#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/i18n.
// Run: node libs/i18n/test/i18n.test.js
"use strict";

const assert = require("assert");
const path = require("path");
const mclite = require(path.join(__dirname, "..", "..", "..", "vendor", "mclite"));
const { createMockOwner } = require(path.join(__dirname, "..", "..", "..", "vendor", "mclite", "test", "mockOwner.js"));
const registerCapabilities = require("../../capabilities/src/register.js");
const registerLib = require("../src/register.js");

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

function makeApi() {
    const { api: capabilitiesApi } = registerCapabilities(null, { manifest: {}, dependencies: { mclite } });
    const { api } = registerLib(null, { manifest: {}, dependencies: { "@openrock/capabilities": capabilitiesApi } });
    return api;
}

test("translate: no params produces a plain RawMessage {translate}", () => {
    const api = makeApi();
    assert.deepStrictEqual(api.translate("cw.greeting"), { translate: "cw.greeting" });
});

test("translate: params are stringified into RawMessage.with", () => {
    const api = makeApi();
    assert.deepStrictEqual(api.translate("cw.level_up", [5, "Yuki"]), { translate: "cw.level_up", with: ["5", "Yuki"] });
});

test("registerLocaleTable/resolveLiteral: substitutes {0}, {1}, ... placeholders", () => {
    const api = makeApi();
    api.registerLocaleTable("nah", { "cw.level_up": "{1} nāhui {0}!" });
    assert.strictEqual(api.resolveLiteral("nah", "cw.level_up", [5, "Yuki"]), "Yuki nāhui 5!");
});

test("resolveLiteral: null for an unregistered language or missing key", () => {
    const api = makeApi();
    api.registerLocaleTable("nah", { "cw.greeting": "hello" });
    assert.strictEqual(api.resolveLiteral("unregistered_lang", "cw.greeting"), null);
    assert.strictEqual(api.resolveLiteral("nah", "cw.missing_key"), null);
});

test("registerLocaleTable: requires a real langCode and table", () => {
    const api = makeApi();
    assert.throws(() => api.registerLocaleTable("", {}), /requires a real langCode/);
    assert.throws(() => api.registerLocaleTable("en", null), /requires a real table/);
});

test("resolveText: with NO player override set, always returns a real RawMessage (client localizes itself)", () => {
    const api = makeApi();
    const owner = createMockOwner(), world = createMockOwner("mock:world");
    api.registerLocaleTable("es", { "cw.greeting": "hola" }); // a table exists, but no override is set
    const result = api.resolveText(owner, world, "cw.greeting");
    assert.deepStrictEqual(result, { translate: "cw.greeting" });
});

test("resolveText: WITH a player override AND a matching table entry, returns a resolved literal string", () => {
    const api = makeApi();
    const owner = createMockOwner(), world = createMockOwner("mock:world");
    api.registerLocaleTable("hieroglyph", { "cw.greeting": "𓋴𓅓" });
    api.setPlayerLanguageOverride(owner, world, "hieroglyph");
    const result = api.resolveText(owner, world, "cw.greeting");
    assert.strictEqual(result, "𓋴𓅓");
});

test("resolveText: an override is set but the key isn't in that language's table - falls back to a real RawMessage", () => {
    const api = makeApi();
    const owner = createMockOwner(), world = createMockOwner("mock:world");
    api.registerLocaleTable("hieroglyph", { "cw.greeting": "𓋴𓅓" }); // "cw.other_key" not present
    api.setPlayerLanguageOverride(owner, world, "hieroglyph");
    const result = api.resolveText(owner, world, "cw.other_key");
    assert.deepStrictEqual(result, { translate: "cw.other_key" });
});

test("resolveText: substitutes params correctly through the literal-table path too", () => {
    const api = makeApi();
    const owner = createMockOwner(), world = createMockOwner("mock:world");
    api.registerLocaleTable("fil", { "cw.level_up": "{1} umabot sa level {0}!" });
    api.setPlayerLanguageOverride(owner, world, "fil");
    assert.strictEqual(api.resolveText(owner, world, "cw.level_up", [10, "Aiko"]), "Aiko umabot sa level 10!");
});

test("getPlayerLanguageOverride: null when never set; reflects the set value once it is", () => {
    const api = makeApi();
    const owner = createMockOwner(), world = createMockOwner("mock:world");
    assert.strictEqual(api.getPlayerLanguageOverride(owner, world), null);
    api.setPlayerLanguageOverride(owner, world, "ja_JP");
    assert.strictEqual(api.getPlayerLanguageOverride(owner, world), "ja_JP");
});

test("clearPlayerLanguageOverride: removes the override, reverting resolveText to the client-localized RawMessage path", () => {
    const api = makeApi();
    const owner = createMockOwner(), world = createMockOwner("mock:world");
    api.registerLocaleTable("nah", { "cw.greeting": "hola-nahuatl" });
    api.setPlayerLanguageOverride(owner, world, "nah");
    assert.strictEqual(api.resolveText(owner, world, "cw.greeting"), "hola-nahuatl");
    api.clearPlayerLanguageOverride(owner, world);
    assert.deepStrictEqual(api.resolveText(owner, world, "cw.greeting"), { translate: "cw.greeting" });
});

console.log(`\n${passed} passed`);
