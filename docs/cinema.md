# Crystal Cinema

Crystal Cinema is a declarative, chronological, line-based DSL for authoring cutscenes in Bedrock mods. Files are `*.cinema` plain text, compiled into timelines by `content.cinemaDsl` in the build pipeline and played by the `@openrock/cinema` runtime (real Bedrock handlers for every verb, FMBE display entities included). CLI: `openrock cinema check|preview [modDir]`.

## Time model

A cutscene progresses on a **cursor** that starts at 0 ticks (one tick = 1/20 second):

- `wait <duration>` advances the cursor.
- `at <time>` / `at +<time>` sets the cursor absolutely / advances it relatively. Going backwards is an error outside `parallel`.
- Events at the same tick run in source order.
- `sequence { ... }` runs children in order from the cursor, advancing it.
- `parallel { ... }` starts every child at the same cursor; afterwards the cursor is the latest END among the children.
- Timed commands (`over` / `for`) **never block the cursor** - they start now and run alongside later lines - but count toward the cutscene's total length. Put a `wait` after them to sequence what follows.

Durations need a unit: `1.5s`, `500ms`, `20t`.

**Syntax** is Crystal Core ([crystal.md](crystal.md#crystal-core-the-syntax-every-crystal-language-shares)): `//` and `/* */` comments, `;` or a newline between statements, `"..."` strings with JavaScript escapes, and `` `backtick` `` strings for text that spans lines (indentation is stripped):

```cinema
mira.say `
  Welcome back.
  It has been a long time.
` for 4s
```

Keywords are camelCase (`lookAt`, `panUp`, `giveEffect`, `clearEffects`, `teleportPlayer`, `markSeen`, `setFlag`); the old snake_case spellings still parse with a deprecation warning.

**Relative coordinates:** any coordinate component may be `~` (the cutscene's start), `~3` or `~-2`: `(~2, ~, ~-4)` is 2 east and 4 north of where the first player stood when it began (their floored position; world axes, no rotation). That makes a cutscene reusable anywhere. Plain numbers stay absolute, and the two mix: `(100, ~1, ~)`.

## Structure

```
cutscene "id" {
  cast  <name> = player [index] | entity "type" at (x, y, z)
  mode  none | letterbox
  lock  cinematic | position | free
  ...timeline...
  unlock                       # required: every cutscene hands control back
  on skip { ... }              # runs instead of the rest when the player skips
}
```

`cast player [n]` binds the n-th player given to `play` (default 0). `cast entity` is spawned when the cutscene starts and **always removed when it ends**.

## Verbs

| Verb | Arguments | Notes |
|------|-----------|-------|
| `lock` | `cinematic` \| `position` \| `free` | cinematic = camera + movement locked; position/free = movement locked, camera free. Permissions are restored to what they were, on every exit path |
| `unlock` | | release locks and the camera |
| `mode` | `none` \| `letterbox` | bars are drawn by the game (`hooks.letterbox`) |
| `fade` | `in` \| `out`, `<dur>` | out = to black (held until `fade in`); in = from black |
| `camera cut` | `to <coord>`, `lookAt <target>`, `fov <n>` | instant |
| `camera move` | `to <coord>`, `over <dur>`, `ease`, `lookAt` | eased on the client; keeps the last look-at |
| `camera lookAt` | `<target>`, `over`, `ease` | turn in place |
| `camera follow` | `<cast>` | keep facing a cast member (re-aimed every 2 ticks) until the next camera instruction |
| `camera orbit` | `around <target>`, `radius`, `speed`, `over <dur>` | circle at the current height; default one turn per duration |
| `camera shake` | `strength <n>`, `for <dur>` | `camera.addShake` (max intensity 4) |
| `camera fov` | `<n>`, `over`, `ease` | |
| `camera panUp` | `over`, `ease` | tilt to look at the sky |
| `camera dolly` | `by <coord>`, `over <dur>` | relative translation |
| `screen show` / `screen hide` | `"texture"`, `fill`, `fade` | UI belongs to the game: `hooks.screenShow/screenHide` |
| `display show` | `<name> <block\|block2d\|item> "<id>" at <coord>`, `rot`, `scale`, `base`, `system`, `for` | FMBE display entity ([fmbe.md](fmbe.md)) |
| `display scene` | `<name> "<scene>" at <coord>`, `yaw`, `scale`, `for` | a compiled `content.fmbeDsl` scene |
| `display move` | `<name> to <coord> over <dur>`, `ease` | client-side within ~3.5 blocks, otherwise the entity glides |
| `display rotate` | `<name> to <x,y,z> over`, `ease`, `loop` | any angle is exact |
| `display spin` | `<name> by <degrees> over`, `ease` | `by 720` = two turns |
| `display scale` | `<name> to <n> over`, `ease` | |
| `display item` | `<name> "<id>"` | swap what it shows |
| `display play` / `display stop` | `<name> "<animation>"` | scene animations |
| `display hide` | `<name>` | |
| `particles` | `"effect"`, `at`, `radius`, `count`, `for` | `count` once, or spread over `for` |
| `sound` | `"sound"`, `at`, `volume`, `pitch` | |
| `title` | `"text"`, `subtitle`, `for`, `fade` | cleared on cleanup |
| `weather` | `clear` \| `rain` \| `thunder` | |
| `time` | `<ticks>` | `world.setTimeOfDay` |
| `giveEffect` / `clearEffects` | `"effect"`, `for`, `level` | level 1 = I |
| `teleportPlayer` | `<coord>` | |
| `heal` | | |
| `call` | `"function"` | `functions[name](env, players)` |
| `emit` | `"event"` | `emit(name, { players })` |
| `markSeen` / `setFlag` | `"id"` | `hooks.markSeen` / `hooks.setFlag` |
| `<cast>.play` | `"animation"`, `loop` | `entity.playAnimation` |
| `<cast>.say` | `"text"`, `for` | `hooks.say`, else the action bar |
| `<cast>.emote` | `"event"` | `entity.triggerEvent` - the entity decides |
| `<cast>.teleport` / `.face` / `.move` / `.despawn` | | `.move` glides linearly, one teleport per tick |

Ease names: `linear`, `in`, `out`, `inOut` (the quad curves), and `in`/`out`/`inOut` + `Sine Quad Cubic Quart Quint Expo Circ Back Elastic Bounce` (e.g. `outBounce`, `inOutBack`).

There is no camera roll (the script API has no roll), and no screen-space displays: a display is a world entity. Use `display show` at a coordinate in front of a locked camera.

A display name is introduced by `display show` / `display scene`; every other `display` verb must name one that is shown (checked at compile time), and `for` hides it again. Hiding twice is fine.

## Example

```cinema
cutscene "first_meeting" {
  cast hero = player
  cast mira = entity "openchara:mira" at (120, 64, -30)
  mode letterbox
  lock cinematic

  camera cut to (118, 66, -25) lookAt mira
  wait 1.5s
  camera move to (118, 65, -29) over 3s ease inOutSine lookAt mira
  mira.play "wave"
  wait 2s
  display show gem item "minecraft:diamond" at (119, 66, -27) scale 0.6
  display spin gem by 720 over 4s ease inOutSine
  display move gem to (119, 67, -27) over 2s ease outSine
  camera panUp over 0.6s ease in
  wait 4s
  display hide gem
  particles "robot_slash" at (140, 64, -10) count 50 for 2s
  call "aoe_wave"
  fade out 0.5s
  unlock

  on skip {
    fade out 0.2s
    markSeen "first_meeting"
  }
}
```

## Running it (`@openrock/cinema`)

```js
import { world, system, InputPermissionCategory, EasingType, WeatherType, CameraShakeType, ItemStack, EnchantmentType } from "@minecraft/server";
import { createCinemaRuntime } from "@openrock/cinema";
import { createFmbe, spawnScene } from "@openrock/fmbe";
import { CUTSCENES } from "@openrock/virtual/openrock-cinema-data";
import { SCENES } from "@openrock/virtual/openrock-fmbe-data";

const cinema = createCinemaRuntime({
    bedrock: { world, system, InputPermissionCategory, EasingType, WeatherType, CameraShakeType },
    cutscenes: CUTSCENES,
    fmbe: createFmbe({ world, system, server: { ItemStack, EnchantmentType }, namespace: "mymod" }),
    scenes: SCENES, spawnScene,
    functions: { aoe_wave: (env, players) => { /* game code */ } },
    hooks: { markSeen, setFlag, screenShow, screenHide, letterbox, say },   // all optional; see below
    emit: (name, { players }) => { /* script event */ },
});
cinema.play("first_meeting", [player], { onFinish: ({ state }) => {} });   // state: finished | skipped | stopped | errored
cinema.skip(player);
```

**The guarantee:** whatever a cutscene changes - input permissions (restored to the values they had, not blindly to `true`), camera, fov, shake, fade, title, overlay, letterbox, displays, cast entities - is undone exactly once on every exit: finish, skip, stop, an op that throws, the player leaving, the player dying, `stopAll()`. An error in one cutscene ends only that cutscene (`onError`).

**What the library does itself** (against real `@minecraft/server`): lock/unlock, fade, every camera verb (`setCamera("minecraft:free", ...)` with client-side easing; follow/orbit step every 2 ticks), shake, fov, particles, sound, title, weather, time, effects, teleport, heal, actors, FMBE displays. **What it asks the game for** (`hooks`): letterbox bars, screen overlays, `markSeen`, `setFlag`, `say`. Missing cosmetic hooks (letterbox, screen) warn once and the cutscene continues; missing state-changing ones (`markSeen`, `setFlag`, `call` functions, `emit`) are errors.

Unverified in game (no server can show it): how the free camera and its easing look, whether `actor play ... loop`'s never-firing stop expression loops, and `camera.setFov()` with no argument resetting the fov. The ops are checked against a recording fake of the API (`libs/cinema/test/ops.test.js`) and the compiler against `test/cinemaDsl.test.js`.

## Linting

Warnings (printed by the build and `openrock cinema check`, never failing it): longer than 5 minutes; `lock free`; consecutive `camera cut` at the same tick; `screen show` without a later `screen hide`; `particles` count over 500.
