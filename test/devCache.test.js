#!/usr/bin/env node
// Real tests for src/devCache.js (OR-Track Q6): the mtime+size compile
// cache shared by the entity/manifest DSL compilers, and the require-cache
// busting fix for a real, pre-existing bug (a long-running `dev` process
// silently serving a stale components.js/jsx-runtime.js forever).
// Run: node test/devCache.test.js
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { signatureForFiles, bustRequireCacheUnder, withCompileCache } = require("../src/devCache.js");

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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openrock-devcache-test-"));

test("signatureForFiles: an unchanged file produces the SAME signature across two calls", () => {
    const f = path.join(tmpDir, "a.txt");
    fs.writeFileSync(f, "hello");
    assert.strictEqual(signatureForFiles([f]), signatureForFiles([f]));
});

test("signatureForFiles: a real content+mtime change produces a DIFFERENT signature", async () => {
    const f = path.join(tmpDir, "b.txt");
    fs.writeFileSync(f, "v1");
    const before = signatureForFiles([f]);
    await new Promise(r => setTimeout(r, 10));
    fs.writeFileSync(f, "v2, a different length");
    const after = signatureForFiles([f]);
    assert.notStrictEqual(before, after);
});

test("signatureForFiles: a missing file is real, distinct 'missing' state, not a thrown error", () => {
    const missing = path.join(tmpDir, "does-not-exist.txt");
    assert.doesNotThrow(() => signatureForFiles([missing]));
    assert.ok(signatureForFiles([missing]).includes("missing"));
});

test("withCompileCache: a matching signature returns the SAME cached value, never recomputing", () => {
    const cache = new Map();
    let computeCalls = 0;
    const compute = () => { computeCalls++; return { n: computeCalls }; };
    const first = withCompileCache(cache, "key", "sig-1", [], compute);
    const second = withCompileCache(cache, "key", "sig-1", [], compute);
    assert.strictEqual(computeCalls, 1, "compute() must run exactly once for an unchanged signature");
    assert.strictEqual(first, second, "the exact same cached value must be returned, not a fresh equal-looking one");
});

test("withCompileCache: a changed signature triggers a real recompute", () => {
    const cache = new Map();
    let computeCalls = 0;
    const compute = () => { computeCalls++; return { n: computeCalls }; };
    withCompileCache(cache, "key", "sig-1", [], compute);
    const second = withCompileCache(cache, "key", "sig-2", [], compute);
    assert.strictEqual(computeCalls, 2);
    assert.strictEqual(second.n, 2);
});

test("bustRequireCacheUnder: real fix - a module previously require()'d under the given dir is re-read from disk on the next require, not served stale", () => {
    const modDir = fs.mkdtempSync(path.join(os.tmpdir(), "openrock-devcache-module-"));
    const modPath = path.join(modDir, "shared.js");
    fs.writeFileSync(modPath, "module.exports = { version: 1 };");

    const first = require(modPath);
    assert.strictEqual(first.version, 1);

    // Real file change - WITHOUT busting, Node's own require cache would
    // keep serving the old `version: 1` object forever in a long-running
    // process (this is the exact real bug this fix targets).
    fs.writeFileSync(modPath, "module.exports = { version: 2 };");
    const staleStillCached = require(modPath);
    assert.strictEqual(staleStillCached.version, 1, "sanity check: proves Node's require cache really is stale here before the fix is applied");

    bustRequireCacheUnder([modDir]);
    const fresh = require(modPath);
    assert.strictEqual(fresh.version, 2, "after busting, the NEXT require must read the real, current file content");
});

test("bustRequireCacheUnder: never touches a module OUTSIDE the given directories", () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "openrock-devcache-outside-"));
    const insideDir = fs.mkdtempSync(path.join(os.tmpdir(), "openrock-devcache-inside-"));
    const outsidePath = path.join(outsideDir, "x.js");
    fs.writeFileSync(outsidePath, "module.exports = 'v1';");
    require(outsidePath);
    assert.ok(require.cache[require.resolve(outsidePath)], "sanity check: it's really cached");

    bustRequireCacheUnder([insideDir]);
    assert.ok(require.cache[require.resolve(outsidePath)], "busting an unrelated directory must never evict a module outside it");
});

console.log(`\n${passed} passed`);
