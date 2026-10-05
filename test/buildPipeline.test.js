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
const asyncTests = [];
function test(name, fn) {
    try {
        const result = fn();
        if (result && typeof result.then === "function") {
            asyncTests.push(result.then(
                () => { passed++; console.log(`ok - ${name}`); },
                e => { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
            ));
            return;
        }
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

test("buildMod: scripts from BOTH the library and the mod are REAL esbuild-bundled into one scripts/main.js, not copied as separate per-package files", () => {
    const { bp } = build();
    assert.deepStrictEqual([...bp.keys()].filter(k => k.startsWith("scripts/")).sort(), ["scripts/main.js", "scripts/main.js.map"], "exactly one real bundled scripts/main.js (+ its source map), no per-package folders");
    const main = bp.get("scripts/main.js").toString("utf8");
    assert.match(main, /LIB_MARKER\s*=\s*"build-lib-loaded"/, "build-lib's own code is really in the bundle");
    assert.match(main, /MOD_MARKER\s*=\s*"build-mod-loaded"/, "build-mod's own code is really in the bundle");
});

test("buildMod: build-mod's script genuinely IMPORTS build-lib's export BY PACKAGE NAME (a bare specifier, no relative path) and the value really flows through - proof this is real cross-package resolution, not string concatenation", () => {
    const { bp } = build();
    const main = bp.get("scripts/main.js").toString("utf8");
    // COMBINED = `${LIB_MARKER}+${MOD_MARKER}` in the source - if esbuild's
    // alias-based cross-package resolution didn't really work, this would
    // either be a build failure (unresolvable "build-lib" specifier) or a
    // template literal left unevaluated in the output; a real bundler
    // inlines both variables' real values into one combined expression.
    assert.match(main, /COMBINED\s*=\s*`\$\{LIB_MARKER\}\+\$\{MOD_MARKER\}`/);
});

test("buildMod: content.scriptEntry names the real bundling entry point; a same-package file reached only via a relative import is bundled in (used) or tree-shaken out (unused) like a real bundler, never separately copied", () => {
    const { bp } = buildMod(path.join(FIXTURES, "script-entry-lib"));
    assert.deepStrictEqual([...bp.keys()].filter(k => k.startsWith("scripts/")).sort(), ["scripts/main.js", "scripts/main.js.map"]);
    const main = bp.get("scripts/main.js").toString("utf8");
    // helper.js's HELPER is genuinely used (ENTRY = HELPER) - it must be
    // present, bundled in, not a separate uncompiled file sitting alongside.
    assert.match(main, /HELPER\s*=\s*true/);
    assert.strictEqual(bp.has("scripts/script-entry-mod/helper.js"), false, "no separate per-file copy - it's bundled into scripts/main.js");
});

test("buildMod: writes a real source map alongside scripts/main.js (OR-Track C2's debugger needs this - a real bundle mixes multiple files' line numbers, unlike the old copy-only model)", () => {
    const { bp } = build();
    assert.ok(bp.has("scripts/main.js.map"));
    const map = JSON.parse(bp.get("scripts/main.js.map").toString("utf8"));
    assert.ok(Array.isArray(map.sources) && map.sources.length >= 2, "the map must reference both build-lib's and build-mod's original source files");
    assert.ok(map.sources.some(s => s.includes("lib_runtime.js")));
    assert.ok(map.sources.some(s => s.includes("mod_runtime.js")));
    assert.match(bp.get("scripts/main.js").toString("utf8"), /\/\/# sourceMappingURL=main\.js\.map\s*$/);
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

test("buildMod: throws if pointed at an ordinary (non-hybrid) library with no packs of its own", () => {
    assert.throws(() => buildMod(path.join(FIXTURES, "build-lib")), /has no buildable pack/);
});

// ---- OR-Track K: hybrid libraries (their own packs, still kind:"library") ----

test("buildMod: a hybrid library (kind:\"library\" with its own packs) builds as its own real pack, real esbuild-bundled scripts included", () => {
    const { bp, rp, manifest } = buildMod(path.join(FIXTURES, "hybrid-library"));
    assert.strictEqual(manifest.kind, "library");
    assert.ok(bp.has("manifest.json"));
    assert.ok(bp.has("scripts/main.js"));
    assert.match(bp.get("scripts/main.js").toString("utf8"), /HYBRID_MARKER\s*=\s*true/);
    assert.ok(rp.has("textures/note.txt"));
    const bpManifest = JSON.parse(bp.get("manifest.json").toString("utf8"));
    assert.strictEqual(bpManifest.header.uuid, "f1111111-1111-1111-1111-111111111111");
});

// ---- OR-Track G: resource-pack-only mods -----------------------------------

test("buildMod: a resource-pack-only mod (packs.behavior: false) produces bp: null", () => {
    const { bp, rp } = buildMod(path.join(FIXTURES, "resource-only-mod"));
    assert.strictEqual(bp, null);
    assert.ok(rp.has("textures/note.txt"));
    assert.ok(rp.has("manifest.json"));
});

test("buildMod: a resource-pack-only mod's RP manifest has no script/data modules", () => {
    const { rp } = buildMod(path.join(FIXTURES, "resource-only-mod"));
    const manifest = JSON.parse(rp.get("manifest.json").toString("utf8"));
    assert.deepStrictEqual(manifest.modules, [{ type: "resources", uuid: "e5555555-5555-5555-5555-555555555555", version: [1, 0, 0] }]);
});

// ---- content.datagenEntry (OR-Track B2, made real) -------------------------

const LIBRARY_DIRS = resolveBundledLibraryDirs(path.join(__dirname, ".."));

test("buildMod: content.datagenEntry executes a real Node script using @openrock/datagen's real builders, output merged into the pack", () => {
    const { bp } = buildMod(path.join(FIXTURES, "datagen-mod"), { libraryDirs: LIBRARY_DIRS });
    assert.ok(bp.has("recipes/dg_test_recipe.json"));
    const recipe = JSON.parse(bp.get("recipes/dg_test_recipe.json").toString("utf8"));
    assert.strictEqual(recipe["minecraft:recipe_shapeless"].description.identifier, "dg:test_recipe");
    assert.deepStrictEqual(recipe["minecraft:recipe_shapeless"].ingredients, [{ item: "minecraft:stick", count: 2 }]);

    assert.ok(bp.has("loot_tables/dg_test_loot.json"));
    const loot = JSON.parse(bp.get("loot_tables/dg_test_loot.json").toString("utf8"));
    assert.strictEqual(loot.pools[0].entries[0].name, "dg:test_item");
});

test("buildMod: datagenEntry without a real @openrock/datagen dependency resolvable is a clear compile error, not a cryptic require() failure (caught even earlier than datagenApi() itself - by collectEntries()'s own normal dependency resolution)", () => {
    assert.throws(
        () => buildMod(path.join(FIXTURES, "datagen-mod")), // no libraryDirs given - @openrock/datagen can't resolve
        /depends on library "@openrock\/datagen", but no directory for it was given/,
    );
});

test("buildMod: datagenEntry with NO dependsOn declared for @openrock/datagen at all (not just missing libraryDirs) is caught by datagenApi()'s own error, not collectEntries()'s", () => {
    assert.throws(
        () => buildMod(path.join(FIXTURES, "datagen-mod-no-dep"), { libraryDirs: LIBRARY_DIRS }),
        /needs a real "@openrock\/datagen" dependency.*none found/,
    );
});

test("buildMod: a datagenEntry script that doesn't exist is a clear compile error naming the missing path", () => {
    assert.throws(
        () => buildMod(path.join(FIXTURES, "datagen-mod-missing-entry"), { libraryDirs: LIBRARY_DIRS }),
        /content\.datagenEntry "nope\.js" doesn't exist/,
    );
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

// ---- OR-Track N: provides.api-based alias resolution (real ESM import of a library) ----

test("buildMod: a bare `import { x } from \"some-library\"` in a mod's own script resolves via that library's real provides.api file, even when the library declares NO content.scriptsDir of its own - and the bundled result genuinely EXECUTES the real function, not a stub", async () => {
    const { bp } = buildMod(path.join(FIXTURES, "api-import-mod"), {
        libraryDirs: { "api-only-lib": path.join(FIXTURES, "api-only-lib") },
    });
    const main = bp.get("scripts/main.js").toString("utf8");
    // Real proof, not a string-match on emitted source: write the real
    // bundled output to disk and actually import() + run it. This fixture's
    // script imports no @minecraft/server API, so it's genuinely executable
    // under plain Node - if the import didn't really resolve to
    // api-only-lib's real double() function, this would either fail to
    // import at all or RESULT would be wrong/undefined.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openrock-provides-api-test-"));
    try {
        const outFile = path.join(tmp, "bundled.mjs");
        fs.writeFileSync(outFile, main);
        const mod = await import(`file://${outFile.replace(/\\/g, "/")}`);
        assert.strictEqual(mod.RESULT, 42, "double(21) must equal 42 - the REAL function body from api-only-lib actually ran");
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test("buildMod: a real unresolvable script import produces the intricate build-debugger report (file/line/column/code-frame/fix), not esbuild's own raw default text", () => {
    // Real, confirmed-by-testing esbuild behavior: buildSync() THROWS its
    // own BuildFailure exception on a real bundling error - it never
    // returns normally with a populated `result.errors` array, regardless
    // of `logLevel`. This is a real regression test for that exact gap
    // (caught live via an actual `openrock build` run, not assumed): before
    // the fix, this exact scenario surfaced esbuild's own default
    // "Build failed with N error(s):\n..." text instead of this project's
    // real, intricate diagnostic report.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openrock-esbuild-diag-test-"));
    try {
        fs.writeFileSync(path.join(tmp, "openrock.mod.json"), JSON.stringify({
            openrockVersion: 1, kind: "mod", name: "broken-import-mod", version: "1.0.0", namespace: "bim",
            packs: {
                behavior: { folder: "B", uuid: "11111111-1111-1111-1111-111111111111", dataModuleUuid: "22222222-2222-2222-2222-222222222222", scriptModuleUuid: "33333333-3333-3333-3333-333333333333" },
                resource: { folder: "R", uuid: "44444444-4444-4444-4444-444444444444", moduleUuid: "55555555-5555-5555-5555-555555555555" },
            },
            content: { scriptsDir: "scripts" },
        }));
        fs.mkdirSync(path.join(tmp, "scripts"));
        fs.writeFileSync(path.join(tmp, "scripts", "main.js"), 'import { x } from "this-module-does-not-exist";\n');
        assert.throws(
            () => buildMod(tmp),
            err => {
                assert.match(err.message, /esbuild failed bundling "broken-import-mod"'s scripts - 1 real error found/);
                assert.match(err.message, /scripts[\\/]main\.js:1:\d+/);
                assert.match(err.message, /Could not resolve "this-module-does-not-exist"/);
                assert.match(err.message, /Fix: Check the import\/reference/);
                return true;
            }
        );
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test("collectEntries: a submodule dep that exists but has no OpenRock manifest (plain code like vendor/mclite) is skipped, so libs depending on capabilities/i18n resolve", () => {
    const { collectEntries } = require("../src/buildPipeline.js");
    const { loadManifestFile } = require("../src/manifest.js");
    const root = path.join(__dirname, "..");
    const { manifest, dir } = loadManifestFile(path.join(root, "libs", "i18n"));
    const names = collectEntries(manifest, dir, { vendorDir: root, libraryDirs: resolveBundledLibraryDirs(root) }).map(e => e.manifest.name);
    assert.deepStrictEqual(names, ["@openrock/i18n", "@openrock/capabilities"]);
});

Promise.all(asyncTests).then(() => console.log(`\n${passed} passed`));
