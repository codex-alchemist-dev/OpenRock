// @openrock/runtime-addon's own minimal, SELF-CONTAINED config registry -
// real @minecraft/server ES module, deliberately NOT reusing
// @openrock/config's (CommonJS, unbridged into in-game code - see
// src/register.js's own header) runtime functions. A consuming mod's own
// real script calls registerAddonConfig() directly, by relative import,
// once both packages land in the same build.
import { world } from "@minecraft/server";
import { resolveConfigValues } from "./pure/configLogic.js";

const registry = new Map(); // modName -> fields[]

/**
 * @param {string} modName
 * @param {Array<{key: string, label: string, type: "string"|"number"|"boolean", default: any, min?: number, max?: number, step?: number}>} fields
 */
export function registerAddonConfig(modName, fields) {
    registry.set(modName, fields);
}

export function listRegisteredMods() {
    return [...registry.keys()];
}

export function getFields(modName) {
    return registry.get(modName) ?? [];
}

function storageKey(modName) {
    return `openrock:config:${modName}`;
}

/** Every declared field's current value (persisted value if set and of the right type, else its declared default). */
export function readConfig(modName) {
    const fields = getFields(modName);
    const raw = world.getDynamicProperty(storageKey(modName));
    let stored = {};
    if (typeof raw === "string") {
        try { stored = JSON.parse(raw); } catch (e) { stored = {}; }
    }
    return resolveConfigValues(fields, stored);
}

export function writeConfig(modName, values) {
    world.setDynamicProperty(storageKey(modName), JSON.stringify(values));
}
