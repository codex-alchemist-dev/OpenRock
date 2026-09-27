// OpenRock's own internal answer to "multiple API versions coexisting"
// (OR-Track B2's @openrock/compat) - scoped honestly to OpenRock's OWN
// versioning, never a cross-engine shim (there's only one engine, Bedrock
// itself - this has nothing to do with @minecraft/server version pinning).
//
// A provider library that wants to keep an old API shape alive alongside a
// new one returns a version-keyed object from register() instead of a flat
// one: `return { api: { "1.0.0": apiV1, "2.0.0": apiV2 } }`. Nothing about
// the manifest format changes - libLoader.js just resolves, PER CONSUMING
// ENTRY, which version that specific consumer's own declared
// `versionRange` picks (so two different mods depending on the same
// library can each get the version they actually asked for).
//
// See "OpenRock Ecosystem Expansion Roadmap", OR-Track B2, in the project
// plan document.
"use strict";

const semver = require("./semver.js");

/**
 * Heuristic: an object whose every own key is a valid semver version
 * string (and has at least one key) is treated as a version-keyed API map.
 * An ordinary API object's keys are function/property names, essentially
 * never semver strings, so this is safe in practice without needing an
 * explicit "this is versioned" flag anywhere.
 */
function isVersionedApi(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    return keys.length > 0 && keys.every(k => semver.isValidVersion(k));
}

/**
 * Picks the HIGHEST version satisfying `versionRange` from a version-keyed
 * API map (npm's own max-satisfying convention). If `exportedApi` isn't
 * version-keyed at all, it's returned completely unchanged - a
 * single-version provider needs no compat handling, and its
 * manifest.version was already range-checked by resolver.js's
 * resolveManifestSet() before this ever runs.
 * @throws if `exportedApi` IS version-keyed but nothing satisfies the range.
 */
function selectApiVersion(exportedApi, versionRange) {
    if (!isVersionedApi(exportedApi)) return exportedApi;
    const versions = Object.keys(exportedApi).sort((a, b) => semver.compare(a, b));
    const matching = versionRange ? versions.filter(v => semver.satisfies(v, versionRange)) : versions;
    if (matching.length === 0) {
        throw new Error(`compat: no exposed API version satisfies "${versionRange}" (available: ${versions.join(", ")})`);
    }
    return exportedApi[matching[matching.length - 1]];
}

module.exports = { isVersionedApi, selectApiVersion };
