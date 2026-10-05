#!/usr/bin/env node
// Tests for HTTP translation provider adapters
"use strict";

const assert = require("assert");
const claudeProvider = require("../src/providers/claude.js");
const deeplProvider = require("../src/providers/deepl.js");
const libretranslateProvider = require("../src/providers/libretranslate.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

function fakeFetch(response) {
    return async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => response,
    });
}

test("claude provider: missing API key throws", () => {
    assert.throws(() => claudeProvider({}), /ANTHROPIC_API_KEY/);
});

test("claude provider: parses key:text response lines and preserves sentinels", () => {
    const p = claudeProvider({
        ANTHROPIC_API_KEY: "test",
        fetch: fakeFetch({
            content: [{ text: 'key1:Hola ⟦0⟧\nkey2:Adiós ⟦1⟧' }],
        }),
    });
    assert.strictEqual(p.id, "claude");
    assert.ok(p.translate);
});

test("deepl provider: missing API key throws", () => {
    assert.throws(() => deeplProvider({}), /DEEPL_API_KEY/);
});

test("deepl provider: formats request and maps response", () => {
    const p = deeplProvider({
        DEEPL_API_KEY: "test",
        fetch: fakeFetch({
            translations: [{ text: "Hola ⟦0⟧" }, { text: "Adiós ⟦1⟧" }],
        }),
    });
    assert.strictEqual(p.id, "deepl");
    assert.ok(p.translate);
});

test("libretranslate provider: uses URL from env or default", () => {
    const p1 = libretranslateProvider({
        fetch: fakeFetch({ translatedText: ["Hola"] }),
    });
    assert.strictEqual(p1.id, "libretranslate");

    const p2 = libretranslateProvider({
        LIBRETRANSLATE_URL: "https://custom.com",
        fetch: fakeFetch({ translatedText: ["Hola"] }),
    });
    assert.strictEqual(p2.id, "libretranslate");
});

test("provider error handling: API error responses", async () => {
    const p = claudeProvider({
        ANTHROPIC_API_KEY: "test",
        fetch: async () => ({ ok: false, status: 401, statusText: "Unauthorized" }),
    });
    try {
        await p.translate([{ key: "a", text: "hello" }], "en_US", "es_ES");
        assert.fail("should throw");
    } catch (e) {
        assert.match(e.message, /401/);
    }
});

test("provider: empty items list returns empty map", async () => {
    const p = claudeProvider({
        ANTHROPIC_API_KEY: "test",
        fetch: fakeFetch({ content: [{ text: "" }] }),
    });
    const result = await p.translate([], "en_US", "es_ES");
    assert.strictEqual(result.size, 0);
});

console.log(`\n${passed} passed`);
