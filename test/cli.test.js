#!/usr/bin/env node
// End-to-end test for bin/openrock.js (OR-Track F0) - runs the real CLI as
// a child process against a minimal self-contained fixture mod (no
// dependencies, so it needs no vendor/ folder), never against real Claude
// Waifus.
// Run: node test/cli.test.js
"use strict";

const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

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

const CLI = path.join(__dirname, "..", "bin", "openrock.js");

function makeStandaloneMod() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openrock-cli-test-"));
    const modDir = path.join(tmp, "mod");
    fs.mkdirSync(path.join(modDir, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(modDir, "openrock.mod.json"), JSON.stringify({
        openrockVersion: 1, kind: "mod", name: "cli-test-mod", version: "0.1.0", namespace: "ctm",
        packs: {
            behavior: { folder: "CLI Test B", uuid: "a1111111-1111-1111-1111-111111111111", dataModuleUuid: "a2222222-2222-2222-2222-222222222222", scriptModuleUuid: "a3333333-3333-3333-3333-333333333333" },
            resource: { folder: "CLI Test R", uuid: "a4444444-4444-4444-4444-444444444444", moduleUuid: "a5555555-5555-5555-5555-555555555555" },
        },
        content: { scriptsDir: "scripts" },
    }));
    fs.writeFileSync(path.join(modDir, "scripts", "main_content.js"), "export const MARKER = true;\n");
    return modDir;
}

function run(args) {
    return execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

test("openrock build: produces a real build/ tree with a correct manifest.json", () => {
    const modDir = makeStandaloneMod();
    const output = run(["build", modDir]);
    assert.match(output, /Built cli-test-mod/);
    const manifestPath = path.join(modDir, "build", "CLI Test B", "manifest.json");
    assert.ok(fs.existsSync(manifestPath));
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.strictEqual(manifest.header.uuid, "a1111111-1111-1111-1111-111111111111");
    assert.ok(fs.existsSync(path.join(modDir, "build", "CLI Test B", "scripts", "main.js")));
    assert.ok(fs.existsSync(path.join(modDir, "build", "CLI Test R", "manifest.json")));
});

test("openrock check: validates without writing anything", () => {
    const modDir = makeStandaloneMod();
    const output = run(["check", modDir]);
    assert.match(output, /OK - cli-test-mod/);
    assert.strictEqual(fs.existsSync(path.join(modDir, "build")), false);
});

test("openrock export: produces a real .mcaddon (a valid, non-empty ZIP)", () => {
    const modDir = makeStandaloneMod();
    const output = run(["export", modDir]);
    assert.match(output, /Exported/);
    const file = path.join(modDir, "dist", "cli-test-mod 0.1.0.mcaddon");
    assert.ok(fs.existsSync(file));
    const buf = fs.readFileSync(file);
    assert.ok(buf.length > 100);
    // A real ZIP's end-of-central-directory signature must appear somewhere near the end.
    assert.ok(buf.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06])));
});

test("openrock <unknown command>: prints usage and exits non-zero", () => {
    let threw = false;
    try { run(["bogus-command"]); }
    catch (e) { threw = true; assert.match(e.stdout ?? "", /Usage: openrock/); }
    assert.strictEqual(threw, true);
});

test("openrock deploy: writes into OPENROCK_COM_MOJANG's development pack folders", () => {
    const modDir = makeStandaloneMod();
    const fakeComMojang = fs.mkdtempSync(path.join(os.tmpdir(), "openrock-cli-mojang-"));
    const output = execFileSync(process.execPath, [CLI, "deploy", modDir], { encoding: "utf8", env: { ...process.env, OPENROCK_COM_MOJANG: fakeComMojang } });
    assert.match(output, /Deployed cli-test-mod/);
    assert.ok(fs.existsSync(path.join(fakeComMojang, "development_behavior_packs", "CLI Test B", "manifest.json")));
    assert.ok(fs.existsSync(path.join(fakeComMojang, "development_resource_packs", "CLI Test R", "manifest.json")));
});

test("openrock dev (multi-mod): a cross-mod breaks conflict is caught before anything deploys", () => {
    const modsDir = path.join(__dirname, "fixtures", "mods-dir"); // mod-b declares breaks: [{name: "mod-a"}]
    let threw = false;
    try { run(["dev", modsDir]); }
    catch (e) { threw = true; assert.match(e.stderr ?? e.message, /"mod-b" breaks "mod-a"/); }
    assert.strictEqual(threw, true);
});

test("openrock build <nonexistent dir>: fails with a clear error, non-zero exit", () => {
    let threw = false;
    try { run(["build", path.join(os.tmpdir(), "definitely-does-not-exist-openrock-test")]); }
    catch (e) { threw = true; assert.match(e.stderr ?? e.message, /No openrock\.mod\.json/); }
    assert.strictEqual(threw, true);
});

console.log(`\n${passed} passed`);
