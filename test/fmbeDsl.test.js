#!/usr/bin/env node
// Run: node test/fmbeDsl.test.js
"use strict";

const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parse } = require("../src/fmbeDsl/parser.js");
const { compileProgram } = require("../src/fmbeDsl/compile.js");
const { compileFmbeDsl, emitDataModule } = require("../src/fmbeDsl/fmbeCompiler.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}
const compile = (src, filename = "t.fmbe") => compileProgram(parse(src, filename), { source: src, filename });

const ALTAR = `// an altar with a spinning gem ring
scene "altar" persist {
  display base block "minecraft:stone" at (0, 0, 0) scale 0.9
  group ring at (0, 1, 0) {
    display gem item "minecraft:diamond" at (1, 0, 0) rot (0, 45, 0) scale 0.5
    display gem2 item "minecraft:diamond" at (-1, 0, 0) scale 0.5 system basic scaleXZ 1.5
  }
  display flower block2d "minecraft:red_flower" at (0, 8px, 0) base (0, 0, "v.wobble") extend scale 2 yrot 30 var "v.wobble" "math.sin(q.life_time*90)"
  anim spin on ring tween rot (0, 360, 0) over 4s loop repeat auto
  anim bob on base tween pos (0, 0.25, 0) over 20t ease inOutSine loop pingpong
}
`;

test("a full scene compiles: tree, local transforms (px = 1/16 block), specs and animations", () => {
    const { scenes, warnings } = compile(ALTAR);
    assert.deepStrictEqual(warnings, []);
    const s = scenes[0];
    assert.strictEqual(s.id, "altar");
    assert.strictEqual(s.persist, true);
    assert.deepStrictEqual(s.stats, { displays: 4, groups: 1, anims: 2 });
    assert.deepStrictEqual(s.nodes.map(n => `${n.parent ?? "-"}/${n.name}`), ["-/base", "-/ring", "ring/gem", "ring/gem2", "-/flower"]);
    const gem = s.nodes.find(n => n.name === "gem");
    assert.deepStrictEqual(gem.local, { pos: [1, 0, 0], rot: [0, 45, 0], scale: 0.5 });
    assert.deepStrictEqual([gem.spec.item, gem.spec.kind, gem.spec.system], ["minecraft:diamond", "item", "advanced"]);
    assert.strictEqual(s.nodes.find(n => n.name === "gem2").spec.scaleXZ, 1.5);
    const flower = s.nodes.find(n => n.name === "flower");
    assert.strictEqual(flower.local.pos[1], 0.5, "8px is half a block");
    assert.deepStrictEqual(flower.spec.basepos, [0, 0, "v.wobble"]);
    assert.deepStrictEqual(flower.spec.extend, { scale: 2, xrot: -90, yrot: 30 });
    assert.deepStrictEqual(flower.spec.vars, [["v.wobble", "math.sin(q.life_time*90)"]]);
    assert.deepStrictEqual(s.anims[0], { name: "spin", target: "ring", patch: { rot: [0, 360, 0] }, ticks: 80, ease: "linear", loop: "repeat", steps: 1, auto: true });
    assert.deepStrictEqual([s.anims[1].ticks, s.anims[1].ease, s.anims[1].loop, s.anims[1].auto], [20, "inOutSine", "pingpong", false]);
});

test("errors point at the line and column with a code frame", () => {
    const bad = (src, re) => assert.throws(() => compile(src), re);
    bad('scene "a" {\n  display x wall "minecraft:stone"\n}', /2:13.*"wall" is not a display kind/s);
    bad('scene "a" {\n  display x block "minecraft:stone" bogus 1\n}', /"bogus" is not valid for a display/);
    bad('scene "a" {\n  display x block "minecraft:stone"\n  display x block "minecraft:dirt"\n}', /display "x" is already defined/);
    bad('scene "a" {\n  group root {\n  }\n}', /"root" is reserved/);
    bad('scene "a" {\n  display x block "minecraft:stone" system static rot (0, "q.life_time", 0)\n}', /rot|number/);
    bad('scene "a" {\n  display x block "minecraft:stone" scaleXZ 2\n}', /scaleXZ only exists in the basic system/);
    bad('scene "a" {\n  display x block "minecraft:shield"\n}', /cannot be shown with FMBE/);
    bad('scene "a" {\n  display x block "minecraft:stone"\n  anim a on y tween scale 2 over 1s\n}', /targets "y"/);
    bad('scene "a" {\n  display x block "minecraft:stone"\n  anim a on x tween scale 2 over 1s ease wobble\n}', /unknown easing "wobble"/);
    bad('scene "a" {\n  display x block "minecraft:stone"\n  anim a on x tween scale 2\n}', /needs a duration/);
    bad('scene "a" {\n  display x block "minecraft:stone"\n  anim a on x tween over 1s\n}', /at least one channel/);
    bad('scene "a" {\n  display x block "minecraft:stone" system static\n  anim a on x tween scale 2 over 1s\n}', /system static, which cannot animate/);
    bad('scene "a" {\n  group g {\n    display x block "minecraft:stone"\n  }\n  anim a on g tween item "minecraft:dirt" over 1s\n}', /group animation can only tween pos, rot and scale/);
    bad('scene "a" {\n  display x block "minecraft:stone"\n', /missing closing/);
    bad('display x block "minecraft:stone"', /expected "scene"/);
});

test("exceptions-list items warn instead of failing", () => {
    const { warnings } = compile('scene "a" {\n  display x item "minecraft:trident"\n}');
    assert.strictEqual(warnings.length, 1);
    assert.match(warnings[0], /exceptions list/);
});

test("the directory compiler emits the virtual data module and per-scene JSON", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "or-fmbe-"));
    try {
        fs.writeFileSync(path.join(tmp, "altar.fmbe"), ALTAR);
        const { bp } = compileFmbeDsl(tmp);
        assert.deepStrictEqual(Object.keys(bp).sort(), [".openrock-virtual/openrock-fmbe-data.js", "fmbe/altar.json"]);
        assert.match(bp[".openrock-virtual/openrock-fmbe-data.js"], /^\/\/ GENERATED[\s\S]*export const SCENES = \{/);
        assert.strictEqual(bp["fmbe/altar.json"].id, "altar");
        assert.ok(emitDataModule([{ id: "x" }]).includes('"x"'));
        fs.writeFileSync(path.join(tmp, "dupe.fmbe"), 'scene "altar" {\n}\n');
        assert.throws(() => compileFmbeDsl(tmp), /duplicate scene id "altar"/);
        assert.deepStrictEqual(compileFmbeDsl(path.join(tmp, "missing")), { bp: {}, rp: {} });
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("CLI: fmbe check / preview / commands", () => {
    const CLI = path.join(__dirname, "..", "bin", "openrock.js");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "or-fmbe-cli-"));
    try {
        fs.mkdirSync(path.join(tmp, "scenes"));
        fs.writeFileSync(path.join(tmp, "scenes", "altar.fmbe"), ALTAR);
        fs.writeFileSync(path.join(tmp, "openrock.mod.json"), JSON.stringify({
            openrockVersion: 1, kind: "mod", name: "test-fmbe", version: "1.0.0", namespace: "tf",
            packs: {
                behavior: { folder: "B", uuid: "11111111-1111-1111-1111-111111111111", dataModuleUuid: "22222222-2222-2222-2222-222222222222", scriptModuleUuid: "33333333-3333-3333-3333-333333333333" },
                resource: { folder: "R", uuid: "44444444-4444-4444-4444-444444444444", moduleUuid: "55555555-5555-5555-5555-555555555555" },
            },
            content: { fmbeDsl: "scenes" },
        }));
        const run = (...a) => execFileSync("node", [CLI, "fmbe", ...a, tmp], { encoding: "utf8" });
        assert.match(run("check"), /altar: 4 displays, 1 groups, 2 animations \(persistent\)/);
        assert.deepStrictEqual(JSON.parse(execFileSync("node", [CLI, "fmbe", "check", tmp, "--json"], { encoding: "utf8" })), { ok: true, scenes: [{ id: "altar", displays: 4, groups: 1, anims: 2, persist: true }] });
        const preview = run("preview");
        assert.match(preview, /display gem: item "minecraft:diamond" advanced, 6 commands/);
        assert.match(preview, /display gem2: item "minecraft:diamond" basic, 9 commands/);
        assert.match(preview, /anim spin on ring: rot over 4\.00s ease linear loop repeat auto/);
        assert.match(run("commands"), /playanimation @s animation\.player\.attack\.positions none 0 "v\.xpos=/);
        assert.throws(() => execFileSync("node", [CLI, "fmbe", "bogus", tmp], { encoding: "utf8", stdio: "pipe" }));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

console.log(`\n${passed} passed`);
