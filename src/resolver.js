// Resolves a whole set of manifests together - version ranges, breaks,
// conflicts, and optional/soft dependency edges - before libLoader.js's
// topoSort() ever runs. topoSort() only knows about hard "library" edges
// that must exist in the load set; everything version-aware or
// optional/soft-aware is decided here first, and its OUTPUT (a possibly
// narrower list of entries with resolved dependsOn) is what topoSort()
// actually receives.
//
// recommends/suggests are deliberately NOT evaluated here - they're purely
// advisory (Modrinth's own "optional"/informational dependency_type
// categories), read directly off manifests by future tooling (a registry
// client, `openrock info`), never enforced by the loader.
//
// See "OpenRock Ecosystem Expansion Roadmap", OR-Track A3, in the project
// plan document.
"use strict";

const semver = require("./semver.js");

/**
 * @param {Array<{manifest: object, register: Function}>} entries
 * @returns {{ entries: Array<{manifest, register}>, warnings: string[] }}
 *   `entries` has every absent optional/soft dependsOn edge stripped out
 *   (so topoSort never sees a reference it can't resolve); `warnings` holds
 *   one string per triggered `conflicts` entry - never thrown, just
 *   surfaced for the caller (a CLI, a log line) to report.
 * @throws if a required "library" dependency is missing from the set, if a
 *   present dependency's version doesn't satisfy a declared versionRange,
 *   or if any manifest's `breaks` entry matches another present manifest.
 */
function resolveManifestSet(entries) {
    const byName = new Map(entries.map(e => [e.manifest.name, e]));
    const warnings = [];

    // --- breaks: hard fail if the named package is present (and, if a
    // versionRange is given, only if the present version satisfies it -
    // "breaks quartz@^2.0.0" doesn't fire against quartz@1.x). ---
    for (const entry of entries) {
        for (const rel of entry.manifest.breaks ?? []) {
            const other = byName.get(rel.name);
            if (!other) continue;
            if (rel.versionRange && !semver.satisfies(other.manifest.version, rel.versionRange)) continue;
            throw new Error(`"${entry.manifest.name}" breaks "${rel.name}"${rel.versionRange ? `@${rel.versionRange}` : ""}, which is also present (version ${other.manifest.version}) - cannot load both together`);
        }
    }

    // --- conflicts: same matching logic as breaks, but soft - collected as
    // a warning string, never thrown, matching kernel.js's invoke()
    // soft-catch philosophy (a conflict is a strong hint, not a hard rule). ---
    for (const entry of entries) {
        for (const rel of entry.manifest.conflicts ?? []) {
            const other = byName.get(rel.name);
            if (!other) continue;
            if (rel.versionRange && !semver.satisfies(other.manifest.version, rel.versionRange)) continue;
            warnings.push(`"${entry.manifest.name}" conflicts with "${rel.name}"${rel.versionRange ? `@${rel.versionRange}` : ""}, which is also present (version ${other.manifest.version})`);
        }
    }

    // --- dependsOn: version ranges, and dropping absent optional/soft edges. ---
    const resolvedEntries = entries.map(entry => {
        const dependsOn = entry.manifest.dependsOn ?? {};
        const resolvedDependsOn = {};

        for (const [depName, dep] of Object.entries(dependsOn)) {
            if (dep.type !== "library") { resolvedDependsOn[depName] = dep; continue; }

            const target = byName.get(depName);
            if (!target) {
                if (dep.optional || dep.soft) continue; // dropped - absent and allowed to be
                throw new Error(`"${entry.manifest.name}" depends on "${depName}" (required), but it is not present in the load set`);
            }
            if (dep.versionRange && !semver.satisfies(target.manifest.version, dep.versionRange)) {
                throw new Error(`"${entry.manifest.name}" requires "${depName}@${dep.versionRange}", but the loaded version is ${target.manifest.version}`);
            }
            resolvedDependsOn[depName] = dep;
        }

        if (Object.keys(resolvedDependsOn).length === Object.keys(dependsOn).length) return entry; // nothing dropped, reuse as-is
        return { ...entry, manifest: { ...entry.manifest, dependsOn: resolvedDependsOn } };
    });

    return { entries: resolvedEntries, warnings };
}

module.exports = { resolveManifestSet };
