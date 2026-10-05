// `openrock dev` - OR-Track F1 (multi-mod watch) + OR-Track Q6 (real
// incremental rebuilds). Accepts either a single mod directory or a MODS
// FOLDER (a directory whose immediate subdirectories are each their own
// mod) - every discovered mod gets its own independent
// watch+debounce+redeploy loop, one mod's rebuild never blocking another's.
"use strict";

const fs = require("fs");
const path = require("path");
const { createIncrementalBuild, discoverMods, isBuildablePackage } = require("../buildPipeline.js");
const { resolveManifestSet } = require("../resolver.js");
const { loadManifestFile } = require("../manifest.js");
const { stamp, buildOpts } = require("./shared.js");
const { deployBuiltResult } = require("./deploy.js");

/**
 * One independent watch+debounce+redeploy loop for a single mod directory -
 * shared by both dev modes below, so a mods/-folder mod behaves exactly
 * like a standalone one, just with its own isolated watcher.
 *
 * OR-Track Q6, made real: ONE createIncrementalBuild() instance lives for
 * this watcher's entire lifetime. A real fs.watch event names the file
 * that changed - that path is queued and handed to `inc.rebuild(absPath)`
 * on the next debounced run, which re-renders ONLY the one real compile
 * unit that file belongs to (see buildPipeline.js's classifyChange()),
 * never a full buildMod() pass, unless the change can't be safely
 * attributed to one unit (inc.rebuild() itself falls back to a real full
 * rebuild in that case - this loop never has to guess). The 30s safety-net
 * tick (some editors/sync tools miss real fs.watch events entirely) is the
 * one deliberate exception: since we don't know what, if anything, was
 * missed, it forces one real FULL rebuild via inc.build() to self-heal -
 * correctness over speed for that one periodic case.
 */
function watchAndDeploy(modDir, openrockRoot, { onError = e => console.error(`[${stamp()}] Not deployed - ${e.message}`) } = {}) {
    const inc = createIncrementalBuild(modDir, buildOpts(modDir, openrockRoot));
    let pendingFiles = [];
    let forceFull = false;
    let timer = null, running = false, again = false;

    const run = () => {
        if (running) { again = true; return; }
        running = true;
        const files = pendingFiles;
        pendingFiles = [];
        const doFull = forceFull || files.length === 0;
        forceFull = false;
        try {
            let r;
            if (doFull) {
                r = inc.build();
            } else {
                for (const f of files) r = inc.rebuild(f);
            }
            const { written, removed } = deployBuiltResult(r);
            if (written + removed) console.log(`[${stamp()}] Deployed ${r.manifest.name}${inc.isFullBuild() ? "" : " (incremental)"}: real update.`);
        } catch (e) { onError(e); }
        running = false;
        if (again) { again = false; schedule(); }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 400); };
    fs.watch(modDir, { recursive: true }, (evt, file) => {
        if (!file) { forceFull = true; schedule(); return; } // some platforms don't report a filename at all - can't classify it, so play it safe with a real full rebuild
        if (/(^|[\\/])(\.git|node_modules|build|dist|\.(entity|manifest|block|item|cinema)-dsl-dist)([\\/]|$)/.test(file)) return;
        pendingFiles.push(path.join(modDir, file));
        schedule();
    });
    setInterval(() => { forceFull = true; schedule(); }, 30000); // safety net - see comment above
    return {
        schedule,
        // The REAL initial deploy, using this SAME incremental builder
        // instance's first .build() call - so `dev` never pays for a full
        // build twice at startup (once here, once again on the first save).
        deployInitial() {
            const r = inc.build();
            const { written, removed } = deployBuiltResult(r);
            console.log(`[${stamp()}] Deployed ${r.manifest.name}: ${written + removed} file(s) updated.`);
            return r;
        },
    };
}

function cmdDevSingle(modDir, openrockRoot) {
    // A broken FIRST deploy is reported but not fatal - the watcher still
    // starts, so fixing the problem and saving triggers a real redeploy
    // without needing to restart `dev`. loadManifestFile() alone still
    // throws (and correctly aborts `dev` entirely) if even the manifest
    // itself is unreadable - there's nothing to watch without that.
    loadManifestFile(modDir);
    const watcher = watchAndDeploy(modDir, openrockRoot);
    try { watcher.deployInitial(); }
    catch (e) { console.error(`[${stamp()}] ${e.message}`); }
    console.log(`[${stamp()}] Watching:\n  ${modDir}\nChanges redeploy automatically (incrementally, where possible). After a script change use /reload in-game; new entities/items/textures need a world rejoin. Ctrl+C to stop.`);
}

// OR-Track F1: every immediate subdirectory of `modsDir` with its own
// openrock.mod.json gets its own independent watch loop - one mod's
// rebuild never blocks or fails another's. resolveManifestSet() runs once
// across the WHOLE discovered set up front so a cross-mod `breaks`
// conflict is caught before anything deploys, not discovered piecemeal
// later.
function cmdDevMulti(modsDir, openrockRoot) {
    const found = discoverMods(modsDir);
    if (found.length === 0) throw new Error(`No mods found in ${modsDir} (each subdirectory needs its own openrock.mod.json)`);
    resolveManifestSet(found); // throws loudly on a cross-mod "breaks" conflict - deliberately not caught

    for (const { dir } of found) {
        const watcher = watchAndDeploy(dir, openrockRoot, { onError: e => console.error(`[${stamp()}] ${path.basename(dir)}: not deployed - ${e.message}`) });
        try { watcher.deployInitial(); }
        catch (e) { console.error(`[${stamp()}] ${path.basename(dir)}: ${e.message}`); }
    }
    console.log(`[${stamp()}] Watching ${found.length} mod(s) in ${modsDir}:\n  ${found.map(f => f.manifest.name).join("\n  ")}\nEach mod redeploys independently on its own changes (incrementally, where possible). Ctrl+C to stop.`);
}

function cmdDev(dir, openrockRoot) {
    let isSinglePackage = false;
    try { isSinglePackage = isBuildablePackage(loadManifestFile(dir).manifest); } catch { /* not a package dir itself - try treating it as a mods/ folder */ }
    return isSinglePackage ? cmdDevSingle(dir, openrockRoot) : cmdDevMulti(dir, openrockRoot);
}

module.exports = cmdDev;
