#!/usr/bin/env node
// Tests for Crystal Cinema's language core (lexer/parser/timeline) and its
// end-to-end build integration. Run: node test/cinemaDsl.test.js
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { lex } = require("../src/cinemaDsl/lexer.js");
const { parse } = require("../src/cinemaDsl/parser.js");
const { compileProgram } = require("../src/cinemaDsl/timeline.js");
const { lintTimeline } = require("../src/cinemaDsl/lint.js");
const { buildMod } = require("../src/buildPipeline.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}
const compile = src => compileProgram(parse(src, "t.cinema"), { source: src, filename: "t.cinema" });
const one = src => compile(src)[0];
const wrap = body => `cutscene "c" {\n${body}\n}\n`;
const throwsMsg = (fn, re) => assert.throws(fn, e => { assert.match(e.message, re); return true; });

test("lexer: durations normalise to ticks, comments and blanks vanish, positions are 1-based", () => {
    const t = lex('wait 1.5s # hi\n\n// nope\nwait 250ms\nwait 7t\n');
    const durs = t.filter(x => x.type === "DUR").map(x => x.value);
    assert.deepStrictEqual(durs, [30, 5, 7]);
    assert.deepStrictEqual([t[0].line, t[0].col], [1, 1]);
});

test("wait advances the cursor; commands land at the right ticks and sort by time", () => {
    const c = one(wrap(`lock cinematic\ncamera cut to (1, 2, 3)\nwait 2s\ncamera move to (4, 5, 6) over 3s ease inOutSine\nwait 3s\nunlock`));
    assert.deepStrictEqual(c.events.map(e => [e.t, e.op]), [[0, "lock"], [0, "camera.cut"], [40, "camera.move"], [100, "unlock"]]);
    assert.deepStrictEqual(c.events[2].args, { pos: [], to: [4, 5, 6], over: 60, ease: "inOutSine" });
    assert.strictEqual(c.durationTicks, 100);
});

test("timed commands don't block the cursor, but count toward total duration", () => {
    const c = one(wrap(`lock cinematic\ncamera move to (0,0,0) over 10s\nunlock`));
    assert.strictEqual(c.events[2].t, 0);
    assert.strictEqual(c.durationTicks, 200);
});

test("`at` sets the cursor absolutely, `at +` relatively, and going backwards is an error", () => {
    const c = one(wrap(`lock cinematic\nat 1s sound "a"\nat +1s sound "b"\nat 5s unlock`));
    assert.deepStrictEqual(c.events.filter(e => e.op === "sound").map(e => e.t), [20, 40]);
    throwsMsg(() => compile(wrap(`wait 5s\nat 1s sound "x"`)), /time goes backwards/);
});

test("parallel starts children together and resumes at the latest end", () => {
    const c = one(wrap(`lock cinematic
parallel {
  camera move to (0,0,0) over 4s
  sequence {
    wait 1s
    sound "x"
  }
  camera shake strength 2 for 6s
}
sound "after"
unlock`));
    const after = c.events.find(e => e.args.pos[0] === "after");
    assert.strictEqual(after.t, 120, "cursor resumes after the 6s shake");
    assert.strictEqual(c.events.find(e => e.args.pos[0] === "x").t, 20);
});

test("actor commands resolve against declared casts (even declared later) and carry the actor", () => {
    const c = one(wrap(`lock cinematic\nmira.play "wave"\ncast mira = entity "openchara:mira" at (1, 64, 2)\nunlock`));
    const ev = c.events.find(e => e.op === "actor.play");
    assert.strictEqual(ev.actor, "mira");
    assert.deepStrictEqual(c.cast, [{ name: "mira", kind: "entity", entityType: "openchara:mira", at: [1, 64, 2] }]);
});

test("references to undeclared casts are errors with a code frame", () => {
    throwsMsg(() => compile(wrap(`lock cinematic\ncamera cut to (0,0,0) lookAt ghost\nunlock`)), /"ghost" is not a declared cast[\s\S]*\^/);
    throwsMsg(() => compile(wrap(`lock cinematic\nghost.play "x"\nunlock`)), /"ghost" is not a declared cast/);
});

test("unknown verbs/options, enum violations, missing required values are precise errors", () => {
    throwsMsg(() => parse(wrap(`explode now`)), /unknown command "explode"/);
    throwsMsg(() => parse(wrap(`camera cut to (0,0,0) wobble 3`)), /"wobble" is not a valid option for "camera cut"/);
    throwsMsg(() => parse(wrap(`lock sideways`)), /"sideways" is not valid for lock - use one of: cinematic, position, free/);
    throwsMsg(() => parse(wrap(`camera move to (0,0,0)`)), /requires "over"/);
    throwsMsg(() => parse(wrap(`wait 3`)), /duration like 2s/);
    throwsMsg(() => parse(wrap(`camera move to (0,0,0) over 2s ease bouncy`)), /not valid for camera move ease/);
});

test("a cutscene must end unlocked, ids must be valid and unique, one `on skip` only", () => {
    throwsMsg(() => compile(wrap(`lock cinematic`)), /ends with the player still locked/);
    throwsMsg(() => compile(`cutscene "a" {\n}\ncutscene "a" {\n}\n`), /duplicate cutscene id/);
    throwsMsg(() => compile(`cutscene "a/b" {\n}\n`), /invalid/);
    throwsMsg(() => compile(wrap(`on skip {\n}\non skip {\n}`)), /only one `on skip`/);
});

test("on skip compiles to its own immediate list and cast/mode land in the header", () => {
    const c = one(wrap(`cast hero = player\nmode letterbox\nlock position\non skip {\n  unlock\n  fade in 0.5s\n}\nwait 10s\nunlock`));
    assert.deepStrictEqual(c.onSkip.map(e => [e.t, e.op]), [[0, "unlock"], [0, "fade"]]);
    assert.strictEqual(c.mode, "letterbox");
    assert.deepStrictEqual(c.cast, [{ name: "hero", kind: "player", index: 0 }]);
});

test("the full example from the plan parses and compiles", () => {
    const src = `cutscene "first_meeting" {
  cast hero = player
  cast mira = entity "openchara:mira" at (120, 64, -30)
  mode letterbox
  lock cinematic
  camera cut to (118, 66, -25) lookAt mira
  wait 1.5s
  camera move to (118, 65, -29) over 3s ease inOutSine lookAt mira
  mira.play "wave"
  wait 2s
  camera panUp over 0.6s ease in
  screen show "space_bg" fill fade 0.3s
  display show robot block "minecraft:iron_block" at (140, 66, -10) scale 2 for 3s
  wait 3s
  screen hide
  camera cut to (140, 70, -10)
  particles "robot_slash" at (140, 64, -10) radius 12 for 2s
  call "aoe_wave"
  fade out 0.5s
  unlock
}`;
    const c = one(src);
    assert.strictEqual(c.id, "first_meeting");
    assert.ok(c.events.length >= 13);
    assert.ok(c.durationTicks > 0);
});

test("end-to-end: a mod with content.cinemaDsl bundles cutscenes into scripts/main.js via the virtual module, ships no loose virtual file", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "or-cinema-"));
    try {
        fs.mkdirSync(path.join(tmp, "cine"));
        fs.mkdirSync(path.join(tmp, "scripts"));
        fs.writeFileSync(path.join(tmp, "cine", "intro.cinema"), wrap(`lock cinematic\nwait 1s\nunlock`).replace('"c"', '"intro"'));
        fs.writeFileSync(path.join(tmp, "scripts", "main.js"), 'import { CUTSCENES } from "@openrock/virtual/openrock-cinema-data";\nexport const COUNT = Object.keys(CUTSCENES).length;\nexport const FIRST = CUTSCENES.intro.durationTicks;\n');
        fs.writeFileSync(path.join(tmp, "openrock.mod.json"), JSON.stringify({
            openrockVersion: 1, kind: "mod", name: "cine-mod", version: "1.0.0", namespace: "cm",
            packs: {
                behavior: { folder: "B", uuid: "11111111-1111-1111-1111-111111111111", dataModuleUuid: "22222222-2222-2222-2222-222222222222", scriptModuleUuid: "33333333-3333-3333-3333-333333333333" },
                resource: { folder: "R", uuid: "44444444-4444-4444-4444-444444444444", moduleUuid: "55555555-5555-5555-5555-555555555555" },
            },
            content: { scriptsDir: "scripts", cinemaDsl: "cine" },
        }));
        const { bp } = buildMod(tmp);
        const main = bp.get("scripts/main.js").toString("utf8");
        assert.match(main, /durationTicks/, "generated cutscene data is inside the bundle");
        assert.match(main, /"intro"/);
        assert.ok(bp.has("cinema/intro.json"), "plain JSON timeline ships for tooling");
        assert.deepStrictEqual([...bp.keys()].filter(k => k.startsWith(".openrock-virtual")), [], "virtual module must not ship as a loose file");
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("new verbs: camera dolly, weather, time, clearEffects, giveEffect, teleportPlayer, heal, setFlag parse and compile", () => {
    const c = one(wrap(`lock cinematic
camera dolly by (1, 2, 3) over 5s
weather rain
time 18000
clearEffects
giveEffect "wither" for 10s level 2
teleportPlayer (0, 64, 0)
heal
setFlag "boss_defeated"
unlock`));
    const opNames = c.events.map(e => e.op.split(".")[0] || e.op);
    assert.ok(opNames.includes("camera"), "camera commands grouped");
    assert.ok(opNames.includes("weather"));
    assert.ok(opNames.includes("time"));
    assert.ok(opNames.includes("clearEffects"));
    assert.ok(opNames.includes("giveEffect"));
    assert.ok(opNames.includes("teleportPlayer"));
    assert.ok(opNames.includes("heal"));
    assert.ok(opNames.includes("setFlag"));
    assert.ok(c.events.find(e => e.op === "camera.dolly")?.args.by);
});

test("display verbs: a display is introduced by show/scene and every other display verb must name a shown one", () => {
    const c = one(wrap(`lock cinematic
display show gem item "minecraft:diamond" at (1, 65, 1) rot (0, 45, 0) scale 0.5 system basic
display move gem to (4, 66, 1) over 2s ease inOutSine
display spin gem by 720 over 4s
display rotate gem to (0, 90, 0) over 1s loop pingpong
display scale gem to 2 over 1s
display item gem "minecraft:emerald"
display scene altar "altar" at (10, 64, 10) yaw 90 for 6s
display play altar "spin"
display stop altar "spin"
display hide gem
unlock`));
    assert.deepStrictEqual(c.events.filter(e => e.op.startsWith("display.")).map(e => e.op), ["display.show", "display.move", "display.spin", "display.rotate", "display.scale", "display.item", "display.scene", "display.play", "display.stop", "display.hide"]);
    const show = c.events.find(e => e.op === "display.show");
    assert.deepStrictEqual(show.args.pos, ["gem", "item", "minecraft:diamond"]);
    assert.deepStrictEqual([show.args.at, show.args.rot, show.args.scale, show.args.system], [[1, 65, 1], [0, 45, 0], 0.5, "basic"]);
    assert.strictEqual(c.durationTicks, 120, "a scene shown `for 6s` counts toward the cutscene length");
    throwsMsg(() => compile(wrap(`lock cinematic
display move ghost to (0,0,0) over 1s
unlock`)), /display "ghost" is not shown yet/);
    throwsMsg(() => compile(wrap(`lock cinematic
display show a block "x:y" at (0,0,0)
display show a block "x:y" at (1,0,0)
unlock`)), /already shown/);
    throwsMsg(() => compile(wrap(`lock cinematic
display show a wall "x:y" at (0,0,0)
unlock`)), /not valid.*block, block2d, item/s);
    assert.ok(compile(wrap(`lock cinematic
display show a block "x:y" at (0,0,0)
display hide a
display show a block "x:y" at (0,0,0)
unlock`)), "reusing a name after hide is fine");
});

test("removed verbs stay removed: roll has no Bedrock camera API, spawn_display became `display show`", () => {
    throwsMsg(() => compile(wrap(`lock cinematic
camera roll 45 over 2s
unlock`)), /unknown command/);
    throwsMsg(() => compile(wrap(`lock cinematic
spawn_display "x" at screen(0.5, 0.4)
unlock`)), /unknown command/);
});

test("relative coordinates: ~, ~n and ~-n parse to {rel} components, mixed with absolute numbers", () => {
    const c = one(wrap(`lock cinematic
camera cut to (~, ~2, ~-3)
particles "p" at (10, ~1, 12)
unlock`));
    assert.deepStrictEqual(c.events[1].args.to, [{ rel: 0 }, { rel: 2 }, { rel: -3 }]);
    assert.deepStrictEqual(c.events[2].args.at, [10, { rel: 1 }, 12]);
});

test("docs/cinema.md mentions every registered verb", () => {
    const { allVerbs } = require("../src/cinemaDsl/verbs.js");
    const doc = fs.readFileSync(path.join(__dirname, "..", "docs", "cinema.md"), "utf8");
    for (const v of allVerbs()) {
        const needle = v.name.startsWith("actor ") ? `.${v.name.slice(6)}` : v.name;
        assert.ok(doc.includes(needle) || (v.name.startsWith("display ") && doc.includes(v.name.slice(8))) || (v.name.startsWith("camera ") || v.name.startsWith("screen ")) && doc.includes(v.name.split(" ")[1]), `verb "${v.name}" is not documented`);
    }
});

test("lint: warns on long cutscene, lock free, consecutive camera cuts, unpaired screen show, high particle count", () => {
    const long = one(wrap(`wait 301s\nunlock`));
    const warnLong = lintTimeline(long);
    assert.ok(warnLong.some(w => w.includes("longer than 5 minutes")));

    const freeCam = one(wrap(`lock free\nunlock`));
    const warnFree = lintTimeline(freeCam);
    assert.ok(warnFree.some(w => w.includes("free-cam")));

    const doubleCut = one(wrap(`camera cut to (0,0,0)\ncamera cut to (1,1,1)\nunlock`));
    const warnCut = lintTimeline(doubleCut);
    assert.ok(warnCut.some(w => w.includes("immediately follows")));

    const unpairedShow = one(wrap(`screen show "bg"\nunlock`));
    const warnShow = lintTimeline(unpairedShow);
    assert.ok(warnShow.some(w => w.includes("never hidden")));

    const manyParticles = one(wrap(`particles "boom" at (0,0,0) count 600\nunlock`));
    const warnParticles = lintTimeline(manyParticles);
    assert.ok(warnParticles.some(w => w.includes("may cause lag")));
});

console.log(`\n${passed} passed`);
