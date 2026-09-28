// Shared, small, single-purpose helpers used by more than one CLI command
// module (src/commands/*.js) - kept modular per the standing project rule:
// every file/function does ONE real thing, never a monolithic "CLI utils"
// grab-bag with unrelated concerns bolted on over time.
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { resolveBundledLibraryDirs } = require("../buildPipeline.js");
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
    return { vendorDir: path.join(modDir, "vendor"), libraryDirs: resolveBundledLibraryDirs(openrockRoot) };
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
    if (!quiet) console.log(`[${stamp()}] BDS smoke test passed - real server booted cleanly with "${r.manifest.name}" loaded (${result.bdsDir}).`);
}

module.exports = { stamp, comMojang, buildOpts, maybeRunSmokeTest };
