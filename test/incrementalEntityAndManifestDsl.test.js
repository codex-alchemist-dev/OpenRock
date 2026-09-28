#!/usr/bin/env node
// Real, end-to-end proof that createIncrementalBuild() genuinely scopes
// entityDsl and manifestDsl changes to their own compile unit, using a
// working copy of the REAL, live mods/pathfinding-demo mod (already
// real-BDS-verified) rather than a synthetic fixture - the actual mod this
// project ships, exercised through the actual incremental builder.
// Run: node test/incrementalEntityAndManifestDsl.test.js
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createIncrementalBuild, resolveBundledLibraryDirs } = require("../src/buildPipeline.js");

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

const OPENROCK_ROOT = path.join(__dirname, "..");
const LIBRARY_DIRS = resolveBundledLibraryDirs(OPENROCK_ROOT);

// A working copy MUST sit at the exact same real directory depth as the
// original (mods/<name>/...) - pathfinding-demo's own real .entity.tsx and
// .manifest.tsx files use relative imports ("../../../src/...",
// "../../src/...") whose correctness depends on that depth, not on being
// literally inside mods/pathfinding-demo/ itself.
function copyPathfindingDemo() {
    const workDir = fs.mkdtempSync(path.join(OPENROCK_ROOT, "mods", "incremental-test-"));
    fs.rmSync(workDir, { recursive: true, force: true }); // mkdtemp already created it; cpSync needs the destination to not pre-exist as a conflicting dir in some Node versions - safe to remove and recreate via cpSync itself
    fs.cpSync(path.join(OPENROCK_ROOT, "mods", "pathfinding-demo"), workDir, {
        recursive: true,
        filter: src => !/[\\/]\.(entity|manifest)-dsl-dist([\\/]|$)/.test(src), // never copy stale compiled output - let it regenerate for real
    });
    return workDir;
}

test("createIncrementalBuild (real pathfinding-demo copy): editing one entity file re-renders ONLY entities/, leaving the script bundle's Buffer untouched", () => {
    const modDir = copyPathfindingDemo();
    const inc = createIncrementalBuild(modDir, { libraryDirs: LIBRARY_DIRS });
    const before = inc.build();
    const scriptBufBefore = before.bp.get("scripts/main.js");
    assert.ok(before.bp.get("entities/nav_test.json"));
    assert.ok(before.bp.get("entities/nav_anchor.json"));

    const entityFile = path.join(modDir, "entities", "nav_test.entity.tsx");
    fs.writeFileSync(entityFile, fs.readFileSync(entityFile, "utf8").replace("value={20}", "value={5}"));
    const after = inc.rebuild(entityFile);

    assert.strictEqual(inc.isFullBuild(), false, "an entityDsl change must take the incremental path");
    const navTest = JSON.parse(after.bp.get("entities/nav_test.json").toString("utf8"));
    assert.strictEqual(navTest["minecraft:entity"].components["minecraft:health"].value, 5, "the real edit must appear in the freshly compiled entity JSON");
    assert.strictEqual(after.bp.get("scripts/main.js"), scriptBufBefore, "the script bundle must be the SAME object - an entity-only change must never re-bundle scripts");

    fs.rmSync(modDir, { recursive: true, force: true });
});

test("createIncrementalBuild (real pathfinding-demo copy): deleting one entity file removes JUST its own output, the sibling entity's output is untouched", () => {
    const modDir = copyPathfindingDemo();
    const inc = createIncrementalBuild(modDir, { libraryDirs: LIBRARY_DIRS });
    const before = inc.build();
    const navTestBufBefore = before.bp.get("entities/nav_test.json");

    const anchorFile = path.join(modDir, "entities", "nav_anchor.entity.tsx");
    fs.rmSync(anchorFile);
    const after = inc.rebuild(anchorFile);

    assert.strictEqual(after.bp.has("entities/nav_anchor.json"), false, "a deleted entity source file's own output must be removed from the pack");
    assert.ok(after.bp.has("entities/nav_test.json"), "the sibling entity (never touched) must still be present");

    fs.rmSync(modDir, { recursive: true, force: true });
});

test("createIncrementalBuild (real pathfinding-demo copy): editing the manifest DSL file re-renders ONLY manifest.json, leaving entity/script output untouched", () => {
    const modDir = copyPathfindingDemo();
    const inc = createIncrementalBuild(modDir, { libraryDirs: LIBRARY_DIRS });
    const before = inc.build();
    const scriptBufBefore = before.bp.get("scripts/main.js");
    const entityBufBefore = before.bp.get("entities/nav_test.json");

    const manifestDslFile = path.join(modDir, "manifest.manifest.tsx");
    fs.writeFileSync(manifestDslFile, fs.readFileSync(manifestDslFile, "utf8").replace("MPL-2.0", "MIT"));
    const after = inc.rebuild(manifestDslFile);

    assert.strictEqual(inc.isFullBuild(), false, "a manifestDsl-only change must take the incremental path");
    const manifestJson = JSON.parse(after.bp.get("manifest.json").toString("utf8"));
    assert.strictEqual(manifestJson.metadata.license, "MIT", "the real edit must appear in the freshly rendered manifest.json");
    assert.strictEqual(after.bp.get("scripts/main.js"), scriptBufBefore, "scripts must be untouched by a manifestDsl-only change");
    assert.strictEqual(after.bp.get("entities/nav_test.json"), entityBufBefore, "entity output must be untouched by a manifestDsl-only change");

    fs.rmSync(modDir, { recursive: true, force: true });
});

console.log(`\n${passed} passed`);
