// Topological plugin/mod loading, by dependsOn's "plugin"-type entries.
// See "OpenRock Mod Packager — Phased Implementation Plan", OR-Phase 3.
"use strict";

const { createKernel } = require("./kernel.js");

/**
 * @param {Array<{manifest: object, register: Function}>} entries
 * @returns {Array<{manifest, register}>} entries in load order: every
 *   plugin dependency before its dependent, mods always last.
 */
function topoSort(entries) {
    const byName = new Map(entries.map(e => [e.manifest.name, e]));
    const visited = new Set();
    const visiting = new Set();
    const order = [];

    function visit(name) {
        if (visited.has(name)) return;
        if (visiting.has(name)) throw new Error(`Circular plugin dependency detected at "${name}"`);
        const entry = byName.get(name);
        if (!entry) throw new Error(`Unknown plugin dependency "${name}" (not in the set of entries being loaded)`);
        visiting.add(name);
        for (const [depName, dep] of Object.entries(entry.manifest.dependsOn ?? {})) {
            if (dep.type !== "plugin") continue;
            const depEntry = byName.get(depName);
            if (depEntry && depEntry.manifest.kind === "mod") {
                throw new Error(`"${name}" depends on "${depName}" as a plugin, but "${depName}" is a mod - mods never provide an API`);
            }
            visit(depName);
        }
        visiting.delete(name);
        visited.add(name);
        order.push(entry);
    }

    for (const entry of entries) visit(entry.manifest.name);

    // Mods never `provides` anything and always load last, after every
    // plugin - a mod's own dependsOn.plugin entries are already satisfied
    // by this point since plugins never depend on mods (the manifest
    // "kind" split makes that direction impossible to declare).
    const plugins = order.filter(e => e.manifest.kind !== "mod");
    const mods = order.filter(e => e.manifest.kind === "mod");
    return [...plugins, ...mods];
}

/**
 * Loads a fixed set of plugin/mod entries against a fresh kernel. A
 * `register(kernel, ctx)` that throws fails the WHOLE load loudly (a
 * load-time contract violation) - this is deliberately not caught, unlike
 * the per-invocation try/catch inside createRegistry(). Individual hook
 * *invocations* at runtime stay soft; plugin *loading* does not.
 *
 * @param {Array<{manifest: object, register: Function}>} entries
 * @returns {{ kernel, exportsByName: Map<string, any> }}
 */
function loadPlugins(entries) {
    const kernel = createKernel();
    const sorted = topoSort(entries);
    const exportsByName = new Map();

    for (const { manifest, register } of sorted) {
        const dependencies = {};
        for (const [depName, dep] of Object.entries(manifest.dependsOn ?? {})) {
            if (dep.type === "plugin") dependencies[depName] = exportsByName.get(depName);
        }
        const ctx = { manifest, dependencies };
        const result = register(kernel, ctx);
        exportsByName.set(manifest.name, result?.api);
    }

    return { kernel, exportsByName };
}

module.exports = { topoSort, loadPlugins };
