#!/usr/bin/env node
// Integration test: @openrock/events loaded for real through
// libLoader.js's loadLibraries(), proving handler order matches the
// dependency-graph load order (not input-array order) - two libraries
// sharing one events instance via ctx.dependencies, one depending on the
// other, register handlers for the same event.
// Run: node test/events-integration.test.js
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

const eventsEntry = {
    manifest: require(path.join(__dirname, "..", "libs", "events", "openrock.library.json")),
    register: require(path.join(__dirname, "..", "libs", "events", "src", "register.js")),
};

test("loadLibraries: handler registration order follows dependency-graph load order, not input order", () => {
    const fired = [];
    const depender = {
        manifest: {
            openrockVersion: 1, kind: "library", name: "depender", version: "1.0.0", entry: "x",
            dependsOn: { "@openrock/events": { type: "library" }, dependency: { type: "library" } },
        },
        register: (kernel, ctx) => { ctx.dependencies["@openrock/events"].on("tick", "depender", () => fired.push("depender")); return { api: {} }; },
    };
    const dependency = {
        manifest: {
            openrockVersion: 1, kind: "library", name: "dependency", version: "1.0.0", entry: "x",
            dependsOn: { "@openrock/events": { type: "library" } },
        },
        register: (kernel, ctx) => { ctx.dependencies["@openrock/events"].on("tick", "dependency", () => fired.push("dependency")); return { api: {} }; },
    };
    // "depender" listed FIRST in the input array, on purpose - topoSort
    // must still load "dependency" before it, so its handler registers first.
    const { exportsByName } = loadLibraries([depender, dependency, eventsEntry]);
    exportsByName.get("@openrock/events").dispatch("tick", {});
    assert.deepStrictEqual(fired, ["dependency", "depender"]);
});

console.log(`\n${passed} passed`);
