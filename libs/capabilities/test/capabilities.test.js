#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/capabilities.
// Run: node libs/capabilities/test/capabilities.test.js
"use strict";

const assert = require("assert");
const path = require("path");
const mclite = require(path.join(__dirname, "..", "..", "..", "vendor", "mclite"));
const { createMockOwner } = require(path.join(__dirname, "..", "..", "..", "vendor", "mclite", "test", "mockOwner.js"));
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

function makeApi() {
    const { api } = registerLib(null, { manifest: {}, dependencies: { mclite } });
    return api;
}

test("registerCapability: a schema-valid record round-trips through write/read", () => {
    const api = makeApi();
    api.registerCapability("gizmo", { name: "string", power: "number" });
    const owner = createMockOwner();
    const world = createMockOwner("mock:world");
    api.writeCapability(owner, world, "gizmo", "g1", () => ({ name: "Widget", power: 5 }));
    const rec = api.readCapability(owner, world, "gizmo", "g1");
    assert.strictEqual(rec.name, "Widget");
    assert.strictEqual(rec.power, 5);
});

test("registerCapability: a record missing a declared field is rejected (write aborted)", () => {
    const api = makeApi();
    api.registerCapability("gizmo2", { name: "string", power: "number" });
    const owner = createMockOwner();
    const world = createMockOwner("mock:world");
    const result = api.writeCapability(owner, world, "gizmo2", "g2", () => ({ name: "Widget" })); // missing "power"
    assert.strictEqual(result, null);
});

test("registerCapability: a record with a wrong-typed field is rejected", () => {
    const api = makeApi();
    api.registerCapability("gizmo3", { name: "string", power: "number" });
    const owner = createMockOwner();
    const world = createMockOwner("mock:world");
    const result = api.writeCapability(owner, world, "gizmo3", "g3", () => ({ name: "Widget", power: "not-a-number" }));
    assert.strictEqual(result, null);
});

test("registerCapability: array types (\"string[]\") are validated element-wise", () => {
    const api = makeApi();
    api.registerCapability("gizmo4", { tags: "string[]" });
    const owner = createMockOwner();
    const world = createMockOwner("mock:world");
    assert.ok(api.writeCapability(owner, world, "gizmo4", "g4", () => ({ tags: ["a", "b"] })));
    assert.strictEqual(api.writeCapability(owner, world, "gizmo4", "g5", () => ({ tags: ["a", 2] })), null);
});

test("registerCapability: fields not in the schema pass through unchecked", () => {
    const api = makeApi();
    api.registerCapability("gizmo5", { name: "string" });
    const owner = createMockOwner();
    const world = createMockOwner("mock:world");
    const rec = api.writeCapability(owner, world, "gizmo5", "g6", () => ({ name: "Widget", extra: { anything: true } }));
    assert.deepStrictEqual(rec.extra, { anything: true });
});

test("registerCapability: an explicit validate() overrides the schema-generated one entirely", () => {
    const api = makeApi();
    let customValidateCalled = false;
    api.registerCapability("gizmo6", { name: "string" }, {
        validate: rec => { customValidateCalled = true; return rec && rec.name === "only-this-name"; },
    });
    const owner = createMockOwner();
    const world = createMockOwner("mock:world");
    assert.strictEqual(api.writeCapability(owner, world, "gizmo6", "g7", () => ({ name: "wrong" })), null);
    assert.strictEqual(customValidateCalled, true);
    assert.ok(api.writeCapability(owner, world, "gizmo6", "g8", () => ({ name: "only-this-name" })));
});

console.log(`\n${passed} passed`);
