// @openrock/registries - typed, STRICT registries per Bedrock domain
// (items, custom components, recipes, loot-table fragments, and any other
// domain a library/mod names on first use). "Strict" is the whole point:
// kernel.js's own createRegistry() silently overwrites on a duplicate
// register() call (the right default for hooks/conditions, where a later
// registration intentionally replacing an earlier one is normal) - a
// two-mods-both-define-recipe-"cw:frost_bow" collision is a completely
// different situation, and should fail loudly at load time instead of
// silently letting one mod's content vanish underneath the other's.
//
// See "OpenRock Ecosystem Expansion Roadmap", OR-Track B2, in the project
// plan document.
"use strict";

function createStrictRegistry(domain) {
    const entries = new Map();
    return {
        register(id, def) {
            if (entries.has(id)) {
                throw new Error(
                    `@openrock/registries: "${domain}" already has an entry for "${id}" ` +
                    `(registered by another mod/library) - ids must be globally unique, ` +
                    `typically "<namespace>:<name>". This is a genuine content collision, ` +
                    `not something to silently resolve.`
                );
            }
            entries.set(id, def);
        },
        get(id) { return entries.get(id); },
        has(id) { return entries.has(id); },
        keys() { return [...entries.keys()]; },
    };
}

module.exports = function register() {
    const domains = new Map(); // domain name -> strict registry, created lazily on first use

    const api = {
        // domain(name) is the general form - "items", "customComponents",
        // "recipes", "lootTableFragments" are just the first four expected
        // uses, not a fixed enum. Every call for the same name returns the
        // SAME registry instance, shared across every library/mod loaded
        // into this kernel.
        domain(name) {
            if (!domains.has(name)) domains.set(name, createStrictRegistry(name));
            return domains.get(name);
        },
    };

    return { api };
};
