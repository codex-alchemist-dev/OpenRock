// Topological library/mod loading, by dependsOn's "library"-type entries.
// See "OpenRock Mod Packager — Phased Implementation Plan", OR-Phase 3, and
// "OpenRock Ecosystem Expansion Roadmap", OR-Track A3, in the project plan
// document.
"use strict";

const { createKernel } = require("./kernel.js");
const { resolveManifestSet } = require("./resolver.js");
const { resolveDependency } = require("./manifest.js");
const { selectApiVersion } = require("./compat.js");

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
 * A `dependsOn` entry of type "submodule" is resolved and `require()`d
 * here too (needs `vendorDir`), so `ctx.dependencies[depName]` is
 * uniformly "the actual thing you'd use" regardless of whether a
 * dependency came from another library's `provides.api` or a vendored
 * submodule like MCLite - a consuming library's register() never has to
 * know or care which kind of dependency it received.
 *
 * A "library"-type dependency's exported API is also run through
 * compat.js's selectApiVersion() (OR-Track B2) - a provider that exposes a
 * version-keyed API object (`{ "1.0.0": apiV1, "2.0.0": apiV2 }`) gets
 * resolved PER CONSUMING ENTRY, against that specific consumer's own
 * declared `apiVersion` (deliberately a SEPARATE field from `versionRange`
 * - see manifest.js's own comment on why), so two different mods depending
 * on the same library can each receive the API generation they actually
 * asked for. A provider with an ordinary (non-version-keyed) API is
 * unaffected - selectApiVersion returns it unchanged regardless of
 * `apiVersion`.
 *
 * @param {Array<{manifest: object, register: Function}>} entries
 * @param {object} [opts]
 * @param {string} [opts.vendorDir] - required only if some entry has a
 *   "submodule"-type dependency.
 * @returns {{ kernel, exportsByName: Map<string, any>, warnings: string[] }}
 */
function loadLibraries(entries, { vendorDir } = {}) {
    const { entries: resolved, warnings } = resolveManifestSet(entries);
    const kernel = createKernel();
    const sorted = topoSort(resolved);
    const exportsByName = new Map();

    for (const { manifest, register } of sorted) {
        const dependencies = {};
        for (const [depName, dep] of Object.entries(manifest.dependsOn ?? {})) {
            // A "soft" dependency is load-order-only (OR-Track A1) - it
            // never receives a ctx.dependencies entry, even when present.
            if (dep.soft) continue;
            if (dep.type === "library") dependencies[depName] = selectApiVersion(exportsByName.get(depName), dep.apiVersion);
            else if (dep.type === "submodule") dependencies[depName] = require(resolveDependency(manifest, depName, { vendorDir }));
        }
        const ctx = { manifest, dependencies };
        const result = register(kernel, ctx);
        exportsByName.set(manifest.name, result?.api);
    }

    return { kernel, exportsByName, warnings };
}

module.exports = { topoSort, loadLibraries };
