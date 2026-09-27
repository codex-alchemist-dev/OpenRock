// Topological library/mod loading, by dependsOn's "library"-type entries.
// See "OpenRock Mod Packager — Phased Implementation Plan", OR-Phase 3, and
// "OpenRock Ecosystem Expansion Roadmap", OR-Track A3, in the project plan
// document.
"use strict";

const { createKernel } = require("./kernel.js");
const { resolveManifestSet } = require("./resolver.js");

/**
 * @param {Array<{manifest: object, register: Function}>} entries
 * @returns {Array<{manifest, register}>} entries in load order: every
 *   library dependency before its dependent, mods always last.
 */
function topoSort(entries) {
    const byName = new Map(entries.map(e => [e.manifest.name, e]));
    const visited = new Set();
    const visiting = new Set();
    const order = [];

    function visit(name) {
        if (visited.has(name)) return;
        if (visiting.has(name)) throw new Error(`Circular library dependency detected at "${name}"`);
        const entry = byName.get(name);
        if (!entry) throw new Error(`Unknown library dependency "${name}" (not in the set of entries being loaded)`);
        visiting.add(name);
        for (const [depName, dep] of Object.entries(entry.manifest.dependsOn ?? {})) {
            if (dep.type !== "library") continue;
            const depEntry = byName.get(depName);
            if (depEntry && depEntry.manifest.kind === "mod") {
                throw new Error(`"${name}" depends on "${depName}" as a library, but "${depName}" is a mod - mods never provide an API`);
            }
            visit(depName);
        }
        visiting.delete(name);
        visited.add(name);
        order.push(entry);
    }

    for (const entry of entries) visit(entry.manifest.name);

    // Mods never `provides` anything and always load last, after every
    // library - a mod's own dependsOn.library entries are already
    // satisfied by this point since libraries never depend on mods (the
    // manifest "kind" split makes that direction impossible to declare).
    const libraries = order.filter(e => e.manifest.kind !== "mod");
    const mods = order.filter(e => e.manifest.kind === "mod");
    return [...libraries, ...mods];
}

/**
 * Loads a fixed set of library/mod entries against a fresh kernel. Runs
 * resolver.js's resolveManifestSet() first (OR-Track A3) - this is what
 * evaluates versionRange/breaks/conflicts and drops absent optional/soft
 * dependsOn edges before topoSort ever sees them, so topoSort's own
 * "Unknown library dependency" check only ever fires for a genuinely
 * required-but-missing dependency, never an intentionally-absent optional
 * one.
 *
 * A `register(kernel, ctx)` that throws fails the WHOLE load loudly (a
 * load-time contract violation) - this is deliberately not caught, unlike
 * the per-invocation try/catch inside createRegistry(). Individual hook
 * *invocations* at runtime stay soft; library *loading* does not.
 *
 * @param {Array<{manifest: object, register: Function}>} entries
 * @returns {{ kernel, exportsByName: Map<string, any>, warnings: string[] }}
 */
function loadLibraries(entries) {
    const { entries: resolved, warnings } = resolveManifestSet(entries);
    const kernel = createKernel();
    const sorted = topoSort(resolved);
    const exportsByName = new Map();

    for (const { manifest, register } of sorted) {
        const dependencies = {};
        for (const [depName, dep] of Object.entries(manifest.dependsOn ?? {})) {
            // A "soft" dependency is load-order-only (OR-Track A1) - it
            // never receives a ctx.dependencies entry, even when present.
            if (dep.type === "library" && !dep.soft) dependencies[depName] = exportsByName.get(depName);
        }
        const ctx = { manifest, dependencies };
        const result = register(kernel, ctx);
        exportsByName.set(manifest.name, result?.api);
    }

    return { kernel, exportsByName, warnings };
}

module.exports = { topoSort, loadLibraries };
