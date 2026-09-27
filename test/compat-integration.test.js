#!/usr/bin/env node
// Integration test: a provider library exposing a version-keyed API,
// resolved differently for two different consumers based on each
// consumer's OWN declared versionRange - the actual scenario OR-Track B2's
// compat.js exists to handle, only provable through a real loadLibraries()
// call (not compat.js's own unit tests, which test selectApiVersion() in
// isolation).
// Run: node test/compat-integration.test.js
"use strict";

const assert = require("assert");
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

const provider = {
    manifest: { openrockVersion: 1, kind: "library", name: "versioned-provider", version: "1.0.0", entry: "x", provides: { api: "x" } },
    register: () => ({ api: { "1.0.0": { shape: "old" }, "2.0.0": { shape: "new" } } }),
};

// Note: apiVersion is deliberately a SEPARATE field from versionRange (see
// manifest.js's own comment) - versionRange would be checked by
// resolver.js against the PROVIDER's package version ("1.0.0" here,
// unrelated to which internal API generation a consumer wants), so these
// tests never set it at all, only apiVersion.
function consumer(name, apiVersion) {
    let received;
    const entry = {
        manifest: { openrockVersion: 1, kind: "library", name, version: "1.0.0", entry: "x", dependsOn: { "versioned-provider": { type: "library", apiVersion } } },
        register: (kernel, ctx) => { received = ctx.dependencies["versioned-provider"]; return { api: {} }; },
    };
    return { entry, get: () => received };
}

test("loadLibraries: two consumers of the same provider each get the API generation their own apiVersion picks", () => {
    const oldConsumer = consumer("old-consumer", "^1.0.0");
    const newConsumer = consumer("new-consumer", "^2.0.0");
    loadLibraries([provider, oldConsumer.entry, newConsumer.entry]);
    assert.deepStrictEqual(oldConsumer.get(), { shape: "old" });
    assert.deepStrictEqual(newConsumer.get(), { shape: "new" });
});

test("loadLibraries: a consumer with no apiVersion gets the highest exposed generation", () => {
    const anyConsumer = consumer("any-consumer", undefined);
    loadLibraries([provider, anyConsumer.entry]);
    assert.deepStrictEqual(anyConsumer.get(), { shape: "new" });
});

test("loadLibraries: a consumer whose apiVersion matches no exposed generation fails the whole load loudly", () => {
    const impossible = consumer("impossible-consumer", "^99.0.0");
    assert.throws(() => loadLibraries([provider, impossible.entry]), /no exposed API version satisfies/);
});

console.log(`\n${passed} passed`);
