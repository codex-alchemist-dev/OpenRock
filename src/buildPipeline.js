// The generic OpenRock build pipeline (OR-Track F0): mod manifest + its
// full dependency tree -> a ready-to-load behavior pack + resource pack,
// as {relPath -> Buffer} maps (nothing written to disk here - see
// fsTree.js's writeTree()).
//
// Deliberately generic - unlike OpenChara's own tools/lib/build.js (which
// this is modeled on), nothing here knows about characters, species,
// classes, quests, navigation slots, or UI compilation. Those are
// OpenChara/MinUI-specific concerns that plug into this generic pipeline
// via each package's own `content.bpOverlayDir`/`rpOverlayDir`/
// `scriptsDir` manifest fields (OR-Track J is what actually wires
// OpenChara in as a real consumer of this).
//
// Tested against dummy fixture libraries/mods (test/fixtures/), never
// against real Claude Waifus - see the plan's own note on why OR-Track F0
// carries zero cutover risk.
//
// content.scriptsDir is REAL esbuild bundling (bundleScripts()/
// resolveScriptEntry() below), not a file copy - the root mod's own script
// entry is the real bundling entry point, cross-package bare-specifier
// imports (`import { X } from "build-lib";`) resolve to each dependency's
// own declared entry file via a custom esbuild resolve plugin, and
// Bedrock's own built-in modules (@minecraft/server etc.) stay external.
// This is what "mod PACKAGER" is actually supposed to mean - compiling a
// real dependency graph down to one bundled output, not copying
// already-Bedrock-format files around with placeholder substitution
// (which is still exactly what content.bpOverlayDir/rpOverlayDir do, and
// correctly so - those are genuinely static assets/JSON with nothing to
// compile, not code).
//
// One real architectural question remains open, worth stating outright:
// the OR-Track B libraries (kernel.js/libLoader.js/each libs/*/src/
// register.js) are plain Node CommonJS (`require`/`module.exports`), used
// for BUILD-TIME kernel registration (a library's `register(kernel, ctx)`
// entry, resolved and called by libLoader.js during collectEntries/
// buildMod itself) - a completely separate mechanism from the real
// in-game ES-module scripts this file now genuinely bundles. Whether/how
// the kernel's own build-time registration data (registries, capabilities,
// etc.) gets surfaced to or consumed by in-game code is a different,
// still-open question this file doesn't need to answer to do its own real
// job (bundling manifest-declared in-game scripts) correctly.
"use strict";

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const { loadManifestFile } = require("./manifest.js");
const { topoSort } = require("./libLoader.js");
const { walk, writeTree, MERGED_FILES, mergeRegistry } = require("./fsTree.js");
const semver = require("./semver.js");

const TEXT_EXT = new Set([".json", ".lang", ".js", ".md", ".txt", ".mcfunction"]);

// Bedrock's own built-in script modules - provided by the game engine at
// runtime, never bundled. esbuild's `external` marks these as "leave the
// import statement alone, don't try to resolve/bundle it" - the same
// treatment a real bundler gives any genuine runtime-provided module.
const BEDROCK_BUILTIN_MODULES = [
    "@minecraft/server", "@minecraft/server-ui", "@minecraft/server-net",
    "@minecraft/server-gametest", "@minecraft/server-admin", "@minecraft/server-editor",
    "@minecraft/debug-utilities", "@minecraft/common", "@minecraft/math", "@minecraft/vanilla-data",
];

/** True for a mod, or a hybrid library that declares its own "packs" (OR-Track K). */
function isBuildablePackage(manifest) {
    return manifest.kind === "mod" || (manifest.kind === "library" && Boolean(manifest.packs));
}

function fill(text, vars) {
    return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/**
 * Walks `rootManifest`'s full dependency tree (submodule deps resolved via
 * `vendorDir`; "library"-type deps resolved via the caller-supplied
 * `libraryDirs` name->directory map, since a plain library reference has
 * no path of its own to resolve from until OR-Track I's real registry
 * exists) into a flat, de-duplicated list of `{manifest, dir}` entries,
 * root included. A "soft" dependency (load-order-only at runtime) is never
 * followed here - it's not a build-time asset/script contributor. An
 * absent "optional" library dependency is skipped, not an error.
 */
function collectEntries(rootManifest, rootDir, { vendorDir, libraryDirs = {} } = {}) {
    const collected = new Map(); // name -> {manifest, dir}

    function visit(manifest, entryDir) {
        if (collected.has(manifest.name)) return;
        collected.set(manifest.name, { manifest, dir: entryDir });
        for (const [depName, dep] of Object.entries(manifest.dependsOn ?? {})) {
            if (dep.soft) continue;
            let depDir;
            if (dep.type === "submodule") {
                if (!vendorDir) throw new Error(`"${manifest.name}" depends on submodule "${depName}", but no vendorDir was given`);
                depDir = path.join(vendorDir, dep.path);
            } else if (dep.type === "library") {
                depDir = libraryDirs[depName];
                if (!depDir) {
                    if (dep.optional) continue;
                    throw new Error(`"${manifest.name}" depends on library "${depName}", but no directory for it was given (pass it in libraryDirs)`);
                }
            }
            const depEntry = loadManifestFile(depDir);
            visit(depEntry.manifest, depEntry.dir);
        }
    }

    visit(rootManifest, rootDir);
    return [...collected.values()];
}

/**
 * Scans `openrockRoot`'s own `libs/*` directories and returns a
 * `{packageName: absoluteDir}` map - a convenience so a caller building a
 * mod that depends on OpenRock's own first-party libraries (OR-Track B)
 * doesn't have to hardcode each one's path by hand.
 */
function resolveBundledLibraryDirs(openrockRoot) {
    const libsDir = path.join(openrockRoot, "libs");
    const out = {};
    if (!fs.existsSync(libsDir)) return out;
    for (const entry of fs.readdirSync(libsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(libsDir, entry.name);
        try {
            const { manifest } = loadManifestFile(dir);
            out[manifest.name] = dir;
        } catch { /* not a valid package dir - skip silently, this is just a convenience scan */ }
    }
    return out;
}

// hasBehaviorPack === false (OR-Track G: packs.behavior === false, a
// resource-pack-only mod) skips the whole behavior-pack manifest - there's
// no data/script module, no scripts/main.js entry, nothing for the
// resource pack's own manifest.json to declare a dependency ON needing a
// paired BP UUID at all (a resource-only pack has no dependencies array).
function buildManifests(m) {
    const v = semver.parse(m.version);
    const version = [v.major, v.minor, v.patch];
    const minEngineVersion = m.engine?.minEngineVersion ?? [1, 21, 0];
    const scriptModules = m.engine?.scriptModules ?? {};
    const hasBehaviorPack = m.packs.behavior !== false;
    const r = m.packs.resource;
    const header = uuid => ({ name: "pack.name", description: "pack.description", uuid, version, min_engine_version: minEngineVersion });
    const metadata = { authors: m.authors ?? [] };
    let bp = null;
    if (hasBehaviorPack) {
        const b = m.packs.behavior;
        bp = {
            format_version: 2,
            header: header(b.uuid),
            modules: [
                { type: "data", uuid: b.dataModuleUuid, version },
                { type: "script", language: "javascript", uuid: b.scriptModuleUuid, entry: "scripts/main.js", version },
            ],
            dependencies: [
                { uuid: r.uuid, version },
                ...Object.entries(scriptModules).map(([module_name, moduleVersion]) => ({ module_name, version: moduleVersion })),
            ],
            metadata,
        };
    }
    const rp = {
        format_version: 2,
        header: header(r.uuid),
        modules: [{ type: "resources", uuid: r.moduleUuid, version }],
        metadata,
    };
    return { bp, rp };
}

/**
 * Builds a mod, OR a hybrid library that declares its own `packs`
 * (OR-Track K: a shared runtime addon other packages depend on via
 * type:"library" for its register()-time API, but that's ALSO its own
 * independently-installable BP/RP pair - not duplicated into every
 * consuming mod's build). The function name stays `buildMod` for
 * continuity with existing callers; "is this buildable at all" is
 * `manifest.kind === "mod" || (kind === "library" && manifest.packs)`.
 *
 * @param {string} modDir - a directory containing openrock.mod.json or a
 *   openrock.library.json with its own "packs".
 * @param {object} [opts]
 * @param {string} [opts.vendorDir] - base directory "submodule"-type deps resolve against.
 * @param {Record<string,string>} [opts.libraryDirs] - name -> directory, for "library"-type deps.
 * @returns {{ bp: Map<string,Buffer>|null, rp: Map<string,Buffer>, manifest: object }}
 *   `bp` is `null` for a resource-pack-only package (OR-Track G,
 *   `manifest.packs.behavior === false`) - there is genuinely no behavior
 *   pack to write/deploy/export, not an empty one.
 */
function buildMod(modDir, { vendorDir, libraryDirs = {} } = {}) {
    const { manifest: modManifest, dir } = loadManifestFile(modDir);
    if (!isBuildablePackage(modManifest)) throw new Error(`buildMod(): "${modDir}" has no buildable pack (kind "${modManifest.kind}" with no "packs" declared)`);
    const hasBehaviorPack = modManifest.packs.behavior !== false;

    const ordered = topoSort(collectEntries(modManifest, dir, { vendorDir, libraryDirs }));

    // @openrock/datagen's real builder functions, resolved once (from
    // whichever entry in `ordered` actually declares it - a package that
    // wants datagen support depends on it for real, via a normal
    // dependsOn entry, so it's already collected by the time this runs)
    // and reused for every datagenEntry script below.
    let cachedDatagenApi;
    function datagenApi() {
        if (cachedDatagenApi) return cachedDatagenApi;
        const entry = ordered.find(e => e.manifest.name === "@openrock/datagen");
        if (!entry || !entry.manifest.provides?.api) {
            throw new Error(`content.datagenEntry needs a real "@openrock/datagen" dependency (dependsOn) - none found in the resolved dependency tree`);
        }
        const register = require(path.resolve(entry.dir, entry.manifest.provides.api));
        cachedDatagenApi = register().api;
        return cachedDatagenApi;
    }

    const bp = hasBehaviorPack ? new Map() : null;
    const rp = new Map();
    const put = (map, rel, data) => map.set(rel, Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8"));
    // Shared by both real overlay files AND datagen output below - a JSON
    // file at a MERGED_FILES path combines with whatever's already there
    // (another package's own contribution to the same registry file)
    // instead of one silently clobbering the other.
    const putJson = (map, outRel, obj) => {
        if (MERGED_FILES.has(outRel) && map.has(outRel)) {
            obj = mergeRegistry(JSON.parse(map.get(outRel).toString("utf8")), obj);
        }
        put(map, outRel, JSON.stringify(obj, null, 2) + "\n");
    };
    const scriptEntries = []; // [{packageName, files: ["./scripts/foo/x.js", ...]}], in dependency load order

    for (const { manifest, dir: entryDir } of ordered) {
        const vars = { ns: manifest.namespace ?? "" };
        const content = manifest.content ?? {};

        for (const [field, map] of [["bpOverlayDir", bp], ["rpOverlayDir", rp]]) {
            if (!map) continue; // no behavior pack being built at all - bpOverlayDir is moot
            const srcDir = content[field];
            if (!srcDir) continue;
            const abs = path.join(entryDir, srcDir);
            for (const rel of walk(abs)) {
                const raw = fs.readFileSync(path.join(abs, rel));
                const outRel = fill(rel, vars);
                const data = TEXT_EXT.has(path.extname(rel)) ? fill(raw.toString("utf8"), vars) : raw;
                if (MERGED_FILES.has(outRel) && map.has(outRel)) {
                    const base = JSON.parse(map.get(outRel).toString("utf8"));
                    const add = JSON.parse(typeof data === "string" ? data : data.toString("utf8"));
                    put(map, outRel, JSON.stringify(mergeRegistry(base, add), null, 2) + "\n");
                } else {
                    put(map, outRel, data);
                }
            }
        }

        // content.datagenEntry (OR-Track B2, made real): a build-time-only
        // Node script, executed HERE (real require(), real JS execution -
        // this is the whole point, generating data from typed calls
        // instead of hand-writing JSON), producing { bp: {relPath: obj},
        // rp: {relPath: obj} } merged into the pack the same way real
        // overlay files are. Never bundled into the in-game scripts -
        // that's content.scriptsDir's separate, real-esbuild-bundled job.
        if (content.datagenEntry) {
            const entryAbs = path.resolve(entryDir, content.datagenEntry);
            if (!fs.existsSync(entryAbs)) throw new Error(`"${manifest.name}": content.datagenEntry "${content.datagenEntry}" doesn't exist`);
            let generate;
            try { generate = require(entryAbs); } catch (err) { throw new Error(`"${manifest.name}": content.datagenEntry "${content.datagenEntry}" failed to load: ${err.message}`); }
            if (typeof generate !== "function") throw new Error(`"${manifest.name}": content.datagenEntry "${content.datagenEntry}" must export a function (datagen) => ({ bp, rp })`);
            const result = generate(datagenApi()) ?? {};
            for (const [side, map] of [["bp", bp], ["rp", rp]]) {
                if (!result[side]) continue;
                if (!map) throw new Error(`"${manifest.name}": content.datagenEntry produced "${side}" output, but this package has no ${side === "bp" ? "behavior" : "resource"} pack`);
                for (const [outRel, obj] of Object.entries(result[side])) putJson(map, fill(outRel, vars), obj);
            }
        }

        if (hasBehaviorPack && content.scriptsDir) scriptEntries.push({ manifest, dir: entryDir });
    }

    const built = buildManifests(modManifest);
    if (hasBehaviorPack) {
        const resolveMap = new Map();
        // OR-Track N: every collected package that declares a real
        // `provides.api` (every kind:"library" entry already does, for the
        // build-time kernel's own resolveDependency()) also gets a real
        // esbuild `alias` entry pointing at that exact file - the same file
        // path already used for the build-time kernel/datagenApi()
        // resolution, reused here rather than inventing a second concept.
        // This is what makes `import { navigateToCoordinate } from
        // "@openrock/pathfinding"` resolve for real from inside a mod's own
        // script: esbuild bundles libs/pathfinding/src/register.js (a real
        // CommonJS file with real top-level named exports, per OR-Track N's
        // hoist) and exposes those exports via its standard CJS->ESM
        // interop. A library that was never hoisted (still only exports its
        // kernel-shaped `register` function) still gets an alias here - if
        // a mod's script tries to import a named export that doesn't
        // actually exist on that file, esbuild fails with a clear
        // resolution error, which is the CORRECT outcome (that library
        // genuinely isn't meant to be imported that way), not a silent gap.
        for (const { manifest, dir: entryDir } of ordered) {
            if (manifest.provides?.api) {
                resolveMap.set(manifest.name, path.resolve(entryDir, manifest.provides.api));
            }
        }
        // A real content.scriptsDir entry (a genuine standalone script
        // contributor, not just a library's API file) can still override
        // the provides.api alias above for its own package name - resolved
        // second, deliberately, so a package declaring BOTH gets its real
        // script entry as the import target, not its bare library API file.
        for (const { manifest, dir: entryDir } of scriptEntries) {
            const entryFile = resolveScriptEntry(manifest, entryDir);
            if (entryFile) resolveMap.set(manifest.name, entryFile);
        }
        const rootEntry = resolveMap.get(modManifest.name);
        if (rootEntry) {
            const { js, map } = bundleScripts(modManifest, rootEntry, resolveMap);
            put(bp, "scripts/main.js", js);
            if (map) put(bp, "scripts/main.js.map", map);
        } else {
            put(bp, "scripts/main.js", "// GENERATED by OpenRock build - this mod declares no script entry.\n");
        }
        put(bp, "manifest.json", JSON.stringify(built.bp, null, 2) + "\n");
    }
    put(rp, "manifest.json", JSON.stringify(built.rp, null, 2) + "\n");

    return { bp, rp, manifest: modManifest };
}

// Resolves which file, if any, is this package's own real in-game script
// entry - the file (a) esbuild actually bundles FROM for the root mod
// being built, and (b) another package's `import "pkg-name"` resolves TO.
// content.scriptEntry names it explicitly; absent that, a conventional
// "main.js" inside scriptsDir is used if present. Neither existing means
// this package contributes no scripts (not an error, unless scriptEntry
// was explicitly declared and genuinely doesn't exist on disk - that's a
// real manifest mistake worth failing loudly on).
function resolveScriptEntry(manifest, dir) {
    const content = manifest.content ?? {};
    if (!content.scriptsDir) return null;
    // esbuild's `alias` remapping resolves its VALUE relative to the
    // process's current working directory unless it's a genuinely absolute
    // path (confirmed the hard way: a relative value here produced "could
    // not resolve ... using the alias feature" even though the file
    // existed) - path.resolve() guarantees an absolute path regardless of
    // whether `dir` itself was passed in as relative or absolute.
    const scriptsAbs = path.resolve(dir, content.scriptsDir);
    if (!fs.existsSync(scriptsAbs)) return null;
    const entryRel = content.scriptEntry ?? "main.js";
    const abs = path.join(scriptsAbs, entryRel);
    if (!fs.existsSync(abs)) {
        if (content.scriptEntry) throw new Error(`"${manifest.name}": content.scriptEntry "${content.scriptEntry}" doesn't exist under "${content.scriptsDir}"`);
        return null;
    }
    return abs;
}

// Real ES-module bundling (esbuild) of the root mod's own script entry,
// resolving cross-package bare-specifier imports (e.g.
// `import { X } from "build-lib";`) to each dependency's own
// resolveScriptEntry() file via esbuild's `alias` option - no node_modules
// tree, no package.json exports map needed, since OpenRock already knows
// every dependency's real directory from collectEntries(). `alias` (a
// plain string->string map) is used instead of a custom resolve plugin
// because esbuild's SYNCHRONOUS build API (buildSync, used throughout this
// pipeline and every one of its callers - CLI, tests, dev-mode) flatly
// refuses to run with plugins at all ("Cannot use plugins in synchronous
// API calls" - a real constraint hit and fixed during implementation, not
// assumed). Bedrock's own built-in modules stay external (untouched
// import statements, resolved by the game engine itself at runtime, never
// bundled). This REPLACES the old copy-every-file-and-generate-a-flat-
// import-list mechanism - real compilation (dead code elimination, real
// cross-package resolution, one genuinely bundled output) instead of a
// file mover pretending to package something.
// Real source maps (OR-Track C2's debugger depends on this): before this
// rewrite, content.scriptsDir files were copied byte-for-byte, so the
// deployed file WAS the original source, 1:1 - no map needed. Real
// bundling concatenates/transforms multiple files into one, so without a
// source map, the debugger's line numbers would point at the wrong place
// in the wrong file. `sourcemap: "linked"` produces a real separate
// scripts/main.js.map, referenced from main.js via the standard
// `//# sourceMappingURL=` comment esbuild appends automatically.
function bundleScripts(rootManifest, entryFile, resolveMap) {
    const result = esbuild.buildSync({
        entryPoints: [entryFile],
        bundle: true,
        format: "esm",
        alias: Object.fromEntries(resolveMap),
        write: false,
        external: BEDROCK_BUILTIN_MODULES,
        sourcemap: "linked",
        outfile: "main.js",
        logLevel: "silent",
    });
    if (result.errors.length) {
        const detail = result.errors.map(e => `${e.text}${e.location ? ` (${e.location.file}:${e.location.line})` : ""}`).join("\n");
        throw new Error(`buildMod(): esbuild failed bundling "${rootManifest.name}"'s scripts:\n${detail}`);
    }
    const js = result.outputFiles.find(f => f.path.endsWith(".js"));
    const map = result.outputFiles.find(f => f.path.endsWith(".js.map"));
    return { js: `// GENERATED by OpenRock build (esbuild) - do not edit.\n${js.text}`, map: map?.text };
}

/**
 * Enumerates every immediate subdirectory of `modsDir` with a valid
 * `kind: "mod"` manifest (OR-Track F1's multi-mod dev mode). A subdirectory
 * with no manifest, an invalid one, or a `kind: "library"` one is skipped
 * silently - `modsDir` is expected to hold mod checkouts, not libraries.
 * @returns {Array<{manifest: object, dir: string}>}
 */
function discoverMods(modsDir) {
    if (!fs.existsSync(modsDir)) return [];
    const out = [];
    for (const entry of fs.readdirSync(modsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(modsDir, entry.name);
        try {
            const loaded = loadManifestFile(dir);
            // A hybrid library with its own "packs" (OR-Track K) is just as
            // buildable/deployable as a mod - discovered here too, so a
            // shared runtime addon sitting in the same mods/ folder gets
            // its own independent dev-mode watch loop like any other package.
            if (isBuildablePackage(loaded.manifest)) out.push(loaded);
        } catch { /* not a valid package dir here - skip */ }
    }
    return out;
}

module.exports = { buildMod, collectEntries, resolveBundledLibraryDirs, discoverMods, isBuildablePackage, writeTree };
