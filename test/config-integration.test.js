#!/usr/bin/env node
// Integration test: @openrock/config loaded for real through
// libLoader.js's loadLibraries(), proving its @openrock/capabilities ->
// mclite (submodule) dependency chain resolves correctly end to end.
// Run: node test/config-integration.test.js
"use strict";

const assert = require("assert");
const path = require("path");
const { loadLibraries } = require("../src/libLoader.js");
const { createMockOwner } = require(path.join(__dirname, "..", "vendor", "mclite", "test", "mockOwner.js"));

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

function libEntry(dir) {
    return {
        manifest: require(path.join(__dirname, "..", "libs", dir, "openrock.library.json")),
        register: require(path.join(__dirname, "..", "libs", dir, "src", "register.js")),
    };
}

test("loadLibraries: @openrock/config's full dependency chain (config -> capabilities -> mclite) resolves for real", () => {
    let capturedConfigApi;
    const consumer = {
        manifest: {
            openrockVersion: 1, kind: "library", name: "consumer", version: "1.0.0", entry: "x",
            dependsOn: { "@openrock/config": { type: "library" } },
        },
        register: (kernel, ctx) => { capturedConfigApi = ctx.dependencies["@openrock/config"]; return { api: {} }; },
    };
    loadLibraries([libEntry("capabilities"), libEntry("config"), consumer], { vendorDir: path.join(__dirname, "..") });

    capturedConfigApi.registerConfig("my-mod", { greeting: "string" }, { greeting: "hello" });
    assert.deepStrictEqual(capturedConfigApi.bakeConfig("my-mod", {}), { greeting: "hello" });

    const owner = createMockOwner();
    const world = createMockOwner("mock:world");
    capturedConfigApi.writeRuntimeConfig(owner, world, "my-mod", { greeting: "howdy" });
    assert.strictEqual(capturedConfigApi.readRuntimeConfig(owner, world, "my-mod").greeting, "howdy");
});

console.log(`\n${passed} passed`);
