#!/usr/bin/env node
// Real, pure-function tests for src/bdsTestHarness.js's analyzeOutput() -
// the log-parsing logic OR-Track Q3's real per-entity/block smoke results
// depend on. No real BDS boot needed here (that's
// test/bdsTestHarness.manual.test.js's job) - these are deterministic
// string-parsing tests against realistic console output.
// Run: node test/bdsTestHarness.test.js
"use strict";

const assert = require("assert");
const { analyzeOutput } = require("../src/bdsTestHarness.js");

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

test("analyzeOutput: a clean boot with real OR-Track Q3 smoke results parses ok=true with per-target results", () => {
    const output = [
        "[INFO] Pack Stack - [00] pack.name",
        "[WARN] [OR-SMOKE][ENTITY][OK] prd:nav_test",
        "[WARN] [OR-SMOKE][ENTITY][OK] prd:nav_anchor",
        "[WARN] [OR-SMOKE][DONE] entities=2 blocks=0 ok=2 fail=0",
        "[INFO] Server started.",
    ].join("\n");
    const result = analyzeOutput(output);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.smokeDone, true);
    assert.strictEqual(result.smokeResults.length, 2);
    assert.ok(result.smokeResults.every(r => r.kind === "entity" && r.ok === true));
    assert.deepStrictEqual(result.smokeResults.map(r => r.id).sort(), ["prd:nav_anchor", "prd:nav_test"]);
});

test("analyzeOutput: a real entity spawn FAILURE is treated as fatal, even if the server itself booted fine", () => {
    const output = [
        "[INFO] Pack Stack - [00] pack.name",
        "[ERROR] [OR-SMOKE][ENTITY][FAIL] prd:broken_mob :: Error: entity type not found",
        "[WARN] [OR-SMOKE][DONE] entities=1 blocks=0 ok=0 fail=1",
        "[INFO] Server started.",
    ].join("\n");
    const result = analyzeOutput(output);
    assert.strictEqual(result.ok, false, "a real spawn failure must fail the whole smoke test, not just get logged");
    assert.ok(result.errors.some(e => e.includes("prd:broken_mob")));
    const failEntry = result.smokeResults.find(r => r.id === "prd:broken_mob");
    assert.strictEqual(failEntry.ok, false);
    assert.match(failEntry.detail, /entity type not found/);
});

test("analyzeOutput: a real identifier containing a colon (namespace:name) is parsed correctly in a FAIL line, not truncated", () => {
    const output = "[OR-SMOKE][BLOCK][FAIL] my_namespace:my_block_name :: TypeError: something broke";
    const result = analyzeOutput(output);
    const entry = result.smokeResults[0];
    assert.strictEqual(entry.id, "my_namespace:my_block_name", "the FULL real identifier (with its own colon) must survive, not just the part before the first colon");
    assert.match(entry.detail, /TypeError: something broke/);
});

test("analyzeOutput: block OK/FAIL lines are classified separately from entity lines", () => {
    const output = "[OR-SMOKE][BLOCK][OK] prd:custom_ore";
    const result = analyzeOutput(output);
    assert.strictEqual(result.smokeResults[0].kind, "block");
    assert.strictEqual(result.smokeResults[0].ok, true);
});

test("analyzeOutput: no real smoke markers at all (e.g. a mod with zero entities/blocks, or the harness pack never ran) reports smokeDone=false, empty results", () => {
    const output = "[INFO] Pack Stack - [00] pack.name\n[INFO] Server started.";
    const result = analyzeOutput(output);
    assert.strictEqual(result.smokeDone, false);
    assert.deepStrictEqual(result.smokeResults, []);
    assert.strictEqual(result.ok, true, "no smoke markers and no real errors and a loaded pack is still a real pass");
});

test("analyzeOutput: a real [Scripting][ERROR] line still fails the build independent of any smoke-test markers (existing Q behavior, unaffected)", () => {
    const output = "[INFO] Pack Stack - [00] pack.name\n[Scripting][ERROR] TypeError: x is not a function";
    const result = analyzeOutput(output);
    assert.strictEqual(result.ok, false);
});

console.log(`\n${passed} passed`);
