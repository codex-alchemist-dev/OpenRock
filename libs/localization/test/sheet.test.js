#!/usr/bin/env node
// XLSX round-trip through the same rows the CSV path uses.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const L = require("../src/register.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xlsx-test-"));
let passed = 0;
async function test(name, fn) {
    try { await fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

(async () => {
    await test("xlsx: rows round-trip exactly (unicode, commas, newlines, empty cells)", async () => {
        const rows = [["key", "context", "source", "es_ES", "es_ES:status"], ["a", "", "Hello, %s\nline2", "Hola, %s", "machine"], ["b", "ctx", "é", "", "missing"]];
        const f = path.join(tmp, "t.xlsx");
        await L.writeXlsx(f, rows);
        assert.deepStrictEqual(await L.readXlsx(f), rows);
    });
    await test("xlsx: catalog -> xlsx -> edit -> import marks reviewed", async () => {
        const c = L.createCatalog();
        L.reconcile(c, new Map([["a", "Hello %s"]]));
        L.setTranslation(c, "a", "es_ES", "Hola %s", "machine");
        const f = path.join(tmp, "c.xlsx");
        await L.writeXlsx(f, L.catalogToRows(c, ["es_ES"]));
        const rows = await L.readXlsx(f);
        rows[1][3] = "Buenas %s";
        const r = L.importRows(c, rows);
        assert.strictEqual(r.applied, 1);
        assert.strictEqual(c.entries.a.translations.es_ES.status, "reviewed");
    });
    console.log(`\n${passed} passed`);
    fs.rmSync(tmp, { recursive: true, force: true });
})();
