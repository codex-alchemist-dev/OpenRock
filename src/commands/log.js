// `openrock log` - show this mod's errors/warnings from Minecraft's newest
// content log (--all: every pack; --follow: keep tailing; --filter=<regex>:
// narrow further, OR-Track C1).
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { loadManifestFile } = require("../manifest.js");
const { stamp } = require("./shared.js");

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
        ? [...(manifest.packs.behavior !== false ? [manifest.packs.behavior.folder] : []), manifest.packs.resource.folder, `${manifest.namespace}:`, "[Scripting]", "[UI]"]
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

module.exports = cmdLog;
