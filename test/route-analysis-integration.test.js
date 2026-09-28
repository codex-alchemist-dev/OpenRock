#!/usr/bin/env node
// Integration test: @openrock/route-analysis loaded for real through
// libLoader.js's loadLibraries(), proving its @openrock/terrain dependency
// resolves correctly end to end.
// Run: node test/route-analysis-integration.test.js
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

function libEntry(dir) {
    return {
        manifest: require(path.join(__dirname, "..", "libs", dir, "openrock.library.json")),
        register: require(path.join(__dirname, "..", "libs", dir, "src", "register.js")),
    };
}

test("loadLibraries: @openrock/route-analysis's dependency on @openrock/terrain resolves for real", () => {
    let capturedApi;
    const consumer = {
        manifest: {
            openrockVersion: 1, kind: "library", name: "consumer", version: "1.0.0", entry: "x",
            dependsOn: { "@openrock/route-analysis": { type: "library" } },
        },
        register: (kernel, ctx) => { capturedApi = ctx.dependencies["@openrock/route-analysis"]; return { api: {} }; },
    };
    loadLibraries([libEntry("terrain"), libEntry("route-analysis"), consumer], { vendorDir: path.join(__dirname, "..") });

    const passable = new Set(["0,0,0", "1,0,0", "-1,0,0"]);
    const isPassable = (x, y, z) => passable.has(`${x},${y},${z}`);
    const { routes } = capturedApi.detectEscapeRoutes({ x: 0, y: 0, z: 0 }, isPassable, { maxBlocks: 200 });
    assert.deepStrictEqual(routes, [], "a fully-enclosed pocket has no real escape routes");
});

console.log(`\n${passed} passed`);
