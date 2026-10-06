"use strict";

// Tag / dynamic-property / entity names the runtime uses, derived from one namespace so two mods (or two systems of
// one mod) never see each other's displays.
function namesFor(ns = "fmbe") {
    if (!/^[a-z][a-z0-9_]*$/.test(ns)) throw new Error(`fmbe namespace must be lowercase letters/digits/_ (got "${ns}")`);
    return Object.freeze({
        ns,
        FOX: "minecraft:fox",
        FOX_SPAWN: "minecraft:fox<minecraft:as_adult>",
        tag: `${ns}_display`,
        idTag: id => `${ns}_id_${id}`,
        ownerProp: `${ns}:owner`,
        specProp: `${ns}:spec`,
        idProp: `${ns}:id`,
        persistProp: `${ns}:persist`,
        controllerNs: ns,
    });
}
module.exports = { namesFor };
