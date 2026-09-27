#!/usr/bin/env node
// Integration test: @openrock/datagen loaded for real through
// libLoader.js's loadLibraries() - lighter than the other *-integration
// tests since datagen has no interesting cross-library dependency behavior
// (no submodule/apiVersion/events wiring to prove), just confirms it's a
// well-formed library entry like any other.
// Run: node test/datagen-integration.test.js
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

const datagenEntry = {
    manifest: require(path.join(__dirname, "..", "libs", "datagen", "openrock.library.json")),
    register: require(path.join(__dirname, "..", "libs", "datagen", "src", "register.js")),
};

test("loadLibraries: a mod depending on @openrock/datagen can generate real content JSON at load time", () => {
    let generated;
    const mod = {
        manifest: {
            openrockVersion: 1, kind: "mod", name: "content-mod", version: "1.0.0",
            dependsOn: { "@openrock/datagen": { type: "library" } },
        },
        register: (kernel, ctx) => {
            generated = ctx.dependencies["@openrock/datagen"].buildItem({ identifier: "cw:generated_item", components: {} });
            return {};
        },
    };
    loadLibraries([datagenEntry, mod]);
    assert.strictEqual(generated["minecraft:item"].description.identifier, "cw:generated_item");
});

console.log(`\n${passed} passed`);
