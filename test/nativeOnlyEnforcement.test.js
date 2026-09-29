#!/usr/bin/env node
// Real, dedicated proof for the standing rule: "OpenRock physically can't
// compile hand-rolled entities, blocks, etc." - a mod that tries to smuggle
// a real, native Bedrock entities/*.json, blocks/*.json, or items/*.json
// file through a plain bpOverlayDir/rpOverlayDir MUST fail the whole
// build loudly, naming the real Crystal Manifest-* dialect that owns it.
// Run: node test/nativeOnlyEnforcement.test.js
"use strict";

const assert = require("assert");
const path = require("path");
const { buildMod, resolveBundledLibraryDirs } = require("../src/buildPipeline.js");

const LIBRARY_DIRS = resolveBundledLibraryDirs(path.join(__dirname, ".."));

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

test("buildMod: a hand-rolled entities/*.json under bpOverlayDir is a real, loud build failure naming Crystal Manifest-Entity", () => {
    assert.throws(
        () => buildMod(path.join(FIXTURES, "enforcement", "native-only-violation-mod")),
        /Crystal Manifest-Entity/,
        "the build must refuse to compile a hand-rolled native entity document"
    );
});

test("buildMod: the same real enforcement fires for a hand-rolled entity/*.json (RP client_entity) under rpOverlayDir", () => {
    const { createIncrementalBuild } = require("../src/buildPipeline.js");
    const fs = require("fs");
    const workDir = fs.mkdtempSync(path.join(FIXTURES, "enforcement", "native-only-violation-rp-"));
    fs.writeFileSync(path.join(workDir, "openrock.mod.json"), JSON.stringify({
        openrockVersion: 1, kind: "mod", name: "native-only-rp-violation", version: "0.1.0", namespace: "norv",
        packs: {
            behavior: { folder: "B", uuid: "aaaaaaaa-0000-4000-8000-000000000001", dataModuleUuid: "aaaaaaaa-0000-4000-8000-000000000002", scriptModuleUuid: "aaaaaaaa-0000-4000-8000-000000000003" },
            resource: { folder: "R", uuid: "aaaaaaaa-0000-4000-8000-000000000004", moduleUuid: "aaaaaaaa-0000-4000-8000-000000000005" },
        },
        content: { rpOverlayDir: "rp" },
    }));
    fs.mkdirSync(path.join(workDir, "rp", "entity"), { recursive: true });
    fs.writeFileSync(path.join(workDir, "rp", "entity", "hand_rolled.json"), JSON.stringify({
        format_version: "1.16.0", "minecraft:client_entity": { description: { identifier: "norv:hand_rolled" } },
    }));

    assert.throws(() => buildMod(workDir), /Crystal Manifest-Entity/);
    fs.rmSync(workDir, { recursive: true, force: true });
});

test("buildMod: the enforcement is real Crystal-dialect-specific - a hand-rolled blocks/*.json names Crystal Manifest-Block, not Crystal Manifest-Entity", () => {
    const fs = require("fs");
    const workDir = fs.mkdtempSync(path.join(FIXTURES, "enforcement", "native-only-violation-block-"));
    fs.writeFileSync(path.join(workDir, "openrock.mod.json"), JSON.stringify({
        openrockVersion: 1, kind: "mod", name: "native-only-block-violation", version: "0.1.0", namespace: "nobv",
        packs: {
            behavior: { folder: "B", uuid: "bbbbbbbb-0000-4000-8000-000000000001", dataModuleUuid: "bbbbbbbb-0000-4000-8000-000000000002", scriptModuleUuid: "bbbbbbbb-0000-4000-8000-000000000003" },
            resource: { folder: "R", uuid: "bbbbbbbb-0000-4000-8000-000000000004", moduleUuid: "bbbbbbbb-0000-4000-8000-000000000005" },
        },
        content: { bpOverlayDir: "bp" },
    }));
    fs.mkdirSync(path.join(workDir, "bp", "blocks"), { recursive: true });
    fs.writeFileSync(path.join(workDir, "bp", "blocks", "hand_rolled.json"), JSON.stringify({
        format_version: "1.21.0", "minecraft:block": { description: { identifier: "nobv:hand_rolled" }, components: {} },
    }));

    assert.throws(() => buildMod(workDir), /Crystal Manifest-Block/);
    fs.rmSync(workDir, { recursive: true, force: true });
});

test("buildMod: a REAL bypass caught by a paranoid re-audit - content.datagenEntry (arbitrary JS) returning a hand-rolled native entities/*.json is ALSO caught, not just the plain overlay-copy path", () => {
    assert.throws(
        () => buildMod(path.join(FIXTURES, "enforcement", "datagen-violation-mod"), { libraryDirs: LIBRARY_DIRS }),
        /Crystal Manifest-Entity/,
        "content.datagenEntry is arbitrary JS - it can return any path at all, including one that never touched a physical overlay directory, so it needs its OWN enforcement check, not just the overlay loop's"
    );
});

test("buildMod: a hand-rolled manifest.json under bpOverlayDir is ALSO caught - previously it silently overwrote nothing (renderManifestJson always runs last), a real confusing footgun a paranoid re-audit caught", () => {
    const fs = require("fs");
    const workDir = fs.mkdtempSync(path.join(FIXTURES, "enforcement", "native-only-violation-manifest-"));
    fs.writeFileSync(path.join(workDir, "openrock.mod.json"), JSON.stringify({
        openrockVersion: 1, kind: "mod", name: "native-only-manifest-violation", version: "0.1.0", namespace: "nomv",
        packs: {
            behavior: { folder: "B", uuid: "dddddddd-0000-4000-8000-000000000001", dataModuleUuid: "dddddddd-0000-4000-8000-000000000002", scriptModuleUuid: "dddddddd-0000-4000-8000-000000000003" },
            resource: { folder: "R", uuid: "dddddddd-0000-4000-8000-000000000004", moduleUuid: "dddddddd-0000-4000-8000-000000000005" },
        },
        content: { bpOverlayDir: "bp" },
    }));
    fs.mkdirSync(path.join(workDir, "bp"), { recursive: true });
    fs.writeFileSync(path.join(workDir, "bp", "manifest.json"), JSON.stringify({ format_version: 2, header: {}, modules: [] }));

    assert.throws(() => buildMod(workDir), /Crystal Manifest\b/);
    fs.rmSync(workDir, { recursive: true, force: true });
});

test("buildMod: legitimate, non-Crystal-owned overlay content (textures, loot tables, etc.) is completely unaffected", () => {
    // build-mod's own existing fixture uses bpOverlayDir/rpOverlayDir for
    // real content (data/note.json, textures/item_texture.json) that no
    // Crystal Manifest-* dialect owns - must still build cleanly.
    assert.doesNotThrow(() => buildMod(path.join(FIXTURES, "build-mod"), { vendorDir: FIXTURES }));
});

console.log(`\n${passed} passed`);
