#!/usr/bin/env node
// Tests for CSV/XLSX round-trip localization sheets
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const sheet = require("../src/sheet.js");
const os = require("os");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

async function testAsync(name, fn) {
    try { await fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sheet-test-"));

test("CSV round-trip: write and read match", () => {
    const catalog = [
        { key: "greet", context: "dialog", source: "Hello", translations: { es_ES: "Hola", fr_FR: "Bonjour" }, status: "source", notes: "" },
        { key: "goodbye", context: "dialog", source: "Goodbye", translations: { es_ES: "Adiós", fr_FR: "Au revoir" }, status: "reviewed", notes: "formal" },
    ];
    const languages = ["es_ES", "fr_FR"];
    const file = path.join(tmpDir, "test.csv");

    sheet.writeCsv(file, catalog, languages);
    const read = sheet.readCsv(file);

    assert.strictEqual(read.catalog.length, 2);
    assert.deepStrictEqual(read.languages, languages);
    assert.strictEqual(read.catalog[0].key, "greet");
    assert.strictEqual(read.catalog[0].translations.es_ES, "Hola");
    assert.strictEqual(read.catalog[1].status, "reviewed");
    assert.strictEqual(read.catalog[1].notes, "formal");
});

test("CSV: empty file returns empty catalog", () => {
    const file = path.join(tmpDir, "empty.csv");
    fs.writeFileSync(file, "");
    const read = sheet.readCsv(file);
    assert.strictEqual(read.catalog.length, 0);
    assert.deepStrictEqual(read.languages, []);
});

test("CSV: single language", () => {
    const catalog = [
        { key: "a", context: "", source: "A", translations: { de_DE: "Ä" }, status: "source", notes: "" },
    ];
    const languages = ["de_DE"];
    const file = path.join(tmpDir, "single.csv");
    sheet.writeCsv(file, catalog, languages);
    const read = sheet.readCsv(file);
    assert.strictEqual(read.languages.length, 1);
    assert.strictEqual(read.catalog[0].translations.de_DE, "Ä");
});

test("CSV: handles missing translations (empty cells)", () => {
    const catalog = [
        { key: "x", context: "", source: "X", translations: { es_ES: "", fr_FR: "Eks" }, status: "source", notes: "" },
    ];
    const languages = ["es_ES", "fr_FR"];
    const file = path.join(tmpDir, "missing.csv");
    sheet.writeCsv(file, catalog, languages);
    const read = sheet.readCsv(file);
    assert.strictEqual(read.catalog[0].translations.es_ES, "");
    assert.strictEqual(read.catalog[0].translations.fr_FR, "Eks");
});

(async () => {
    await testAsync("XLSX round-trip: write and read match", async () => {
        const catalog = [
            { key: "item1", context: "inventory", source: "Sword", translations: { es_ES: "Espada", fr_FR: "Épée" }, status: "machine", notes: "" },
            { key: "item2", context: "inventory", source: "Shield", translations: { es_ES: "Escudo", fr_FR: "Bouclier" }, status: "stale", notes: "needs review" },
        ];
        const languages = ["es_ES", "fr_FR"];
        const file = path.join(tmpDir, "test.xlsx");

        await sheet.writeXlsx(file, catalog, languages);
        const read = await sheet.readXlsx(file);

        assert.strictEqual(read.catalog.length, 2);
        assert.deepStrictEqual(read.languages, languages);
        assert.strictEqual(read.catalog[0].key, "item1");
        assert.strictEqual(read.catalog[0].translations.fr_FR, "Épée");
        assert.strictEqual(read.catalog[1].status, "stale");
    });

    await testAsync("XLSX: preserves readonly column markers", async () => {
        const catalog = [{ key: "test", context: "", source: "Test", translations: {}, status: "source", notes: "" }];
        const languages = [];
        const file = path.join(tmpDir, "readonly.xlsx");
        await sheet.writeXlsx(file, catalog, languages);
        const read = await sheet.readXlsx(file);
        assert.strictEqual(read.catalog[0].key, "test");
    });

    console.log(`\n${passed} passed`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
})();
