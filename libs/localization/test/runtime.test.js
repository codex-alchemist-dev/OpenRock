#!/usr/bin/env node
// Tests for per-player localization runtime helpers
"use strict";

const assert = require("assert");
const runtime = require("../src/runtime.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

const mockLangModule = {
    getPlayerLanguage: (player) => player.lang || "en_US",
    translate: (lang, key, args = []) => {
        const table = {
            "en_US": { "test.key": "Hello", "greet": "Hi %s", "tab.skills": "Skills" },
            "es_ES": { "test.key": "Hola", "greet": "Hola %s", "tab.skills": "Habilidades" },
        };
        const text = (table[lang] || table.en_US)?.[key] ?? key;
        let i = 0;
        return text.replace(/%s/g, () => args[i++] ?? "");
    },
};

test("resolveTabLabel: resolves key in player's language", () => {
    const player = { lang: "es_ES" };
    const result = runtime.resolveTabLabel(player, "tab.skills", mockLangModule);
    assert.strictEqual(result, "Habilidades");
});

test("resolveTabLabel: falls back to en_US", () => {
    const player = { lang: "fr_FR" };
    const result = runtime.resolveTabLabel(player, "test.key", mockLangModule);
    assert.strictEqual(result, "Hello");
});

test("resolveTabLabel: handles args", () => {
    const player = { lang: "es_ES" };
    const result = runtime.resolveTabLabel(player, "greet", mockLangModule, ["Juan"]);
    assert.strictEqual(result, "Hola Juan");
});

test("resolveTabLabel: throws on missing langModule", () => {
    const player = {};
    assert.throws(() => {
        runtime.resolveTabLabel(player, "key", null);
    }, /langModule/);
});

test("applyPlayerLanguageFilter: resolves {t:key} in strings", () => {
    const player = { lang: "es_ES" };
    const obj = { label: "{t:test.key}", text: "Plain {t:tab.skills}" };
    const result = runtime.applyPlayerLanguageFilter(obj, player, mockLangModule);
    assert.strictEqual(result.label, "Hola");
    assert.strictEqual(result.text, "Plain Habilidades");
});

test("applyPlayerLanguageFilter: handles nested objects", () => {
    const player = { lang: "es_ES" };
    const obj = { a: { b: { c: "{t:test.key}" } }, d: ["{t:tab.skills}"] };
    const result = runtime.applyPlayerLanguageFilter(obj, player, mockLangModule);
    assert.strictEqual(result.a.b.c, "Hola");
    assert.strictEqual(result.d[0], "Habilidades");
});

test("applyPlayerLanguageFilter: ignores non-string values", () => {
    const player = { lang: "es_ES" };
    const obj = { num: 42, bool: true, nil: null };
    const result = runtime.applyPlayerLanguageFilter(obj, player, mockLangModule);
    assert.strictEqual(result.num, 42);
    assert.strictEqual(result.bool, true);
    assert.strictEqual(result.nil, null);
});

console.log(`\n${passed} passed`);
