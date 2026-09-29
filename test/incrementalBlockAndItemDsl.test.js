#!/usr/bin/env node
// Real, live proof that OR-Track Q6's createIncrementalBuild() genuinely
// covers Crystal Manifest-Block and Crystal Manifest-Item too, not just
// Crystal Manifest-Entity/-Manifest (the only two dialects the existing
// incremental tests happened to exercise). The DIRECTORY_DSLS table-driven
// refactor SHOULD make this automatic, but "should" isn't "verified" - a
// paranoid re-audit demanded this real, dedicated proof rather than
// trusting the refactor by inference.
// Run: node test/incrementalBlockAndItemDsl.test.js
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createIncrementalBuild } = require("../src/buildPipeline.js");

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`ok - ${name}`);
    } catch (e) {
        console.error(`FAIL - ${name}`);
        console.error(e);
        process.exitCode = 1;
    }
}

const OPENROCK_ROOT = path.join(__dirname, "..");

// A real, throwaway mod under mods/ (same real depth convention as
// mods/pathfinding-demo/entities/*.entity.tsx - 3 segments deep, matching
// each DSL source file's own "../../../src/..." relative import), created
// fresh and torn down per test so it can never collide with real work.
function makeMod() {
    const workDir = fs.mkdtempSync(path.join(OPENROCK_ROOT, "mods", "incremental-block-item-test-"));
    fs.mkdirSync(path.join(workDir, "blocks"));
    fs.mkdirSync(path.join(workDir, "items"));
    fs.writeFileSync(path.join(workDir, "openrock.mod.json"), JSON.stringify({
        openrockVersion: 1, kind: "mod", name: "incremental-block-item-test", version: "0.1.0", namespace: "ibit",
        packs: {
            behavior: { folder: "B", uuid: "eeeeeeee-0000-4000-8000-000000000001", dataModuleUuid: "eeeeeeee-0000-4000-8000-000000000002", scriptModuleUuid: "eeeeeeee-0000-4000-8000-000000000003" },
            resource: { folder: "R", uuid: "eeeeeeee-0000-4000-8000-000000000004", moduleUuid: "eeeeeeee-0000-4000-8000-000000000005" },
        },
        content: { blockDsl: "blocks", itemDsl: "items" },
    }));
    fs.writeFileSync(path.join(workDir, "blocks", "pebble.block.tsx"), `
import * as OpenRockBlock from "../../../src/blockDsl/jsx-runtime.js";
import { Block, Friction } from "../../../src/blockDsl/components.js";
export default (<Block identifier="ibit:pebble"><Friction value={0.4} /></Block>);
`);
    fs.writeFileSync(path.join(workDir, "items", "gem.item.tsx"), `
import * as OpenRockItem from "../../../src/itemDsl/jsx-runtime.js";
import { Item, MaxStackSize } from "../../../src/itemDsl/components.js";
export default (<Item identifier="ibit:gem"><MaxStackSize value={16} /></Item>);
`);
    return workDir;
}

test("createIncrementalBuild: editing a real .block.tsx file re-renders ONLY the block output, leaving item output untouched (same object reference)", () => {
    const modDir = makeMod();
    const inc = createIncrementalBuild(modDir);
    const before = inc.build();
    assert.strictEqual(before.bp.get("blocks/pebble.json") && JSON.parse(before.bp.get("blocks/pebble.json")).format_version, "1.21.0");
    const itemBufBefore = before.bp.get("items/gem.json");
    assert.ok(itemBufBefore, "expected a real items/gem.json in the initial build");

    const blockFile = path.join(modDir, "blocks", "pebble.block.tsx");
    fs.writeFileSync(blockFile, fs.readFileSync(blockFile, "utf8").replace("value={0.4}", "value={0.1}"));
    const after = inc.rebuild(blockFile);

    assert.strictEqual(inc.isFullBuild(), false, "a blockDsl-only change must take the real incremental path");
    const pebble = JSON.parse(after.bp.get("blocks/pebble.json").toString("utf8"));
    assert.strictEqual(pebble["minecraft:block"].components["minecraft:friction"], 0.1, "the real edit must appear in the freshly compiled block");
    assert.strictEqual(after.bp.get("items/gem.json"), itemBufBefore, "the item output must be the SAME object - proof a block-only change never re-touches item output");

    fs.rmSync(modDir, { recursive: true, force: true });
});

test("createIncrementalBuild: editing a real .item.tsx file re-renders ONLY the item output, leaving block output untouched (same object reference)", () => {
    const modDir = makeMod();
    const inc = createIncrementalBuild(modDir);
    const before = inc.build();
    const blockBufBefore = before.bp.get("blocks/pebble.json");
    assert.ok(blockBufBefore);

    const itemFile = path.join(modDir, "items", "gem.item.tsx");
    fs.writeFileSync(itemFile, fs.readFileSync(itemFile, "utf8").replace("value={16}", "value={64}"));
    const after = inc.rebuild(itemFile);

    assert.strictEqual(inc.isFullBuild(), false, "an itemDsl-only change must take the real incremental path");
    const gem = JSON.parse(after.bp.get("items/gem.json").toString("utf8"));
    assert.strictEqual(gem["minecraft:item"].components["minecraft:max_stack_size"], 64, "the real edit must appear in the freshly compiled item");
    assert.strictEqual(after.bp.get("blocks/pebble.json"), blockBufBefore, "the block output must be the SAME object - proof an item-only change never re-touches block output");

    fs.rmSync(modDir, { recursive: true, force: true });
});

test("createIncrementalBuild: deleting a real block source file removes JUST its own output", () => {
    const modDir = makeMod();
    const inc = createIncrementalBuild(modDir);
    inc.build();

    const blockFile = path.join(modDir, "blocks", "pebble.block.tsx");
    fs.rmSync(blockFile);
    const after = inc.rebuild(blockFile);

    assert.strictEqual(after.bp.has("blocks/pebble.json"), false, "a deleted block source file's own output must be removed from the pack");
    assert.ok(after.bp.has("items/gem.json"), "the unrelated item output must still be present");

    fs.rmSync(modDir, { recursive: true, force: true });
});

console.log(`\n${passed} passed`);
