// Run: node libs/fmbe/test/runtime.test.mjs   (the in-world runtime against a fake Bedrock)
import assert from "node:assert";
import { createMock } from "./mock.mjs";
import { createFmbe, spawnScene } from "../scripts/fmbe/index.js";

let passed = 0;
async function test(name, fn) {
    try { await fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);
const setup = (opts = {}) => {
    const m = createMock();
    const errors = [];
    const fmbe = createFmbe({ world: m.world, system: m.system, onError: e => errors.push(e.message), ...opts });
    return { ...m, fmbe, errors };
};
const at = { x: 10.5, y: 70, z: 4.5 };
const varsOf = e => e.commands.filter(c => c.includes("animation.player.attack.positions")).at(-1);

await test("spawn: queued, then a fox with owner, tags, effects, the item and the whole command chain", () => {
    const { fmbe, overworld, tick, entities } = setup();
    const d = fmbe.spawn(overworld, at, { item: "minecraft:grass_block", scale: 0.9 }, { owner: "p1" });
    assert.strictEqual(d.state, "pending");
    assert.strictEqual(entities.length, 0, "spawning is deferred to the tick budget");
    tick(1);
    assert.strictEqual(d.state, "live");
    const fox = entities[0];
    assert.strictEqual(overworld.spawnLog[0], "minecraft:fox<minecraft:as_adult>");
    assert.ok(fox.tags.has("fmbe_display") && fox.tags.has(`fmbe_id_${d.id}`));
    assert.strictEqual(fox.props.get("fmbe:owner"), "p1");
    assert.deepStrictEqual(fox.effects.map(e => e[0]), ["slowness", "resistance", "fire_resistance", "weakness", "slow_falling"]);
    assert.strictEqual(fox.commands[0], "replaceitem entity @s slot.weapon.mainhand 0 minecraft:grass_block");
    assert.strictEqual(fox.commands.length, 1 + 5 + 1, "item + 5 render commands + variables");
    assert.ok(varsOf(fox).includes("v.scale=0.9;"));
});

await test("spawn budget: at most maxSpawnPerTick foxes per tick", () => {
    const { fmbe, overworld, tick, entities } = setup({ maxSpawnPerTick: 3 });
    for (let i = 0; i < 10; i++) fmbe.spawn(overworld, { x: i, y: 70, z: 0 }, { item: "minecraft:stone" });
    tick(1); assert.strictEqual(entities.length, 3);
    tick(1); assert.strictEqual(entities.length, 6);
    tick(2); assert.strictEqual(entities.length, 10);
    assert.deepStrictEqual(fmbe.stats(), { total: 10, live: 10, pending: 0, running: true });
});

await test("a block with no item is dropped after maxAttempts and reported; a chunk that is not loaded is retried", () => {
    const { fmbe, overworld, tick, errors, entities } = setup({ maxAttempts: 3 });
    overworld.badItems = ["modded:ghost"];
    const bad = fmbe.spawn(overworld, at, { item: "modded:ghost" });
    tick(5);
    assert.strictEqual(bad.state, "removed");
    assert.ok(errors.some(e => /gave up spawning after 3 attempts.*no item/.test(e)), errors.join("|"));
    assert.ok(entities.every(e => !e.isValid), "no half-built fox left behind");
    overworld.failSpawns = 2;
    const late = fmbe.spawn(overworld, at, { item: "minecraft:stone" });
    tick(5);
    assert.strictEqual(late.state, "live", "retried until the chunk loaded");
});

await test("set/tween: variables update live; a tween sends formulas, then settles to plain numbers", () => {
    const { fmbe, overworld, tick, entities, system } = setup();
    const d = fmbe.spawn(overworld, at, { item: "minecraft:stone" });
    tick(1);
    const fox = entities[0];
    d.set({ rot: [0, 90, 0], scale: 2 });
    assert.ok(varsOf(fox).includes("v.yrot=90;") && varsOf(fox).includes("v.scale=2;"));
    d.tween({ pos: [0, 1, 0] }, { ticks: 20, ease: "inOutQuad" });
    const during = varsOf(fox);
    assert.ok(during.includes("v.ypos=0+(16-0)*") && during.includes("q.life_time") && during.includes("v.yrot=90;"), during);
    tick(10);
    near(d.current().pos[1], 0.5, 1e-9);
    tick(20);
    assert.strictEqual(d.running, null);
    assert.ok(varsOf(fox).includes("v.ypos=16;"), varsOf(fox));
    d.tween({ rot: [0, 360, 0] }, { ticks: 40, loop: "repeat" });
    tick(100);
    assert.ok(d.running, "a looping tween keeps running");
    d.stop();
    assert.strictEqual(d.running, null);
    assert.throws(() => fmbe.spawn(overworld, at, { item: "x:y", system: "static" }).tween({ scale: 2 }), /static system cannot animate/);
    void system;
});

await test("changing the item re-equips; changing kind re-sends the whole chain", () => {
    const { fmbe, overworld, tick, entities } = setup();
    const d = fmbe.spawn(overworld, at, { item: "minecraft:stone" });
    tick(1);
    const fox = entities[0];
    const before = fox.commands.length;
    d.set({ item: "minecraft:diamond" });
    assert.ok(fox.commands.slice(before).some(c => c.endsWith("minecraft:diamond")));
    const mark = fox.commands.length;
    d.set({ kind: "item" });
    assert.ok(fox.commands.length - mark >= 6, "kind change re-sends render chain");
});

await test("maintenance: pin drifted foxes, re-apply stale animations, respawn lost ones, mute fox sounds", () => {
    const { fmbe, overworld, tick, entities } = setup({ reapplyTicks: 30 });
    const d = fmbe.spawn(overworld, at, { item: "minecraft:stone" });
    tick(1);
    const fox = entities[0];
    fox.location = { x: 10.5, y: 66, z: 4.5 };
    tick(1);
    assert.deepStrictEqual(fox.teleports.at(-1), at, "teleported back to its anchor");
    const n = fox.commands.length;
    tick(40);
    assert.ok(fox.commands.length > n, "re-applied after reapplyTicks");
    assert.ok(overworld.commands.filter(c => c.startsWith("stopsound @a mob.fox.")).length >= 10, "muted");
    fox.isValid = false;
    tick(2);
    assert.strictEqual(d.state, "live");
    assert.strictEqual(entities.filter(e => e.isValid).length, 1, "a lost fox is replaced");
    assert.notStrictEqual(d.entity, fox);
});

await test("keepAlive:false removes a display whose fox vanished", () => {
    const { fmbe, overworld, tick, entities } = setup({ keepAlive: false });
    const d = fmbe.spawn(overworld, at, { item: "minecraft:stone" });
    tick(1);
    entities[0].isValid = false;
    tick(1);
    assert.strictEqual(d.state, "removed");
    assert.strictEqual(fmbe.stats().total, 0);
});

await test("owners: releaseOwner removes only theirs; the loop stops when nothing is left", () => {
    const { fmbe, overworld, tick, entities } = setup();
    fmbe.spawn(overworld, at, { item: "minecraft:stone" }, { owner: "a" });
    fmbe.spawn(overworld, at, { item: "minecraft:stone" }, { owner: "b" });
    tick(1);
    fmbe.releaseOwner("a");
    assert.strictEqual(entities.filter(e => e.isValid).length, 1);
    fmbe.releaseOwner("b");
    tick(2);
    assert.strictEqual(fmbe.stats().running, false);
});

await test("orphans: unknown foxes of the namespace are swept; other foxes are left alone; persisted ones can be adopted", () => {
    const first = setup({ namespace: "mymod" });
    const d = first.fmbe.spawn(first.overworld, at, { item: "minecraft:stone", scale: 0.5 }, { persist: true, owner: "p" });
    first.tick(1);
    const fox = first.entities[0];
    const wild = first.overworld.spawnEntity("minecraft:fox", at);
    assert.ok(!wild.tags.has("mymod_display"));
    // a fresh runtime (restart): it does not know the fox
    const fresh = createFmbe({ world: first.world, system: first.system, namespace: "mymod" });
    fresh.sweepOrphans();
    assert.strictEqual(fox.isValid, false, "unknown display fox removed");
    assert.strictEqual(wild.isValid, true, "not ours: untouched");
    const adopting = setup({ namespace: "mymod", orphanPolicy: "adopt" });
    const d2 = adopting.fmbe.spawn(adopting.overworld, at, { item: "minecraft:stone", scale: 0.5 }, { persist: true, owner: "p" });
    adopting.tick(1);
    const fox2 = adopting.entities[0];
    const restarted = createFmbe({ world: adopting.world, system: adopting.system, namespace: "mymod", orphanPolicy: "adopt" });
    restarted.sweepOrphans();
    assert.strictEqual(fox2.isValid, true);
    const back = restarted.get(d2.id);
    assert.ok(back && back.state === "live" && back.spec.scale === 0.5 && back.owner === "p", "re-attached with its spec");
    void d;
});

await test("entityLoad: a known fox reloaded gets its animation re-sent", () => {
    const { fmbe, overworld, tick, entities, loadHandlers } = setup();
    fmbe.spawn(overworld, at, { item: "minecraft:stone" });
    tick(1);
    const fox = entities[0];
    const n = fox.commands.length;
    loadHandlers[0]({ entity: fox });
    tick(1);
    assert.ok(fox.commands.length > n);
});

await test("snapshot/restore round-trips displays through plain data", () => {
    const a = setup();
    a.fmbe.spawn(a.overworld, at, { item: "minecraft:stone", rot: [0, 45, 0] }, { owner: "p", tags: ["t1"] });
    a.tick(1);
    const snap = JSON.parse(JSON.stringify(a.fmbe.snapshot()));
    const b = setup();
    const [d] = b.fmbe.restore(snap);
    b.tick(1);
    assert.strictEqual(d.state, "live");
    assert.deepStrictEqual(d.spec.rot, [0, 45, 0]);
    assert.strictEqual(d.owner, "p");
    assert.ok(b.entities[0].tags.has("t1"));
});

await test("glide: the fox is teleported along the path with easing and stops at the end", () => {
    const { fmbe, overworld, tick, entities } = setup();
    const d = fmbe.spawn(overworld, { x: 0.5, y: 70, z: 0.5 }, { item: "minecraft:stone" });
    tick(1);
    let done = false;
    d.glideTo([{ x: 10.5, y: 70, z: 0.5 }], { ticksPerSegment: 10, onDone: () => { done = true; } });
    tick(5);
    near(entities[0].location.x, 5.5, 1.1);
    tick(10);
    near(entities[0].location.x, 10.5, 1e-9);
    assert.ok(done && d.glide === null);
});

await test("group: children follow the group; yaw moves them around the origin; sub-groups compose; tween steps make an arc", () => {
    const { fmbe, overworld, tick, entities } = setup();
    const g = fmbe.group({ dimension: overworld, local: { pos: [10, 70, 10], rot: [0, 0, 0], scale: 1 } });
    const a = g.add({ item: "minecraft:stone" }, { pos: [2, 0, 0] });
    const sub = g.addGroup({ pos: [0, 1, 0] });
    const b = sub.add({ item: "minecraft:gold_block" }, { pos: [0, 0, 2] });
    tick(1);
    const worldOf = d => [d.anchor.x + d.spec.pos[0], d.anchor.y + d.spec.pos[1], d.anchor.z + d.spec.pos[2]];
    assert.deepStrictEqual(worldOf(a).map(v => +v.toFixed(6)), [12, 70, 10]);
    assert.deepStrictEqual(worldOf(b).map(v => +v.toFixed(6)), [10, 71, 12]);
    g.set({ pos: [20, 70, 20], rot: [0, 90, 0] });
    const wa = worldOf(a), wb = worldOf(b);
    near(Math.hypot(wa[0] - 20, wa[2] - 20), 2, 1e-9);
    near(Math.hypot(wb[0] - 20, wb[2] - 20), 2, 1e-9);
    near(wb[1], 71, 1e-9);
    assert.ok(Math.abs(a.spec.rot[1] - 90) < 1e-6, "children inherit the group's yaw");
    // far moves re-anchor so offsets stay small
    g.set({ pos: [200, 70, 200] });
    assert.ok(Math.abs(a.spec.pos[0]) <= 4 && Math.abs(a.spec.pos[2]) <= 4);
    assert.ok(Math.abs(a.anchor.x - 200) < 5);
    // tween with steps queues the pieces
    g.set({ pos: [0, 70, 0], rot: [0, 0, 0] });
    tick(1);
    g.tween({ rot: [0, 90, 0] }, { ticks: 20, steps: 4 });
    tick(30);
    near(a.current().rot[1], 90, 1e-6);
    void entities;
});

await test("group sweep: a 360 yaw spin is exact - the client formulas put every child on the true circle at every instant", async () => {
    const { run, expressionOf } = (await import("module")).createRequire(import.meta.url)("../scripts/fmbe/molangEval.cjs");
    const { composeTransforms } = (await import("module")).createRequire(import.meta.url)("../scripts/fmbe/matrix.cjs");
    const { fmbe, overworld, tick, entities } = setup();
    const g = fmbe.group({ dimension: overworld, local: { pos: [20, 64, 20], rot: [0, 30, 0], scale: 2 } });
    const sub = g.addGroup({ pos: [0, 1, 0], rot: [0, 10, 0], scale: 0.5 });
    const d = sub.add({ item: "minecraft:diamond", rot: [0, 0, 0] }, { pos: [1.5, 0.25, -1], rot: [15, 40, 5], scale: 0.8 });
    tick(1);
    g.tween({ rot: [0, 30 + 360, 0] }, { ticks: 80, loop: "repeat" });
    const cmd = entities[0].commands.filter(c => c.includes("animation.player.attack.positions")).at(-1);
    assert.ok(cmd.includes("math.mod(v.fm_ywg1+"), cmd);
    const expr = expressionOf(cmd);
    for (const life of [0, 1, 1.7, 2.5, 3.9]) {
        const vars = { "v.fm_tg1": 0 };
        run(expr, vars, { query: { life_time: life } });
        const theta = 30 + 360 * (life / 4);
        const w = composeTransforms(composeTransforms({ pos: [20, 64, 20], rot: [0, theta, 0], scale: 2 }, { pos: [0, 1, 0], rot: [0, 10, 0], scale: 0.5 }), { pos: [1.5, 0.25, -1], rot: [15, 40, 5], scale: 0.8 });
        near(d.anchor.x + vars["v.xpos"] / 16, w.pos[0], 1e-4);
        near(d.anchor.y + vars["v.ypos"] / 16, w.pos[1], 1e-4);
        near(d.anchor.z + vars["v.zpos"] / 16, w.pos[2], 1e-4);
        near(((vars["v.yrot"] - w.rot[1]) % 360 + 540) % 360 - 180, 0, 1e-4);
        near(vars["v.scale"], w.scale, 1e-6);
    }
    tick(1);
    g.stop();
    assert.ok(!entities[0].commands.at(-1).includes("q.life_time"), "stopped: plain numbers again");
    assert.throws(() => g.tween({ rot: [45, 0, 0] }, { loop: "repeat" }), /yaw-only/);
});

await test("scenes: compiled data spawns groups and displays, auto animations start, play/stop/set work, remove cleans up", () => {
    const { fmbe, overworld, tick, entities } = setup();
    const scene = {
        id: "altar", persist: false,
        nodes: [
            { kind: "display", name: "base", parent: null, spec: { item: "minecraft:stone" }, local: { pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 } },
            { kind: "group", name: "ring", parent: null, local: { pos: [0, 1, 0], rot: [0, 0, 0], scale: 1 } },
            { kind: "display", name: "gem", parent: "ring", spec: { item: "minecraft:diamond" }, local: { pos: [1, 0, 0], rot: [0, 0, 0], scale: 0.5 } },
        ],
        anims: [
            { name: "spin", target: "ring", patch: { rot: [0, 360, 0] }, ticks: 80, ease: "linear", loop: "repeat", steps: 1, auto: true },
            { name: "bob", target: "base", patch: { pos: [0, 0.25, 0] }, ticks: 20, ease: "inOutSine", loop: "pingpong", steps: 1, auto: false },
        ],
    };
    const s = spawnScene(fmbe, scene, { dimension: overworld, origin: { x: 5.5, y: 64, z: 5.5 }, yaw: 0 });
    tick(2);
    assert.strictEqual(entities.filter(e => e.isValid).length, 2);
    assert.ok(s.displays.get("gem").spec.vars.some(([n]) => n.startsWith("v.fm_t")), "auto animation started on the child of the spinning group");
    s.play("bob");
    assert.ok(s.displays.get("base").running);
    s.stop("bob");
    assert.strictEqual(s.displays.get("base").running, null);
    s.set("gem", { scale: 1 });
    near(s.displays.get("gem").spec.scale, 1);
    assert.throws(() => s.play("nope"), /no animation/);
    s.remove();
    assert.ok(entities.every(e => !e.isValid));
});

await test("copyBlock: a silk-touch pickaxe stand mines the block into the fox's hand and is removed again", () => {
    const stands = [];
    class ItemStack { constructor(id) { this.id = id; this.ench = []; } getComponent() { return { addEnchantment: e => this.ench.push(e) }; } }
    const m = createMock();
    const fmbe = createFmbe({ world: m.world, system: m.system, server: { ItemStack } });
    const d = fmbe.spawn(m.overworld, at, { item: "minecraft:stone" });
    m.tick(1);
    m.overworld.blocks.set("3,64,3", { isAir: false });
    const spawn = m.overworld.spawnEntity.bind(m.overworld);
    m.overworld.spawnEntity = (t, p) => {
        const e = spawn(t, p);
        if (t === "minecraft:armor_stand") { e.getComponent = () => ({ setEquipment: (slot, item) => { e.held = [slot, item]; } }); stands.push(e); }
        return e;
    };
    assert.strictEqual(fmbe.copyBlock(d, { x: 3, y: 64, z: 3 }), true);
    const stand = stands[0];
    assert.strictEqual(stand.held[0], "Mainhand");
    assert.deepStrictEqual(stand.held[1].ench, [{ type: "silk_touch", level: 1 }]);
    assert.ok(stand.commands[0].startsWith(`loot replace entity @e[tag=fmbe_id_${d.id}] slot.weapon.mainhand 0 mine 3 64 3 mainhand`));
    assert.strictEqual(stand.isValid, false, "stand removed");
    assert.strictEqual(fmbe.copyBlock(d, { x: 9, y: 9, z: 9 }), false, "air has nothing to copy");
    assert.throws(() => createFmbe({ world: m.world, system: m.system }).copyBlock({ isLive: true, dimension: m.overworld }, { x: 3, y: 64, z: 3 }), /server/);
});

console.log(`\n${passed} passed`);
