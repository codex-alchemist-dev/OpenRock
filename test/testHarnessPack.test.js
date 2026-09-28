#!/usr/bin/env node
// Real tests for src/testHarnessPack.js (OR-Track Q3): enumerating real
// entity/block identifiers from a built bp Map, and generating the real
// synthetic test-harness pack (manifest + in-game spawn/place script).
// Run: node test/testHarnessPack.test.js
"use strict";

const assert = require("assert");
const {
    enumerateTestTargets, buildTestHarnessPack, generateHarnessManifest,
    MARKER_ENTITY_OK, MARKER_ENTITY_FAIL, MARKER_BLOCK_OK, MARKER_DONE,
} = require("../src/testHarnessPack.js");

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

function jsonBuf(obj) { return Buffer.from(JSON.stringify(obj), "utf8"); }

test("enumerateTestTargets: extracts every real entity identifier from entities/*.json", () => {
    const bp = new Map([
        ["entities/nav_test.json", jsonBuf({ "minecraft:entity": { description: { identifier: "prd:nav_test" } } })],
        ["entities/nav_anchor.json", jsonBuf({ "minecraft:entity": { description: { identifier: "prd:nav_anchor" } } })],
        ["scripts/main.js", Buffer.from("// not an entity")],
    ]);
    const { entityIds, blockIds } = enumerateTestTargets(bp);
    assert.deepStrictEqual(entityIds.sort(), ["prd:nav_anchor", "prd:nav_test"]);
    assert.deepStrictEqual(blockIds, []);
});

test("enumerateTestTargets: extracts every real block identifier from blocks/*.json", () => {
    const bp = new Map([
        ["blocks/custom_ore.json", jsonBuf({ "minecraft:block": { description: { identifier: "prd:custom_ore" } } })],
    ]);
    const { entityIds, blockIds } = enumerateTestTargets(bp);
    assert.deepStrictEqual(entityIds, []);
    assert.deepStrictEqual(blockIds, ["prd:custom_ore"]);
});

test("enumerateTestTargets: a malformed/non-conforming JSON file is skipped, not thrown on", () => {
    const bp = new Map([["entities/broken.json", Buffer.from("not real json")]]);
    assert.deepStrictEqual(enumerateTestTargets(bp), { entityIds: [], blockIds: [] });
});

test("enumerateTestTargets: an empty bp Map produces empty target lists, not an error", () => {
    assert.deepStrictEqual(enumerateTestTargets(new Map()), { entityIds: [], blockIds: [] });
});

test("buildTestHarnessPack: produces a real manifest.json and scripts/main.js referencing every real target", () => {
    const { bp, folder, uuid } = buildTestHarnessPack({ entityIds: ["prd:nav_test"], blockIds: ["prd:custom_ore"] });
    assert.ok(bp.has("manifest.json"));
    assert.ok(bp.has("scripts/main.js"));
    assert.strictEqual(folder, "OpenRock Test Harness");
    const manifest = JSON.parse(bp.get("manifest.json").toString("utf8"));
    assert.strictEqual(manifest.header.uuid, uuid);
    const script = bp.get("scripts/main.js").toString("utf8");
    assert.match(script, /prd:nav_test/);
    assert.match(script, /prd:custom_ore/);
    assert.match(script, new RegExp(MARKER_ENTITY_OK.replace(/[[\]]/g, "\\$&")));
    assert.match(script, new RegExp(MARKER_DONE.replace(/[[\]]/g, "\\$&")));
});

test("buildTestHarnessPack: a real, syntactically valid script (parses as real JS)", () => {
    const { bp } = buildTestHarnessPack({ entityIds: ["a:b", "c:d"], blockIds: ["e:f"] });
    const script = bp.get("scripts/main.js").toString("utf8");
    // A real, syntax-only check (this is an ES module using import/top-level
    // await-free code) - new Function() can't parse `import`, so strip it
    // for a cheap real syntax sanity check instead of a full esbuild pass.
    const body = script.replace(/^import .+;\n/gm, "");
    assert.doesNotThrow(() => new Function(body), "the generated harness script must be syntactically valid JavaScript");
});

test("generateHarnessManifest: a real, valid, minimal manifest.json shape (data + script modules, real @minecraft/server dependency)", () => {
    const m = generateHarnessManifest();
    assert.strictEqual(m.format_version, 2);
    assert.ok(m.header.uuid);
    assert.strictEqual(m.modules.length, 2);
    assert.ok(m.modules.some(mod => mod.type === "data"));
    const scriptModule = m.modules.find(mod => mod.type === "script");
    assert.strictEqual(scriptModule.entry, "scripts/main.js");
    assert.ok(m.dependencies.some(d => d.module_name === "@minecraft/server"));
});

console.log(`\n${passed} passed`);
