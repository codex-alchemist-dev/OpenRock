#!/usr/bin/env node
// Real proof for Crystal Manifest-Block (OR-Track M4, see docs/crystal.md):
// compile a real .block.tsx through real tsc -> requireCompiled ->
// blockBuilder.js's real declarative emission backend, and assert every
// real field (confirmed via live Microsoft Learn/bedrock.dev docs fetches
// - never guessed) round-trips correctly.
// Run: node test/blockDsl.test.js
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { compileBlockDsl } = require("../src/blockDsl/blockCompiler.js");

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

const FIXTURE_DIR = path.join(__dirname, "fixtures", "block-dsl-pilot");

test("compileBlockDsl: a real .block.tsx compiles through real tsc + blockBuilder into a genuine Bedrock block document", () => {
    const output = compileBlockDsl(FIXTURE_DIR);
    assert.ok(output.bp["blocks/test_block.json"]);
    const doc = output.bp["blocks/test_block.json"];
    assert.strictEqual(doc.format_version, "1.21.0");
    assert.strictEqual(doc["minecraft:block"].description.identifier, "prd:test_block");
    assert.deepStrictEqual(doc["minecraft:block"].description.menu_category, { category: "construction" });
});

test("compileBlockDsl: typed components produce the real, correct Bedrock component shapes", () => {
    const output = compileBlockDsl(FIXTURE_DIR);
    const components = output.bp["blocks/test_block.json"]["minecraft:block"].components;
    assert.deepStrictEqual(components["minecraft:collision_box"], { origin: [-8, 0, -8], size: [16, 16, 16] });
    assert.strictEqual(components["minecraft:friction"], 0.6);
    assert.strictEqual(components["minecraft:light_emission"], 7);
    assert.deepStrictEqual(components["minecraft:destructible_by_mining"], { seconds_to_destroy: 2 });
    assert.strictEqual(components["minecraft:map_color"], "#a0a0a0");
    assert.strictEqual(components["minecraft:display_name"], "tile.prd:test_block.name");
});

test("compileBlockDsl: <Permutation> produces a real permutations[] entry with its own scoped components", () => {
    const output = compileBlockDsl(FIXTURE_DIR);
    const doc = output.bp["blocks/test_block.json"]["minecraft:block"];
    assert.strictEqual(doc.permutations.length, 1);
    assert.strictEqual(doc.permutations[0].condition, "query.block_state('orbt:powered') == true");
    assert.strictEqual(doc.permutations[0].components["minecraft:light_emission"], 15);
});

test("compileBlockDsl: a mod with no block DSL directory at all returns an empty output, not an error", () => {
    assert.deepStrictEqual(compileBlockDsl(path.join(__dirname, "fixtures", "does-not-exist")), { bp: {}, rp: {} });
});

test("compileBlockDsl (OR-Track Q6): an unchanged directory returns the SAME cached output object - real tsc is skipped", () => {
    const first = compileBlockDsl(FIXTURE_DIR);
    const second = compileBlockDsl(FIXTURE_DIR);
    assert.strictEqual(first, second);
});

test("compileBlockDsl (OR-Track Q6): editing a real .block.tsx file produces a genuinely fresh, different compile", () => {
    const workDir = fs.mkdtempSync(path.join(__dirname, "fixtures", "openrock-blockdsl-cache-test-"));
    const src = fs.readFileSync(path.join(FIXTURE_DIR, "test_block.block.tsx"), "utf8");
    const srcPath = path.join(workDir, "test_block.block.tsx");
    const absSrcDir = path.join(__dirname, "..", "src").split(path.sep).join("/");
    fs.writeFileSync(srcPath, src.replace(/\.\.\/\.\.\/\.\.\/src/g, absSrcDir).replace("value={0.6}", "value={0.2}"));

    const output = compileBlockDsl(workDir);
    assert.strictEqual(output.bp["blocks/test_block.json"]["minecraft:block"].components["minecraft:friction"], 0.2);

    fs.rmSync(workDir, { recursive: true, force: true });
});

console.log(`\n${passed} passed`);
