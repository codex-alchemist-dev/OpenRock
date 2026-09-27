// @openrock/config - per-mod configuration, two ways:
//
// - bakeConfig(): the BUILD-TIME-BAKED path (OR-Track B2's primary design).
//   A real "inline mod.config.json into the compiled bundle" step needs
//   OR-Track F0's actual CLI/build pipeline, which doesn't exist yet - this
//   is the honest part that's buildable today: merge a mod's declared
//   defaults with an overrides object (whatever a future build step would
//   have read from mod.config.json) and validate the result. A future CLI
//   change is "call bakeConfig() at build time and write the result into
//   the compiled output," not a redesign of this module.
// - readRuntimeConfig()/writeRuntimeConfig(): the RUNTIME-MUTABLE path
//   (originally scoped as "a stretch goal once Track D's form UI exists").
//   The storage/validation half of that doesn't actually need a UI to
//   exist first - it's built directly on @openrock/capabilities today, so
//   it's real and testable now; only the in-game screen for editing it
//   (Track D, or OR-Track K's add-ons config menu) is still future work.
//
// See "OpenRock Ecosystem Expansion Roadmap", OR-Track B2, in the project
// plan document.
"use strict";

function matchesType(value, type) {
    if (type.endsWith("[]")) {
        const elemType = type.slice(0, -2);
        return Array.isArray(value) && value.every(v => matchesType(v, elemType));
    }
    switch (type) {
        case "string": return typeof value === "string";
        case "number": return typeof value === "number";
        case "boolean": return typeof value === "boolean";
        case "object": return value !== null && typeof value === "object" && !Array.isArray(value);
        case "any": return true;
        default: throw new Error(`@openrock/config: unknown schema type "${type}"`);
    }
}

const RUNTIME_VALUE_ID = "value"; // config is one-per-mod, not one-per-many-ids

module.exports = function register(kernel, ctx) {
    const capabilities = ctx.dependencies["@openrock/capabilities"];
    const configs = new Map(); // modName -> { schema, defaults }

    /**
     * @param {string} modName
     * @param {Record<string,string>} schema - same flat type-schema
     *   language as @openrock/capabilities (string/number/boolean/object/
     *   any, or "<type>[]").
     * @param {object} defaults - MUST cover every field in `schema` - both
     *   bakeConfig() and the runtime path rely on defaults being a
     *   complete, valid config on their own.
     */
    function registerConfig(modName, schema, defaults = {}) {
        for (const field of Object.keys(schema ?? {})) {
            if (!(field in defaults)) throw new Error(`@openrock/config: registerConfig("${modName}"): defaults is missing required field "${field}"`);
        }
        configs.set(modName, { schema, defaults });
        // Also opens a runtime-mutable slot for this mod, via capabilities -
        // registerRuntimeConfig doesn't need to be called separately.
        capabilities.registerCapability(`config:${modName}`, schema);
    }

    function requireConfig(modName) {
        const entry = configs.get(modName);
        if (!entry) throw new Error(`@openrock/config: "${modName}" was never registered - call registerConfig() first`);
        return entry;
    }

    /**
     * Merges `overrides` (whatever a build step would read from a mod's own
     * mod.config.json) onto the registered defaults and validates the
     * result against the schema. Throws on an invalid/incomplete override -
     * a bad config value should fail the build, not silently fall back.
     * @returns {object} a frozen, fully-validated config object.
     */
    function bakeConfig(modName, overrides = {}) {
        const { schema, defaults } = requireConfig(modName);
        const merged = { ...defaults, ...overrides };
        for (const [field, type] of Object.entries(schema)) {
            if (!(field in merged) || !matchesType(merged[field], type)) {
                throw new Error(`@openrock/config: bakeConfig("${modName}"): field "${field}" is missing or doesn't match type "${type}"`);
            }
        }
        return Object.freeze(merged);
    }

    /** Reads the current runtime-mutable config, falling back to defaults if nothing's been written yet. */
    function readRuntimeConfig(owner, world, modName) {
        const { defaults } = requireConfig(modName);
        const rec = capabilities.readCapability(owner, world, `config:${modName}`, RUNTIME_VALUE_ID);
        return rec ? { ...rec } : { ...defaults };
    }

    /**
     * Merges `patch` onto the current runtime config (or defaults, if
     * nothing's been written yet) and commits it - a partial update is
     * fine here (unlike bakeConfig's overrides), since the merge always
     * starts from a complete prior config.
     * @returns {object|null} the new config, or null if the patched result
     *   failed schema validation (write aborted, old value untouched).
     */
    function writeRuntimeConfig(owner, world, modName, patch) {
        const { defaults } = requireConfig(modName);
        return capabilities.writeCapability(owner, world, `config:${modName}`, RUNTIME_VALUE_ID, old => ({ ...(old ?? defaults), ...patch }));
    }

    return { api: { registerConfig, bakeConfig, readRuntimeConfig, writeRuntimeConfig } };
};
