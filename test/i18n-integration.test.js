#!/usr/bin/env node
// Integration test: @openrock/i18n loaded for real through
// libLoader.js's loadLibraries(), proving its full dependency chain
// (i18n -> capabilities -> mclite submodule) resolves end to end.
// Run: node test/i18n-integration.test.js
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

test("loadLibraries: @openrock/i18n's full dependency chain (i18n -> capabilities -> mclite) resolves for real", () => {
    let capturedApi;
    const consumer = {
        manifest: {
            openrockVersion: 1, kind: "library", name: "consumer", version: "1.0.0", entry: "x",
            dependsOn: { "@openrock/i18n": { type: "library" } },
        },
        register: (kernel, ctx) => { capturedApi = ctx.dependencies["@openrock/i18n"]; return { api: {} }; },
    };
    loadLibraries([libEntry("capabilities"), libEntry("i18n"), consumer], { vendorDir: path.join(__dirname, "..") });

    const owner = createMockOwner();
    const world = createMockOwner("mock:world");
    capturedApi.registerLocaleTable("nah", { "cw.greeting": "niltze" });
    capturedApi.setPlayerLanguageOverride(owner, world, "nah");
    assert.strictEqual(capturedApi.resolveText(owner, world, "cw.greeting"), "niltze");
});

console.log(`\n${passed} passed`);
