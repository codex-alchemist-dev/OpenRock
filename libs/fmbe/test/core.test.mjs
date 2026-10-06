// Run: node libs/fmbe/test/core.test.mjs   (pure core: systems, spec, commands, easing, tweens, matrices, Molang simulation)
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { SYSTEMS, WIKI_SELECTOR } = require("../scripts/fmbe/wikiSystems.cjs");
const { normalizeSpec, FmbeSpecError } = require("../scripts/fmbe/spec.cjs");
const C = require("../scripts/fmbe/commands.cjs");
const { easeTree, easeNames } = require("../scripts/fmbe/ease.cjs");
const X = require("../scripts/fmbe/expr.cjs");
const T = require("../scripts/fmbe/tween.cjs");
const M = require("../scripts/fmbe/matrix.cjs");
const MQ = require("../scripts/fmbe/molangEval.cjs");
const { itemSupport } = require("../scripts/fmbe/items.cjs");
const { simulate } = require("../scripts/fmbe/simulate.cjs");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);
const spec = (o = {}) => normalizeSpec({ item: "minecraft:stone", ...o });

test("wiki systems: the right number of commands per system, first one on the mandatory controller", () => {
    assert.deepStrictEqual(Object.fromEntries(Object.entries(SYSTEMS).map(([k, v]) => [k, v.length])), { basic: 8, compressed: 3, advanced3d: 5, advanced2d: 5, advancedItem: 5 });
    for (const sys of Object.values(SYSTEMS)) {
        assert.strictEqual(sys[0].controller, C.FIRST_CONTROLLER);
        for (const c of sys) assert.ok(c.anim.startsWith("animation.") && c.controller.length);
    }
    assert.strictEqual(WIKI_SELECTOR, "@e[tag=wiki:fmbe]");
});

test("spec: defaults, kinds, systems and field rules", () => {
    const s = spec();
    assert.deepStrictEqual([s.kind, s.system, s.scale, s.pos, s.rot], ["block", "advanced", 1, [0, 0, 0], [0, 0, 0]]);
    assert.ok(Object.isFrozen(s));
    assert.throws(() => spec({ kind: "wall" }), FmbeSpecError);
    assert.throws(() => spec({ pos: [1, 2] }), /x, y, z/);
    assert.throws(() => spec({ bogus: 1 }), /unknown field "bogus"/);
    assert.throws(() => normalizeSpec({}), /"item"/);
    assert.throws(() => spec({ scaleXZ: 2 }), /only exists in the basic system/);
    assert.throws(() => spec({ system: "basic", extend: { scale: 2 } }), /only exists in the advanced system/);
    assert.throws(() => spec({ system: "static", rot: [0, "q.life_time", 0] }), /static system bakes numbers/);
    assert.deepStrictEqual(spec({ extend: { scale: 3 } }).extend, { scale: 3, xrot: -90, yrot: 0 });
    assert.strictEqual(spec({ system: "basic", scaleXZ: 2 }).scaleXZ, 2);
});

test("item support follows the wiki's exceptions list", () => {
    assert.strictEqual(itemSupport("minecraft:stone").level, "ok");
    assert.strictEqual(itemSupport("minecraft:shield").level, "unsupported");
    for (const id of ["minecraft:trident", "minecraft:bow", "minecraft:spyglass", "minecraft:oak_button", "minecraft:white_banner", "minecraft:decorated_pot", "minecraft:conduit", "minecraft:heavy_core", "minecraft:skull"]) assert.strictEqual(itemSupport(id).level, "exception", id);
    assert.strictEqual(itemSupport("modded:cool_block").level, "ok");
});

test("commands: advanced chain is the wiki text verbatim with our selector and controller namespace", () => {
    const { render, vars } = C.commandsFor(spec({ kind: "block", pos: [0, 0.5, 0], rot: [0, 45, 0], scale: 0.9 }));
    assert.strictEqual(render.length, 5);
    assert.ok(render[0].startsWith("playanimation @s animation.player.sleeping _ 0 \"v.xpos=v.xpos??0;") && render[0].endsWith("controller.animation.fox.move"));
    assert.ok(render[1].endsWith("fmbe.fmbe.3d_blocks.anim1"), render[1].slice(-50));
    SYSTEMS.advanced3d.forEach((c, i) => assert.ok(render[i].includes(`"${c.expr}"`), `command ${i} keeps the wiki Molang verbatim`));
    assert.strictEqual(vars, 'playanimation @s animation.player.attack.positions none 0 "v.xpos=0;v.ypos=8;v.zpos=0;v.xbasepos=0;v.ybasepos=0;v.zbasepos=0;v.xrot=0;v.yrot=45;v.zrot=0;v.scale=0.9;" fmbe.setvariable');
    assert.ok(C.commandsFor(spec({ kind: "item" })).render[2].includes("v.F.X="), "items have their own offsets");
    assert.ok(C.commandsFor(spec({ kind: "block2d" })).render[1].includes("v.F.co=math.cos(25)"));
    assert.ok(C.renderCommands(spec(), { selector: "@e[tag=x]", ns: "mymod" })[1].startsWith("playanimation @e[tag=x] "));
});

test("commands: basic system carries xzscale/yscale and the 8-command chain", () => {
    const { render, vars } = C.commandsFor(spec({ system: "basic", scaleXZ: 2, scaleY: 0.5, basepos: [0, 0, 1] }));
    assert.strictEqual(render.length, 8);
    assert.ok(vars.includes("v.xzscale=2;") && vars.includes("v.yscale=0.5;") && vars.includes("v.zbasepos=16;"));
});

test("commands: static system bakes numbers into the wiki's compressed 3 commands", () => {
    const { render, vars } = C.commandsFor(spec({ system: "static", pos: [0, 0.5, 0], rot: [10, 20, 30], scale: 0.9 }));
    assert.strictEqual(vars, null);
    assert.strictEqual(render.length, 3);
    for (const needle of ["v.scale=0.9;", "v.ypos=8;", "v.xrot=10;", "v.yrot=20;", "v.zrot=30;"]) assert.ok(render[1].includes(needle), needle);
    assert.ok(!render[1].includes("q.life_time"));
});

test("commands: variable names and quoting are validated", () => {
    assert.throws(() => C.variablesCommand([["xpos", 1]]), /bad Molang variable/);
    assert.throws(() => C.variablesCommand([["v.x", '1"']]), /double quotes/);
    assert.ok(C.variablesCommand([["v.x", X.add(1, "v.y")]]).includes("v.x=1+v.y;"));
});

test("commands: world commands (summon, item, sounds, structure, loot-mine)", () => {
    assert.strictEqual(C.summonFoxCommand(1, 2.5, 3, { name: "n" }), 'summon fox 1 2.5 3 0 0 minecraft:as_adult "n"');
    assert.strictEqual(C.replaceItemCommand("minecraft:stone"), "replaceitem entity @s slot.weapon.mainhand 0 minecraft:stone");
    assert.strictEqual(C.stopSoundCommands().length, 10);
    assert.strictEqual(C.structureSaveCommand("a:b"), "execute at @n[tag=fmbe] run structure save a:b ~~~ ~~~ true disk false");
    assert.strictEqual(C.structureLoadCommand("a:b", 1, 2, 3), "structure load a:b 1 2 3");
    assert.ok(C.lootMineCommand({ standSelector: "@e[name=s]", foxSelector: "@e[tag=f]" }).endsWith("mine ~ ~-1 ~ mainhand"));
});

test("easing: every curve starts at 0 and ends at 1, and the Molang text evaluates like the JS tree", () => {
    for (const name of easeNames()) {
        const tree = easeTree(name, X.vr("v.u"));
        near(X.evaluate(tree, { "v.u": 0 }), 0, 1e-9);
        near(X.evaluate(tree, { "v.u": 1 }), 1, 1e-9);
        for (const u of [0.1, 0.37, 0.5, 0.82]) {
            const vars = { "v.u": u };
            near(MQ.run(`v.out=${X.toMolang(tree)};`, vars), X.evaluate(tree, { "v.u": u }), 1e-5);
        }
    }
    near(X.evaluate(easeTree("outBounce"), { u: 0.5 }), 0.765625);
    assert.throws(() => easeTree("wobble"), /unknown easing/);
});

test("tween: client formula latches its start, eases, clamps and loops", () => {
    const a = T.tweenAssignments(7, [["v.ypos", 0, 16]], { ticks: 20, ease: "linear" });
    const src = a.slice(1).map(([n, v]) => `${n}=${v};`).join("");
    const at = life => { const v = { "v.fm_t7": 10 }; MQ.run(src, v, { query: { life_time: life } }); return v["v.ypos"]; };
    near(at(10), 0); near(at(10.5), 8); near(at(11), 16); near(at(99), 16);
    const first = a[0];
    assert.strictEqual(first[1], "v.fm_t7??q.life_time");
    const pp = T.tweenAssignments(8, [["v.ypos", 0, 16]], { ticks: 20, loop: "pingpong" }).slice(1).map(([n, v]) => `${n}=${v};`).join("");
    const ppAt = life => { const v = { "v.fm_t8": 0 }; MQ.run(pp, v, { query: { life_time: life } }); return v["v.ypos"]; };
    near(ppAt(0.5), 8); near(ppAt(1), 16); near(ppAt(1.5), 8); near(ppAt(2), 0);
    assert.throws(() => T.tweenAssignments(1, [], { ticks: 0 }), /ticks/);
    const d = T.diffChannels(spec({ pos: [0, 0, 0] }), spec({ pos: [0, 1, 0], scale: 2 }));
    assert.deepStrictEqual(d, [["v.ypos", 0, 16], ["v.scale", 1, 2]]);
});

test("matrix: the advanced system's rotation variables equal Ry(-y)·Rx(x)·Rz(-z); euler round-trips; groups compose", () => {
    const rad = d => d * Math.PI / 180;
    const Rx = a => [1, 0, 0, 0, Math.cos(rad(a)), -Math.sin(rad(a)), 0, Math.sin(rad(a)), Math.cos(rad(a))];
    const Ry = a => [Math.cos(rad(a)), 0, Math.sin(rad(a)), 0, 1, 0, -Math.sin(rad(a)), 0, Math.cos(rad(a))];
    const Rz = a => [Math.cos(rad(a)), -Math.sin(rad(a)), 0, Math.sin(rad(a)), Math.cos(rad(a)), 0, 0, 0, 1];
    for (const [x, y, z] of [[10, 20, 30], [-40, 70, 5], [33, -120, 170], [0, 90, 0]]) {
        const R = M.eulerToMatrix(x, y, z), E = M.mul(Ry(-y), M.mul(Rx(x), Rz(-z)));
        R.forEach((v, i) => near(v, E[i], 1e-12));
        const back = M.eulerToMatrix(...M.matrixToEuler(R));
        R.forEach((v, i) => near(v, back[i], 1e-9));
    }
    // the same matrix the wiki's Molang builds (v.F.r0..r8), evaluated by the interpreter
    const v = { "v.xrot": 25, "v.yrot": -40, "v.zrot": 70 };
    MQ.run(SYSTEMS.advanced3d[0].expr, v);
    const wiki = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => v[`v.f.r${i}`]);
    M.eulerToMatrix(25, -40, 70).forEach((m, i) => near(m, wiki[i], 1e-9));
    // groups: a child one block ahead of a parent that yaws 90 degrees about Y ends up on a different axis, scale multiplies
    const w = M.composeTransforms({ pos: [10, 0, 0], rot: [0, 90, 0], scale: 2 }, { pos: [1, 0, 0], rot: [0, 0, 0], scale: 0.5 });
    near(w.scale, 1);
    near(Math.hypot(w.pos[0] - 10, w.pos[2]), 2, 1e-9);
    near(w.rot[1], 90, 1e-9);
    const flipped = M.composeTransforms({ pos: [0, 0, 0], rot: [30, 0, 0], scale: 1 }, { pos: [0, 0, 0], rot: [0, 60, 0], scale: 1 }, { handedness: -1 });
    const normal = M.composeTransforms({ pos: [0, 0, 0], rot: [30, 0, 0], scale: 1 }, { pos: [0, 0, 0], rot: [0, 60, 0], scale: 1 });
    assert.notDeepStrictEqual(flipped.rot, normal.rot);
});

test("simulation: every chain evaluates without NaN, scale/pos move the head the way the formulas say", () => {
    const run = s => simulate(s).vars;
    for (const kind of ["block", "block2d", "item"]) {
        for (const system of ["advanced", "basic", "static"]) {
            const r = simulate(spec({ kind, system, pos: [0.25, 0.5, -0.25], rot: [10, 20, 30], scale: 0.8 }));
            assert.deepStrictEqual(r.nonFinite, [], `${kind}/${system}`);
            assert.deepStrictEqual(r.undefinedReads, [], `${kind}/${system} reads a variable nothing sets`);
            assert.ok("v.head_position_x" in r.vars && "v.head_position_y" in r.vars && "v.head_position_z" in r.vars, `${kind}/${system} produced the head position`);
        }
    }
    const a = run(spec({ pos: [0, 0, 0] })), b = run(spec({ pos: [1, 0, 0] }));
    const head = v => ["v.head_position_x", "v.head_position_y", "v.head_position_z"].map(k => v[k]);
    assert.notDeepStrictEqual(head(a), head(b), "an x offset moves the head");
    const s1 = run(spec({ scale: 1 })), s2 = run(spec({ scale: 2 }));
    near(s2["v.swelling_scale1"] / s1["v.swelling_scale1"], Math.sqrt(2), 1e-9);
    const stretched = run(spec({ extend: { scale: 3 } }));
    near(stretched["v.swelling_scale2"] / run(spec())["v.swelling_scale2"], 3, 1e-9);
});

test("molang interpreter: precedence, ??, ternary, nested assignment, struct variables", () => {
    const v = {};
    near(MQ.run("v.a=1+2*3;", v), 7);
    near(MQ.run("v.b=v.undefinedthing??5;", v), 5);
    near(MQ.run("v.c=v.a>3?10:20;", v), 10);
    near(MQ.run("v.d=2*(v.e=3);", v), 6);
    near(v["v.e"], 3);
    MQ.run("v.F.x=4;v.y=v.F.x*2;", v);
    near(v["v.y"], 8);
    near(MQ.run("v.z=0||1?7:8;", v), 7);
    near(MQ.run("v.s=math.sin(90)+math.cos(0);", v), 2);
    assert.throws(() => MQ.run("v.a=nope(1);", {}), /unknown function/);
});

console.log(`\n${passed} passed`);
