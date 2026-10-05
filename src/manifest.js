// OpenRock manifest validation + dependency resolution. See "OpenRock Mod
// Packager — Phased Implementation Plan", OR-Phase 3.1, and "OpenRock
// Ecosystem Expansion Roadmap", OR-Track A1, in the project plan document
// for the full manifest shape and worked examples (a real library manifest
// for OpenChara, a real mod manifest translated field-for-field from
// Claude Waifus's actual PATCHES/project.json).
"use strict";

const path = require("path");
const semver = require("./semver.js");
const { validateScripts } = require("./scriptsDecl.js");

const VALID_KINDS = ["library", "mod"];
const VALID_DEP_TYPES = ["submodule", "library"];
// Modrinth's real dependency_type categories (required/optional/incompatible/
// embedded), adapted to OpenRock's own vocabulary - see OR-Track A1.
const RELATION_ARRAYS = ["breaks", "conflicts", "recommends", "suggests"];

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
    if (!semver.isValidVersion(manifest.version)) throw new Error(`manifest.version "${manifest.version}" is not a valid semver version (major.minor.patch)`);

    for (const [depName, dep] of Object.entries(manifest.dependsOn ?? {})) {
        if (!dep || typeof dep !== "object") throw new Error(`manifest.dependsOn.${depName} must be an object`);
        if (!VALID_DEP_TYPES.includes(dep.type)) throw new Error(`manifest.dependsOn.${depName}.type must be one of ${VALID_DEP_TYPES.join("/")}, got ${JSON.stringify(dep.type)}`);
        if (dep.type === "submodule" && typeof dep.path !== "string") throw new Error(`manifest.dependsOn.${depName}: type "submodule" requires a "path"`);
        // versionRange (A1): an npm-style range, only meaningful for a
        // "library" dependency (a submodule dependency is pinned by git
        // commit, not a version string at all). Absent means "any version".
        if (dep.versionRange !== undefined) {
            if (dep.type !== "library") throw new Error(`manifest.dependsOn.${depName}: "versionRange" is only valid on a "library" dependency`);
            if (typeof dep.versionRange !== "string" || !semver.isValidRange(dep.versionRange)) throw new Error(`manifest.dependsOn.${depName}.versionRange "${dep.versionRange}" is not a valid semver range`);
        }
        // apiVersion (B2): a SEPARATE concept from versionRange - versionRange
        // checks the provider's own PACKAGE version (manifest.version);
        // apiVersion picks which internal API generation to receive from a
        // provider that exposes a version-keyed API object (compat.js's
        // selectApiVersion), when that provider's package version doesn't
        // move in lockstep with every API shape it still supports. The two
        // are deliberately independent fields precisely so a provider can
        // bump its own release version freely without invalidating an old
        // consumer's pinned apiVersion.
        if (dep.apiVersion !== undefined) {
            if (dep.type !== "library") throw new Error(`manifest.dependsOn.${depName}: "apiVersion" is only valid on a "library" dependency`);
            if (typeof dep.apiVersion !== "string" || !semver.isValidRange(dep.apiVersion)) throw new Error(`manifest.dependsOn.${depName}.apiVersion "${dep.apiVersion}" is not a valid semver range`);
        }
        // optional (A1): orders if present, never fails loadLibraries if the
        // target is absent from the load set - ctx.dependencies[name] is
        // then explicitly undefined rather than the load failing.
        if (dep.optional !== undefined && typeof dep.optional !== "boolean") throw new Error(`manifest.dependsOn.${depName}.optional must be a boolean`);
        // soft (A1): load-order-only - doesn't even require the target to
        // `provides.api`; a soft dependent never receives ctx.dependencies
        // for it, only an ordering guarantee.
        if (dep.soft !== undefined && typeof dep.soft !== "boolean") throw new Error(`manifest.dependsOn.${depName}.soft must be a boolean`);
    }

    // breaks/conflicts/recommends/suggests (A1): each an array of
    // {name, versionRange?} entries, matching Modrinth's real
    // dependency_type categories (required/optional/incompatible/embedded)
    // adapted to OpenRock's vocabulary. breaks = hard fail at resolve time,
    // conflicts = soft warning, recommends/suggests = advisory only, never
    // enforced by the resolver itself.
    for (const arrayName of RELATION_ARRAYS) {
        const entries = manifest[arrayName];
        if (entries === undefined) continue;
        if (!Array.isArray(entries)) throw new Error(`manifest.${arrayName} must be an array`);
        entries.forEach((entry, i) => {
            if (!entry || typeof entry !== "object") throw new Error(`manifest.${arrayName}[${i}] must be an object`);
            if (typeof entry.name !== "string" || !entry.name) throw new Error(`manifest.${arrayName}[${i}].name is required`);
            if (entry.versionRange !== undefined && (typeof entry.versionRange !== "string" || !semver.isValidRange(entry.versionRange))) {
                throw new Error(`manifest.${arrayName}[${i}].versionRange "${entry.versionRange}" is not a valid semver range`);
            }
        });
    }

    if (manifest.kind === "library") {
        if (typeof manifest.entry !== "string" || !manifest.entry) throw new Error(`library manifest "${manifest.name}" requires an "entry"`);
        // Whether a given dependsOn.library entry actually points at a
        // library (never a mod - mods are leaf packages, nothing can
        // legally depend on one) can only be checked once the full set of
        // manifests being loaded together is known - see libLoader.js's
        // topoSort(), which throws "Unknown library dependency" for
        // exactly this case.
        // OR-Track K: a HYBRID library optionally declares its own "packs"
        // - it's still a normal kind:"library" for the dependency graph
        // (other packages depend on it via type:"library" for its
        // register()-time API), but it ALSO builds into its own real,
        // independently-installable BP/RP pair (buildPipeline.js's
        // buildMod() accepts this case too) - the deliberate example is
        // OR-Track K's own runtime addon: a shared pack every consuming
        // mod's world needs once, not duplicated into each mod's own build.
        if (manifest.packs !== undefined) {
            if (typeof manifest.namespace !== "string" || !/^[a-z][a-z0-9_]*$/.test(manifest.namespace)) throw new Error(`library manifest "${manifest.name}": "namespace" is required when "packs" is present, and must be lowercase letters/digits/underscores`);
            validatePacks(manifest);
        }
    }
    if (manifest.kind === "mod") {
        if (manifest.provides) throw new Error(`mod manifest "${manifest.name}" must not declare "provides" - mods are leaf packages`);
        if (typeof manifest.namespace !== "string" || !/^[a-z][a-z0-9_]*$/.test(manifest.namespace)) throw new Error(`mod manifest "${manifest.name}": "namespace" must be lowercase letters/digits/underscores`);
        validatePacks(manifest);
        // OR-Track G: a resource-pack-only mod (packs.behavior === false) has
        // no scripts at all, so depending on a "library" dependency (whose
        // whole point is handing back an API to CALL from script) makes no
        // sense - reject it outright rather than silently loading a library
        // nothing will ever use.
        if (manifest.packs.behavior === false) {
            for (const [depName, dep] of Object.entries(manifest.dependsOn ?? {})) {
                if (dep.type === "library") throw new Error(`mod manifest "${manifest.name}": resource-pack-only (packs.behavior: false) mods can't depend on library "${depName}" - there's no script context to use its API in`);
            }
        }
    }

    // content (OR-Track F0): where a package's own build-time inputs live,
    // relative to its own manifest's directory. Optional on BOTH kinds - a
    // pure script library (e.g. @openrock/registries) has none of this; a
    // library that DOES contribute real in-world assets (OR-Track K's
    // runtime addon is the deliberate example) can still declare it, same
    // as a mod would.
    if (manifest.templateVars !== undefined) {
        const tv = manifest.templateVars;
        if (!tv || typeof tv !== "object" || Array.isArray(tv)) throw new Error(`manifest.templateVars must be an object of strings`);
        for (const [k, v] of Object.entries(tv)) {
            if (!/^\w+$/.test(k) || k === "ns") throw new Error(`manifest.templateVars: "${k}" is not a valid variable name ("ns" is reserved)`);
            if (typeof v !== "string") throw new Error(`manifest.templateVars.${k} must be a string`);
        }
    }
    if (manifest.content !== undefined) {
        const c = manifest.content;
        if (!c || typeof c !== "object") throw new Error(`manifest.content must be an object`);
        for (const field of ["scriptsDir", "bpOverlayDir", "rpOverlayDir", "uiDir", "scriptEntry", "datagenEntry", "entityDsl", "manifestDsl", "blockDsl", "itemDsl", "cinemaDsl", "localization"]) {
            if (c[field] !== undefined && typeof c[field] !== "string") throw new Error(`manifest.content.${field} must be a string path`);
        }
        // entityDsl (Crystal Manifest-Entity, OR-Track M): a directory of
        // real *.entity.tsx files, compiled via
        // src/entityDsl/entityCompiler.js into real Bedrock entity JSON at
        // build time - the DSL replacement for hand-writing entities/*.json
        // directly (still supported via bpOverlayDir for anything not yet
        // authored through the DSL).
        // manifestDsl (Crystal Manifest, OR-Track O): a single real
        // *.manifest.tsx file, compiled via
        // src/manifestDsl/manifestCompiler.js into a real manifest.json
        // override/extension document, merged onto buildManifests()'s own
        // generated bp/rp manifest.json.
        // blockDsl (Crystal Manifest-Block, OR-Track M4): a directory of
        // real *.block.tsx files, compiled via src/blockDsl/blockCompiler.js
        // into real Bedrock block JSON - same real pattern as entityDsl.
        // itemDsl (Crystal Manifest-Item, OR-Track M5): a directory of real
        // *.item.tsx files, compiled via src/itemDsl/itemCompiler.js into
        // real Bedrock item JSON - same real pattern as entityDsl.
        // scriptEntry: this package's own real in-game script entry -
        // esbuild bundles the ROOT mod's own entry for real (resolving
        // cross-package bare-specifier imports via each dependency's own
        // scriptEntry), so every OTHER package needs one too, to be
        // resolvable BY NAME from an importing package's own scripts
        // (buildPipeline.js's resolveScriptEntry()/bundleScripts()).
        // Defaults to "main.js" under scriptsDir if not set.
        if (c.scriptEntry !== undefined && !c.scriptsDir) throw new Error(`manifest.content.scriptEntry requires "scriptsDir" to be set too`);
        // datagenEntry (OR-Track B2's "typed builders" half becoming real):
        // a Node CommonJS script (relative to this manifest's own
        // directory, NOT bundled into the in-game pack - executed at BUILD
        // TIME only) exporting `(datagen) => ({ bp: {relPath: obj}, rp: {relPath: obj} })`,
        // called with @openrock/datagen's real builder functions and
        // merged into the built pack the same way bpOverlayDir/rpOverlayDir
        // are - this is what makes "compile data from typed calls instead
        // of hand-writing JSON" (the original OR-Track B2 ask) real,
        // instead of just a library of builder functions nothing ever calls.
    }

    // scripts: declares in-world/build-time script status plus any
    // "external" scripts to surface to users - see src/scriptsDecl.js.
    validateScripts(manifest);
}

// A mod (and OR-Track K's hybrid libraries, later) needs real pack UUIDs to
// build into a deployable BP/RP pair - a pure script library never does.
// packs.behavior may be the literal `false` (OR-Track G: a resource-pack-
// only mod, no behavior pack at all) instead of the full descriptor object
// - packs.resource is always required regardless, since a mod needs at
// least one real pack to be a valid add-on.
function validatePacks(manifest) {
    const p = manifest.packs;
    const need = (cond, msg) => { if (!cond) throw new Error(`${manifest.kind} manifest "${manifest.name}": ${msg}`); };
    need(p && typeof p === "object", `requires "packs"`);
    if (p.behavior !== false) {
        need(p.behavior && typeof p.behavior === "object", `packs.behavior is required (or explicitly false for a resource-pack-only mod, OR-Track G)`);
        need(typeof p.behavior.folder === "string" && p.behavior.folder, `packs.behavior.folder is required`);
        need(typeof p.behavior.uuid === "string" && p.behavior.uuid, `packs.behavior.uuid is required`);
        need(typeof p.behavior.dataModuleUuid === "string" && p.behavior.dataModuleUuid, `packs.behavior.dataModuleUuid is required`);
        need(typeof p.behavior.scriptModuleUuid === "string" && p.behavior.scriptModuleUuid, `packs.behavior.scriptModuleUuid is required`);
    }
    need(p.resource && typeof p.resource === "object", `packs.resource is required`);
    need(typeof p.resource.folder === "string" && p.resource.folder, `packs.resource.folder is required`);
    need(typeof p.resource.uuid === "string" && p.resource.uuid, `packs.resource.uuid is required`);
    need(typeof p.resource.moduleUuid === "string" && p.resource.moduleUuid, `packs.resource.moduleUuid is required`);
}

/**
 * Loads and validates a manifest file from `dir` (tries openrock.mod.json,
 * then openrock.library.json). Returns `{manifest, dir}` - `dir` travels
 * with the manifest since every path in `content`/`dependsOn.submodule` is
 * relative to it, not to the caller's own cwd.
 */
function loadManifestFile(dir) {
    const fs = require("fs");
    for (const filename of ["openrock.mod.json", "openrock.library.json"]) {
        const file = path.join(dir, filename);
        if (!fs.existsSync(file)) continue;
        let manifest;
        try { manifest = JSON.parse(fs.readFileSync(file, "utf8")); }
        catch (e) { throw new Error(`${file}: ${e.message}`); }
        validateManifest(manifest);
        return { manifest, dir };
    }
    throw new Error(`No openrock.mod.json or openrock.library.json found in ${dir}`);
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

module.exports = { validateManifest, resolveDependency, loadManifestFile, VALID_KINDS, VALID_DEP_TYPES, RELATION_ARRAYS };
