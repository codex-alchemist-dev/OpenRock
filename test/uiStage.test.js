#!/usr/bin/env node
// content.uiDir: MinUI compile -> rp JSON UI + the @openrock/virtual/ui-screens module in the script bundle.
"use strict";
const assert = require("assert");
const path = require("path");
const { buildMod } = require("../src/buildPipeline.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

const MOD = path.join(__dirname, "fixtures", "ui-mod");

test("uiDir: screens compile into rp ui JSON and the runtime table is bundled, not shipped loose", () => {
    const { bp, rp } = buildMod(MOD, { vendorDir: path.join(__dirname, "fixtures") });
    const doc = JSON.parse(rp.get("ui/openchara/screens.json").toString());
    assert.ok(JSON.stringify(doc).includes("demo"), "demo screen present in compiled JSON UI");
    assert.ok(![...bp.keys()].some(k => k.includes(".openrock-virtual")), "virtual module stripped from shipped pack");
    const main = bp.get("scripts/main.js").toString();
    assert.ok(/SCREENS/.test(main) && /demo/.test(main), "runtime table bundled into main.js");
});

console.log(`\n${passed} passed`);
