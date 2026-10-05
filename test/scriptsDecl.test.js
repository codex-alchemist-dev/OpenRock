#!/usr/bin/env node
// Tests for src/scriptsDecl.js (manifest "scripts" declaration) and the
// `openrock info` command. Run: node test/scriptsDecl.test.js
"use strict";

const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { validateManifest } = require("../src/manifest.js");
const { describeScripts, describeScriptsTree, checkExternalScriptFiles } = require("../src/scriptsDecl.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

const lib = extra => ({ openrockVersion: 1, kind: "library", name: "t-lib", version: "1.0.0", entry: "src/register.js", ...extra });

test("no scripts block: validates, summary is inferred from content/provides", () => {
    const m = lib({ provides: { api: "src/register.js" } });
    validateManifest(m);
    const d = describeScripts(m);
    assert.deepStrictEqual([d.runtime, d.buildTime, d.declared, d.external], [true, false, false, []]);
});

test("declared scripts block round-trips through describeScripts, with why defaulting to null", () => {
    const m = lib({
        provides: { api: "src/register.js" },
        content: { datagenEntry: "build/gen.js" },
        scripts: { runtime: true, buildTime: true, external: [{ name: "mtl", path: "build/mtl.js", runs: "build" }] },
    });
    validateManifest(m);
    const d = describeScripts(m);
    assert.strictEqual(d.declared, true);
    assert.deepStrictEqual(d.external, [{ name: "mtl", path: "build/mtl.js", runs: "build", why: null }]);
});

test("rejects structurally bad scripts blocks", () => {
    assert.throws(() => validateManifest(lib({ scripts: [] })), /"scripts" must be an object/);
    assert.throws(() => validateManifest(lib({ scripts: { runtime: "yes" } })), /scripts\.runtime must be a boolean/);
    assert.throws(() => validateManifest(lib({ scripts: { external: {} } })), /scripts\.external must be an array/);
    assert.throws(() => validateManifest(lib({ scripts: { external: [{ path: "a.js", runs: "build" }] } })), /name is required/);
    assert.throws(() => validateManifest(lib({ scripts: { external: [{ name: "a", path: "a.js", runs: "nope" }] } })), /runs must be one of/);
});

test("lying runtime:false is an error when the package really ships scripts", () => {
    assert.throws(() => validateManifest(lib({ provides: { api: "src/register.js" }, scripts: { runtime: false } })), /runtime is false but the manifest ships in-world scripts/);
    assert.throws(() => validateManifest(lib({ content: { scriptsDir: "s" }, scripts: { runtime: false } })), /runtime is false/);
});

test("lying buildTime:false is an error when datagenEntry exists", () => {
    assert.throws(() => validateManifest(lib({ content: { datagenEntry: "g.js" }, scripts: { buildTime: false } })), /buildTime is false but content\.datagenEntry/);
});

test("claiming scripts that don't exist is an error, unless an external script backs the claim", () => {
    assert.throws(() => validateManifest(lib({ scripts: { runtime: true } })), /runtime is true but there is no/);
    assert.throws(() => validateManifest(lib({ scripts: { buildTime: true } })), /buildTime is true but there is no/);
    validateManifest(lib({ scripts: { buildTime: true, external: [{ name: "x", path: "x.js", runs: "build" }] } }));
});

test("an external script of a kind the package says it lacks is an error", () => {
    assert.throws(() => validateManifest(lib({ scripts: { buildTime: false, external: [{ name: "x", path: "x.js", runs: "build" }] } })), /build external script is listed but scripts\.buildTime is false/);
});

test("describeScriptsTree aggregates packages and tags external scripts with their package", () => {
    const a = lib({ name: "a", provides: { api: "x.js" } });
    const b = lib({ name: "b", scripts: { buildTime: true, external: [{ name: "gen", path: "g.js", runs: "build", why: "makes files" }] } });
    const tree = describeScriptsTree(new Map([["a", { manifest: a }], ["b", { manifest: b }]]));
    assert.strictEqual(tree.anyRuntime, true);
    assert.strictEqual(tree.anyBuildTime, true);
    assert.deepStrictEqual(tree.external, [{ name: "gen", path: "g.js", runs: "build", why: "makes files", package: "b" }]);
});

test("checkExternalScriptFiles reports only the missing paths", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "or-scripts-"));
    try {
        fs.writeFileSync(path.join(tmp, "here.js"), "");
        const m = lib({ scripts: { buildTime: true, external: [{ name: "ok", path: "here.js", runs: "build" }, { name: "gone", path: "gone.js", runs: "build" }] } });
        assert.deepStrictEqual(checkExternalScriptFiles(m, tmp), [{ name: "gone", path: "gone.js" }]);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("openrock info --json reports scripts for a real library dir and exits nonzero on a missing external file", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "or-info-"));
    const CLI = path.join(__dirname, "..", "bin", "openrock.js");
    try {
        fs.writeFileSync(path.join(tmp, "openrock.library.json"), JSON.stringify(lib({
            name: "info-lib", provides: { api: "src/register.js" },
            scripts: { buildTime: true, external: [{ name: "gen", path: "build/gen.js", runs: "build" }] },
        })));
        let threw = false, out = "";
        try { out = execFileSync("node", [CLI, "info", tmp, "--json"], { encoding: "utf8" }); }
        catch (e) { threw = true; out = e.stdout; }
        assert.strictEqual(threw, true, "missing external script must fail the command");
        const r = JSON.parse(out);
        assert.strictEqual(r.ok, false);
        assert.deepStrictEqual(r.missingExternalScripts, [{ name: "gen", path: "build/gen.js", package: "info-lib" }]);
        fs.mkdirSync(path.join(tmp, "build"));
        fs.writeFileSync(path.join(tmp, "build", "gen.js"), "");
        const ok = JSON.parse(execFileSync("node", [CLI, "info", tmp, "--json"], { encoding: "utf8" }));
        assert.strictEqual(ok.ok, true);
        assert.strictEqual(ok.scripts.anyRuntime, true);
        assert.strictEqual(ok.scripts.external[0].package, "info-lib");
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

console.log(`\n${passed} passed`);
