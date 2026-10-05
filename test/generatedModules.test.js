#!/usr/bin/env node
"use strict";
const assert = require("assert");
const path = require("path");
const { buildMod } = require("../src/buildPipeline.js");
const { validateGeneratedModules } = require("../src/generatedModules.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

test("generatedModules: provider output is bundled into main.js with ctx (namespace, templateVars, readJsonTable)", () => {
    const { bp } = buildMod(path.join(__dirname, "fixtures", "gen-mod"), { vendorDir: path.join(__dirname, "fixtures") });
    const main = bp.get("scripts/main.js").toString();
    assert.ok(/"ns": "gm"/.test(main) && /"char": "waifu"/.test(main) && /"rows": \["a"\]/.test(main), main.slice(0, 400));
    assert.ok(![...bp.keys()].some(k => k.includes(".openrock-virtual")));
});
test("generatedModules: validation", () => {
    assert.throws(() => validateGeneratedModules({}, "m"), /array/);
    assert.throws(() => validateGeneratedModules([{ name: "a b", from: "x" }], "m"), /name/);
    assert.throws(() => validateGeneratedModules([{ name: "a" }], "m"), /from/);
    assert.throws(() => validateGeneratedModules([{ name: "a", from: "x" }, { name: "a", from: "y" }], "m"), /duplicate/);
});
console.log(`\n${passed} passed`);
