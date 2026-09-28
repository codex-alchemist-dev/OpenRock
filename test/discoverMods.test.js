#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for buildPipeline.js's
// discoverMods() (OR-Track F1's multi-mod enumeration) and its combination
// with resolver.js's resolveManifestSet() for cross-mod conflict
// detection across a whole mods/ folder.
// Run: node test/discoverMods.test.js
"use strict";

const assert = require("assert");
const path = require("path");
const { discoverMods } = require("../src/buildPipeline.js");
const { resolveManifestSet } = require("../src/resolver.js");

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

const MODS_DIR = path.join(__dirname, "fixtures", "mods-dir");

test("discoverMods: finds every valid mod subdirectory, skips non-mod ones silently", () => {
    const found = discoverMods(MODS_DIR);
    const names = found.map(f => f.manifest.name).sort();
    assert.deepStrictEqual(names, ["mod-a", "mod-b"]);
});

test("discoverMods: a hybrid library (kind:\"library\" with its own packs) counts as discoverable too (OR-Track K)", () => {
    const found = discoverMods(path.join(__dirname, "fixtures"));
    const names = found.map(f => f.manifest.name).sort();
    assert.deepStrictEqual(names, ["build-mod", "datagen-mod", "datagen-mod-missing-entry", "datagen-mod-no-dep", "hybrid-library", "resource-only-mod", "script-entry-mod"]);
    // build-lib (an ordinary, non-hybrid library) and mods-dir (a folder of
    // manifests, not a manifest itself) are correctly excluded.
});

test("discoverMods: an empty/nonexistent mods dir returns an empty array, not a throw", () => {
    assert.deepStrictEqual(discoverMods(path.join(MODS_DIR, "does-not-exist")), []);
});

test("resolveManifestSet across a discovered mods/ folder catches a cross-mod breaks conflict", () => {
    const found = discoverMods(MODS_DIR); // mod-b declares breaks: [{name: "mod-a"}]
    assert.throws(() => resolveManifestSet(found), /"mod-b" breaks "mod-a"/);
});

test("resolveManifestSet on a conflict-free subset passes cleanly", () => {
    const found = discoverMods(MODS_DIR).filter(f => f.manifest.name === "mod-a");
    assert.doesNotThrow(() => resolveManifestSet(found));
});

console.log(`\n${passed} passed`);
