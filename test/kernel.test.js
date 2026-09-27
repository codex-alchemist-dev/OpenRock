#!/usr/bin/env node
// Plain-Node test runner (no dependencies, matching the rest of this
// workspace's convention) for OR-Phase 3's kernel/pluginLoader/manifest.
// Run: node test/kernel.test.js
"use strict";

const assert = require("assert");
const path = require("path");
const { createRegistry, createKernel } = require("../src/kernel.js");
const { topoSort, loadPlugins } = require("../src/pluginLoader.js");
const { validateManifest, resolveDependency } = require("../src/manifest.js");

const FIXTURES = path.join(__dirname, "fixtures");
function loadFixture(name) {
    const manifest = require(path.join(FIXTURES, name, "openrock.plugin.json"));
    const register = require(path.join(FIXTURES, name, manifest.entry));
    return { manifest, register };
}

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

// ---- createRegistry ----------------------------------------------------

test("createRegistry: register + invoke", () => {
    const r = createRegistry("test");
    r.register("double", x => x * 2);
    assert.strictEqual(r.invoke("double", 21), 42);
});

test("createRegistry: invoke on unregistered key returns undefined, no throw", () => {
    const r = createRegistry("test");
    assert.strictEqual(r.invoke("nope", 1), undefined);
});

test("createRegistry: invoke catches a throwing def and returns undefined", () => {
    const r = createRegistry("test");
    let warned = false;
    const origWarn = console.warn;
    console.warn = () => { warned = true; };
    try {
        r.register("boom", () => { throw new Error("nope"); });
        assert.strictEqual(r.invoke("boom"), undefined);
        assert.strictEqual(warned, true, "expected invoke() to log a warning for the caught throw");
    } finally {
        console.warn = origWarn;
    }
});

test("createRegistry: validate runs at register() time and can reject", () => {
    const r = createRegistry("test", { validate: (key, def) => { if (typeof def !== "function") throw new Error("def must be a function"); } });
    assert.throws(() => r.register("bad", "not a function"), /def must be a function/);
});

test("createKernel: registry() is created lazily and shared across callers", () => {
    const k = createKernel();
    const a = k.registry("shared");
    const b = k.registry("shared");
    assert.strictEqual(a, b, "expected the same registry instance on repeated access");
});

// ---- manifest validation -------------------------------------------------

test("validateManifest: accepts a well-formed plugin manifest", () => {
    validateManifest(loadFixture("plugin-a").manifest);
});

test("validateManifest: accepts a well-formed dependent plugin manifest", () => {
    validateManifest(loadFixture("plugin-b").manifest);
});

test("validateManifest: rejects a bad openrockVersion", () => {
    assert.throws(() => validateManifest({ openrockVersion: 2, kind: "plugin", name: "x", version: "1.0.0", entry: "x.js" }), /openrockVersion/);
});

test("validateManifest: rejects an unknown kind", () => {
    assert.throws(() => validateManifest({ openrockVersion: 1, kind: "widget", name: "x", version: "1.0.0" }), /kind/);
});

test("validateManifest: plugin manifest requires an entry", () => {
    assert.throws(() => validateManifest({ openrockVersion: 1, kind: "plugin", name: "x", version: "1.0.0" }), /entry/);
});

test("validateManifest: mod manifest must not declare provides", () => {
    assert.throws(() => validateManifest({ openrockVersion: 1, kind: "mod", name: "x", version: "1.0.0", provides: { api: "x.js" } }), /must not declare "provides"/);
});

test("validateManifest: rejects a malformed dependsOn entry type", () => {
    assert.throws(() => validateManifest({ openrockVersion: 1, kind: "plugin", name: "x", version: "1.0.0", entry: "x.js", dependsOn: { y: { type: "bogus" } } }), /type must be one of/);
});

// ---- resolveDependency -----------------------------------------------

test("resolveDependency: resolves a submodule dependency to a vendorDir path", () => {
    const manifest = { name: "x", dependsOn: { mclite: { type: "submodule", path: "vendor/mclite" } } };
    const resolved = resolveDependency(manifest, "mclite", { vendorDir: "/repo" });
    assert.strictEqual(resolved, path.join("/repo", "vendor/mclite"));
});

test("resolveDependency: resolves a loaded plugin dependency to its exported API", () => {
    const manifest = { name: "x", dependsOn: { "plugin-a": { type: "plugin" } } };
    const loadedPlugins = new Map([["plugin-a", { shout: () => "hi" }]]);
    const resolved = resolveDependency(manifest, "plugin-a", { loadedPlugins });
    assert.strictEqual(resolved.shout(), "hi");
});

test("resolveDependency: throws if the plugin dependency isn't loaded yet", () => {
    const manifest = { name: "x", dependsOn: { "plugin-a": { type: "plugin" } } };
    assert.throws(() => resolveDependency(manifest, "plugin-a", { loadedPlugins: new Map() }), /not loaded yet/);
});

// ---- pluginLoader: load order + ctx.dependencies wiring ----------------

test("loadPlugins: dependency loads before dependent, ctx.dependencies wired correctly", () => {
    const a = loadFixture("plugin-a");
    const b = loadFixture("plugin-b");
    // Intentionally passed out of dependency order (b before a) - topoSort
    // must reorder them, not just trust array order.
    const { kernel, exportsByName } = loadPlugins([b, a]);

    assert.strictEqual(exportsByName.get("plugin-a").shout("world"), "WORLD!");
    // plugin-b's own register() computed ctx.dependencies["plugin-a"].shout("world")
    // at load time - if this matches, load order + wiring both worked.
    assert.strictEqual(exportsByName.get("plugin-b").shoutedHello, "WORLD!");

    // Both plugins' hooks landed in the SAME shared "greeting" registry.
    const greeting = kernel.registry("greeting");
    assert.strictEqual(greeting.invoke("hello", "Ann"), "Hello, Ann!");
    assert.strictEqual(greeting.invoke("bonjour", "Ann"), "Bonjour, Ann!");
});

test("loadPlugins: a throwing hook invocation doesn't corrupt the registry or other plugins' state", () => {
    const a = loadFixture("plugin-a");
    const b = loadFixture("plugin-b");
    const { kernel } = loadPlugins([a, b]);
    const greeting = kernel.registry("greeting");

    const origWarn = console.warn;
    console.warn = () => {};
    let brokenResult;
    try { brokenResult = greeting.invoke("broken"); } finally { console.warn = origWarn; }

    assert.strictEqual(brokenResult, undefined, "a throwing invoke() should return undefined, not propagate");
    // Both earlier plugins' hooks still work fine after the throw.
    assert.strictEqual(greeting.invoke("hello", "Bo"), "Hello, Bo!");
    assert.strictEqual(greeting.invoke("bonjour", "Bo"), "Bonjour, Bo!");
});

test("loadPlugins: a register()-time throw fails the WHOLE load loudly", () => {
    const t = loadFixture("plugin-throws");
    assert.throws(() => loadPlugins([t]), /intentional register\(\)-time failure/);
});

test("topoSort: detects a circular dependency", () => {
    const x = { manifest: { openrockVersion: 1, kind: "plugin", name: "x", version: "1.0.0", entry: "x.js", dependsOn: { y: { type: "plugin" } } }, register: () => ({}) };
    const y = { manifest: { openrockVersion: 1, kind: "plugin", name: "y", version: "1.0.0", entry: "y.js", dependsOn: { x: { type: "plugin" } } }, register: () => ({}) };
    assert.throws(() => topoSort([x, y]), /Circular plugin dependency/);
});

test("topoSort: a plugin cannot depend on a mod", () => {
    const mod = { manifest: { openrockVersion: 1, kind: "mod", name: "leaf-mod", version: "1.0.0" }, register: () => ({}) };
    const plugin = { manifest: { openrockVersion: 1, kind: "plugin", name: "p", version: "1.0.0", entry: "p.js", dependsOn: { "leaf-mod": { type: "plugin" } } }, register: () => ({}) };
    assert.throws(() => topoSort([plugin, mod]), /mods never provide an API/);
});

test("loadPlugins: mods always load last, after every plugin they depend on", () => {
    const a = loadFixture("plugin-a");
    const modManifest = { openrockVersion: 1, kind: "mod", name: "test-mod", version: "1.0.0", dependsOn: { "plugin-a": { type: "plugin" } } };
    let sawPluginALoaded = false;
    const mod = {
        manifest: modManifest,
        register(kernel, ctx) {
            sawPluginALoaded = Boolean(ctx.dependencies["plugin-a"]);
            return {};
        },
    };
    loadPlugins([mod, a]); // mod listed first in the input array on purpose
    assert.strictEqual(sawPluginALoaded, true, "expected plugin-a's API to already be available when the mod's register() ran");
});

console.log(`\n${passed} passed${process.exitCode ? ", with failures" : ""}`);
