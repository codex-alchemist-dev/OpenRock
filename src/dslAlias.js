// Stable import specifiers for Crystal DSL sources, so a library/mod outside the OpenRock checkout can write
//   import * as OpenRockEntity from "@openrock/entity-dsl/jsx-runtime";
//   import { Entity, Health } from "@openrock/entity-dsl";
// (dialects: entity, item, block, manifest). tsc resolves them through generated `paths`; the compiled commonjs
// is loaded with a scoped Module._resolveFilename alias.
"use strict";

const path = require("path");
const Module = require("module");

const DIALECT_DIRS = { entity: "entityDsl", item: "itemDsl", block: "blockDsl", manifest: "manifestDsl" };

function aliasMap(dialect) {
    const dir = path.join(__dirname, DIALECT_DIRS[dialect]);
    return {
        [`@openrock/${dialect}-dsl`]: path.join(dir, "components.js"),
        [`@openrock/${dialect}-dsl/jsx-runtime`]: path.join(dir, "jsx-runtime.js"),
    };
}

/** compilerOptions fragment for the generated tsconfig. */
function tsPaths(dialect, baseDir) {
    return { baseUrl: baseDir, paths: Object.fromEntries(Object.entries(aliasMap(dialect)).map(([k, v]) => [k, [v]])) };
}

/** Runs fn() with the dialect's specifiers resolvable by require(). */
function withAlias(dialect, fn) {
    const map = aliasMap(dialect);
    const original = Module._resolveFilename;
    Module._resolveFilename = function (request, ...rest) {
        return original.call(this, map[request] ?? request, ...rest);
    };
    try { return fn(); } finally { Module._resolveFilename = original; }
}

/** Exposes the build's template vars to the DSL source being evaluated (read via vars() from the dialect components). */
function withVars(vars, fn) {
    const prev = globalThis.__openrockDslVars;
    globalThis.__openrockDslVars = vars ?? {};
    try { return fn(); } finally { globalThis.__openrockDslVars = prev; }
}

module.exports = { aliasMap, tsPaths, withAlias, withVars };
