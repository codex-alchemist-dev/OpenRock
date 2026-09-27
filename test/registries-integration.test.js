#!/usr/bin/env node
// Integration test: @openrock/registries loaded for real through
// libLoader.js's loadLibraries(), proving two DIFFERENT libraries sharing
// one kernel-wide registry (via ctx.dependencies, not two independent
// instances) collide correctly when they register the same id - the
// actual scenario @openrock/registries exists to catch.
// Run: node test/registries-integration.test.js
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

const registriesManifest = require(path.join(__dirname, "..", "libs", "registries", "openrock.library.json"));
const registriesRegister = require(path.join(__dirname, "..", "libs", "registries", "src", "register.js"));
const registriesEntry = { manifest: registriesManifest, register: registriesRegister };

function consumerEntry(name, itemId) {
    return {
        manifest: {
            openrockVersion: 1, kind: "library", name, version: "1.0.0", entry: "x",
            dependsOn: { "@openrock/registries": { type: "library" } },
        },
        register: (kernel, ctx) => {
            ctx.dependencies["@openrock/registries"].domain("items").register(itemId, { from: name });
            return { api: {} };
        },
    };
}

test("loadLibraries: two libraries registering the SAME item id through the shared registries API collide loudly", () => {
    const modA = consumerEntry("mod-a", "cw:frost_bow");
    const modB = consumerEntry("mod-b", "cw:frost_bow"); // same id - a genuine collision
    assert.throws(() => loadLibraries([registriesEntry, modA, modB]), /already has an entry for "cw:frost_bow"/);
});

test("loadLibraries: two libraries registering DIFFERENT item ids both succeed, sharing one registry", () => {
    const modA = consumerEntry("mod-a", "cw:frost_bow");
    const modC = consumerEntry("mod-c", "cw:fire_axe");
    assert.doesNotThrow(() => loadLibraries([registriesEntry, modA, modC]));
});

console.log(`\n${passed} passed`);
