#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/compat's library
// wrapper - src/compat.test.js already covers the underlying logic
// thoroughly; this just proves the library packaging re-exports it intact.
// Run: node libs/compat/test/compat.test.js
"use strict";

const assert = require("assert");
const registerLib = require("../src/register.js");

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

test("register() exposes isVersionedApi and selectApiVersion", () => {
    const { api } = registerLib();
    assert.strictEqual(typeof api.isVersionedApi, "function");
    assert.strictEqual(typeof api.selectApiVersion, "function");
    assert.strictEqual(api.isVersionedApi({ "1.0.0": {} }), true);
    assert.strictEqual(api.selectApiVersion({ shout: () => {} }, "^1.0.0").shout !== undefined, true);
});

console.log(`\n${passed} passed`);
