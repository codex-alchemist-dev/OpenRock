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
//                              newest content log (--all: every pack; --follow: keep tailing)
//
// <modDir> is the folder containing openrock.mod.json (defaults to the
// current directory). A mod's "library"-type dependencies are resolved
// against OpenRock's own bundled libs/* by name automatically
// (resolveBundledLibraryDirs); its "submodule"-type dependencies resolve
// against <modDir>/vendor/ by convention.
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { buildMod, resolveBundledLibraryDirs, writeTree } = require("../src/buildPipeline.js");
const { zip } = require("../src/zip.js");
const { loadManifestFile } = require("../src/manifest.js");

const OPENROCK_ROOT = path.join(__dirname, "..");
const COMMANDS = ["build", "check", "export", "deploy", "dev", "log"];

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

function cmdDev(modDir) {
    let manifest;
    try { manifest = cmdDeploy(modDir).r.manifest; }
    catch (e) { console.error(`[${stamp()}] ${e.message}`); manifest = loadManifestFile(modDir).manifest; }

    const watched = [modDir]; // includes vendor/ - a vendored dependency's own change should redeploy too
    let timer = null, running = false, again = false;
    const run = () => {
        if (running) { again = true; return; }
        running = true;
        try { cmdDeploy(modDir, true); }
        catch (e) { console.error(`[${stamp()}] Not deployed - ${e.message}`); }
        running = false;
        if (again) { again = false; schedule(); }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 400); };

    for (const dir of watched) {
        fs.watch(dir, { recursive: true }, (evt, file) => {
            if (file && /(^|[\\/])(\.git|node_modules|build|dist)([\\/]|$)/.test(file)) return;
            schedule();
        });
    }
    // Safety net: some editors/sync tools don't fire watch events reliably;
    // a periodic no-op-if-unchanged deploy catches anything missed.
    setInterval(schedule, 30000);
    console.log(`[${stamp()}] Watching:\n  ${watched.join("\n  ")}\nChanges redeploy automatically. After a script change use /reload in-game; new entities/items/textures need a world rejoin. Ctrl+C to stop.`);
}

function logDir() {
    const appdata = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    const dirs = [path.join(appdata, "Minecraft Bedrock", "logs"), path.join(process.env.LOCALAPPDATA || "", "Packages", "Microsoft.MinecraftUWP_8wekyb3d8bbwe", "LocalState", "logs")];
    return dirs.find(d => fs.existsSync(d)) ?? null;
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
    const clean = l => l.replace(/%APPDATA%\/Minecraft Bedrock\/Users\/Shared\/games\/com\.mojang\/development_(behavior|resource)_packs\//g, "");
    const show = text => {
        const counts = new Map();
        for (const raw of text.split(/\r?\n/)) {
            if (!/\[(error|warning)\]/i.test(raw)) continue;
            if (needles && !needles.some(n => raw.includes(n))) continue;
            const key = clean(raw.replace(/^\d\d:\d\d:\d\d/, "")).trim();
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        for (const [line, n] of counts) console.log(`${n > 1 ? `${String(n).padStart(3)}x ` : "     "}${line}`);
        return counts.size;
    };
    const full = path.join(dir, file);
    console.log(`${file}${needles ? ` (filtered to ${manifest.name}; --all for everything)` : ""}:`);
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
