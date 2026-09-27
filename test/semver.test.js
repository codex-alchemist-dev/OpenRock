#!/usr/bin/env node
// Plain-Node test runner (no dependencies) for src/semver.js.
// Run: node test/semver.test.js
"use strict";

const assert = require("assert");
const { parse, isValidVersion, compare, satisfies, isValidRange } = require("../src/semver.js");

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

// ---- parse / isValidVersion ---------------------------------------------

test("parse: a plain version", () => {
    assert.deepStrictEqual(parse("1.2.3"), { major: 1, minor: 2, patch: 3, prerelease: [] });
});

test("parse: a prerelease version, ignoring build metadata", () => {
    assert.deepStrictEqual(parse("1.2.3-rc.1+build.5"), { major: 1, minor: 2, patch: 3, prerelease: ["rc", "1"] });
});

test("isValidVersion: rejects garbage", () => {
    assert.strictEqual(isValidVersion("not-a-version"), false);
    assert.strictEqual(isValidVersion("1.2"), false);
    assert.strictEqual(isValidVersion("1.2.3"), true);
});

// ---- compare --------------------------------------------------------------

test("compare: major/minor/patch ordering", () => {
    assert.strictEqual(compare("1.0.0", "2.0.0"), -1);
    assert.strictEqual(compare("2.1.0", "2.0.9"), 1);
    assert.strictEqual(compare("1.2.3", "1.2.3"), 0);
});

test("compare: a release always outranks its own prereleases", () => {
    assert.strictEqual(compare("1.0.0", "1.0.0-rc.1"), 1);
    assert.strictEqual(compare("1.0.0-rc.1", "1.0.0"), -1);
});

test("compare: numeric prerelease identifiers compare numerically, not lexically", () => {
    assert.strictEqual(compare("1.0.0-rc.2", "1.0.0-rc.10"), -1);
});

// ---- satisfies: exact pins --------------------------------------------------

test("satisfies: exact pin matches only that version", () => {
    assert.strictEqual(satisfies("1.2.3", "1.2.3"), true);
    assert.strictEqual(satisfies("1.2.4", "1.2.3"), false);
});

// ---- satisfies: caret ranges ------------------------------------------------

test("satisfies: ^1.2.3 allows minor/patch bumps but not a major bump", () => {
    assert.strictEqual(satisfies("1.2.3", "^1.2.3"), true);
    assert.strictEqual(satisfies("1.9.9", "^1.2.3"), true);
    assert.strictEqual(satisfies("1.2.2", "^1.2.3"), false);
    assert.strictEqual(satisfies("2.0.0", "^1.2.3"), false);
});

test("satisfies: ^0.x.y special-cases (0.x is treated as unstable, narrower range)", () => {
    assert.strictEqual(satisfies("0.2.9", "^0.2.3"), true);
    assert.strictEqual(satisfies("0.3.0", "^0.2.3"), false);
    assert.strictEqual(satisfies("0.0.3", "^0.0.3"), true);
    assert.strictEqual(satisfies("0.0.4", "^0.0.3"), false);
});

// ---- satisfies: tilde ranges ------------------------------------------------

test("satisfies: ~1.2.3 allows only patch bumps", () => {
    assert.strictEqual(satisfies("1.2.9", "~1.2.3"), true);
    assert.strictEqual(satisfies("1.3.0", "~1.2.3"), false);
});

test("satisfies: ~1.2 and ~1 widen to the missing component", () => {
    assert.strictEqual(satisfies("1.2.9", "~1.2"), true);
    assert.strictEqual(satisfies("1.3.0", "~1.2"), false);
    assert.strictEqual(satisfies("1.9.9", "~1"), true);
    assert.strictEqual(satisfies("2.0.0", "~1"), false);
});

// ---- satisfies: x-ranges / wildcards ----------------------------------------

test("satisfies: x-ranges and bare partials", () => {
    assert.strictEqual(satisfies("1.2.9", "1.2.x"), true);
    assert.strictEqual(satisfies("1.3.0", "1.2.x"), false);
    assert.strictEqual(satisfies("1.9.0", "1.x"), true);
    assert.strictEqual(satisfies("2.0.0", "1.x"), false);
    assert.strictEqual(satisfies("9.9.9", "*"), true);
    assert.strictEqual(satisfies("9.9.9", ""), true);
});

// ---- satisfies: comparator operators and conjunctions -----------------------

test("satisfies: plain comparator operators", () => {
    assert.strictEqual(satisfies("2.0.0", ">=1.0.0"), true);
    assert.strictEqual(satisfies("0.9.0", ">=1.0.0"), false);
    assert.strictEqual(satisfies("1.0.0", "<2.0.0"), true);
    assert.strictEqual(satisfies("2.0.0", "<2.0.0"), false);
});

test("satisfies: space-separated tokens AND together", () => {
    assert.strictEqual(satisfies("1.5.0", ">=1.2.3 <2.0.0"), true);
    assert.strictEqual(satisfies("2.0.0", ">=1.2.3 <2.0.0"), false);
    assert.strictEqual(satisfies("1.0.0", ">=1.2.3 <2.0.0"), false);
});

// ---- satisfies: hyphen ranges ------------------------------------------------

test("satisfies: a fully-specified hyphen range is inclusive on both ends", () => {
    assert.strictEqual(satisfies("1.2.3", "1.2.3 - 2.3.4"), true);
    assert.strictEqual(satisfies("2.3.4", "1.2.3 - 2.3.4"), true);
    assert.strictEqual(satisfies("2.3.5", "1.2.3 - 2.3.4"), false);
});

test("satisfies: a partial upper bound in a hyphen range widens to the next unit", () => {
    // "1.2.3 - 2.3" means >=1.2.3 <2.4.0 (anything with prefix 2.3.* is included)
    assert.strictEqual(satisfies("2.3.99", "1.2.3 - 2.3"), true);
    assert.strictEqual(satisfies("2.4.0", "1.2.3 - 2.3"), false);
});

// ---- isValidRange / error handling ------------------------------------------

test("isValidRange: rejects a garbage range without throwing", () => {
    assert.strictEqual(isValidRange("^not-a-version"), false);
    assert.strictEqual(isValidRange("^1.2.3"), true);
});

test("isValidRange: rejects an unsupported \"||\" alternative-set range", () => {
    assert.strictEqual(isValidRange("^1.0.0 || ^2.0.0"), false);
});

test("satisfies: throws on an invalid version being checked", () => {
    assert.throws(() => satisfies("not-a-version", "^1.0.0"));
});

console.log(`\n${passed} passed`);
