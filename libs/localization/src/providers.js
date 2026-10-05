// Provider resolution. `localization.json` -> "provider" is either a string
// naming a built-in adapter (registered via registerProvider; HTTP adapters
// live under src/providers/) or { "module": "./path.js" } resolved relative to
// the package, exporting a provider object or a factory (env) => provider.
// Credentials always come from environment variables, never from config.
"use strict";

const path = require("path");

const builtins = new Map();

function registerProvider(name, factory) {
    if (builtins.has(name)) throw new Error(`localization provider "${name}" is already registered`);
    builtins.set(name, factory);
}

function resolveProvider(spec, { baseDir, env = process.env } = {}) {
    if (!spec) throw new Error("localization: no provider configured (set \"provider\" in localization.json)");
    let provider;
    if (typeof spec === "string") {
        const factory = builtins.get(spec);
        if (!factory) throw new Error(`localization: unknown provider "${spec}" (registered: ${[...builtins.keys()].join(", ") || "none"})`);
        provider = factory(env);
    } else if (spec && typeof spec.module === "string") {
        const mod = require(path.resolve(baseDir, spec.module));
        const exported = mod.default ?? mod;
        provider = typeof exported === "function" ? exported(env) : exported;
    } else {
        throw new Error("localization: provider must be a name or { \"module\": \"./file.js\" }");
    }
    if (!provider || typeof provider.id !== "string" || typeof provider.translate !== "function") {
        throw new Error("localization: a provider must be { id: string, translate(items, from, to) }");
    }
    return provider;
}

module.exports = { registerProvider, resolveProvider };
