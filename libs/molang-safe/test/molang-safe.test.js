#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for @openrock/molang-safe.
// Run: node libs/molang-safe/test/molang-safe.test.js
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

test("validateExpression: flags a raw '>=' as unsafe", () => {
    const { api } = registerLib();
    const result = api.validateExpression("(#health >= 10)");
    assert.strictEqual(result.valid, false);
    assert.ok(result.issues.some(i => i.includes(">=")));
});

test("validateExpression: flags a bare empty string literal ''", () => {
    const { api } = registerLib();
    const result = api.validateExpression("(#name = '')");
    assert.strictEqual(result.valid, false);
    assert.ok(result.issues.some(i => i.includes("empty string literal")));
});

test("validateExpression: flags division directly against a quoted string literal", () => {
    const { api } = registerLib();
    const result = api.validateExpression("(#inventory_stack_count / '2')");
    assert.strictEqual(result.valid, false);
    assert.ok(result.issues.some(i => i.includes("division")));
});

test("validateExpression: a clean expression with no known-unsafe patterns is valid", () => {
    const { api } = registerLib();
    const result = api.validateExpression("(#health < 10)");
    assert.deepStrictEqual(result, { valid: true, issues: [] });
});

test("validateExpression: a non-string input is reported invalid, not thrown", () => {
    const { api } = registerLib();
    const result = api.validateExpression(42);
    assert.strictEqual(result.valid, false);
});

test("gte(): produces a real, validator-clean '!(a < b)' expression, never a raw '>='", () => {
    const { api } = registerLib();
    const expr = api.gte("#health", "10");
    assert.strictEqual(expr, "!((#health < 10))");
    assert.strictEqual(api.validateExpression(expr).valid, true);
});

test("and()/or(): join 2+ expressions, and reject fewer than 2", () => {
    const { api } = registerLib();
    assert.strictEqual(api.and("(#a = 1)", "(#b = 2)"), "((#a = 1) && (#b = 2))");
    assert.strictEqual(api.or("(#a = 1)", "(#b = 2)", "(#c = 3)"), "((#a = 1) || (#b = 2) || (#c = 3))");
    assert.throws(() => api.and("(#a = 1)"), /needs at least 2/);
    assert.throws(() => api.or("(#a = 1)"), /needs at least 2/);
});

test("asNumber(): produces the proven '(prop - 0)' string-to-number coercion", () => {
    const { api } = registerLib();
    assert.strictEqual(api.asNumber("#inventory_stack_count"), "((#inventory_stack_count) - 0)");
});

test("safeDivide(): both operands always go through asNumber() - the string-division crash is structurally unreachable", () => {
    const { api } = registerLib();
    const expr = api.safeDivide("#inventory_stack_count", "#max_count");
    assert.strictEqual(expr, "(((#inventory_stack_count) - 0) / ((#max_count) - 0))");
    assert.strictEqual(api.validateExpression(expr).valid, true, "the div-on-string-literal heuristic must not false-positive on a safeDivide() result");
});

test("stringLiteral(): throws instead of silently producing the known-crashing bare ''", () => {
    const { api } = registerLib();
    assert.throws(() => api.stringLiteral(""), /known-crashing bare ''/);
    assert.strictEqual(api.stringLiteral("hello"), "'hello'");
});

test("stringLiteral(): escapes an embedded single quote", () => {
    const { api } = registerLib();
    assert.strictEqual(api.stringLiteral("it's"), "'it\\'s'");
});

test("bakedConstant(): produces the proven '((#v = #v) * N)' write-a-constant-through-a-property technique", () => {
    const { api } = registerLib();
    assert.strictEqual(api.bakedConstant("#v", 5), "((#v = #v) * 5)");
});

console.log(`\n${passed} passed`);
