#!/usr/bin/env node
// Run: node test/crystalRefs.test.js
// Crystal Refs: `@ns:name` / `@:name` references, resolved across every Crystal language when the pack is built.
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { lex } = require("../src/crystal/lexer.js");
const { resolveRef, packDefs, linkRefs, CrystalLinkError } = require("../src/crystal/refs.js");
const { parse: parseCinema } = require("../src/cinemaDsl/parser.js");
const { parse: parseFmbe } = require("../src/fmbeDsl/parser.js");
const { buildMod } = require("../src/buildPipeline.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

test("lexer: @ns:name, @:name and paths read as REF tokens; a bare @ is an error with a hint", () => {
    const refs = lex("a @minecraft:mob.cat.meow @:mira @cw:folder/thing-2", {}).filter(t => t.type === "REF").map(t => t.value);
    assert.deepStrictEqual(refs, [{ ns: "minecraft", name: "mob.cat.meow" }, { ns: null, name: "mira" }, { ns: "cw", name: "folder/thing-2" }]);
    assert.throws(() => lex("x @ y", {}), /written @namespace:name, or @:name/);
    assert.throws(() => lex("x @nocolon", {}), /@namespace:name/);
});

test("resolveRef: @:name takes the project namespace; cutscene and scene refs carry the bare name at runtime", () => {
    assert.deepStrictEqual(resolveRef({ ns: null, name: "mira" }, "entity", "cw"), { ns: "cw", id: "cw:mira", value: "cw:mira" });
    assert.deepStrictEqual(resolveRef({ ns: "other", name: "x" }, "sound", "cw"), { ns: "other", id: "other:x", value: "other:x" });
    assert.deepStrictEqual(resolveRef({ ns: null, name: "shrine" }, "scene", "cw"), { ns: "cw", id: "cw:shrine", value: "shrine" });
    assert.deepStrictEqual(resolveRef({ ns: null, name: "wave" }, "animation", "cw"), { ns: "cw", id: "animation.cw.wave", value: "animation.cw.wave" }, "animations are animation.<ns>.<name>");
    assert.throws(() => resolveRef({ ns: null, name: "x" }, "entity", null), /needs a project namespace/);
});

test("parsers: Cinema and FMBE slots take refs (resolved, recorded with their position) or plain strings (unchecked)", () => {
    const c = parseCinema('cutscene "c" {\n  cast mira = entity @:mira at (0, 0, 0)\n  lock cinematic\n  sound @:meow\n  particles @minecraft:endrod\n  mira.play @:wave\n  display scene s @:shrine at (0, 0, 0)\n  sound "legacy:string"\n  unlock\n}', "c.cinema", { ns: "cw" });
    assert.deepStrictEqual(c.links.map(l => [l.kind, l.id, l.line]), [["entity", "cw:mira", 2], ["sound", "cw:meow", 4], ["particle", "minecraft:endrod", 5], ["animation", "animation.cw.wave", 6], ["scene", "cw:shrine", 7]]);
    assert.strictEqual(c.cutscenes[0].body[0].entityType, "cw:mira");
    const scene = c.cutscenes[0].body.find(s => s.verb === "display scene");
    assert.deepStrictEqual(scene.args.pos, ["s", "shrine"], "scene refs carry the bare id the runtime looks up");
    const f = parseFmbe('scene "s" {\n  display a block @:marble at (0, 0, 0)\n  display b item "minecraft:stone"\n  anim x on a tween item @minecraft:dirt over 1s\n}', "s.fmbe", { ns: "cw" });
    assert.deepStrictEqual(f.links.map(l => [l.kind, l.id]), [["blockOrItem", "cw:marble"], ["blockOrItem", "minecraft:dirt"]]);
    assert.throws(() => parseCinema('cutscene "c" {\n  sound @:meow\n}', "c.cinema"), /needs a project namespace/);
});

test("packDefs reads definitions out of the finished pack JSON (entities, items, blocks, particles, animations, sounds)", () => {
    const bp = new Map([
        ["entities/a.json", JSON.stringify({ "minecraft:entity": { description: { identifier: "cw:mira" } } })],
        ["items/b.json", Buffer.from(JSON.stringify({ "minecraft:item": { description: { identifier: "cw:gem" } } }))],
        ["blocks/c.json", JSON.stringify({ "minecraft:block": { description: { identifier: "cw:marble" } } })],
        ["entities/broken.json", "{nope"],
    ]);
    const rp = new Map([
        ["particles/p.json", JSON.stringify({ particle_effect: { description: { identifier: "cw:spark" } } })],
        ["animations/a.json", JSON.stringify({ animations: { "animation.cw.wave": {} } })],
        ["sounds/sound_definitions.json", JSON.stringify({ sound_definitions: { "cw:meow": {} } })],
    ]);
    const d = packDefs({ bp, rp });
    assert.deepStrictEqual([...d.get("entity")], ["cw:mira"]);
    assert.deepStrictEqual([...d.get("item")], ["cw:gem"]);
    assert.deepStrictEqual([...d.get("block")], ["cw:marble"]);
    assert.deepStrictEqual([...d.get("particle")], ["cw:spark"]);
    assert.deepStrictEqual([...d.get("animation")], ["animation.cw.wave"]);
    assert.deepStrictEqual([...d.get("sound")], ["cw:meow"]);
});

test("linkRefs: own-namespace refs must resolve (with a did-you-mean); other namespaces pass; blockOrItem accepts either", () => {
    const pack = { bp: new Map([["entities/a.json", JSON.stringify({ "minecraft:entity": { description: { identifier: "cw:mira" } } })], ["items/g.json", JSON.stringify({ "minecraft:item": { description: { identifier: "cw:gem" } } })]]) };
    const base = { pack, namespaces: ["cw"] };
    assert.deepStrictEqual(linkRefs({ ...base, refs: [{ kind: "entity", ns: "cw", id: "cw:mira" }, { kind: "entity", ns: "minecraft", id: "minecraft:zombie" }, { kind: "blockOrItem", ns: "cw", id: "cw:gem" }, { kind: "scene", ns: "cw", id: "cw:shrine" }], defs: [{ kind: "scene", ns: "cw", id: "cw:shrine" }] }), { checked: 3 });
    const source = 'cast m = entity @:mria at (0, 0, 0)';
    assert.throws(() => linkRefs({ ...base, refs: [{ kind: "entity", ns: "cw", id: "cw:mria", file: "a.cinema", line: 1, col: 17, source }], defs: [] }), e => {
        assert.ok(e instanceof CrystalLinkError);
        assert.match(e.message, /a\.cinema:1:17: unknown entity @cw:mria - did you mean @cw:mira\?/);
        assert.match(e.message, /1 \| cast m = entity @:mria/);
        return true;
    });
    assert.throws(() => linkRefs({ ...base, refs: [{ kind: "blockOrItem", ns: "cw", id: "cw:nothing" }, { kind: "entity", ns: "cw", id: "cw:zzzzzzzz" }], defs: [] }), /2 unresolved Crystal references[\s\S]*unknown block or item @cw:nothing[\s\S]*unknown entity @cw:zzzzzzzz$/);
});

// ---- the whole pipeline ----
function modWith({ cinema, fmbe, rp = {} }) {
    // inside the repo tree: the entity DSL compiles with tsc, which wants the project next to the OpenRock sources
    const tmp = fs.mkdtempSync(path.join(__dirname, "fixtures", "tmp-refs-"));
    fs.cpSync(path.join(__dirname, "fixtures", "ns-entity-mod"), tmp, { recursive: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(tmp, "openrock.mod.json"), "utf8"));
    manifest.content = { ...manifest.content, cinemaDsl: "cine", fmbeDsl: "fmbe", rpOverlayDir: "rp" };
    fs.writeFileSync(path.join(tmp, "openrock.mod.json"), JSON.stringify(manifest));
    fs.mkdirSync(path.join(tmp, "cine")); fs.mkdirSync(path.join(tmp, "fmbe"));
    fs.writeFileSync(path.join(tmp, "cine", "c.cinema"), cinema);
    fs.writeFileSync(path.join(tmp, "fmbe", "s.fmbe"), fmbe);
    for (const [rel, doc] of Object.entries(rp)) { fs.mkdirSync(path.dirname(path.join(tmp, "rp", rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, "rp", rel), JSON.stringify(doc)); }
    return tmp;
}
const RP = {
    "particles/spark.json": { format_version: "1.10.0", particle_effect: { description: { identifier: "nem:spark" } } },
    "animations/wave.json": { format_version: "1.8.0", animations: { "animation.nem.wave": {} } },
    "sounds/sound_definitions.json": { format_version: "1.14.0", sound_definitions: { "nem:meow": { sounds: [] } } },
};
const build = tmp => buildMod(tmp, { vendorDir: path.join(__dirname, "fixtures") });

test("end to end: entity DSL, FMBE scene, particle, sound and animation JSON all link from a cutscene; vanilla refs pass", () => {
    const tmp = modWith({
        rp: RP,
        fmbe: 'scene "shrine" {\n  display a block @minecraft:stone at (0, 0, 0)\n}\n',
        cinema: `cutscene "c" {
  cast bot = entity @:waifu_nav at (~1, ~, ~)
  lock cinematic
  bot.play @:wave
  sound @:meow
  particles @:spark at (~, ~, ~) count 3
  particles @minecraft:endrod at (0, 0, 0)
  display scene s @:shrine at (~2, ~, ~)
  wait 1s
  unlock
}\n`,
    });
    try {
        const { bp } = build(tmp);
        const cut = JSON.parse(bp.get("cinema/c.json").toString("utf8"));
        assert.strictEqual(cut.cast[0].entityType, "nem:waifu_nav", "@:waifu_nav became the entity id");
        assert.deepStrictEqual(cut.events.find(e => e.op === "display.scene").args.pos, ["s", "shrine"]);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("end to end: a typo fails the BUILD naming the file, line, column and the closest real name", () => {
    const tmp = modWith({
        rp: RP,
        fmbe: 'scene "shrine" {\n  display a block @minecraft:stone at (0, 0, 0)\n}\n',
        cinema: 'cutscene "c" {\n  cast bot = entity @:waifu_nva at (0, 0, 0)\n  lock cinematic\n  display scene s @:shrne at (0, 0, 0)\n  wait 1s\n  unlock\n}\n',
    });
    try {
        assert.throws(() => build(tmp), e => {
            assert.match(e.message, /2 unresolved Crystal references/);
            assert.match(e.message, /c\.cinema:2:21: unknown entity @nem:waifu_nva - did you mean @nem:waifu_nav\?/);
            assert.match(e.message, /c\.cinema:4:19: unknown scene @nem:shrne - did you mean @nem:shrine\?/);
            return true;
        });
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

console.log(`\n${passed} passed`);
