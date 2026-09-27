#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/registries.
// Run: node libs/registries/test/registries.test.js
"use strict";

const assert = require("assert");
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

test("domain(): the same name always returns the same registry instance", () => {
    const { api } = registerLib();
    assert.strictEqual(api.domain("items"), api.domain("items"));
});

test("register/get/has/keys work normally for distinct ids", () => {
    const { api } = registerLib();
    const items = api.domain("items");
    items.register("cw:frost_bow", { damage: 5 });
    assert.deepStrictEqual(items.get("cw:frost_bow"), { damage: 5 });
    assert.strictEqual(items.has("cw:frost_bow"), true);
    assert.strictEqual(items.has("cw:nonexistent"), false);
    assert.deepStrictEqual(items.keys(), ["cw:frost_bow"]);
});

test("register(): a duplicate id in the SAME domain throws loudly", () => {
    const { api } = registerLib();
    const recipes = api.domain("recipes");
    recipes.register("cw:frost_bow", { output: "cw:frost_bow" });
    assert.throws(() => recipes.register("cw:frost_bow", { output: "different" }), /already has an entry for "cw:frost_bow"/);
});

test("the same id in TWO DIFFERENT domains does not collide", () => {
    const { api } = registerLib();
    api.domain("items").register("cw:frost_bow", { a: 1 });
    assert.doesNotThrow(() => api.domain("recipes").register("cw:frost_bow", { b: 2 }));
});

console.log(`\n${passed} passed`);
