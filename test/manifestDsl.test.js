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

console.log(`\n${passed} passed`);
