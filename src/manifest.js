// OpenRock manifest validation + dependency resolution. See "OpenRock Mod
// Packager — Phased Implementation Plan", OR-Phase 3.1 in the project plan
// document for the full manifest shape and worked examples (a real
// library manifest for OpenChara, a real mod manifest translated field-for-
// field from Claude Waifus's actual PATCHES/project.json).
"use strict";

const path = require("path");

const VALID_KINDS = ["library", "mod"];
const VALID_DEP_TYPES = ["submodule", "library"];

/**
 * Structural validation only - throws with a specific reason on the first
 * problem found. Does not resolve dependencies or touch the filesystem.
 */
function validateManifest(manifest) {
    if (!manifest || typeof manifest !== "object") throw new Error("manifest must be an object");
    if (manifest.openrockVersion !== 1) throw new Error(`manifest.openrockVersion must be 1, got ${JSON.stringify(manifest.openrockVersion)}`);
    if (!VALID_KINDS.includes(manifest.kind)) throw new Error(`manifest.kind must be one of ${VALID_KINDS.join("/")}, got ${JSON.stringify(manifest.kind)}`);
    if (typeof manifest.name !== "string" || !manifest.name) throw new Error("manifest.name is required");
    if (typeof manifest.version !== "string" || !manifest.version) throw new Error("manifest.version is required");

    for (const [depName, dep] of Object.entries(manifest.dependsOn ?? {})) {
        if (!dep || typeof dep !== "object") throw new Error(`manifest.dependsOn.${depName} must be an object`);
        if (!VALID_DEP_TYPES.includes(dep.type)) throw new Error(`manifest.dependsOn.${depName}.type must be one of ${VALID_DEP_TYPES.join("/")}, got ${JSON.stringify(dep.type)}`);
        if (dep.type === "submodule" && typeof dep.path !== "string") throw new Error(`manifest.dependsOn.${depName}: type "submodule" requires a "path"`);
    }

    if (manifest.kind === "library") {
        if (typeof manifest.entry !== "string" || !manifest.entry) throw new Error(`library manifest "${manifest.name}" requires an "entry"`);
        // Whether a given dependsOn.library entry actually points at a
        // library (never a mod - mods are leaf packages, nothing can
        // legally depend on one) can only be checked once the full set of
        // manifests being loaded together is known - see libLoader.js's
        // topoSort(), which throws "Unknown library dependency" for
        // exactly this case.
    }
    if (manifest.kind === "mod") {
        if (manifest.provides) throw new Error(`mod manifest "${manifest.name}" must not declare "provides" - mods are leaf packages`);
    }
}

/**
 * Resolves one `dependsOn` entry to a usable value:
 * - "submodule": an absolute filesystem path under `vendorDir`.
 * - "library": the already-loaded library's exported API (from
 *   `loadedLibraries`, a Map<name, api> - see libLoader.js's
 *   `exportsByName`). Throws if that library hasn't been loaded yet -
 *   libLoader.js's topological order is what guarantees it always has
 *   been by the time a real dependent's register() runs.
 */
function resolveDependency(manifest, depName, { vendorDir, loadedLibraries } = {}) {
    const dep = manifest.dependsOn?.[depName];
    if (!dep) throw new Error(`"${manifest.name}" has no dependency named "${depName}"`);
    if (dep.type === "submodule") {
        if (!vendorDir) throw new Error(`resolveDependency("${depName}"): a submodule dependency needs vendorDir`);
        return path.join(vendorDir, dep.path);
    }
    if (dep.type === "library") {
        if (!loadedLibraries || !loadedLibraries.has(depName)) throw new Error(`resolveDependency("${depName}"): library not loaded yet (check load order)`);
        return loadedLibraries.get(depName);
    }
    throw new Error(`resolveDependency("${depName}"): unknown dependency type "${dep.type}"`);
}

module.exports = { validateManifest, resolveDependency, VALID_KINDS, VALID_DEP_TYPES };
