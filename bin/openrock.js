#!/usr/bin/env node
// OpenRock command-line tool (OR-Track F0 - the real CLI, replacing the
// OR-Phase 1 scaffold). Tested against dummy fixture mods/libraries
// (test/fixtures/, test/buildPipeline.test.js) - never against real
// Claude Waifus, so this carries zero cutover risk; OpenChara/Claude
// Waifus keep building via `node tools/openchara.js <cmd>` exactly as
// today until OR-Track J's real, deliberate cutover.
//
//   openrock build  <modDir>   build into <modDir>/build/
//   openrock check  <modDir>   build + validate only (nothing written)
//   openrock export <modDir>   build + write <modDir>/dist/<name> <version>.mcaddon
//   openrock deploy <modDir>   build + sync into Minecraft's development pack folders
//   openrock dev    <modDir>   deploy, then watch the mod and its vendored
//                              dependencies for changes and redeploy automatically
//   openrock log    <modDir>   show this mod's errors/warnings from Minecraft's
//                              newest content log (--all: every pack; --follow: keep
//                              tailing; --filter=<regex>: narrow further, OR-Track C1)
//   openrock debug  <modDir>   OR-Track C2 Stage 1: --launch-vscode writes a real
//                              VS Code launch.json for Mojang's official
//                              minecraft-js debugger extension (port 19144)
//
// <modDir> is the folder containing openrock.mod.json (defaults to the
// current directory). A mod's "library"-type dependencies are resolved
// against OpenRock's own bundled libs/* by name automatically
// (resolveBundledLibraryDirs); its "submodule"-type dependencies resolve
// against <modDir>/vendor/ by convention.
//
// `dev` also accepts a MODS FOLDER (a directory whose immediate
// subdirectories are each their own mod, rather than a mod itself) -
// OR-Track F1's multi-mod dev mode: every discovered mod gets its own
// independent watch+debounce+redeploy loop (one mod's rebuild never blocks
// another's), and resolveManifestSet() runs across the WHOLE discovered
// set once at startup so a `breaks` conflict between two mods in the
// folder is caught before either deploys.
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { buildMod, resolveBundledLibraryDirs, discoverMods, writeTree } = require("../src/buildPipeline.js");
const { resolveManifestSet } = require("../src/resolver.js");
const { zip } = require("../src/zip.js");
const { loadManifestFile } = require("../src/manifest.js");

const OPENROCK_ROOT = path.join(__dirname, "..");
const COMMANDS = ["build", "check", "export", "deploy", "dev", "log", "debug"];

function stamp() { return new Date().toTimeString().slice(0, 8); }

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

function buildOpts(modDir) {
    return { vendorDir: path.join(modDir, "vendor"), libraryDirs: resolveBundledLibraryDirs(OPENROCK_ROOT) };
}

function cmdBuild(modDir) {
    const t0 = Date.now();
    const r = buildMod(modDir, buildOpts(modDir));
    const out = path.join(modDir, "build");
    const a = writeTree(r.bp, path.join(out, r.manifest.packs.behavior.folder));
    const b = writeTree(r.rp, path.join(out, r.manifest.packs.resource.folder));
    console.log(`[${stamp()}] Built ${r.manifest.name} in ${Date.now() - t0}ms -> ${out} (${a.written + b.written} written, ${a.removed + b.removed} removed)`);
    return r;
}

function cmdCheck(modDir) {
    const t0 = Date.now();
    const r = buildMod(modDir, buildOpts(modDir));
    console.log(`OK - ${r.manifest.name}: ${r.bp.size} BP + ${r.rp.size} RP files, all checks passed (${Date.now() - t0}ms).`);
    return r;
}

function cmdDeploy(modDir, quiet = false) {
    const r = buildMod(modDir, buildOpts(modDir));
    const root = comMojang();
    const a = writeTree(r.bp, path.join(root, "development_behavior_packs", r.manifest.packs.behavior.folder));
    const b = writeTree(r.rp, path.join(root, "development_resource_packs", r.manifest.packs.resource.folder));
    const changed = a.written + b.written + a.removed + b.removed;
    if (!quiet || changed) console.log(`[${stamp()}] Deployed ${r.manifest.name}: ${a.written + b.written} file(s) updated, ${a.removed + b.removed} removed.`);
    return { r, changed };
}

function cmdExport(modDir) {
    const r = buildMod(modDir, buildOpts(modDir));
    const entries = [];
    for (const [folder, map] of [[r.manifest.packs.behavior.folder, r.bp], [r.manifest.packs.resource.folder, r.rp]]) {
        for (const [rel, data] of map) entries.push({ name: `${folder}/${rel}`, data });
    }
    const dist = path.join(modDir, "dist");
    fs.mkdirSync(dist, { recursive: true });
    const file = path.join(dist, `${r.manifest.name} ${r.manifest.version}.mcaddon`);
    fs.writeFileSync(file, zip(entries));
    console.log(`[${stamp()}] Exported ${file} (${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB)`);
}

// One independent watch+debounce+redeploy loop for a single mod directory
// - shared by both dev modes below, so a mods/-folder mod behaves exactly
// like a standalone one, just with its own isolated watcher.
function watchAndDeploy(modDir, { onError = e => console.error(`[${stamp()}] Not deployed - ${e.message}`) } = {}) {
    let timer = null, running = false, again = false;
    const run = () => {
        if (running) { again = true; return; }
        running = true;
        try { cmdDeploy(modDir, true); }
        catch (e) { onError(e); }
        running = false;
        if (again) { again = false; schedule(); }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 400); };
    fs.watch(modDir, { recursive: true }, (evt, file) => {
        if (file && /(^|[\\/])(\.git|node_modules|build|dist)([\\/]|$)/.test(file)) return;
        schedule();
    });
    setInterval(schedule, 30000); // safety net - some editors/sync tools miss real fs.watch events
    return schedule;
}

function cmdDevSingle(modDir) {
    // A broken FIRST deploy is reported but not fatal - the watcher still
    // starts, so fixing the problem and saving triggers a real redeploy
    // without needing to restart `dev`. loadManifestFile() alone still
    // throws (and correctly aborts `dev` entirely) if even the manifest
    // itself is unreadable - there's nothing to watch without that.
    loadManifestFile(modDir);
    try { cmdDeploy(modDir); }
    catch (e) { console.error(`[${stamp()}] ${e.message}`); }
    watchAndDeploy(modDir);
    console.log(`[${stamp()}] Watching:\n  ${modDir}\nChanges redeploy automatically. After a script change use /reload in-game; new entities/items/textures need a world rejoin. Ctrl+C to stop.`);
}

// OR-Track F1: every immediate subdirectory of `modsDir` with its own
// openrock.mod.json gets its own independent watch loop - one mod's
// rebuild never blocks or fails another's. resolveManifestSet() runs once
// across the WHOLE discovered set up front so a cross-mod `breaks`
// conflict is caught before anything deploys, not discovered piecemeal
// later.
function cmdDevMulti(modsDir) {
    const found = discoverMods(modsDir);
    if (found.length === 0) throw new Error(`No mods found in ${modsDir} (each subdirectory needs its own openrock.mod.json)`);
    resolveManifestSet(found); // throws loudly on a cross-mod "breaks" conflict - deliberately not caught

    for (const { dir } of found) {
        try { cmdDeploy(dir); }
        catch (e) { console.error(`[${stamp()}] ${path.basename(dir)}: ${e.message}`); }
        watchAndDeploy(dir, { onError: e => console.error(`[${stamp()}] ${path.basename(dir)}: not deployed - ${e.message}`) });
    }
    console.log(`[${stamp()}] Watching ${found.length} mod(s) in ${modsDir}:\n  ${found.map(f => f.manifest.name).join("\n  ")}\nEach mod redeploys independently on its own changes. Ctrl+C to stop.`);
}

function cmdDev(dir) {
    let isSingleMod = false;
    try { isSingleMod = loadManifestFile(dir).manifest.kind === "mod"; } catch { /* not a mod dir itself - try treating it as a mods/ folder */ }
    return isSingleMod ? cmdDevSingle(dir) : cmdDevMulti(dir);
}

function logDir() {
    if (process.env.OPENROCK_LOG_DIR) return process.env.OPENROCK_LOG_DIR;
    const appdata = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    const dirs = [path.join(appdata, "Minecraft Bedrock", "logs"), path.join(process.env.LOCALAPPDATA || "", "Packages", "Microsoft.MinecraftUWP_8wekyb3d8bbwe", "LocalState", "logs")];
    return dirs.find(d => fs.existsSync(d)) ?? null;
}

// OR-Track C1: --filter=<regex> narrows the same tailer to a caller-chosen
// pattern, on top of (or, with --all, instead of) the usual project-scoped
// needle match - no new protocol work, purely a filter refinement over the
// existing content-log mechanism.
function parseLogFilter(flags) {
    const raw = flags.find(f => f.startsWith("--filter="));
    if (!raw) return null;
    try { return new RegExp(raw.slice("--filter=".length)); }
    catch (e) { throw new Error(`--filter: invalid regular expression: ${e.message}`); }
}

function cmdLog(modDir, flags) {
    const dir = logDir();
    if (!dir) throw new Error("Can't find Minecraft's logs folder.");
    const newest = () => fs.readdirSync(dir).filter(f => /^ContentLog.*\.txt$/.test(f))
        .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0]?.f;
    const file = newest();
    if (!file) { console.log("No content log yet - enable Settings > Creator > Content Log File, then play."); return; }
    let manifest = null;
    try { manifest = loadManifestFile(modDir).manifest; } catch { /* show everything */ }
    const needles = manifest && !flags.includes("--all")
        ? [manifest.packs.behavior.folder, manifest.packs.resource.folder, `${manifest.namespace}:`, "[Scripting]", "[UI]"]
        : null;
    const customFilter = parseLogFilter(flags);
    const clean = l => l.replace(/%APPDATA%\/Minecraft Bedrock\/Users\/Shared\/games\/com\.mojang\/development_(behavior|resource)_packs\//g, "");
    const show = text => {
        const counts = new Map();
        for (const raw of text.split(/\r?\n/)) {
            if (!/\[(error|warning)\]/i.test(raw)) continue;
            if (needles && !needles.some(n => raw.includes(n))) continue;
            if (customFilter && !customFilter.test(raw)) continue;
            const key = clean(raw.replace(/^\d\d:\d\d:\d\d/, "")).trim();
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        for (const [line, n] of counts) console.log(`${n > 1 ? `${String(n).padStart(3)}x ` : "     "}${line}`);
        return counts.size;
    };
    const full = path.join(dir, file);
    console.log(`${file}${needles ? ` (filtered to ${manifest.name}; --all for everything)` : ""}${customFilter ? ` (--filter=${customFilter.source})` : ""}:`);
    const n = show(fs.readFileSync(full, "utf8"));
    if (!n) console.log("     no errors or warnings");
    if (!flags.includes("--follow")) return;
    let size = fs.statSync(full).size;
    console.log(`[${stamp()}] following ${file} - Ctrl+C to stop`);
    setInterval(() => {
        const now = fs.statSync(full).size;
        if (now <= size) return;
        const fd = fs.openSync(full, "r");
        const buf = Buffer.alloc(now - size);
        fs.readSync(fd, buf, 0, buf.length, size);
        fs.closeSync(fd);
        size = now;
        show(buf.toString("utf8"));
    }, 1000);
}

// OR-Track C2 Stage 1: orchestrate Mojang's OWN official "minecraft-js"
// VS Code debugger extension rather than building a DAP client from
// scratch - pure glue, generating the exact launch.json shape that
// extension expects (a real Debug Adapter Protocol client against
// Minecraft's built-in script debug port, 19144). This is also the exact
// source-map wiring OR-Track D2's future TypeScript authoring pipeline
// will need, so building it now isn't wasted even before real .map files
// exist. `mode` defaults to "listen" - double-check this against Mojang's
// own current minecraft-debugger README before relying on it, since which
// side initiates the connection is the one detail here not independently
// re-verified in this pass.
function cmdDebug(modDir, flags) {
    if (!flags.includes("--launch-vscode")) {
        console.log("Usage: openrock debug --launch-vscode [--mode=connect|listen] <modDir>");
        console.log('Writes .vscode/launch.json for Mojang\'s official "minecraft-js" debugger extension (port 19144).');
        return;
    }
    const { manifest } = loadManifestFile(modDir);
    const modeFlag = flags.find(f => f.startsWith("--mode="));
    const mode = modeFlag ? modeFlag.slice("--mode=".length) : "listen";
    if (mode !== "connect" && mode !== "listen") throw new Error(`--mode must be "connect" or "listen", got "${mode}"`);

    const vscodeDir = path.join(modDir, ".vscode");
    fs.mkdirSync(vscodeDir, { recursive: true });
    const launchJsonPath = path.join(vscodeDir, "launch.json");
    const existing = fs.existsSync(launchJsonPath) ? JSON.parse(fs.readFileSync(launchJsonPath, "utf8")) : { version: "0.2.0", configurations: [] };
    const scriptsSubdir = manifest.content?.scriptsDir ? path.relative(modDir, path.join(modDir, manifest.content.scriptsDir)).split(path.sep).join("/") : "scripts";
    const config = {
        type: "minecraft-js",
        request: "attach",
        mode,
        port: 19144,
        sourceMapRoot: `\${workspaceFolder}/${scriptsSubdir}/`,
        generatedSourceRoot: `\${workspaceFolder}/build/${manifest.packs.behavior.folder}/scripts/`,
    };
    const idx = existing.configurations.findIndex(c => c.type === "minecraft-js" && c.name === `Debug ${manifest.name}`);
    if (idx >= 0) existing.configurations[idx] = { name: `Debug ${manifest.name}`, ...config };
    else existing.configurations.push({ name: `Debug ${manifest.name}`, ...config });
    fs.writeFileSync(launchJsonPath, JSON.stringify(existing, null, 2) + "\n");
    console.log(`[${stamp()}] Wrote ${launchJsonPath}`);
    console.log(`Install Mojang's "Minecraft Bedrock Edition" VS Code extension, enable the world's script debugger, then Run > Start Debugging ("Debug ${manifest.name}").`);
}

function main() {
    const args = process.argv.slice(2);
    const flags = args.filter(a => a.startsWith("--"));
    const [cmd, dirArg] = args.filter(a => !a.startsWith("--"));
    const modDir = path.resolve(dirArg ?? ".");
    try {
        switch (cmd) {
            case "build": cmdBuild(modDir); break;
            case "check": cmdCheck(modDir); break;
            case "export": cmdExport(modDir); break;
            case "deploy": cmdDeploy(modDir); break;
            case "dev": cmdDev(modDir); break;
            case "log": cmdLog(modDir, flags); break;
            case "debug": cmdDebug(modDir, flags); break;
            default:
                console.log(`Usage: openrock <${COMMANDS.join("|")}> [modDir]`);
                process.exitCode = cmd ? 1 : 0;
        }
    } catch (e) {
        console.error(e.message);
        process.exitCode = 1;
    }
}

main();
