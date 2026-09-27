#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for src/resolver.js (OR-Track A3)
// and its wiring into src/libLoader.js's loadLibraries().
// Run: node test/resolver.test.js
"use strict";

const assert = require("assert");
const { resolveManifestSet } = require("../src/resolver.js");
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

function lib(name, version, extra = {}) {
    return { manifest: { openrockVersion: 1, kind: "library", name, version, entry: "register.js", ...extra }, register: () => ({ api: {} }) };
}

// ---- versionRange -----------------------------------------------------

test("resolveManifestSet: a satisfied versionRange passes through untouched", () => {
    const a = lib("a", "1.5.0");
    const b = lib("b", "1.0.0", { dependsOn: { a: { type: "library", versionRange: "^1.0.0" } } });
    const { entries } = resolveManifestSet([a, b]);
    assert.strictEqual(entries.length, 2);
    assert.deepStrictEqual(entries.find(e => e.manifest.name === "b").manifest.dependsOn, b.manifest.dependsOn);
});

test("resolveManifestSet: an unsatisfied versionRange throws", () => {
    const a = lib("a", "2.0.0");
    const b = lib("b", "1.0.0", { dependsOn: { a: { type: "library", versionRange: "^1.0.0" } } });
    assert.throws(() => resolveManifestSet([a, b]), /requires "a\^?1\.0\.0"|requires "a@\^1\.0\.0"/);
});

// ---- required vs. optional vs. soft ------------------------------------

test("resolveManifestSet: a missing REQUIRED library dependency throws", () => {
    const b = lib("b", "1.0.0", { dependsOn: { a: { type: "library" } } });
    assert.throws(() => resolveManifestSet([b]), /required/);
});

test("resolveManifestSet: a missing OPTIONAL library dependency is silently dropped", () => {
    const b = lib("b", "1.0.0", { dependsOn: { a: { type: "library", optional: true } } });
    const { entries } = resolveManifestSet([b]);
    assert.deepStrictEqual(entries[0].manifest.dependsOn, {});
});

test("resolveManifestSet: a missing SOFT library dependency is silently dropped", () => {
    const b = lib("b", "1.0.0", { dependsOn: { a: { type: "library", soft: true } } });
    const { entries } = resolveManifestSet([b]);
    assert.deepStrictEqual(entries[0].manifest.dependsOn, {});
});

test("resolveManifestSet: a PRESENT optional dependency is kept and version-checked normally", () => {
    const a = lib("a", "2.0.0");
    const b = lib("b", "1.0.0", { dependsOn: { a: { type: "library", optional: true, versionRange: "^1.0.0" } } });
    assert.throws(() => resolveManifestSet([a, b]), /requires "a/);
});

test("loadLibraries: a soft dependency orders before its dependent but never appears in ctx.dependencies", () => {
    const seen = {};
    const a = { manifest: { openrockVersion: 1, kind: "library", name: "a", version: "1.0.0", entry: "x" }, register: () => ({ api: { marker: "a-api" } }) };
    const b = {
        manifest: { openrockVersion: 1, kind: "library", name: "b", version: "1.0.0", entry: "x", dependsOn: { a: { type: "library", soft: true } } },
        register: (kernel, ctx) => { seen.dependencies = ctx.dependencies; return { api: {} }; },
    };
    loadLibraries([b, a]); // deliberately out of order in the input array
    assert.strictEqual(seen.dependencies.a, undefined);
});

// ---- breaks / conflicts -------------------------------------------------

test("resolveManifestSet: breaks throws when the named package is present", () => {
    const a = lib("a", "1.0.0");
    const b = lib("b", "1.0.0", { breaks: [{ name: "a" }] });
    assert.throws(() => resolveManifestSet([a, b]), /breaks "a"/);
});

test("resolveManifestSet: breaks with a versionRange only fires for a matching version", () => {
    const a1 = lib("a", "1.0.0");
    const b = lib("b", "1.0.0", { breaks: [{ name: "a", versionRange: "^2.0.0" }] });
    assert.doesNotThrow(() => resolveManifestSet([a1, b])); // a@1.0.0 doesn't satisfy ^2.0.0, so no break
    const a2 = lib("a", "2.5.0");
    assert.throws(() => resolveManifestSet([a2, b]), /breaks "a"/);
});

test("resolveManifestSet: breaks does not fire when the named package is absent", () => {
    const b = lib("b", "1.0.0", { breaks: [{ name: "nonexistent" }] });
    assert.doesNotThrow(() => resolveManifestSet([b]));
});

test("resolveManifestSet: conflicts is a warning, never a throw", () => {
    const a = lib("a", "1.0.0");
    const b = lib("b", "1.0.0", { conflicts: [{ name: "a" }] });
    const { warnings } = resolveManifestSet([a, b]);
    assert.strictEqual(warnings.length, 1);
    assert.match(warnings[0], /conflicts with "a"/);
});

console.log(`\n${passed} passed`);
