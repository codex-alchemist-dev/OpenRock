#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildMod } = require("../src/buildPipeline.js");
const { mergeLangOutput, injectPackStrings } = require("../src/packLang.js");
const emit = require("../libs/localization/src/emit.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}
const lines = t => t.split("\n").filter(l => l && !l.startsWith("##"));

test("emit: non-game locales reach only the runtime table; aliases are opt-in", () => {
    const catalog = { version: 1, sourceLang: "en_US", entries: { a: { source: "Hi", sourceHash: "h", translations: { fil_PH: { text: "Kumusta", status: "reviewed", from: "h" }, es_ES: { text: "Hola", status: "reviewed", from: "h" } } } } };
    const args = { catalog, sourceTexts: new Map([["a", "Hi"]]), langs: ["es_ES", "fil_PH"] };
    const files = emit.renderLangOutputs(args);
    assert.deepStrictEqual([...files.keys()].sort(), ["texts/en_US.lang", "texts/es_ES.lang", "texts/languages.json"]);
    assert.ok(emit.renderLangOutputs({ ...args, aliasRegionalLocales: true }).has("texts/es_MX.lang"));
    const rt = emit.renderRuntimeModule(args);
    assert.ok(rt.includes('"fil_PH"') && rt.includes("Kumusta"));
});

test("mergeLangOutput: later package wins per key; languages union with source first; runtime tables merge", () => {
    assert.deepStrictEqual(lines(mergeLangOutput("texts/en_US.lang", "a=1\nb=2\n", "b=3\nc=4\n")), ["a=1", "b=3", "c=4"]);
    assert.deepStrictEqual(JSON.parse(mergeLangOutput("texts/languages.json", '["en_US","de_DE"]', '["es_ES","en_US"]')), ["en_US", "de_DE", "es_ES"]);
    const mk = o => `export const LANGS = ${JSON.stringify(o)};\n`;
    const m = mergeLangOutput(".openrock-virtual/localization-tables.js", mk({ en_US: { name: "English", table: { a: "1" } } }), mk({ en_US: { name: "en_US", table: { b: "2" } }, de_DE: { name: "de_DE", table: {} } }));
    const parsed = JSON.parse(m.slice(m.indexOf("{"), m.lastIndexOf("}") + 1));
    assert.deepStrictEqual(parsed.en_US, { name: "English", table: { a: "1", b: "2" } });
});

test("injectPackStrings: adds pack.name/description only where absent", () => {
    const bp = new Map([["texts/en_US.lang", Buffer.from("pack.name=Mine\nx=1\n")]]);
    injectPackStrings({ name: "n", displayName: "Display", description: "Desc" }, [bp, null]);
    const t = bp.get("texts/en_US.lang").toString();
    assert.ok(t.includes("pack.name=Mine") && t.includes("pack.description=Desc") && !t.includes("Display"));
});

test("pipeline: two packages' localization merge into one set of texts + a single runtime table", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pl-"));
    fs.cpSync(path.join(__dirname, "fixtures"), tmp, { recursive: true });
    const lib = path.join(tmp, "build-lib"), mod = path.join(tmp, "build-mod");
    for (const [dir, text] of [[lib, "k.engine=E\nk.shared=lib\n"], [mod, "k.mod=M\nk.shared=mod\npack.name=Pretty\n"]]) {
        fs.mkdirSync(path.join(dir, "lang"), { recursive: true });
        fs.writeFileSync(path.join(dir, "lang", "en_US.lang"), text);
        const f = fs.readdirSync(dir).find(n => n.startsWith("openrock."));
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        j.content = { ...(j.content ?? {}), localization: "lang" };
        fs.writeFileSync(path.join(dir, f), JSON.stringify(j, null, 2));
    }
    const { bp, rp } = buildMod(mod, { vendorDir: tmp });
    for (const map of [bp, rp]) {
        assert.deepStrictEqual(lines(map.get("texts/en_US.lang").toString()).sort(), ["k.engine=E", "k.mod=M", "k.shared=mod", "pack.description=", "pack.name=Pretty"]);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log(`\n${passed} passed`);
