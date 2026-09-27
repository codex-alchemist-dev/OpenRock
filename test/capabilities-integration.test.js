#!/usr/bin/env node
// Integration test: @openrock/capabilities loaded for real through
// libLoader.js's loadLibraries(), proving its "mclite" submodule
// dependency actually resolves through the real vendored MCLite (not a
// hand-constructed ctx like the library's own unit test uses).
// Run: node test/capabilities-integration.test.js
"use strict";

const assert = require("assert");
const path = require("path");
const { loadLibraries } = require("../src/libLoader.js");

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

const capabilitiesManifest = require(path.join(__dirname, "..", "libs", "capabilities", "openrock.library.json"));
const capabilitiesRegister = require(path.join(__dirname, "..", "libs", "capabilities", "src", "register.js"));
const capabilitiesEntry = { manifest: capabilitiesManifest, register: capabilitiesRegister };

const { createMockOwner } = require(path.join(__dirname, "..", "vendor", "mclite", "test", "mockOwner.js"));

test("loadLibraries: @openrock/capabilities resolves its MCLite submodule dependency for real", () => {
    let capturedApi;
    const consumer = {
        manifest: {
            openrockVersion: 1, kind: "library", name: "consumer", version: "1.0.0", entry: "x",
            dependsOn: { "@openrock/capabilities": { type: "library" } },
        },
        register: (kernel, ctx) => { capturedApi = ctx.dependencies["@openrock/capabilities"]; return { api: {} }; },
    };
    loadLibraries([capabilitiesEntry, consumer], { vendorDir: path.join(__dirname, "..") });

    capturedApi.registerCapability("integration-gizmo", { name: "string" });
    const owner = createMockOwner();
    const world = createMockOwner("mock:world");
    capturedApi.writeCapability(owner, world, "integration-gizmo", "ig1", () => ({ name: "Real Thing" }));
    assert.strictEqual(capturedApi.readCapability(owner, world, "integration-gizmo", "ig1").name, "Real Thing");
});

console.log(`\n${passed} passed`);
