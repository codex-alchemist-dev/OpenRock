#!/usr/bin/env node
// Integration test: @openrock/permissions loaded for real through
// libLoader.js's loadLibraries(), proving its full dependency chain
// (permissions -> capabilities -> mclite submodule) resolves end to end.
// Run: node test/permissions-integration.test.js
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

test("loadLibraries: @openrock/permissions's full dependency chain (permissions -> capabilities -> mclite) resolves for real", () => {
    let capturedApi;
    const consumer = {
        manifest: {
            openrockVersion: 1, kind: "library", name: "consumer", version: "1.0.0", entry: "x",
            dependsOn: { "@openrock/permissions": { type: "library" } },
        },
        register: (kernel, ctx) => { capturedApi = ctx.dependencies["@openrock/permissions"]; return { api: {} }; },
    };
    loadLibraries([libEntry("capabilities"), libEntry("permissions"), consumer], { vendorDir: path.join(__dirname, "..") });

    const owner = createMockOwner();
    const world = createMockOwner("mock:world");
    capturedApi.setPassword(owner, world, "addons-menu", "realpassword");
    assert.strictEqual(capturedApi.checkPassword(owner, world, "addons-menu", "realpassword"), true);
    assert.strictEqual(capturedApi.checkPassword(owner, world, "addons-menu", "wrong"), false);
});

console.log(`\n${passed} passed`);
