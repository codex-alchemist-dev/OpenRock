#!/usr/bin/env node
// Real, end-to-end proof for OR-Track Q6's actual incremental build
// (src/buildPipeline.js's createIncrementalBuild()) - not just a compile
// cache, but a genuine "only re-render the one compile unit a changed file
// belongs to" builder, proven by asserting UNRELATED keys in the resulting
// {bp, rp} Maps keep the EXACT SAME Buffer object reference across a
// rebuild (proof that unit was never touched at all, not just "produced an
// equal-looking result").
// Run: node test/incrementalBuild.test.js
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createIncrementalBuild } = require("../src/buildPipeline.js");

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

// build-mod is a real, shared, git-tracked fixture other tests also read -
// copied into a fresh scratch directory per test so mutating it here can
// never affect (or be affected by) anything else. vendorDir still points
// at the REAL FIXTURES dir - dependency resolution (build-lib) only needs
// vendorDir + the dependency's own declared relative path, independent of
// where the depending mod's own directory happens to live.
function copyBuildMod() {
    const workDir = fs.mkdtempSync(path.join(FIXTURES, "incremental-build-mod-"));
    fs.cpSync(path.join(FIXTURES, "build-mod"), workDir, { recursive: true });
    return workDir;
}

test("createIncrementalBuild: the first .build() is a real, full build - isFullBuild() reports true", () => {
    const modDir = copyBuildMod();
    const inc = createIncrementalBuild(modDir, { vendorDir: FIXTURES });
    const result = inc.build();
    assert.ok(inc.isFullBuild());
    assert.match(result.bp.get("scripts/main.js").toString("utf8"), /MOD_MARKER\s*=\s*"build-mod-loaded"/);
    assert.match(result.bp.get("data/note.json").toString("utf8"), /this mod's namespace is bm/);
    fs.rmSync(modDir, { recursive: true, force: true });
});

test("createIncrementalBuild: an overlay-file-only change re-renders ONLY that file - the script bundle's Buffer is the exact same object, never re-touched", () => {
    const modDir = copyBuildMod();
    const inc = createIncrementalBuild(modDir, { vendorDir: FIXTURES });
    const before = inc.build();
    const scriptBufBefore = before.bp.get("scripts/main.js");

    const overlayFile = path.join(modDir, "bp", "data", "note.json");
    fs.writeFileSync(overlayFile, JSON.stringify({ note: "a real, edited note for {{ns}}" }, null, 2));
    const after = inc.rebuild(overlayFile);

    assert.strictEqual(inc.isFullBuild(), false, "an overlay change must take the incremental path, not fall back to a full rebuild");
    assert.match(after.bp.get("data/note.json").toString("utf8"), /a real, edited note for bm/);
    assert.strictEqual(after.bp.get("scripts/main.js"), scriptBufBefore, "the script bundle must be the SAME object - proof it was never re-bundled for an unrelated overlay change");

    fs.rmSync(modDir, { recursive: true, force: true });
});

test("createIncrementalBuild: deleting an overlay file removes it from the pack, real rebuild, not a stale leftover", () => {
    const modDir = copyBuildMod();
    const inc = createIncrementalBuild(modDir, { vendorDir: FIXTURES });
    inc.build();

    const overlayFile = path.join(modDir, "bp", "data", "note.json");
    fs.rmSync(overlayFile);
    const after = inc.rebuild(overlayFile);

    assert.strictEqual(after.bp.has("data/note.json"), false, "a real file deletion must remove the corresponding pack entry");
    fs.rmSync(modDir, { recursive: true, force: true });
});

test("createIncrementalBuild: a script-file-only change re-bundles scripts but leaves the overlay file's Buffer untouched (same object)", () => {
    const modDir = copyBuildMod();
    const inc = createIncrementalBuild(modDir, { vendorDir: FIXTURES });
    const before = inc.build();
    const overlayBufBefore = before.bp.get("data/note.json");

    const scriptFile = path.join(modDir, "scripts", "mod_runtime.js");
    const src = fs.readFileSync(scriptFile, "utf8");
    fs.writeFileSync(scriptFile, src.replace('"build-mod-loaded"', '"build-mod-loaded-EDITED"'));
    const after = inc.rebuild(scriptFile);

    assert.strictEqual(inc.isFullBuild(), false, "a scriptsDir change must take the incremental path");
    assert.match(after.bp.get("scripts/main.js").toString("utf8"), /build-mod-loaded-EDITED/, "the real edit must appear in the freshly rebundled script");
    assert.strictEqual(after.bp.get("data/note.json"), overlayBufBefore, "the overlay file's Buffer must be the SAME object - proof it was never re-copied for an unrelated script change");

    fs.rmSync(modDir, { recursive: true, force: true });
});

test("createIncrementalBuild: a change to a file OUTSIDE every known content directory falls back to a real, full rebuild", () => {
    const modDir = copyBuildMod();
    const inc = createIncrementalBuild(modDir, { vendorDir: FIXTURES });
    inc.build();

    const manifestPath = path.join(modDir, "openrock.mod.json");
    inc.rebuild(manifestPath); // the mod's own manifest - not any known content unit
    assert.strictEqual(inc.isFullBuild(), true, "an unattributable change must trigger a real, safe full rebuild, never a silent no-op or a guess");

    fs.rmSync(modDir, { recursive: true, force: true });
});

test("createIncrementalBuild: rebuild() with no prior .build() call does a real full build itself, not a crash", () => {
    const modDir = copyBuildMod();
    const inc = createIncrementalBuild(modDir, { vendorDir: FIXTURES });
    const result = inc.rebuild(path.join(modDir, "scripts", "mod_runtime.js"));
    assert.ok(inc.isFullBuild());
    assert.ok(result.bp.get("scripts/main.js"));
    fs.rmSync(modDir, { recursive: true, force: true });
});

console.log(`\n${passed} passed`);
