#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/permissions.
// Run: node libs/permissions/test/permissions.test.js
"use strict";

const assert = require("assert");
const path = require("path");
const mclite = require(path.join(__dirname, "..", "..", "..", "vendor", "mclite"));
const { createMockOwner } = require(path.join(__dirname, "..", "..", "..", "vendor", "mclite", "test", "mockOwner.js"));
const registerCapabilities = require("../../capabilities/src/register.js");
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
    const { api: capabilitiesApi } = registerCapabilities(null, { manifest: {}, dependencies: { mclite } });
    const { api } = registerLib(null, { manifest: {}, dependencies: { "@openrock/capabilities": capabilitiesApi } });
    return api;
}

test("isOp: delegates to the real, injected checkOpFn", () => {
    const api = makeApi();
    const player = { name: "theof" };
    assert.strictEqual(api.isOp(player, p => p.name === "theof"), true);
    assert.strictEqual(api.isOp(player, () => false), false);
});

test("isOp: requires a real checkOpFn", () => {
    const api = makeApi();
    assert.throws(() => api.isOp({}, null), /requires a real checkOpFn/);
});

test("setPassword/checkPassword: a correct password matches, a wrong one doesn't", () => {
    const api = makeApi();
    const owner = createMockOwner(), world = createMockOwner("mock:world");
    api.setPassword(owner, world, "addons-menu", "hunter2");
    assert.strictEqual(api.checkPassword(owner, world, "addons-menu", "hunter2"), true);
    assert.strictEqual(api.checkPassword(owner, world, "addons-menu", "wrong"), false);
});

test("setPassword: never stores the plaintext password anywhere readable", () => {
    const api = makeApi();
    const owner = createMockOwner(), world = createMockOwner("mock:world");
    api.setPassword(owner, world, "gate1", "supersecret");
    const rawValues = [...owner._debugProps.values(), ...world._debugProps.values()];
    for (const v of rawValues) assert.ok(!String(v).includes("supersecret"), "plaintext password leaked into raw storage");
});

test("checkPassword: false (never throws) when no password has ever been set for that gate", () => {
    const api = makeApi();
    const owner = createMockOwner(), world = createMockOwner("mock:world");
    assert.strictEqual(api.checkPassword(owner, world, "never-configured", "anything"), false);
});

test("hasPasswordSet: reflects whether a password exists for a gate", () => {
    const api = makeApi();
    const owner = createMockOwner(), world = createMockOwner("mock:world");
    assert.strictEqual(api.hasPasswordSet(owner, world, "gate2"), false);
    api.setPassword(owner, world, "gate2", "pw");
    assert.strictEqual(api.hasPasswordSet(owner, world, "gate2"), true);
});

test("setPassword: replacing a password invalidates the old one", () => {
    const api = makeApi();
    const owner = createMockOwner(), world = createMockOwner("mock:world");
    api.setPassword(owner, world, "gate3", "first");
    api.setPassword(owner, world, "gate3", "second");
    assert.strictEqual(api.checkPassword(owner, world, "gate3", "first"), false);
    assert.strictEqual(api.checkPassword(owner, world, "gate3", "second"), true);
});

test("setPassword: rejects an empty password", () => {
    const api = makeApi();
    const owner = createMockOwner(), world = createMockOwner("mock:world");
    assert.throws(() => api.setPassword(owner, world, "gate4", ""), /non-empty password/);
});

test("canAccess: OP always passes, regardless of password", () => {
    const api = makeApi();
    const owner = createMockOwner(), world = createMockOwner("mock:world");
    const player = { isOp: true };
    assert.strictEqual(api.canAccess(player, { checkOpFn: p => p.isOp }), true);
});

test("canAccess: non-OP with the correct password passes", () => {
    const api = makeApi();
    const owner = createMockOwner(), world = createMockOwner("mock:world");
    api.setPassword(owner, world, "addons", "letmein");
    const player = { isOp: false };
    const result = api.canAccess(player, { checkOpFn: p => p.isOp, owner, world, gateId: "addons", passwordAttempt: "letmein" });
    assert.strictEqual(result, true);
});

test("canAccess: non-OP with a wrong password, or no password data supplied at all, fails closed", () => {
    const api = makeApi();
    const owner = createMockOwner(), world = createMockOwner("mock:world");
    api.setPassword(owner, world, "addons2", "correct");
    const player = { isOp: false };
    assert.strictEqual(api.canAccess(player, { checkOpFn: p => p.isOp, owner, world, gateId: "addons2", passwordAttempt: "wrong" }), false);
    assert.strictEqual(api.canAccess(player, { checkOpFn: p => p.isOp }), false, "no gate info at all - never silently allowed");
});

console.log(`\n${passed} passed`);
