#!/usr/bin/env node
// Real proof for Crystal Manifest-Item (OR-Track M5, see docs/crystal.md).
// Run: node test/itemDsl.test.js
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { compileItemDsl } = require("../src/itemDsl/itemCompiler.js");

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

const FIXTURE_DIR = path.join(__dirname, "fixtures", "item-dsl-pilot");

test("compileItemDsl: a real .item.tsx compiles through real tsc + itemBuilder into a genuine Bedrock item document", () => {
    const output = compileItemDsl(FIXTURE_DIR);
    assert.ok(output.bp["items/test_item.json"]);
    const doc = output.bp["items/test_item.json"];
    assert.strictEqual(doc.format_version, "1.21.0");
    assert.strictEqual(doc["minecraft:item"].description.identifier, "prd:test_item");
    assert.deepStrictEqual(doc["minecraft:item"].description.menu_category, { category: "items" });
});

test("compileItemDsl: typed components produce the real, correct Bedrock component shapes", () => {
    const output = compileItemDsl(FIXTURE_DIR);
    const components = output.bp["items/test_item.json"]["minecraft:item"].components;
    assert.strictEqual(components["minecraft:icon"], "prd_test_item");
    assert.strictEqual(components["minecraft:max_stack_size"], 16);
    assert.deepStrictEqual(components["minecraft:display_name"], { value: "item.prd:test_item.name" });
    assert.deepStrictEqual(components["minecraft:food"], { nutrition: 4, saturation_modifier: 0.3, can_always_eat: true });
    assert.strictEqual(components["minecraft:hand_equipped"], true);
});

test("compileItemDsl: a mod with no item DSL directory at all returns an empty output, not an error", () => {
    assert.deepStrictEqual(compileItemDsl(path.join(__dirname, "fixtures", "does-not-exist")), { bp: {}, rp: {} });
});

test("compileItemDsl (OR-Track Q6): an unchanged directory returns the SAME cached output object - real tsc is skipped", () => {
    const first = compileItemDsl(FIXTURE_DIR);
    const second = compileItemDsl(FIXTURE_DIR);
    assert.strictEqual(first, second);
});

test("compileItemDsl (OR-Track Q6): editing a real .item.tsx file produces a genuinely fresh, different compile", () => {
    const workDir = fs.mkdtempSync(path.join(__dirname, "fixtures", "openrock-itemdsl-cache-test-"));
    const src = fs.readFileSync(path.join(FIXTURE_DIR, "test_item.item.tsx"), "utf8");
    const srcPath = path.join(workDir, "test_item.item.tsx");
    const absSrcDir = path.join(__dirname, "..", "src").split(path.sep).join("/");
    fs.writeFileSync(srcPath, src.replace(/\.\.\/\.\.\/\.\.\/src/g, absSrcDir).replace("value={16}", "value={64}"));

    const output = compileItemDsl(workDir);
    assert.strictEqual(output.bp["items/test_item.json"]["minecraft:item"].components["minecraft:max_stack_size"], 64);

    fs.rmSync(workDir, { recursive: true, force: true });
});

console.log(`\n${passed} passed`);
