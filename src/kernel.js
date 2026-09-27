// OpenRock's kernel - the registry core every library/mod registers against.
// Generalizes the Map + register() + safe-default + try/catch-and-warn
// pattern already proven twice in OpenChara (hooks.js, conditions.js).
// See "OpenRock Mod Packager — Phased Implementation Plan", OR-Phase 3, in
// the project plan document for the full design this implements.
"use strict";

// A single named registry: register(key, def), then either read it back
// directly (get/has, for callers that need the raw def) or invoke() it
// safely (a throwing def is caught and logged, never crashes the caller -
// exactly hooks.js's existing try/catch-and-warn convention).
function createRegistry(name, { validate } = {}) {
    const entries = new Map();
    return {
        register(key, def) {
            if (validate) validate(key, def);
            entries.set(key, def);
        },
        get(key) { return entries.get(key); },
        has(key) { return entries.has(key); },
        invoke(key, ...args) {
            const def = entries.get(key);
            if (!def) return undefined;
            try { return def(...args); }
            catch (e) { console.warn(`[openrock:${name}] "${key}" failed: ${e}`); return undefined; }
        },
        keys() { return [...entries.keys()]; },
    };
}

// The kernel is just a lazily-created set of named registries, shared by
// every library loaded into one process/build. `kernel.hooks`,
// `kernel.conditions`, `kernel.mclite` etc. are created on first access by
// whichever library asks for them first - a library never needs to declare
// a registry before using it, matching how hooks.js/conditions.js today
// just exist as already-created singletons.
function createKernel() {
    const registries = new Map();
    return {
        registry(name, opts) {
            if (!registries.has(name)) registries.set(name, createRegistry(name, opts));
            return registries.get(name);
        },
    };
}

module.exports = { createRegistry, createKernel };
