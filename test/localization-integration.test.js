#!/usr/bin/env node
// Integration: content.localization through the real build pipeline (BP+RP and
// resource-pack-only mods) and the `openrock translate` CLI. Run: node test/localization-integration.test.js
"use strict";

const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildMod } = require("../src/buildPipeline.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

const CLI = path.join(__dirname, "..", "bin", "openrock.js");
const cli = (args, opts = {}) => {
    try { return { code: 0, out: execFileSync("node", [CLI, ...args], { encoding: "utf8", ...opts }) }; }
    catch (e) { return { code: e.status, out: (e.stdout ?? "") + (e.stderr ?? "") }; }
};

function makeMod({ resourceOnly = false } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "or-locint-"));
    fs.mkdirSync(path.join(dir, "lang"));
    fs.mkdirSync(path.join(dir, "ui"));
    fs.writeFileSync(path.join(dir, "lang", "en_US.lang"), "ui.title=Hello %s\nui.bye=Bye\n");
    fs.writeFileSync(path.join(dir, "lang", "localization.json"), JSON.stringify({ languages: ["es_ES"] }));
    fs.writeFileSync(path.join(dir, "ui", "home.ui.html"), "<text>{t:ui.title}</text>");
    const packs = {
        resource: { folder: "R", uuid: "44444444-4444-4444-4444-444444444444", moduleUuid: "55555555-5555-5555-5555-555555555555" },
        behavior: resourceOnly ? false : { folder: "B", uuid: "11111111-1111-1111-1111-111111111111", dataModuleUuid: "22222222-2222-2222-2222-222222222222", scriptModuleUuid: "33333333-3333-3333-3333-333333333333" },
    };
    fs.writeFileSync(path.join(dir, "openrock.mod.json"), JSON.stringify({
        openrockVersion: 1, kind: "mod", name: "loc-mod", version: "1.0.0", namespace: "lm", packs, content: { localization: "lang" },
    }));
    return dir;
}

test("build emits texts/*.lang + languages.json into BOTH packs", () => {
    const dir = makeMod();
    try {
        const { bp, rp } = buildMod(dir);
        for (const side of [bp, rp]) {
            assert.match(side.get("texts/en_US.lang").toString("utf8"), /ui\.title=Hello %s/);
            assert.deepStrictEqual(JSON.parse(side.get("texts/languages.json").toString("utf8")), ["en_US", "es_ES"]);
        }
        assert.match(rp.get("texts/es_ES.lang").toString("utf8"), /ui\.bye=Bye/, "untranslated keys fall back to source text");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a resource-pack-only mod gets localization too (and has no bp)", () => {
    const dir = makeMod({ resourceOnly: true });
    try {
        const { bp, rp } = buildMod(dir);
        assert.strictEqual(bp, null);
        assert.ok(rp.has("texts/en_US.lang"));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a missing source .lang is a clear build error", () => {
    const dir = makeMod();
    try {
        fs.rmSync(path.join(dir, "lang", "en_US.lang"));
        assert.throws(() => buildMod(dir), /the source-language text\) doesn't exist/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("translate CLI: extract -> status -> export -> edit -> import -> build picks up the reviewed translation", () => {
    const dir = makeMod();
    try {
        let r = cli(["translate", "extract", dir, "--json"]);
        assert.strictEqual(JSON.parse(r.out).added.length, 2);
        r = cli(["translate", "status", dir, "--json"]);
        assert.strictEqual(JSON.parse(r.out).languages.es_ES.missing, 2);

        const csv = path.join(dir, "sheet.csv");
        cli(["translate", "export", dir, `--out=${csv}`]);
        const lines = fs.readFileSync(csv, "utf8").split("\r\n");
        assert.match(lines[0], /key,context,source,es_ES,es_ES:status/);
        const edited = lines.map(l => l.startsWith("ui.title,") ? 'ui.title,,Hello %s,Hola %s,' : l.startsWith("ui.bye,") ? "ui.bye,,Bye,Adiós," : l).join("\r\n");
        fs.writeFileSync(csv, edited);
        r = cli(["translate", "import", dir, `--file=${csv}`, "--json"]);
        assert.strictEqual(JSON.parse(r.out).applied, 2);

        const { rp } = buildMod(dir);
        assert.match(rp.get("texts/es_ES.lang").toString("utf8"), /ui\.title=Hola %s\nui\.bye=Adiós/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("translate CLI: check fails on a used-but-undefined key and on a broken-placeholder translation", () => {
    const dir = makeMod();
    try {
        fs.writeFileSync(path.join(dir, "ui", "extra.ui.html"), "<text>{t:ui.nope}</text>");
        let r = cli(["translate", "check", dir, "--json"]);
        assert.strictEqual(r.code, 1);
        assert.deepStrictEqual(JSON.parse(r.out).problems[0], { kind: "undefined-key", keys: ["ui.nope"] });
        fs.rmSync(path.join(dir, "ui", "extra.ui.html"));
        cli(["translate", "extract", dir]);
        const catPath = path.join(dir, "lang", "catalog.json");
        const cat = JSON.parse(fs.readFileSync(catPath, "utf8"));
        cat.entries["ui.title"].translations.es_ES = { text: "Hola", status: "machine", from: cat.entries["ui.title"].sourceHash };
        fs.writeFileSync(catPath, JSON.stringify(cat));
        r = cli(["translate", "check", dir, "--json"]);
        assert.strictEqual(r.code, 1);
        assert.strictEqual(JSON.parse(r.out).problems[0].kind, "placeholder-mismatch");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("openrock build runs the autoTranslate prebuild with a module provider and the result lands in the pack", () => {
    const dir = makeMod();
    try {
        fs.writeFileSync(path.join(dir, "lang", "localization.json"), JSON.stringify({ autoTranslate: true, languages: ["es_ES"], provider: { module: "./prov.js" } }));
        fs.writeFileSync(path.join(dir, "prov.js"), "module.exports = { id: 'p', async translate(items){ return new Map(items.map(i=>[i.key,'ES '+i.text])); } };");
        const r = cli(["build", dir, "--no-test-server"]);
        assert.strictEqual(r.code, 0, r.out);
        const lang = fs.readFileSync(path.join(dir, "build", "R", "texts", "es_ES.lang"), "utf8");
        assert.match(lang, /ui\.title=ES Hello %s/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

console.log(`\n${passed} passed`);
