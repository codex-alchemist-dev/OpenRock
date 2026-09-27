#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for src/buildPipeline.js
// (OR-Track F0), against the dummy build-lib/build-mod fixtures - never
// against real Claude Waifus, per the plan's own note on why this phase
// carries zero cutover risk.
// Run: node test/buildPipeline.test.js
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildMod, resolveBundledLibraryDirs, writeTree } = require("../src/buildPipeline.js");

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

const FIXTURES = path.join(__dirname, "fixtures");
const MOD_DIR = path.join(FIXTURES, "build-mod");

function build() {
    return buildMod(MOD_DIR, { vendorDir: FIXTURES });
}

test("buildMod: copies a library's own overlay files, unmerged files pass through untouched", () => {
    const { bp } = build();
    const lootTable = JSON.parse(bp.get("loot_tables/example.json").toString("utf8"));
    assert.strictEqual(lootTable.pools[0].entries[0].name, "build-lib:shared_icon");
});

test("buildMod: MERGED_FILES combines the library's and mod's own registry contributions", () => {
    const { rp } = build();
    const itemTexture = JSON.parse(rp.get("textures/item_texture.json").toString("utf8"));
    assert.deepStrictEqual(Object.keys(itemTexture.texture_data).sort(), ["bm:mod_icon", "build-lib:shared_icon"]);
});

test("buildMod: {{ns}} placeholders are filled from the mod's own namespace", () => {
    const { bp } = build();
    const note = JSON.parse(bp.get("data/note.json").toString("utf8"));
    assert.strictEqual(note.note, "this mod's namespace is bm");
});

test("buildMod: scripts from BOTH the library and the mod are bundled, namespaced by package folder", () => {
    const { bp } = build();
    assert.ok(bp.has("scripts/build-lib/lib_runtime.js"));
    assert.ok(bp.has("scripts/build-mod/mod_runtime.js"));
});

test("buildMod: main.js imports the library's scripts BEFORE the mod's own (dependency load order)", () => {
    const { bp } = build();
    const main = bp.get("scripts/main.js").toString("utf8");
    const libIndex = main.indexOf("build-lib/lib_runtime.js");
    const modIndex = main.indexOf("build-mod/mod_runtime.js");
    assert.ok(libIndex >= 0 && modIndex >= 0 && libIndex < modIndex);
});

test("buildMod: generates a real BP manifest.json from packs/version", () => {
    const { bp } = build();
    const manifest = JSON.parse(bp.get("manifest.json").toString("utf8"));
    assert.deepStrictEqual(manifest.header.version, [1, 2, 3]);
    assert.strictEqual(manifest.header.uuid, "11111111-1111-1111-1111-111111111111");
    assert.strictEqual(manifest.modules[1].entry, "scripts/main.js");
    assert.strictEqual(manifest.dependencies[0].uuid, "44444444-4444-4444-4444-444444444444");
});

test("buildMod: generates a real RP manifest.json too", () => {
    const { rp } = build();
    const manifest = JSON.parse(rp.get("manifest.json").toString("utf8"));
    assert.strictEqual(manifest.header.uuid, "44444444-4444-4444-4444-444444444444");
    assert.strictEqual(manifest.modules[0].uuid, "55555555-5555-5555-5555-555555555555");
});

test("buildMod: throws a clear error for a missing submodule dependency directory", () => {
    assert.throws(() => buildMod(MOD_DIR, { vendorDir: path.join(FIXTURES, "nonexistent") }), /No openrock\.mod\.json or openrock\.library\.json found/);
});

test("buildMod: throws if pointed at a library manifest instead of a mod", () => {
    assert.throws(() => buildMod(path.join(FIXTURES, "build-lib")), /is not a mod manifest/);
});

test("resolveBundledLibraryDirs: finds every real libs/* package by name", () => {
    const dirs = resolveBundledLibraryDirs(path.join(__dirname, ".."));
    assert.strictEqual(dirs["@openrock/registries"], path.join(__dirname, "..", "libs", "registries"));
    assert.strictEqual(dirs["@openrock/datagen"], path.join(__dirname, "..", "libs", "datagen"));
});

test("writeTree: a real build round-trips through the filesystem correctly", () => {
    const { bp } = build();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openrock-build-test-"));
    try {
        const result = writeTree(bp, tmp);
        assert.ok(result.written > 0);
        assert.strictEqual(fs.existsSync(path.join(tmp, "manifest.json")), true);
        assert.strictEqual(fs.existsSync(path.join(tmp, "scripts", "main.js")), true);
        // A second write with no changes writes nothing new.
        const second = writeTree(bp, tmp);
        assert.strictEqual(second.written, 0);
        assert.strictEqual(second.removed, 0);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

console.log(`\n${passed} passed`);
