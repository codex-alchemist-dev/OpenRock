#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/config.
// Run: node libs/config/test/config.test.js
"use strict";

const assert = require("assert");
const path = require("path");
const mclite = require(path.join(__dirname, "..", "..", "..", "vendor", "mclite"));
const { createMockOwner } = require(path.join(__dirname, "..", "..", "..", "vendor", "mclite", "test", "mockOwner.js"));
const registerCapabilities = require(path.join(__dirname, "..", "..", "capabilities", "src", "register.js"));
const registerConfigLib = require("../src/register.js");

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
    const { api: capabilities } = registerCapabilities(null, { manifest: {}, dependencies: { mclite } });
    const { api: config } = registerConfigLib(null, { manifest: {}, dependencies: { "@openrock/capabilities": capabilities } });
    return config;
}

test("registerConfig: throws if defaults don't cover every schema field", () => {
    const config = makeApi();
    assert.throws(() => config.registerConfig("bad-mod", { volume: "number" }, {}), /missing required field "volume"/);
});

test("bakeConfig: merges overrides onto defaults and freezes the result", () => {
    const config = makeApi();
    config.registerConfig("sound-mod", { volume: "number", muted: "boolean" }, { volume: 100, muted: false });
    const baked = config.bakeConfig("sound-mod", { volume: 50 });
    assert.deepStrictEqual(baked, { volume: 50, muted: false });
    assert.throws(() => { baked.volume = 999; }, /Cannot assign/);
});

test("bakeConfig: throws on an override with the wrong type", () => {
    const config = makeApi();
    config.registerConfig("sound-mod-2", { volume: "number" }, { volume: 100 });
    assert.throws(() => config.bakeConfig("sound-mod-2", { volume: "loud" }), /doesn't match type "number"/);
});

test("bakeConfig: throws for an unregistered mod name", () => {
    const config = makeApi();
    assert.throws(() => config.bakeConfig("never-registered", {}), /was never registered/);
});

// readCapability/writeCapability return the real MCLite record, which
// carries its own _checksum field - stripped here since these tests only
// care about the config's own declared fields.
function withoutChecksum(rec) {
    const { _checksum, ...rest } = rec;
    return rest;
}

test("readRuntimeConfig: falls back to defaults when nothing's been written yet", () => {
    const config = makeApi();
    config.registerConfig("hud-mod", { showBar: "boolean" }, { showBar: true });
    const owner = createMockOwner();
    const world = createMockOwner("mock:world");
    assert.deepStrictEqual(config.readRuntimeConfig(owner, world, "hud-mod"), { showBar: true });
});

test("writeRuntimeConfig: a partial patch merges onto the current value, persists across reads", () => {
    const config = makeApi();
    config.registerConfig("hud-mod-2", { showBar: "boolean", scale: "number" }, { showBar: true, scale: 1 });
    const owner = createMockOwner();
    const world = createMockOwner("mock:world");
    config.writeRuntimeConfig(owner, world, "hud-mod-2", { scale: 2 });
    assert.deepStrictEqual(withoutChecksum(config.readRuntimeConfig(owner, world, "hud-mod-2")), { showBar: true, scale: 2 });
    config.writeRuntimeConfig(owner, world, "hud-mod-2", { showBar: false });
    assert.deepStrictEqual(withoutChecksum(config.readRuntimeConfig(owner, world, "hud-mod-2")), { showBar: false, scale: 2 });
});

test("writeRuntimeConfig: an invalid patch is rejected, old value untouched", () => {
    const config = makeApi();
    config.registerConfig("hud-mod-3", { scale: "number" }, { scale: 1 });
    const owner = createMockOwner();
    const world = createMockOwner("mock:world");
    const result = config.writeRuntimeConfig(owner, world, "hud-mod-3", { scale: "not-a-number" });
    assert.strictEqual(result, null);
    assert.deepStrictEqual(config.readRuntimeConfig(owner, world, "hud-mod-3"), { scale: 1 }); // untouched - never written, so no _checksum yet (falls back to defaults)
});

console.log(`\n${passed} passed`);
