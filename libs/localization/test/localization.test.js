#!/usr/bin/env node
// Unit tests for @openrock/localization. Run: node libs/localization/test/localization.test.js
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const L = require("../src/register.js");

let passed = 0;
const pending = [];
function test(name, fn) {
    const done = () => { passed++; console.log(`ok - ${name}`); };
    const fail = e => { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; };
    try {
        const r = fn();
        if (r && typeof r.then === "function") pending.push(r.then(done, fail)); else done();
    } catch (e) { fail(e); }
}

test("placeholders: extract finds format specs, {slots}, {t:} markers, color codes, \\n", () => {
    const toks = L.extractPlaceholders("Hi %s, you have {0} {count} items §a{t:ui.x} %1$d\\n 100%%");
    assert.deepStrictEqual(toks, ["%s", "{0}", "{count}", "§a", "{t:ui.x}", "%1$d", "\\n", "%%"]);
});

test("placeholders: compare is order-insensitive but catches missing/extra", () => {
    assert.strictEqual(L.comparePlaceholders("a %s b {0}", "{0} x %s").ok, true);
    const bad = L.comparePlaceholders("a %s b {0}", "a %s");
    assert.deepStrictEqual([bad.ok, bad.missing, bad.extra], [false, ["{0}"], []]);
    assert.deepStrictEqual(L.comparePlaceholders("a", "a %s").extra, ["%s"]);
});

test("placeholders: mask/unmask round-trips; do-not-translate terms are protected; dropped/duplicated/invented sentinels fail", () => {
    const { masked, tokens } = L.mask("Welcome to OpenChara, %s!", ["OpenChara"]);
    assert.ok(!masked.includes("OpenChara") && !masked.includes("%s"));
    assert.strictEqual(L.unmask(masked, tokens).text, "Welcome to OpenChara, %s!");
    assert.strictEqual(L.unmask("sin marcadores", tokens).ok, false);
    assert.strictEqual(L.unmask(masked + masked, tokens).ok, false);
    assert.strictEqual(L.unmask(masked + "⟦9⟧", tokens).ok, false);
});

test("langFile: parse keeps '=' in values, skips comments, serialize escapes newlines and round-trips", () => {
    const m = L.parseLang("﻿## c\na.b=x=y\n\nc=hi\r\n");
    assert.deepStrictEqual([...m], [["a.b", "x=y"], ["c", "hi"]]);
    assert.strictEqual(L.serializeLang(new Map([["k", "a\nb"]])), "k=a\\nb\n");
    assert.throws(() => L.serializeLang(new Map([["a=b", "x"]])), /contains/);
});

const src = entries => new Map(Object.entries(entries));

test("catalog: reconcile adds, detects changed source -> stale (derived), orphans, revives, reports undefined keys", () => {
    const c = L.createCatalog();
    let r = L.reconcile(c, src({ a: "Hello", b: "Bye" }), { usedKeys: ["a", "b", "zzz"] });
    assert.deepStrictEqual([r.added, r.undefinedKeys], [["a", "b"], ["zzz"]]);
    L.setTranslation(c, "a", "es_ES", "Hola", "machine");
    assert.strictEqual(L.statusOf(c.entries.a, "es_ES"), "machine");
    r = L.reconcile(c, src({ a: "Hello there" }));
    assert.deepStrictEqual([r.changed, r.orphaned], [["a"], ["b"]]);
    assert.strictEqual(L.statusOf(c.entries.a, "es_ES"), "stale");
    assert.deepStrictEqual(L.pendingKeys(c, "es_ES"), ["a"]);
    r = L.reconcile(c, src({ a: "Hello there", b: "Bye" }));
    assert.deepStrictEqual(r.revived, ["b"]);
});

test("catalog: machine never overwrites a CURRENT reviewed string, reviewed always wins, stale reviewed is replaceable", () => {
    const c = L.createCatalog();
    L.reconcile(c, src({ a: "Hello" }));
    L.setTranslation(c, "a", "fr_FR", "Salut", "reviewed");
    assert.strictEqual(L.setTranslation(c, "a", "fr_FR", "Bonjour", "machine"), false);
    assert.strictEqual(c.entries.a.translations.fr_FR.text, "Salut");
    L.reconcile(c, src({ a: "Hello!" }));
    assert.strictEqual(L.statusOf(c.entries.a, "fr_FR"), "stale");
    assert.strictEqual(L.setTranslation(c, "a", "fr_FR", "Bonjour!", "machine"), true);
});

function fakeProvider(fn = t => `[es]${t}`) {
    const calls = [];
    return { id: "fake", calls, async translate(items, from, to) { calls.push(items.length); return new Map(items.map(i => [i.key, fn(i.text, i.key)])); } };
}

test("mtl: translates missing keys, preserves placeholders end-to-end, second run is fully cached (zero provider calls)", async () => {
    const c = L.createCatalog();
    L.reconcile(c, src({ a: "Hello %s", b: "You have {0} items" }));
    const cache = L.memoryCache();
    const p = fakeProvider();
    let r = await L.translateMissing({ catalog: c, lang: "es_ES", provider: p, cache });
    assert.deepStrictEqual([r.translated, r.failed.length, p.calls.length], [2, 0, 1]);
    assert.strictEqual(c.entries.a.translations.es_ES.text, "[es]Hello %s");
    // wipe translations, keep cache: must not call the provider again
    for (const e of Object.values(c.entries)) e.translations = {};
    const p2 = fakeProvider();
    r = await L.translateMissing({ catalog: c, lang: "es_ES", provider: p2, cache });
    assert.deepStrictEqual([r.cached, r.translated, p2.calls.length], [2, 0, 0]);
});

test("mtl: a provider that drops a placeholder is retried once, then reported failed and NOT written", async () => {
    const c = L.createCatalog();
    L.reconcile(c, src({ a: "Hello %s" }));
    const bad = fakeProvider(() => "Hola sin marcador");
    const r = await L.translateMissing({ catalog: c, lang: "es_ES", provider: bad, cache: L.memoryCache() });
    assert.strictEqual(r.failed.length, 1);
    assert.strictEqual(bad.calls.length, 2, "retried once");
    assert.strictEqual(c.entries.a.translations.es_ES, undefined);
});

test("mtl: batches by batchSize, skips current reviewed, honours glossary do-not-translate and forced terms", async () => {
    const c = L.createCatalog();
    L.reconcile(c, src({ a: "OpenChara one", b: "two", c: "three" }));
    L.setTranslation(c, "c", "es_ES", "tres", "reviewed");
    const p = fakeProvider(t => t.replace("one", "uno").replace("two", "dos"));
    const r = await L.translateMissing({ catalog: c, lang: "es_ES", provider: p, cache: L.memoryCache(), batchSize: 1, glossary: { doNotTranslate: ["OpenChara"], terms: { es_ES: { dos: "DOS" } } } });
    assert.deepStrictEqual([r.translated, p.calls], [2, [1, 1]]);
    assert.strictEqual(c.entries.a.translations.es_ES.text, "OpenChara uno");
    assert.strictEqual(c.entries.b.translations.es_ES.text, "DOS");
    assert.strictEqual(c.entries.c.translations.es_ES.text, "tres");
});

test("sheet: CSV escaping/parsing round-trips quotes, commas, newlines; BOM and CRLF accepted", () => {
    const rows = [["key", "a,b", 'say "hi"', "multi\nline"], ["x", "", "é", "1"]];
    assert.deepStrictEqual(L.parseCsv(L.toCsv(rows)), rows);
    assert.deepStrictEqual(L.parseCsv("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]);
});

test("sheet: export -> edit -> import marks edits reviewed, approves unchanged-with-status, rejects placeholder-breaking cells, ignores source edits", () => {
    const c = L.createCatalog();
    L.reconcile(c, src({ a: "Hello %s", b: "Bye" }));
    L.setTranslation(c, "a", "es_ES", "Hola %s", "machine");
    L.setTranslation(c, "b", "es_ES", "Adios", "machine");
    const rows = L.catalogToRows(c, ["es_ES"]);
    assert.deepStrictEqual(rows[0], ["key", "context", "source", "es_ES", "es_ES:status"]);
    const aRow = rows.find(r => r[0] === "a"), bRow = rows.find(r => r[0] === "b");
    aRow[3] = "Buenas %s";            // human edit
    bRow[4] = "reviewed";             // approval, text unchanged
    aRow[2] = "TAMPERED SOURCE";      // must be ignored
    const r1 = L.importRows(c, rows);
    assert.strictEqual(r1.applied, 2);
    assert.deepStrictEqual([c.entries.a.translations.es_ES, c.entries.b.translations.es_ES.status], [{ text: "Buenas %s", status: "reviewed", from: c.entries.a.sourceHash }, "reviewed"]);
    assert.strictEqual(c.entries.a.source, "Hello %s");
    aRow[3] = "Hola sin marcador";
    const r2 = L.importRows(c, rows);
    assert.strictEqual(r2.applied, 0);
    assert.match(r2.skipped[0].reason, /placeholders differ/);
});

test("extract: finds {t:} markers and translate() calls with line numbers", () => {
    const found = L.extractKeysFromText('<text>{t:ui.title}</text>\nfoo(translate("ui.btn.ok"), "{t:ui.sub:x}")');
    assert.deepStrictEqual(found, [{ key: "ui.title", line: 1 }, { key: "ui.btn.ok", line: 2 }, { key: "ui.sub", line: 2 }]);
});

test("emit: renderLangOutputs falls back to source text, writes languages.json with source language first", () => {
    const c = L.createCatalog();
    L.reconcile(c, src({ a: "Hello", b: "Bye" }));
    L.setTranslation(c, "a", "es_ES", "Hola");
    const out = L.renderLangOutputs({ catalog: c, sourceTexts: src({ a: "Hello", b: "Bye" }), langs: ["es_ES"] });
    assert.match(out.get("texts/es_ES.lang"), /a=Hola\nb=Bye\n/);
    assert.deepStrictEqual(JSON.parse(out.get("texts/languages.json")), ["en_US", "es_ES"]);
});

function makeLocDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "or-loc-"));
    fs.mkdirSync(path.join(dir, "lang"));
    fs.mkdirSync(path.join(dir, "ui"));
    fs.writeFileSync(path.join(dir, "lang", "en_US.lang"), "ui.title=Hello %s\nui.bye=Bye\n");
    fs.writeFileSync(path.join(dir, "ui", "home.ui.html"), "<text>{t:ui.title}</text><text>{t:ui.missing}</text>");
    return dir;
}

test("project: syncCatalog scans the package, saves a sorted catalog, flags used-but-undefined keys", () => {
    const dir = makeLocDir();
    try {
        const p = L.loadProject(path.join(dir, "lang"), dir);
        const r = L.syncCatalog(p);
        assert.deepStrictEqual([r.added.sort(), r.undefinedKeys], [["ui.bye", "ui.title"], ["ui.missing"]]);
        assert.deepStrictEqual(p.catalog.entries["ui.title"].refs, ["ui/home.ui.html:1"]);
        L.saveCatalog(p);
        assert.ok(fs.existsSync(path.join(dir, "lang", "catalog.json")));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("prebuild: autoTranslate runs the module provider, writes the catalog, and a second run makes zero provider calls", async () => {
    const dir = makeLocDir();
    try {
        fs.writeFileSync(path.join(dir, "lang", "localization.json"), JSON.stringify({ autoTranslate: true, languages: ["es_ES"], provider: { module: "./prov.js" } }));
        fs.writeFileSync(path.join(dir, "prov.js"), "let n=0; module.exports = { id: 'mod', get calls(){return n}, async translate(items){ n++; return new Map(items.map(i=>[i.key,'ES '+i.text])); } };");
        const run = () => L.runLocalizationPrebuild({ locDir: path.join(dir, "lang"), scanDir: dir });
        const r1 = await run();
        assert.strictEqual(r1.ran, true);
        const cat = JSON.parse(fs.readFileSync(path.join(dir, "lang", "catalog.json"), "utf8"));
        assert.strictEqual(cat.entries["ui.title"].translations.es_ES.text, "ES Hello %s");
        const before = require(path.join(dir, "prov.js")).calls;
        const r2 = await run();
        assert.strictEqual(require(path.join(dir, "prov.js")).calls, before, "no new provider calls when nothing changed");
        assert.strictEqual(r2.results.es_ES.translated, 0);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("providers: unknown names and malformed providers are clear errors", () => {
    assert.throws(() => L.resolveProvider(undefined), /no provider configured/);
    assert.throws(() => L.resolveProvider("nope"), /unknown provider "nope"/);
    L.registerProvider("unit-test-provider", () => ({ id: "u" }));
    assert.throws(() => L.resolveProvider("unit-test-provider"), /must be \{ id: string, translate/);
});

Promise.all(pending).then(() => console.log(`\n${passed} passed`));
