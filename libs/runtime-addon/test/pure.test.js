#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/runtime-addon's
// pure logic (scripts/pure/*.js) - the part of this addon that's directly
// testable, since it has zero @minecraft/server import (unlike
// auth.js/config.js/menu.js/main.js, which genuinely require a running
// Minecraft instance to verify - see main.js's own header comment).
// Uses dynamic import() since scripts/pure/*.js are real ES modules
// (Bedrock scripts always are), loadable this way even from a plain
// CommonJS test file with zero special config.
// Run: node test/pure.test.js
"use strict";

const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

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

async function main() {
    const { hash } = await import(pathToFileURL(path.join(__dirname, "..", "scripts", "pure", "hash.js")));
    const { resolveConfigValues, coerceFieldValues } = await import(pathToFileURL(path.join(__dirname, "..", "scripts", "pure", "configLogic.js")));

    test("hash: deterministic for the same input", () => {
        assert.strictEqual(hash("hunter2"), hash("hunter2"));
    });

    test("hash: different inputs produce different hashes (no trivial collisions)", () => {
        assert.notStrictEqual(hash("hunter2"), hash("hunter3"));
    });

    test("hash: empty string doesn't throw and is stable", () => {
        assert.strictEqual(hash(""), hash(""));
    });

    test("resolveConfigValues: uses the stored value when present and correctly typed", () => {
        const fields = [{ key: "volume", type: "number", default: 100 }];
        assert.deepStrictEqual(resolveConfigValues(fields, { volume: 42 }), { volume: 42 });
    });

    test("resolveConfigValues: falls back to default when the field is missing", () => {
        const fields = [{ key: "volume", type: "number", default: 100 }];
        assert.deepStrictEqual(resolveConfigValues(fields, {}), { volume: 100 });
    });

    test("resolveConfigValues: falls back to default when the stored value is the WRONG type (corrupted data)", () => {
        const fields = [{ key: "volume", type: "number", default: 100 }];
        assert.deepStrictEqual(resolveConfigValues(fields, { volume: "not-a-number" }), { volume: 100 });
    });

    test("resolveConfigValues: handles multiple fields of different types independently", () => {
        const fields = [
            { key: "enabled", type: "boolean", default: true },
            { key: "label", type: "string", default: "hi" },
        ];
        assert.deepStrictEqual(resolveConfigValues(fields, { enabled: false, label: 5 }), { enabled: false, label: "hi" });
    });

    test("coerceFieldValues: coerces raw form values to each field's declared type", () => {
        const fields = [{ key: "count", type: "number" }, { key: "flag", type: "boolean" }, { key: "name", type: "string" }];
        const result = coerceFieldValues(fields, ["7", true, 42], {});
        assert.deepStrictEqual(result, { count: 7, flag: true, name: "42" });
    });

    test("coerceFieldValues: merges onto previous values, doesn't wipe fields the form didn't include", () => {
        const fields = [{ key: "a", type: "number" }];
        const result = coerceFieldValues(fields, [5], { a: 1, b: "kept" });
        assert.deepStrictEqual(result, { a: 5, b: "kept" });
    });

    test("coerceFieldValues: an undefined raw value (form omitted it) leaves the previous value untouched", () => {
        const fields = [{ key: "a", type: "number" }];
        const result = coerceFieldValues(fields, [undefined], { a: 99 });
        assert.deepStrictEqual(result, { a: 99 });
    });

    console.log(`\n${passed} passed`);
}

main();
