# FMBE - display entities for Bedrock (`@openrock/fmbe`)

Bedrock has no `block_display` / `item_display` entities. The community technique is **FMBE** ("Fox MBE", from the
[Bedrock Wiki](https://wiki.bedrock.dev/commands/display-entities)): a vanilla `minecraft:fox` holds a block or item in its
main hand (`replaceitem`), and client animations shrink, scale, move and rotate the fox so the held item *is* the display. The
game renders the real model and texture, so **any block or item works, modded ones included**, with no addon content.
`@openrock/fmbe` is the full toolkit around that: command generation for every wiki system, a runtime that keeps hundreds of
displays alive and cheap, client-side tweens, groups, and a small DSL.

Everything below is built from the wiki's own Molang (copied verbatim by script into `wikiSystems.cjs`, never retyped).

## Concepts

| | |
|---|---|
| **display** | one fox showing one block/item, described by a *spec* |
| **spec** | `item`, `kind`, `system`, `pos`, `basepos`, `rot`, `scale`, `scaleXZ`/`scaleY`, `extend`, `vars`, `tags` |
| **kind** | `block` (3D blocks), `block2d` (ladder, coral, flowers), `item` (diamond, door...) - the fox holds each differently |
| **system** | `advanced` (default; the wiki's 5-command diagonal-transformation system), `basic` (8 commands; has `scaleXZ`/`scaleY`), `static` (3 commands with numbers baked in; cheapest, cannot animate) |
| **group** | rigid assembly of displays and sub-groups with one shared transform |
| **scene** | a compiled `.fmbe` file: groups, displays and named animations |

Units: positions in **blocks** (the wiki's `v.xpos` is 1/16 block; the library converts; the DSL accepts `8px`), angles in
**degrees**. `pos` is the offset of the display's centre from the fox; `basepos` shifts it *without* moving the centre of
rotation (so it turns with the display). `extend` stretches the display along a direction (`scale`, `xrot`, `yrot`).

Not supported by FMBE itself (wiki): the shield; trident, spyglass, bow, heads, banner, heavy core, conduit, decorated pot and
buttons are held differently, so placement is off (the DSL warns). A fox per display, visible to everyone, can be walked
through, and costs a real mob each - budget accordingly.

## Runtime

```js
import { world, system, ItemStack, EnchantmentType } from "@minecraft/server";
import { createFmbe } from "@openrock/fmbe";

const fmbe = createFmbe({ world, system, server: { ItemStack, EnchantmentType }, namespace: "mymod" });
fmbe.sweepOrphans();                                   // once at startup

const d = fmbe.spawn(dimension, { x: 10.5, y: 70, z: 4.5 },
    { item: "minecraft:grass_block", scale: 0.9, rot: [0, 45, 0] }, { owner: player.id });
d.set({ rot: [0, 90, 0] });                            // instant
d.tween({ pos: [0, 1, 0], scale: 1.2 }, { ticks: 40, ease: "outBack" });   // client-side, free
d.tween({ rot: [0, 360, 0] }, { ticks: 80, loop: "repeat" });              // forever
d.glideTo([{ x: 14.5, y: 70, z: 4.5 }], { ticksPerSegment: 40 });          // moves the fox itself (1 teleport/tick)
fmbe.copyBlock(d, { x: 3, y: 64, z: 3 });              // show whatever block stands there (states, modded blocks)
fmbe.releaseOwner(player.id);                          // remove all of a player's displays
```

What the runtime takes care of (all budgeted per tick - `maxSpawnPerTick`, `maxPinPerTick`, `maxReapplyPerTick`):

* **spawning** - queued; retried while the chunk is not loaded; dropped after `maxAttempts` (a block with no item form), reported via `onError`.
* **keeping them alive** - the five immobilising effects (slowness, resistance, fire resistance, weakness, slow falling); pinned back with a teleport if one drifts; respawned if killed/unloaded (`keepAlive`).
* **client state** - animations re-sent every `reapplyTicks` and on `entityLoad` (the client forgets them when a chunk reloads).
* **sound** - the wiki's ten `stopsound @a mob.fox.*` commands, every `muteTicks`.
* **ownership** - every fox carries `<ns>_display`, an id tag, and optional owner/persist properties. `sweepOrphans()` and chunk loads remove foxes of the namespace the runtime does not know (crash, `/reload`); `orphanPolicy: "adopt"` re-attaches displays created with `persist: true` (their spec is stored on the fox).
* **snapshots** - `fmbe.snapshot()` / `fmbe.restore()` turn displays into plain JSON (store it with MCLite or anything).

### Tweens run on the client

`playanimation ... "<molang>"` re-evaluates its expression every frame, so a value that is a *formula* animates with **no
server work**: `v.ypos = from + (to - from) * ease(clamp((q.life_time - start)/seconds, 0, 1))`. The library renders all of
easings.net (`linear`, `in|out|inOut` x `Quad Cubic Quart Quint Sine Expo Circ Back Elastic Bounce`) to Molang from one
expression tree that also evaluates in JS, so the server always knows where a display is (`d.current()`), `d.stop()` freezes
it, and mid-flight tweens continue smoothly. Loops: `repeat`, `pingpong`. Raw formulas are allowed too - any channel may be a
Molang string, and `vars: { "v.speed": "..." }` sets extra variables first.

### Groups

```js
const g = fmbe.group({ dimension, local: { pos: [20, 64, 20], rot: [0, 0, 0], scale: 1 }, owner: player.id });
const ring = g.addGroup({ pos: [0, 1, 0] });
ring.add({ item: "minecraft:gold_block" }, { pos: [2, 0, 0], scale: 0.3 });
g.set({ pos: [30, 64, 20], rot: [0, 90, 0] });
g.tween({ rot: [0, 360, 0] }, { ticks: 80, loop: "repeat" });   // a turntable
```

Transforms compose through the advanced system's own rotation matrix (`matrix.cjs`; `R = Ry(-y) Rx(x) Rz(-z)`, checked
against the wiki's `v.F.r0..r8` in the tests).

**Animations compose.** Any number of channels (`pos`, `rot`, `scale`) of any groups and displays can animate at the same time,
each with its own duration, easing and loop - a bobbing platform carrying a spinning ring carrying a pulsing gem is three
`tween` calls. While anything animates, the whole tree becomes client-side Molang (`groupFormulas.js`): every display's world
position, yaw and scale is a formula of the animation clocks, composed symbolically down the tree. This is exact for any angle
and any loop as long as group rotations are about the vertical axis (yaw) - the test evaluates the generated Molang at five
instants and compares it with `composeTransforms` of the sampled values. A tilting group rotation (pitch/roll) cannot be
expressed that way; it animates as straight pieces (one per 90 degrees), cannot loop, and needs nothing else animating.
Because an offset is only reliable within a few blocks of its entity, displays re-anchor as needed; a motion too wide for FMBE
throws instead of silently vanishing (`maxOffset`, default 4).

If in-game the angles act as the transpose of this convention (children of a pitched/rolled group compose in the wrong
order), pass `handedness: -1` to the group; yaw-only groups do not depend on it.

## The DSL (`content.fmbeDsl`)

Syntax is Crystal Core ([crystal.md](crystal.md#crystal-core-the-syntax-every-crystal-language-shares)): `//` comments, `;` or newline between statements, `{ }` blocks, camelCase options.

```
scene "altar" persist {
  display base block "minecraft:stone" at (0, 0, 0) scale 0.9
  group ring at (0, 1, 0) {
    display gem item "minecraft:diamond" at (1, 0, 0) rot (0, 45, 0) scale 0.5
    display gem2 item "minecraft:diamond" at (-1, 0, 0) scale 0.5 system basic scaleXZ 1.5
  }
  display flower block2d "minecraft:red_flower" at (0, 8px, 0) base (0, 0, "v.wobble") var "v.wobble" "math.sin(q.life_time*90)"
  anim spin on ring tween rot (0, 360, 0) over 4s loop repeat auto
  anim bob  on base tween pos (0, 0.25, 0) over 20t ease inOutSine loop pingpong
}
```

* **display** `<name> <block|block2d|item> @ns:id` (a Crystal Ref, checked at build time, or a quoted "id") then any of `at (x,y,z)` `rot (x,y,z)` `scale n` `base (x,y,z)` `scaleXZ n` `scaleY n` `system advanced|basic|static` `extend scale n xrot n yrot n` `var "v.name" <n|"molang">` `tag "t"` `name "n"`. `at`/`rot`/`scale` are local to the enclosing group. Numbers accept `px` (1/16 block); `base`, `scaleXZ`, `scaleY`, `extend` and `var` accept quoted Molang.
* **group** `<name> [at rot scale] { ... }` - nest freely.
* **anim** `<name> on <display|group> tween <pos|rot|scale|base|extend|item ...> over <2s|20t|500ms> [ease <name>] [loop repeat|pingpong] [steps n] [auto]`. A group animation may only tween `pos rot scale`; `auto` starts it when the scene spawns.

Compile-time checks: unknown kinds/props/easings, duplicate names, missing targets, `static` displays reached by an animation,
unsupported items (shield) are errors; exceptions-list items warn; every display is **simulated** through a small Molang
interpreter (`simulate.cjs`) and rejected if it produces NaN/Infinity.

```js
import { SCENES } from "@openrock/virtual/openrock-fmbe-data";
import { createFmbe, spawnScene } from "@openrock/fmbe";
const altar = spawnScene(fmbe, SCENES.altar, { dimension, origin: { x: 5.5, y: 64, z: 5.5 }, yaw: 90, owner: player.id });
altar.play("bob"); altar.stop("bob"); altar.set("gem", { scale: 1 }); altar.remove();
```

CLI: `openrock fmbe check|preview|commands [modDir]` - `commands` prints the exact `playanimation` strings (paste into a
command block to try a display by hand).

## Honest limits

* The wiki systems are community-made. Everything is verified for **syntax and arithmetic** (`node libs/fmbe/tools/bds-verify.mjs` replays all 98 generated commands - every system and kind, every easing, loops, group sweeps, the longest 1433 characters - through a real Bedrock Dedicated Server, which accepts them all; the server forwards Molang to clients without parsing it, so Molang itself is checked by the interpreter tests: finite values, no unset reads, JS-twin equality) but *how it looks on a client* - exactly where the block sits relative to the fox, and that a never-stopping stop-expression keeps animating - can only be confirmed in-game. The `fmbe` spike in OpenChara exists to calibrate placement.
* Foxes are mobs: they can be pushed through, are visible to all players, and each costs real server time.
* Heads, banners, tridents etc. are held differently by the fox; the systems have no correction for them.
