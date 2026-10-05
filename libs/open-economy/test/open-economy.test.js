#!/usr/bin/env node
// Tests for @openrock/open-economy
"use strict";

const assert = require("assert");
const lib = require("../src/register.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

test("smoke: module loads and exports register function", () => {
    assert.strictEqual(typeof lib, "function");
    const { api } = lib();
    assert.strictEqual(typeof api, "object");
});

console.log(`\n${passed} passed`);
