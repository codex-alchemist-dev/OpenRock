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
// A real architectural question surfaced while writing this, worth stating
// outright rather than silently working around: `content.scriptsDir` files
// are copied as OPAQUE BYTES here and only ever referenced by a generated
// `import "./pkg/file.js";` line in main.js - this pipeline never requires
// or executes them. That's deliberate and correct for THIS module's job
// (asset/script bundling), but it means the OR-Track B libraries
// (kernel.js/libLoader.js/each libs/*/src/register.js) - all written as
// plain Node CommonJS (`require`/`module.exports`) so they're testable
// with `node test.js` - have NEVER been shown to actually run inside
// Minecraft's real script engine, which only supports ES modules
// (`import`/`export`), not arbitrary `require()`. Whether/how OR-Track B's
// kernel system gets ported to (or invoked from) real in-game ES-module
// code is genuinely unresolved and is OR-Track D/J's problem once
// OpenChara's real in-game runtime actually consumes these libraries - not
// assumed solved here, and not blocking this pipeline's own real,
// testable job of bundling manifest-declared content files correctly.
"use strict";

const fs = require("fs");
const path = require("path");
const { loadManifestFile } = require("./manifest.js");
const { topoSort } = require("./libLoader.js");
const { walk, writeTree, MERGED_FILES, mergeRegistry } = require("./fsTree.js");
const semver = require("./semver.js");

const TEXT_EXT = new Set([".json", ".lang", ".js", ".md", ".txt", ".mcfunction"]);

/** True for a mod, or a hybrid library that declares its own "packs" (OR-Track K). */
function isBuildablePackage(manifest) {
    return manifest.kind === "mod" || (manifest.kind === "library" && Boolean(manifest.packs));
}

function fill(text, vars) {
    return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

// Turns a package name ("@openrock/registries", "openchara") into a
// filesystem/import-path-safe folder name.
function scriptFolderName(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, "_");
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

    const bp = hasBehaviorPack ? new Map() : null;
    const rp = new Map();
    const put = (map, rel, data) => map.set(rel, Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8"));
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

        if (hasBehaviorPack && content.scriptsDir) {
            const abs = path.join(entryDir, content.scriptsDir);
            const folder = scriptFolderName(manifest.name);
            const files = [];
            for (const rel of walk(abs)) {
                put(bp, `scripts/${folder}/${rel}`, fs.readFileSync(path.join(abs, rel)));
                // scriptEntry (OR-Track K), when declared, narrows the
                // top-level import list to just that one file - every other
                // .js file is still copied, only reachable via the entry's
                // OWN relative imports, never separately double-imported.
                if (rel.endsWith(".js") && (!content.scriptEntry || rel === content.scriptEntry)) files.push(`./${folder}/${rel}`);
            }
            if (files.length) scriptEntries.push({ packageName: manifest.name, files });
        }
    }

    const built = buildManifests(modManifest);
    if (hasBehaviorPack) {
        const mainLines = ["// GENERATED by OpenRock build - do not edit."];
        for (const { files } of scriptEntries) for (const f of files) mainLines.push(`import "${f}";`);
        put(bp, "scripts/main.js", mainLines.join("\n") + "\n");
        put(bp, "manifest.json", JSON.stringify(built.bp, null, 2) + "\n");
    }
    put(rp, "manifest.json", JSON.stringify(built.rp, null, 2) + "\n");

    return { bp, rp, manifest: modManifest };
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
