#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for src/compat.js (OR-Track B2).
// Run: node test/compat.test.js
"use strict";

const assert = require("assert");
const { isVersionedApi, selectApiVersion } = require("../src/compat.js");

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

test("isVersionedApi: recognizes a version-keyed object", () => {
    assert.strictEqual(isVersionedApi({ "1.0.0": {}, "2.0.0": {} }), true);
});

test("isVersionedApi: an ordinary API object (function/property keys) is not version-keyed", () => {
    assert.strictEqual(isVersionedApi({ shout: () => {}, greet: () => {} }), false);
});

test("isVersionedApi: rejects an empty object, arrays, and non-objects", () => {
    assert.strictEqual(isVersionedApi({}), false);
    assert.strictEqual(isVersionedApi(["1.0.0"]), false);
    assert.strictEqual(isVersionedApi(null), false);
    assert.strictEqual(isVersionedApi("1.0.0"), false);
});

test("selectApiVersion: an ordinary (non-versioned) API passes through unchanged", () => {
    const api = { shout: () => "hi" };
    assert.strictEqual(selectApiVersion(api, "^1.0.0"), api);
});

test("selectApiVersion: picks the highest version satisfying the range", () => {
    const v1 = { name: "v1" }, v2 = { name: "v2" }, v3 = { name: "v3" };
    const versioned = { "1.0.0": v1, "2.0.0": v2, "2.5.0": v3 };
    assert.strictEqual(selectApiVersion(versioned, "^2.0.0"), v3);
    assert.strictEqual(selectApiVersion(versioned, "^1.0.0"), v1);
});

test("selectApiVersion: no versionRange picks the overall highest version", () => {
    const v1 = { name: "v1" }, v2 = { name: "v2" };
    assert.strictEqual(selectApiVersion({ "1.0.0": v1, "2.0.0": v2 }, undefined), v2);
});

test("selectApiVersion: throws if no exposed version satisfies the range", () => {
    const versioned = { "1.0.0": {}, "1.5.0": {} };
    assert.throws(() => selectApiVersion(versioned, "^2.0.0"), /no exposed API version satisfies/);
});

console.log(`\n${passed} passed`);
