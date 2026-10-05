// `openrock cinema <check|preview> [modDir]`
"use strict";

const path = require("path");
const { loadManifestFile } = require("../manifest.js");
const { compileCinemaDsl } = require("../cinemaDsl/cinemaCompiler.js");

async function cmdCinema(sub, modDir, flags = []) {
    const subs = ["check", "preview"];
    if (!subs.includes(sub)) throw new Error(`Usage: openrock cinema <${subs.join("|")}> [modDir]`);

    const { manifest, dir } = loadManifestFile(modDir);
    const rel = manifest.content?.cinemaDsl;
    if (!rel) throw new Error(`"${manifest.name}" doesn't declare content.cinemaDsl`);

    const cinemaDir = path.resolve(dir, rel);
    const { bp } = compileCinemaDsl(cinemaDir);
    const json = flags.includes("--json");

    const cutscenes = [];
    for (const [key, value] of Object.entries(bp ?? {})) {
        if (key.startsWith("cinema/") && key.endsWith(".json")) {
            let timeline = value;
            if (typeof value === "string") timeline = JSON.parse(value);
            else if (Buffer.isBuffer(value)) timeline = JSON.parse(value.toString("utf8"));
            cutscenes.push(timeline);
        }
    }

    if (sub === "check") {
        const report = {
            ok: true,
            cutscenes: cutscenes.map(t => ({
                id: t.id,
                seconds: (t.durationTicks / 20).toFixed(2),
                events: t.events.length,
            })),
        };
        if (json) console.log(JSON.stringify(report));
        else {
            for (const cs of report.cutscenes) {
                console.log(`${cs.id}: ${cs.seconds}s (${cs.events} events)`);
            }
        }
    } else if (sub === "preview") {
        for (const timeline of cutscenes) {
            console.log(`\n# ${timeline.id} (${(timeline.durationTicks / 20).toFixed(2)}s)\n`);
            const fmt = (t, op, args) => {
                const tstr = `${String(Math.floor(t / 20)).padStart(3)}:${String(Math.round((t % 20) * 2.5)).padStart(2, "0")}`;
                const argsStr = Object.entries(args)
                    .filter(([k, v]) => v !== undefined && v !== null && v !== "")
                    .map(([k, v]) => {
                        if (Array.isArray(v)) return `${k}=(${v.join(",")})`;
                        if (typeof v === "object") return `${k}={...}`;
                        if (typeof v === "string" && v.length > 20) return `${k}="${v.slice(0, 17)}..."`;
                        return `${k}=${v}`;
                    })
                    .join(" ");
                return `${tstr}  ${op.padEnd(20)}  ${argsStr}`;
            };
            for (const ev of timeline.events) console.log(fmt(ev.t, ev.op, ev.args));
            if (timeline.onSkip?.length) {
                console.log("\non skip:");
                for (const ev of timeline.onSkip) console.log(fmt(0, ev.op, ev.args));
            }
        }
    }
}

module.exports = { cmdCinema };
