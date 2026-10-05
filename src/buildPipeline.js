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
//
// OR-Track Q6 (real incremental builds, not just a "recopy changed files"
// diff): buildMod() itself is decomposed below into named, individually
// callable pieces (renderEntryContent/renderManifestJson/renderScripts/
// runEntityLints) instead of one monolithic function body. buildMod()
// composes ALL of them in order, unchanged in behavior from before this
// refactor - every existing caller keeps working exactly as it did.
// createIncrementalBuild() (bottom of this file) is the NEW real consumer:
// it keeps a persistent {bp, rp} Map pair across many calls, classifies a
// changed file to the ONE package + ONE content mechanism (entityDsl,
// scriptsDir, bpOverlayDir/rpOverlayDir, datagenEntry, manifestDsl) it
// belongs to, and re-runs ONLY that one piece - never a full buildMod()
// pass - unless the change can't be safely attributed to one known unit,
// in which case it falls back to a real full rebuild (buildMod() itself),
// exactly as the original Q6 design called for.
"use strict";

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const { loadManifestFile } = require("./manifest.js");
const { topoSort } = require("./libLoader.js");
const { walk, writeTree, MERGED_FILES, mergeRegistry } = require("./fsTree.js");
const semver = require("./semver.js");
const { compileEntityDsl } = require("./entityDsl/entityCompiler.js");
const { compileBlockDsl } = require("./blockDsl/blockCompiler.js");
const { compileItemDsl } = require("./itemDsl/itemCompiler.js");
const { compileCinemaDsl } = require("./cinemaDsl/cinemaCompiler.js");
const { compileLocalization } = require("../libs/localization/src/emit.js");
const { lintEntityDoc, lintClientEntityDoc, lintRenderControllerReferences } = require("./entityDsl/entityLint.js");
const { checkScriptModulesCompleteness, scanEarlyExecutionCalls } = require("./scriptLint.js");
const { compileManifestDsl } = require("./manifestDsl/manifestCompiler.js");
const { mergeManifestDoc } = require("./manifestDsl/manifestBuilder.js");
const { formatEsbuildFailure } = require("./buildDiagnostics.js");
const { extractVirtualModules, materializeVirtualModules, stripVirtual, isVirtualKey } = require("./virtualModules.js");

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

const put = (map, rel, data) => map.set(rel, Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8"));

// Every real "directory of *.<kind>.tsx files, compiled into real Bedrock
// JSON" Crystal Manifest-* dialect (Crystal Manifest-Entity, -Block,
// -Item, see docs/crystal.md) is REAL PLUMBING around one shared shape -
// table-driven so a new dialect is a one-line addition here, never a
// third/fourth copy-pasted render/classify/incremental-tracking path.
// Each dialect's own compiler (entityCompiler.js/blockCompiler.js/
// itemCompiler.js) already has its own real Q6 compile cache - this table
// only concerns ITSELF with "which manifest.content field, which real
// compile function," nothing about caching or emission.
const DIRECTORY_DSLS = [
    { contentField: "entityDsl", compile: compileEntityDsl },
    { contentField: "blockDsl", compile: compileBlockDsl },
    { contentField: "itemDsl", compile: compileItemDsl },
    { contentField: "cinemaDsl", compile: compileCinemaDsl },
    // allowWithoutBehavior: the output is valid for a resource-pack-only mod too (text/lang files).
    { contentField: "localization", compile: compileLocalization, allowWithoutBehavior: true },
];

function hasManifestFile(dir) {
    return ["openrock.mod.json", "openrock.library.json"].some(f => fs.existsSync(path.join(dir, f)));
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
            // A submodule that exists but has no OpenRock manifest is plain code
            // (e.g. vendor/mclite, required directly by the libraries that use it),
            // not a package with assets/scripts to merge - nothing to collect.
            if (dep.type === "submodule" && fs.existsSync(depDir) && !hasManifestFile(depDir)) continue;
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
 * The real, cheap "setup" phase - directory listing, manifest parsing,
 * topo-sorting the dependency tree, resolving the esbuild alias map. None
 * of this is expensive compilation (no tsc, no esbuild invocation happens
 * here), so it's always safe and correct to recompute in full on every
 * incremental pass too - it's what lets a NEWLY added file (e.g. a second
 * *.entity.tsx dropped into an existing entityDsl dir) be discovered
 * without needing its own special-cased "structural change" detection.
 * @returns {{modManifest, dir, hasBehaviorPack, ordered, scriptEntries, resolveMap, rootEntry, datagenApi: () => object}}
 */
function resolveBuildPlan(modDir, { vendorDir, libraryDirs = {} } = {}) {
    const { manifest: modManifest, dir } = loadManifestFile(modDir);
    if (!isBuildablePackage(modManifest)) throw new Error(`buildMod(): "${modDir}" has no buildable pack (kind "${modManifest.kind}" with no "packs" declared)`);
    const hasBehaviorPack = modManifest.packs.behavior !== false;
    const ordered = topoSort(collectEntries(modManifest, dir, { vendorDir, libraryDirs }));

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

    const scriptEntries = ordered.filter(({ manifest }) => hasBehaviorPack && manifest.content?.scriptsDir);

    let resolveMap = null;
    let rootEntry = null;
    if (hasBehaviorPack) {
        resolveMap = new Map();
        // OR-Track N: every collected package that declares a real
        // `provides.api` (every kind:"library" entry already does, for the
        // build-time kernel's own resolveDependency()) also gets a real
        // esbuild `alias` entry pointing at that exact file.
        for (const { manifest, dir: entryDir } of ordered) {
            if (manifest.provides?.api) resolveMap.set(manifest.name, path.resolve(entryDir, manifest.provides.api));
        }
        // A real content.scriptsDir entry overrides the provides.api alias
        // above for its own package name - resolved second, deliberately.
        for (const { manifest, dir: entryDir } of scriptEntries) {
            const entryFile = resolveScriptEntry(manifest, entryDir);
            if (entryFile) resolveMap.set(manifest.name, entryFile);
        }
        rootEntry = resolveMap.get(modManifest.name) ?? null;
    }

    return { modManifest, dir, hasBehaviorPack, ordered, scriptEntries, resolveMap, rootEntry, datagenApi };
}

/**
 * Shared by both real overlay files AND datagen output - a JSON file at a
 * MERGED_FILES path combines with whatever's already there (another
 * package's own contribution to the same registry file) instead of one
 * silently clobbering the other.
 */
function putJson(map, outRel, obj) {
    if (MERGED_FILES.has(outRel) && map.has(outRel)) {
        obj = mergeRegistry(JSON.parse(map.get(outRel).toString("utf8")), obj);
    }
    put(map, outRel, JSON.stringify(obj, null, 2) + "\n");
}

// A Crystal Manifest-* dialect's own output entry (OR-Track M6) can be
// either a real JSON document (an entity/block/item definition) or a real
// raw binary asset (a co-located texture file, copied verbatim) - this
// dispatches to the right real handling for each, so a texture Buffer
// never gets accidentally run through JSON.stringify() (which would
// mangle it into a {"type":"Buffer","data":[...]} object, not real bytes).
function putDirectoryDslEntry(map, outRel, value) {
    if (Buffer.isBuffer(value) || typeof value === "string") put(map, outRel, value);
    else putJson(map, outRel, value);
}

// Real, standing architectural rule: OpenRock is a completely different
// format from native Minecraft, and it must be PHYSICALLY IMPOSSIBLE to
// compile hand-rolled, native Bedrock documents through it - every real
// document a Crystal Manifest-* dialect (see docs/crystal.md) now covers
// has to be authored through that dialect, never smuggled in as a raw
// file under bpOverlayDir/rpOverlayDir. This is enforced here, not just
// documented: a real file landing at one of these paths fails the whole
// build loudly, naming the real Crystal dialect that owns it. Anything
// NOT in this list (textures, sounds, loot_tables, recipes, trading,
// animations, and any render_controllers a mod still needs to hand-author
// - no Crystal dialect covers that yet) is unaffected; this only blocks
// the exact real document shapes OpenRock's own DSLs now fully own.
const NATIVE_ONLY_PATHS = [
    { pattern: /^entities\//, kind: "entity", dialect: "Crystal Manifest-Entity", field: "content.entityDsl" },
    { pattern: /^entity\//, kind: "entity", dialect: "Crystal Manifest-Entity", field: "content.entityDsl" },
    { pattern: /^blocks\//, kind: "block", dialect: "Crystal Manifest-Block", field: "content.blockDsl" },
    { pattern: /^items\//, kind: "item", dialect: "Crystal Manifest-Item", field: "content.itemDsl" },
    // manifest.json is ALWAYS regenerated last by renderManifestJson() and
    // would otherwise just silently overwrite a hand-rolled one here with
    // zero warning - a real, confusing footgun a paranoid re-audit caught
    // (the file would sit there looking "wired up" while never actually
    // taking effect). Loud and explicit beats silent and confusing.
    { pattern: /^manifest\.json$/, kind: "manifest", dialect: "Crystal Manifest", field: "content.manifestDsl" },
];

function assertNotNativeOnlyPath(manifestName, outRel) {
    const hit = NATIVE_ONLY_PATHS.find(({ pattern }) => pattern.test(outRel));
    if (hit) {
        throw new Error(
            `"${manifestName}": a real, hand-rolled native Bedrock file at "${outRel}" was found under a plain overlay directory (bpOverlayDir/rpOverlayDir) - OpenRock physically cannot compile hand-authored ${hit.kind} documents. ` +
            `Author this through ${hit.dialect} instead (${hit.field}).`
        );
    }
}

/**
 * Renders ONE package entry's own bpOverlayDir/rpOverlayDir/datagenEntry/
 * Crystal Manifest-* content into `{bp, rp}` - the one real "compile unit"
 * per package this pipeline knows about (scripts are handled separately by
 * renderScripts() below, since script bundling spans the WHOLE dependency
 * graph, not one package in isolation). Used both by buildMod()'s full
 * assembly (called once per entry, in order) and by
 * createIncrementalBuild()'s rebuild() (called for just the one entry that
 * owns a changed file).
 */
/**
 * Template variables for `{{name}}` placeholders in a package's content. `ns` is the
 * package's own namespace (falling back to the mod's, so a namespace-less library's
 * templates land in the mod's namespace); every other variable comes from the ROOT mod's
 * `templateVars`, so a library's templates (e.g. OpenChara's `{{char}}`) are filled
 * with the consuming mod's values.
 */
function templateVarsFor(entryManifest, rootManifest) {
    return { ...(rootManifest?.templateVars ?? {}), ns: entryManifest.namespace ?? rootManifest?.namespace ?? "" };
}

function renderEntryContent({ manifest, dir: entryDir }, { bp, rp }, datagenApi, rootManifest = null) {
    const vars = templateVarsFor(manifest, rootManifest);
    const content = manifest.content ?? {};

    for (const [field, map] of [["bpOverlayDir", bp], ["rpOverlayDir", rp]]) {
        if (!map) continue; // no behavior pack being built at all - bpOverlayDir is moot
        const srcDir = content[field];
        if (!srcDir) continue;
        const abs = path.join(entryDir, srcDir);
        for (const rel of walk(abs)) {
            const raw = fs.readFileSync(path.join(abs, rel));
            const outRel = fill(rel, vars);
            assertNotNativeOnlyPath(manifest.name, outRel);
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

    // content.datagenEntry (OR-Track B2, made real): a build-time-only Node
    // script, executed HERE (real require(), real JS execution), producing
    // { bp: {relPath: obj}, rp: {relPath: obj} } merged into the pack the
    // same way real overlay files are.
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
            for (const [outRel, obj] of Object.entries(result[side])) {
                const filledRel = fill(outRel, vars);
                // Real, paranoid catch: a datagenEntry script is arbitrary
                // JS - it can return ANY path, including a real, hand-rolled
                // native entities/blocks/items document that never went
                // near a plain overlay directory at all. The enforcement
                // above only guarded the overlay-copy loop; without this,
                // datagenEntry was a real, live bypass of the whole "OpenRock
                // physically can't compile hand-rolled native documents"
                // rule - caught by a deliberately paranoid re-audit, not
                // assumed safe just because it wasn't the first place checked.
                assertNotNativeOnlyPath(manifest.name, filledRel);
                putJson(map, filledRel, obj);
            }
        }
    }

    // The real Crystal Manifest-Entity/-Block/-Item dialects (OR-Track
    // M/M4/M5, made real): each is a directory of real *.<kind>.tsx files,
    // compiled into real Bedrock JSON, merged into the pack the same way
    // datagenEntry's output is.
    {
        for (const { contentField, compile, allowWithoutBehavior } of DIRECTORY_DSLS) {
            if (!content[contentField]) continue;
            if (!bp && !allowWithoutBehavior) continue;
            const dslDirAbs = path.resolve(entryDir, content[contentField]);
            const output = compile(dslDirAbs);
            if (bp) for (const [outRel, doc] of Object.entries(output.bp ?? {})) putDirectoryDslEntry(bp, fill(outRel, vars), doc);
            if (rp) for (const [outRel, doc] of Object.entries(output.rp ?? {})) putDirectoryDslEntry(rp, fill(outRel, vars), doc);
        }
    }
}

/**
 * Renders the real, generated bp/rp manifest.json - buildManifests()'s own
 * output, extended/overridden by the root manifest's real manifest DSL
 * file (OR-Track O), if any. Cheap enough (no tsc unless the manifest DSL
 * file itself changed - and even then, manifestDsl's own Q6 cache skips it
 * when unchanged) to always re-run in full on every build, incremental or not.
 */
function renderManifestJson(plan, { bp, rp }) {
    const { modManifest, dir, hasBehaviorPack } = plan;
    const built = buildManifests(modManifest);

    const rootManifestDsl = modManifest.content?.manifestDsl;
    if (rootManifestDsl) {
        const manifestDslAbs = path.resolve(dir, rootManifestDsl);
        const manifestOutput = compileManifestDsl(manifestDslAbs);
        if (manifestOutput) {
            if (built.bp) built.bp = mergeManifestDoc(built.bp, manifestOutput.bp);
            else if (manifestOutput.bp) throw new Error(`"${modManifest.name}": manifest DSL declares a <Behavior> pack, but this mod has no real behavior pack (packs.behavior === false)`);
            built.rp = mergeManifestDoc(built.rp, manifestOutput.rp);
        }
    }

    if (hasBehaviorPack) put(bp, "manifest.json", JSON.stringify(built.bp, null, 2) + "\n");
    put(rp, "manifest.json", JSON.stringify(built.rp, null, 2) + "\n");
}

/**
 * Real ES-module bundling of the root mod's own script entry (via
 * bundleScripts()) plus the real, compile-time script lints (OR-Track M3).
 * Spans the WHOLE resolved dependency graph (cross-package bare-specifier
 * resolution), so unlike renderEntryContent() this is never scoped to one
 * package - any scriptsDir change anywhere in the tree re-runs this in full.
 * @returns {string[]} lint issues found against the freshly bundled output.
 */
function renderScripts(plan, bp) {
    const { modManifest, rootEntry } = plan;
    const lintIssues = [];
    if (rootEntry) {
        // Generated "virtual" modules a build-time compiler emitted into bp
        // (src/virtualModules.js) become importable as @openrock/virtual/<name>.
        const resolveMap = new Map(plan.resolveMap);
        for (const [specifier, file] of materializeVirtualModules(extractVirtualModules(bp))) resolveMap.set(specifier, file);
        const { js, map } = bundleScripts(modManifest, rootEntry, resolveMap);
        lintIssues.push(...checkScriptModulesCompleteness(js, modManifest.engine?.scriptModules, modManifest.name));
        lintIssues.push(...scanEarlyExecutionCalls(js, modManifest.name));
        put(bp, "scripts/main.js", js);
        if (map) put(bp, "scripts/main.js.map", map);
        else bp.delete("scripts/main.js.map");
    } else {
        put(bp, "scripts/main.js", "// GENERATED by OpenRock build - this mod declares no script entry.\n");
    }
    return lintIssues;
}

/**
 * OR-Track M3 (made real): the entity DSL linter, run over EVERY real
 * entity doc currently in `{bp, rp}` - both DSL-compiled and any
 * hand-authored overlay JSON that reached bp/rp through
 * bpOverlayDir/rpOverlayDir, since a lint pass here catches the failure
 * class regardless of which authoring path produced the bad JSON. Cheap
 * (a JSON walk, no process spawn) - always safe to re-run in full after
 * ANY incremental change, so lint coverage never silently narrows just
 * because a rebuild was scoped to one package.
 */
function runEntityLints({ bp, rp }) {
    const lintIssues = [];
    if (bp) {
        for (const [rel, buf] of bp) {
            if (!rel.startsWith("entities/") || !rel.endsWith(".json")) continue;
            let doc;
            try { doc = JSON.parse(buf.toString("utf8")); } catch { continue; }
            lintIssues.push(...lintEntityDoc(doc, rel));
        }
    }
    const rcDocs = [];
    const clientEntityDocs = [];
    for (const [rel, buf] of rp) {
        if (rel.startsWith("render_controllers/") && rel.endsWith(".json")) {
            try { rcDocs.push(JSON.parse(buf.toString("utf8"))); } catch { /* not real JSON - skip */ }
        } else if (rel.startsWith("entity/") && rel.endsWith(".json")) {
            try { clientEntityDocs.push([rel, JSON.parse(buf.toString("utf8"))]); } catch { /* not real JSON - skip */ }
        }
    }
    for (const [rel, doc] of clientEntityDocs) {
        lintIssues.push(...lintClientEntityDoc(doc, rel));
        lintIssues.push(...lintRenderControllerReferences(doc, rcDocs, rel));
    }
    return lintIssues;
}

function assertNoLintIssues(modManifest, lintIssues) {
    if (lintIssues.length) {
        throw new Error(`buildMod(): "${modManifest.name}" failed OpenRock's entity/script lint (OR-Track M3) with ${lintIssues.length} real issue(s):\n${lintIssues.map(i => `  - ${i}`).join("\n")}`);
    }
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
 * A full, correct, from-scratch build every time - the safe, always-right
 * baseline every other command (build/check/export/deploy, and
 * createIncrementalBuild()'s own fallback path) can rely on. For a
 * long-running `dev` watch loop that wants to skip re-rendering content
 * that provably didn't change, see createIncrementalBuild() below.
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
function buildMod(modDir, opts = {}) {
    const plan = resolveBuildPlan(modDir, opts);
    const bp = plan.hasBehaviorPack ? new Map() : null;
    const rp = new Map();

    for (const entry of plan.ordered) renderEntryContent(entry, { bp, rp }, plan.datagenApi, plan.modManifest);

    const lintIssues = runEntityLints({ bp, rp });
    renderManifestJson(plan, { bp, rp });
    if (plan.hasBehaviorPack) lintIssues.push(...renderScripts(plan, bp));

    assertNoLintIssues(plan.modManifest, lintIssues);
    return { bp: stripVirtual(bp), rp, manifest: plan.modManifest };
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
    // Real, confirmed-by-testing esbuild behavior: buildSync() doesn't
    // return normally with a populated `result.errors` on failure - it
    // THROWS its own BuildFailure exception (whose `.errors` array carries
    // the exact same real, structured diagnostics) regardless of
    // `logLevel`. `logLevel` only controls esbuild's own console printing,
    // never whether it throws - a real gap caught live (a broken import
    // produced esbuild's own default-formatted exception text instead of
    // this project's real, intricate report) and fixed here, not assumed
    // safe just because `if (result.errors.length)` looked plausible.
    let result;
    try {
        result = esbuild.buildSync({
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
    } catch (err) {
        throw new Error(formatEsbuildFailure(err.errors ?? [{ text: err.message, location: null }], rootManifest.name));
    }
    if (result.errors.length) {
        throw new Error(formatEsbuildFailure(result.errors, rootManifest.name));
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

/**
 * Finds which `plan.ordered` entry a real absolute file path lives under -
 * the LONGEST matching directory prefix wins, so a dependency nested
 * inside another package's own directory (not a normal layout, but not
 * forbidden either) still attributes correctly.
 */
function findOwningEntry(plan, absPath) {
    let best = null;
    for (const entry of plan.ordered) {
        const entryDirAbs = path.resolve(entry.dir);
        if (absPath !== entryDirAbs && !absPath.startsWith(entryDirAbs + path.sep)) continue;
        if (!best || entryDirAbs.length > path.resolve(best.dir).length) best = entry;
    }
    return best;
}

/**
 * Classifies a real, absolute changed-file path into exactly the one real
 * compile unit it belongs to, or `null` if it can't be safely attributed
 * to one (the real, correct trigger for createIncrementalBuild()'s full-
 * rebuild fallback - e.g. a package manifest itself changed, or the file
 * sits outside every known content directory).
 * @returns {null | {kind: "overlay", entry, side: "bp"|"rp", dirAbs: string}
 *   | {kind: "directoryDsl", entry, dirAbs: string, compile: Function} | {kind: "scripts", entry}
 *   | {kind: "datagen", entry} | {kind: "manifestDsl"}}
 */
function classifyChange(plan, absPath) {
    const entry = findOwningEntry(plan, absPath);
    if (entry) {
        const content = entry.manifest.content ?? {};
        for (const [field, side] of [["bpOverlayDir", "bp"], ["rpOverlayDir", "rp"]]) {
            if (!content[field]) continue;
            const dirAbs = path.resolve(entry.dir, content[field]);
            if (absPath === dirAbs || absPath.startsWith(dirAbs + path.sep)) return { kind: "overlay", entry, side, dirAbs };
        }
        for (const { contentField, compile } of DIRECTORY_DSLS) {
            if (!content[contentField]) continue;
            const dirAbs = path.resolve(entry.dir, content[contentField]);
            if (absPath === dirAbs || absPath.startsWith(dirAbs + path.sep)) return { kind: "directoryDsl", entry, dirAbs, compile };
        }
        if (content.scriptsDir) {
            const dirAbs = path.resolve(entry.dir, content.scriptsDir);
            if (absPath === dirAbs || absPath.startsWith(dirAbs + path.sep)) return { kind: "scripts", entry };
        }
        if (content.datagenEntry) {
            const fileAbs = path.resolve(entry.dir, content.datagenEntry);
            if (absPath === fileAbs) return { kind: "datagen", entry };
        }
    }
    const rootManifestDsl = plan.modManifest.content?.manifestDsl;
    if (rootManifestDsl) {
        const fileAbs = path.resolve(plan.dir, rootManifestDsl);
        if (absPath === fileAbs) return { kind: "manifestDsl" };
    }
    return null;
}

/**
 * OR-Track Q6, made real: a genuinely incremental builder for `openrock
 * dev`'s long-running watch loop. Keeps ONE persistent `{bp, rp}` Map pair
 * across many `.rebuild(absChangedPath)` calls, re-rendering ONLY the one
 * real compile unit a changed file belongs to (see classifyChange()) -
 * never re-running the whole dependency tree's overlay copies, datagen,
 * entity DSL compiles, or script bundling just because ONE file in ONE of
 * them changed. Falls back to a real, full `buildMod()` rebuild (and resets
 * its own cached state from that fresh result) whenever a change can't be
 * safely attributed to one unit in isolation - a merged-registry overlay
 * file, a datagenEntry script (which can write into BOTH bp and rp and
 * merge-register), or a file outside every known content directory (e.g.
 * the package's own manifest.json, or a brand-new content directory that
 * didn't exist during the last build). This mirrors buildMod()'s own
 * ordering and lint discipline exactly - runEntityLints() and
 * renderManifestJson() re-run after EVERY rebuild, incremental or full, so
 * lint coverage and the generated manifest.json are never stale.
 *
 * @param {string} modDir
 * @param {object} [opts] - same shape as buildMod()'s own opts.
 * @returns {{ build: () => {bp,rp,manifest}, rebuild: (absChangedPath: string) => {bp,rp,manifest}, isFullBuild: () => boolean }}
 */
function createIncrementalBuild(modDir, opts = {}) {
    let plan = null;
    let bp = null;
    let rp = null;
    let lastWasFullBuild = true;
    // dirAbs (a Crystal Manifest-Entity/-Block/-Item directory) -> Set of
    // output-path keys IT was responsible for as of the last time we knew
    // for sure - lets an incremental directoryDsl rebuild remove a key
    // that stopped being produced (a source file deleted, or its
    // identifier renamed) instead of leaving a stale JSON file behind
    // forever. One shared map across ALL directory-DSL dialects - real
    // output paths are already globally unique (entities/blocks/items
    // never collide), so there's no real need for a per-dialect map.
    const directoryDslOutputKeys = new Map();

    function fullBuild() {
        plan = resolveBuildPlan(modDir, opts);
        bp = plan.hasBehaviorPack ? new Map() : null;
        rp = new Map();
        for (const entry of plan.ordered) renderEntryContent(entry, { bp, rp }, plan.datagenApi, plan.modManifest);
        const lintIssues = runEntityLints({ bp, rp });
        renderManifestJson(plan, { bp, rp });
        if (plan.hasBehaviorPack) lintIssues.push(...renderScripts(plan, bp));
        assertNoLintIssues(plan.modManifest, lintIssues);
        lastWasFullBuild = true;

        // Seed directoryDslOutputKeys for real, at zero extra real compile
        // cost - each dialect's compile() was already called (and its own
        // Q6 cache populated) for each of these directories by
        // renderEntryContent() above, so this is a guaranteed cache hit,
        // never a second real tsc invocation.
        directoryDslOutputKeys.clear();
        {
            for (const { manifest, dir: entryDir } of plan.ordered) {
                const vars = templateVarsFor(manifest, plan.modManifest);
                for (const { contentField, compile, allowWithoutBehavior } of DIRECTORY_DSLS) {
                    const dslRel = manifest.content?.[contentField];
                    if (!dslRel) continue;
                    if (!bp && !allowWithoutBehavior) continue;
                    const dirAbs = path.resolve(entryDir, dslRel);
                    const output = compile(dirAbs);
                    directoryDslOutputKeys.set(dirAbs, {
                        bp: new Set(Object.keys(output.bp ?? {}).map(k => fill(k, vars))),
                        rp: new Set(Object.keys(output.rp ?? {}).map(k => fill(k, vars))),
                    });
                }
            }
        }
        return { bp: stripVirtual(bp), rp, manifest: plan.modManifest };
    }

    function rebuild(absChangedPath) {
        if (!plan) return fullBuild(); // no prior build to incrementally extend - do a real full one
        const target = classifyChange(plan, path.resolve(absChangedPath));
        if (!target) return fullBuild();

        lastWasFullBuild = false;
        switch (target.kind) {
            case "overlay": {
                const map = target.side === "bp" ? bp : rp;
                if (!map) return fullBuild(); // shouldn't happen (bp overlay with no bp), but never guess
                const vars = templateVarsFor(target.entry.manifest, plan.modManifest);
                const rel = path.relative(target.dirAbs, path.resolve(absChangedPath)).split(path.sep).join("/");
                const outRel = fill(rel, vars);
                assertNotNativeOnlyPath(target.entry.manifest.name, outRel);
                // A MERGED_FILES path (e.g. a shared registry JSON multiple
                // packages contribute to) can't be safely re-derived from
                // just the ONE changed contributor in isolation without
                // replaying every other package's own contribution too -
                // genuinely unsafe to special-case, so it's always a real
                // full rebuild instead of a guess that could silently drop
                // another package's real data.
                if (MERGED_FILES.has(outRel)) return fullBuild();
                if (!fs.existsSync(absChangedPath)) {
                    map.delete(outRel); // a real deletion - remove it from the pack too
                } else {
                    const raw = fs.readFileSync(absChangedPath);
                    const data = TEXT_EXT.has(path.extname(absChangedPath)) ? fill(raw.toString("utf8"), vars) : raw;
                    put(map, outRel, data);
                }
                break;
            }
            case "directoryDsl": {
                if (!bp) return fullBuild();
                // compile() re-lists target.dirAbs itself, so an
                // added/removed source file in this same directory is
                // picked up for real too, not just an edit to an existing one.
                const vars = templateVarsFor(target.entry.manifest, plan.modManifest);
                const output = target.compile(target.dirAbs);
                const freshBpKeys = new Set(Object.keys(output.bp ?? {}).map(k => fill(k, vars)));
                const freshRpKeys = new Set(Object.keys(output.rp ?? {}).map(k => fill(k, vars)));

                // Any output this directory previously contributed that the
                // fresh output no longer includes (a source file was
                // deleted, or its identifier renamed) is removed here -
                // otherwise a stale JSON file would linger in the pack
                // forever, silently outliving its own source. bp and rp
                // keys are tracked and cleaned up separately - Crystal
                // Manifest-Entity's own RP client_entity output lives in
                // `rp`, everything else in `bp`.
                const previous = directoryDslOutputKeys.get(target.dirAbs) ?? { bp: new Set(), rp: new Set() };
                for (const staleKey of previous.bp) if (!freshBpKeys.has(staleKey)) bp.delete(staleKey);
                if (rp) for (const staleKey of previous.rp) if (!freshRpKeys.has(staleKey)) rp.delete(staleKey);
                directoryDslOutputKeys.set(target.dirAbs, { bp: freshBpKeys, rp: freshRpKeys });

                for (const [outRel, doc] of Object.entries(output.bp ?? {})) putDirectoryDslEntry(bp, fill(outRel, vars), doc);
                if (rp) for (const [outRel, doc] of Object.entries(output.rp ?? {})) putDirectoryDslEntry(rp, fill(outRel, vars), doc);
                // Generated virtual script modules feed the bundle, so a
                // change to one means the bundle itself must be re-rendered.
                if ([...freshBpKeys, ...previous.bp].some(isVirtualKey)) {
                    const scriptIssues = renderScripts(plan, bp);
                    assertNoLintIssues(plan.modManifest, scriptIssues);
                }
                break;
            }
            case "scripts": {
                if (!bp) return fullBuild();
                const lintIssues = renderScripts(plan, bp);
                lintIssues.push(...runEntityLints({ bp, rp }));
                assertNoLintIssues(plan.modManifest, lintIssues);
                return { bp: stripVirtual(bp), rp, manifest: plan.modManifest };
            }
            case "datagen": {
                // Can emit into BOTH bp and rp, and can merge-register into
                // shared files - the same "can't safely replay in isolation"
                // reasoning as the MERGED_FILES overlay case above applies
                // even harder here (an arbitrary script, not a static file).
                return fullBuild();
            }
            case "manifestDsl": {
                renderManifestJson(plan, { bp, rp });
                break;
            }
        }

        const lintIssues = runEntityLints({ bp, rp });
        assertNoLintIssues(plan.modManifest, lintIssues);
        return { bp: stripVirtual(bp), rp, manifest: plan.modManifest };
    }

    return { build: fullBuild, rebuild, isFullBuild: () => lastWasFullBuild };
}

module.exports = {
    buildMod, collectEntries, resolveBundledLibraryDirs, discoverMods, isBuildablePackage, writeTree,
    createIncrementalBuild, resolveBuildPlan, classifyChange,
};
