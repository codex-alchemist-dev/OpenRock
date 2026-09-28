#!/usr/bin/env node
// Real proof for OR-Track O (the manifest DSL): compile a real
// .manifest.tsx through real tsc -> requireCompiled -> the real,
// declarative manifestBuilder.js backend, and assert every confirmed
// manifest.json field (learn.microsoft.com's own
// 3.0.0.PackManifestDocument shape) round-trips correctly, including the
// real subpacks shape confirmed via a live docs fetch.
// Run: node test/manifestDsl.test.js
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { compileManifestDsl } = require("../src/manifestDsl/manifestCompiler.js");
const { mergeManifestDoc } = require("../src/manifestDsl/manifestBuilder.js");

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

const FIXTURE = path.join(__dirname, "fixtures", "manifest-dsl-pilot", "pilot.manifest.tsx");

test("compileManifestDsl: a real .manifest.tsx compiles through real tsc into real bp/rp manifest.json documents", () => {
    const { bp, rp } = compileManifestDsl(FIXTURE);
    assert.strictEqual(bp.format_version, 2);
    assert.strictEqual(rp.format_version, 3);
});

test("compileManifestDsl: <Header> produces the real header shape, camelCase props mapped to real snake_case fields", () => {
    const { bp } = compileManifestDsl(FIXTURE);
    assert.deepStrictEqual(bp.header, {
        name: "pack.name", description: "pack.description",
        uuid: "11111111-1111-1111-1111-111111111111",
        version: [1, 0, 0], min_engine_version: [1, 21, 0],
    });
});

test("compileManifestDsl: <Module>/<Dependency>/<Capability>/<Metadata> produce the real, correct manifest.json arrays", () => {
    const { bp } = compileManifestDsl(FIXTURE);
    assert.deepStrictEqual(bp.modules, [{ type: "data", uuid: "22222222-2222-2222-2222-222222222222", version: [1, 0, 0] }]);
    assert.deepStrictEqual(bp.dependencies, [{ module_name: "@minecraft/server", version: "1.10.0" }]);
    assert.deepStrictEqual(bp.capabilities, ["raytraced"]);
    assert.deepStrictEqual(bp.metadata, { authors: ["OpenRock Pilot"], license: "MPL-2.0" });
});

test("compileManifestDsl: <Setting> (v3 preview) passes through real, un-validated fields", () => {
    const { bp } = compileManifestDsl(FIXTURE);
    assert.deepStrictEqual(bp.settings, [{ type: "toggle", identifier: "pilotToggle", text: "Pilot toggle", defaultValue: true }]);
});

test("compileManifestDsl: <Subpack> produces the real, confirmed {folder_name, name, memory_performance_tier} shape - not guessed", () => {
    const { rp } = compileManifestDsl(FIXTURE);
    assert.deepStrictEqual(rp.subpacks, [
        { folder_name: "textures_sd", name: "SD Textures", memory_performance_tier: 1 },
        { folder_name: "textures_hd", name: "HD Textures", memory_performance_tier: 3 },
    ]);
    assert.strictEqual(rp.header.pack_scope, "any");
});

test("compileManifestDsl: a mod with no manifest DSL file at all returns null, not an error", () => {
    assert.strictEqual(compileManifestDsl(path.join(__dirname, "fixtures", "does-not-exist.manifest.tsx")), null);
});

test("mergeManifestDoc: a real DSL override EXTENDS the generated document - concatenates arrays, doesn't replace them", () => {
    const generated = {
        format_version: 2,
        header: { name: "pack.name", uuid: "gen-uuid", version: [1, 0, 0] },
        modules: [{ type: "data", uuid: "gen-data-uuid", version: [1, 0, 0] }],
    };
    const dslDoc = { header: { description: "a real description" }, capabilities: ["pbr"] };
    const merged = mergeManifestDoc(generated, dslDoc);
    assert.deepStrictEqual(merged.header, { name: "pack.name", uuid: "gen-uuid", version: [1, 0, 0], description: "a real description" });
    assert.deepStrictEqual(merged.modules, [{ type: "data", uuid: "gen-data-uuid", version: [1, 0, 0] }]);
    assert.deepStrictEqual(merged.capabilities, ["pbr"]);
});

test("mergeManifestDoc: a real key collision lets the DSL win over the generated value", () => {
    const generated = { header: { name: "generated-name" } };
    const merged = mergeManifestDoc(generated, { header: { name: "dsl-override-name" } });
    assert.strictEqual(merged.header.name, "dsl-override-name");
});

test("mergeManifestDoc: a null dslDoc (no manifest DSL authored) returns the generated document completely unchanged", () => {
    const generated = { format_version: 2, header: { name: "x" } };
    assert.strictEqual(mergeManifestDoc(generated, null), generated);
});

test("compileManifestDsl (OR-Track Q6): an unchanged file returns the SAME cached object - real tsc is skipped, not just fast", () => {
    const first = compileManifestDsl(FIXTURE);
    const second = compileManifestDsl(FIXTURE);
    assert.strictEqual(first, second, "a cache hit must return the exact cached object, proving compileManifestDsl() didn't recompile at all");
});

test("compileManifestDsl (OR-Track Q6): editing the real .manifest.tsx file produces a genuinely fresh, different compile", () => {
    // Same drive as the repo, not os.tmpdir() - see entityDsl.test.js's
    // identical note for the real reason (tsc's rootDir inference needs a
    // common ancestor, and Windows drive letters have none across drives).
    const workDir = fs.mkdtempSync(path.join(__dirname, "fixtures", "openrock-manifestdsl-cache-test-"));
    const src = fs.readFileSync(FIXTURE, "utf8");
    const srcPath = path.join(workDir, "pilot.manifest.tsx");
    // The fixture's relative imports ("../../../src/...") assume its real
    // fixtures/manifest-dsl-pilot/ location - rewrite to an absolute path
    // for this test's own, differently-nested temp directory.
    const absSrcDir = path.join(__dirname, "..", "src").split(path.sep).join("/");
    fs.writeFileSync(srcPath, src.replace(/\.\.\/\.\.\/\.\.\/src/g, absSrcDir));

    const before = compileManifestDsl(srcPath);
    assert.strictEqual(before.bp.format_version, 2);

    fs.writeFileSync(srcPath, fs.readFileSync(srcPath, "utf8").replace("formatVersion={2}", "formatVersion={99}"));
    const after = compileManifestDsl(srcPath);
    assert.strictEqual(after.bp.format_version, 99, "a real source edit must be picked up, not masked by the cache");
    assert.notStrictEqual(before, after);

    fs.rmSync(workDir, { recursive: true, force: true });
});

console.log(`\n${passed} passed`);
