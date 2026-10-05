#!/usr/bin/env node
// Tests for glossary management
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const glossary = require("../src/glossary.js");
const os = require("os");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "glossary-test-"));

test("glossary: load empty (nonexistent file)", () => {
    const g = glossary.loadGlossary(path.join(tmpDir, "nonexistent.json"));
    assert.deepStrictEqual(g, { doNotTranslate: [], terms: {} });
});

test("glossary: save and load round-trip", () => {
    const g = {
        doNotTranslate: ["OpenChara", "Bedrock"],
        terms: { es_ES: { "hello": "hola", "goodbye": "adiós" } }
    };
    const file = path.join(tmpDir, "test.json");
    glossary.saveGlossary(file, g);
    const loaded = glossary.loadGlossary(file);
    assert.deepStrictEqual(loaded, g);
});

test("glossary: add do-not-translate term", () => {
    const g = { doNotTranslate: [], terms: {} };
    glossary.addDoNotTranslate(g, "Test");
    glossary.addDoNotTranslate(g, "Test");
    assert.deepStrictEqual(g.doNotTranslate, ["Test"]);
});

test("glossary: remove do-not-translate term", () => {
    const g = { doNotTranslate: ["A", "B", "C"], terms: {} };
    glossary.removeDoNotTranslate(g, "B");
    assert.deepStrictEqual(g.doNotTranslate, ["A", "C"]);
});

test("glossary: set forced term", () => {
    const g = { doNotTranslate: [], terms: {} };
    glossary.setForcedTerm(g, "es_ES", "hello", "hola");
    glossary.setForcedTerm(g, "fr_FR", "hello", "bonjour");
    assert.deepStrictEqual(g.terms, {
        es_ES: { hello: "hola" },
        fr_FR: { hello: "bonjour" }
    });
});

test("glossary: remove forced term", () => {
    const g = {
        doNotTranslate: [],
        terms: { es_ES: { hello: "hola", goodbye: "adiós" } }
    };
    glossary.removeForcedTerm(g, "es_ES", "hello");
    assert.deepStrictEqual(g.terms, {
        es_ES: { goodbye: "adiós" }
    });
});

test("glossary: list functions", () => {
    const g = {
        doNotTranslate: ["Test", "OpenChara"],
        terms: { es_ES: { hello: "hola" }, fr_FR: { hello: "bonjour" } }
    };
    assert.deepStrictEqual(glossary.listDoNotTranslate(g), ["Test", "OpenChara"]);
    assert.deepStrictEqual(glossary.listForcedTerms(g, "es_ES"), { hello: "hola" });
    assert.deepStrictEqual(glossary.listForcedTerms(g, "de_DE"), {});
});

console.log(`\n${passed} passed`);

fs.rmSync(tmpDir, { recursive: true, force: true });
