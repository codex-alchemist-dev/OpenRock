#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");
const { loadManifestFile } = require(path.join(__dirname, "..", "..", "..", "src", "manifest.js"));
const lib = require("../src/register.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

test("input: manifest validates", () => {
    const { manifest } = loadManifestFile(path.join(__dirname, ".."));
    assert.strictEqual(manifest.name, "@openrock/input");
});

test("input: register() exposes the declared API; every stub fails loudly", () => {
    const { api } = lib();
    for (const [k, fn] of Object.entries(api)) {
        assert.strictEqual(typeof fn, "function", k);
        assert.throws(() => fn(), /not implemented/, k);
    }
});

console.log(`
${passed} passed`);
