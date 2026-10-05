// Shared, small, single-purpose helpers used by more than one CLI command
// module (src/commands/*.js) - kept modular per the standing project rule:
// every file/function does ONE real thing, never a monolithic "CLI utils"
// grab-bag with unrelated concerns bolted on over time.
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { resolveBundledLibraryDirs, collectEntries } = require("../buildPipeline.js");
const { loadManifestFile } = require("../manifest.js");
const { runLocalizationPrebuild } = require("../../libs/localization/src/prebuild.js");
const { runSmokeTest } = require("../bdsTestHarness.js");

function stamp() { return new Date().toTimeString().slice(0, 8); }

/** Locates Minecraft's real com.mojang folder - explicit OPENROCK_COM_MOJANG env var first, then the two real, known install locations. */
function comMojang() {
    if (process.env.OPENROCK_COM_MOJANG) return process.env.OPENROCK_COM_MOJANG;
    const appdata = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    const candidates = [
        path.join(appdata, "Minecraft Bedrock", "Users", "Shared", "games", "com.mojang"),
        path.join(process.env.LOCALAPPDATA || "", "Packages", "Microsoft.MinecraftUWP_8wekyb3d8bbwe", "LocalState", "games", "com.mojang"),
    ];
    const found = candidates.find(c => fs.existsSync(c));
    if (!found) throw new Error("Can't find Minecraft's com.mojang folder - set OPENROCK_COM_MOJANG to its path.");
    return found;
}

/** The real buildMod() opts every build-family command shares: vendor/ by convention, OpenRock's own bundled libs/* resolved by name. */
function buildOpts(modDir, openrockRoot) {
    // A package with no vendor/ of its own (e.g. a bundled lib/ inspected in place) resolves submodule deps against OpenRock's own root.
    const local = path.join(modDir, "vendor");
    return { vendorDir: fs.existsSync(local) ? local : openrockRoot, libraryDirs: resolveBundledLibraryDirs(openrockRoot) };
}

/**
 * OR-Track Q: runs the real BDS smoke test unless --no-test-server was
 * passed. A missing BDS instance (even after a real auto-install attempt)
 * is a one-line skip note (never blocks a machine with none installed); a
 * REAL failure (the pack failed to load, or a script threw during load)
 * throws, failing the whole command - this is the actual "catch it before
 * the user ever sees it" gate.
 */
async function maybeRunSmokeTest(r, flags, quiet = false) {
    if (flags.includes("--no-test-server")) return;
    let result;
    try {
        result = await runSmokeTest(r);
    } catch (e) {
        if (/no real BDS instance found/.test(e.message)) {
            if (!quiet) console.log(`[${stamp()}] (skipping BDS smoke test - ${e.message})`);
            return;
        }
        throw e;
    }
    if (!result.ok) {
        const detail = result.errors.length ? result.errors.join("\n") : "pack never reached \"Pack Stack\" - it didn't load at all.";
        throw new Error(`BDS smoke test FAILED for "${r.manifest.name}" (real server boot at ${result.bdsDir}):\n${detail}`);
    }
    if (!quiet) {
        // OR-Track Q3: report the real per-entity/per-block/per-item
        // spawn/place/test results, not just "it loaded" - this is the
        // actual "all entities and blocks (and items) in the mod's
        // definitions will be summoned/tested" guarantee.
        const smoke = result.smokeResults ?? [];
        const entityCount = smoke.filter(s => s.kind === "entity").length;
        const blockCount = smoke.filter(s => s.kind === "block").length;
        const itemCount = smoke.filter(s => s.kind === "item").length;
        const smokeNote = result.smokeDone
            ? ` ${entityCount} entit${entityCount === 1 ? "y" : "ies"}, ${blockCount} block${blockCount === 1 ? "" : "s"}, and ${itemCount} item${itemCount === 1 ? "" : "s"} genuinely spawned/placed/tested and confirmed clean. Server left debug-attach-ready (see "openrock debug --launch-vscode --mode=connect").`
            : "";
        console.log(`[${stamp()}] BDS smoke test passed - real server booted cleanly with "${r.manifest.name}" loaded (${result.bdsDir}).${smokeNote}`);
    }
}

/**
 * Async pre-build steps that must finish before the synchronous build reads
 * the filesystem. Today: opt-in machine translation (localization.json
 * "autoTranslate"). Silently does nothing for a directory that isn't a package.
 */
async function runPrebuild(modDir, openrockRoot) {
    let root;
    try { root = loadManifestFile(modDir); } catch { return; }
    const entries = collectEntries(root.manifest, root.dir, buildOpts(modDir, openrockRoot));
    for (const { manifest, dir } of entries.values()) {
        const rel = manifest.content?.localization;
        if (!rel) continue;
        const r = await runLocalizationPrebuild({ locDir: path.resolve(dir, rel), scanDir: dir, log: m => console.log(`[${stamp()}] ${m}`) });
        if (r.failed?.length) throw new Error(`localization MTL failed for ${r.failed.length} string(s): ${r.failed.map(f => `${f.lang}:${f.key}`).join(", ")}`);
    }
}

module.exports = { stamp, comMojang, buildOpts, maybeRunSmokeTest, runPrebuild };
