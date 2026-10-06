// Replays every FMBE command the library can generate through a REAL Bedrock Dedicated Server and reports which it accepts.
//   node libs/fmbe/tools/bds-verify.mjs [path/to/bedrock_server.exe]      (default: OPENROCK_BDS_DIR or ../../../../bds-test)
//
// What this proves: the command SYNTAX (quoting, argument count, command-length limits, the `_` next-state placeholder).
// What it cannot prove: the server forwards `playanimation` to clients without parsing the Molang ("Animation request sent
// to clients for processing"), so even a nonsense expression is accepted - Molang correctness is covered by the Molang
// interpreter tests, and the visual result only by looking at a client.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createMock } from "../test/mock.mjs";
import { createFmbe } from "../scripts/fmbe/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const C = require("../scripts/fmbe/commands.cjs");
const { normalizeSpec } = require("../scripts/fmbe/spec.cjs");
const { easeNames } = require("../scripts/fmbe/ease.cjs");

// ---- collect the commands ----
const corpus = new Map();   // label -> command
const add = (label, cmd) => corpus.set(label, cmd);
for (const kind of ["block", "block2d", "item"]) {
    for (const system of ["advanced", "basic", "static"]) {
        const spec = normalizeSpec({ item: "minecraft:stone", kind, system, pos: [0.25, 0.5, -0.25], rot: [10, 20, 30], scale: 0.9 });
        const { render, vars } = C.commandsFor(spec);
        [...render, vars].filter(Boolean).forEach((c, i) => add(`${kind}/${system}#${i}`, c));
    }
}
const mock = createMock();
const fmbe = createFmbe({ world: mock.world, system: mock.system });
const d = fmbe.spawn(mock.overworld, { x: 0.5, y: 70, z: 0.5 }, { item: "minecraft:stone" });
mock.tick(1);
const lastVars = () => mock.entities[0].commands.filter(c => c.includes("animation.player.attack.positions")).at(-1);
for (const ease of easeNames()) { d.tween({ pos: [0, 1, 0], scale: 1.5 }, { ticks: 20, ease }); add(`tween/${ease}`, lastVars()); d.set({ pos: [0, 0, 0], scale: 1 }); }
for (const loop of ["repeat", "pingpong"]) { d.tween({ rot: [0, 360, 0] }, { ticks: 40, loop }); add(`tween/loop-${loop}`, lastVars()); d.set({ rot: [0, 0, 0] }); }
const g = fmbe.group({ dimension: mock.overworld, local: { pos: [20, 64, 20], rot: [0, 30, 0], scale: 2 } });
const sub = g.addGroup({ pos: [0, 1, 0], rot: [0, 10, 0], scale: 0.5 });
sub.add({ item: "minecraft:diamond" }, { pos: [1.5, 0.25, -1], rot: [15, 40, 5], scale: 0.8 });
mock.tick(1);
g.tween({ rot: [0, 30 + 360, 0] }, { ticks: 80, ease: "inOutBack", loop: "repeat" });
add("group/sweep-inOutBack", mock.entities.at(-1).commands.filter(c => c.includes("animation.player.attack.positions")).at(-1));
for (const c of C.stopSoundCommands()) add(`world/${c}`, c);

// ---- replay through BDS ----
const exe = process.argv[2] ?? path.join(process.env.OPENROCK_BDS_DIR ?? path.resolve(here, "../../../../bds-test"), "bedrock_server.exe");
const server = spawn(exe, [], { cwd: path.dirname(exe) });
let out = "";
server.stdout.on("data", x => { out += x; });
const send = c => server.stdin.write(c + "\n");
const wait = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (re, ms) => { const t0 = Date.now(); while (!re.test(out) && Date.now() - t0 < ms) await wait(200); return re.test(out); };

if (!await waitFor(/Server started/, 120000)) { console.error("BDS did not start"); server.kill(); process.exit(2); }
await wait(3000);
const run = async (c, ms = 350) => { const n = out.length; send(c); await wait(ms); return out.slice(n).replace(/\r?\n/g, " ").trim(); };
await run("summon fox 4 140 4 0 0 minecraft:as_adult", 600);
await run("effect @e[type=fox,c=1] resistance 1000000 255 true", 400);
await run("replaceitem entity @e[type=fox,c=1] slot.weapon.mainhand 0 minecraft:grass_block", 400);

let bad = 0, longest = 0;
for (const [label, cmd] of corpus) {
    const full = cmd.startsWith("playanimation") ? `execute as @e[type=fox,c=1] run ${cmd}` : cmd;
    longest = Math.max(longest, full.length);
    const reply = await run(full);
    // stopsound with nobody online answers "No targets matched selector": the command itself parsed
    const ok = /Animation request sent/i.test(reply) || (label.startsWith("world/") && /No targets matched|Stopped/i.test(reply));
    if (!ok) { bad++; console.log(`REJECTED ${label} (${full.length} chars): ${reply.slice(0, 200)}`); }
}
console.log(`${corpus.size - bad}/${corpus.size} commands accepted by BDS; longest command ${longest} characters`);
await run("kill @e[type=fox]", 300);
send("stop");
await wait(3000);
server.kill();
process.exit(bad ? 1 : 0);
