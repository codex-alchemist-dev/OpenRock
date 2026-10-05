# Crystal Cinema Language Reference

Crystal Cinema is a declarative, chronological, line-based DSL for authoring cutscenes in Bedrock mods. Files are stored as `*.cinema` plain text and compiled into executable timelines by `content.cinemaDsl` in the build pipeline.

## Time Model

A cutscene progresses on a **cursor** that starts at 0 ticks (one tick = 1/20 second):
- `wait <duration>` advances the cursor by that duration
- `at <time>` or `at +<time>` sets the cursor absolutely (to tick T) or relatively (forward by T)
- Events fire when the cursor reaches their timestamp; events at the same tick run in source order
- `sequence { ... }` runs its children in order from the cursor, advancing it
- `parallel { ... }` starts every child at the same cursor; afterwards the cursor is the latest END time
- Timed commands (with `over` or `for`) count their duration toward the timeline's total, but do not block the cursor

Time may never go backwards except within a `parallel` block. Every cutscene must end with `unlock` so control is always returned.

## Cutscene Structure

```
cutscene "id" {
  cast  <name> = player | entity "type" at (x, y, z)
  
  mode  none | letterbox | fade-in
  
  lock  cinematic | position | free
  
  # timeline events
  
  unlock
  
  on skip { ... }
}
```

## Durations

Durations must have a unit:
- `1.5s` – seconds (converted to ticks)
- `500ms` – milliseconds
- `20t` – ticks (1/20 second each)

## Cast Declaration

Each cast is a named reference to a game actor:
- `player [0]` — bound at play time; optional player index (default 0)
- `entity "type" at (x, y, z)` — spawned at the given coordinate

## Verbs

| Verb | Arguments | Notes |
|------|-----------|-------|
| `lock` | `cinematic` \| `position` \| `free` | Camera/movement lock mode |
| `unlock` | — | Release locks, restore control |
| `mode` | `none` \| `letterbox` \| `fade-in` | Screen mode |
| `fade` | `in` \| `out`, `<duration>` | Fade screen |
| `camera cut` | `to <coord>`, opt `look_at <target>`, opt `fov <num>` | Instant camera placement |
| `camera move` | `to <coord>`, `over <duration>`, opt `ease <name>`, opt `look_at <target>` | Animated move (blocking) |
| `camera look_at` | `<target>`, opt `over <duration>`, opt `ease <name>` | Rotate to face target |
| `camera follow` | `<cast>` | Camera follows a cast |
| `camera orbit` | `around <target>`, `radius <num>`, `speed <num>`, `over <duration>` | Orbit an entity (blocking) |
| `camera shake` | `strength <num>`, `for <duration>` | Screen shake |
| `camera fov` | `<num>`, opt `over <duration>`, opt `ease <name>` | Field of view (blocking) |
| `camera pan_up` | opt `over <duration>`, opt `ease <name>` | Pan away from ground (blocking) |
| `camera dolly` | `by <coord>`, `over <duration>` | Relative camera translation (blocking) |
| `camera roll` | `<num>`, opt `over <duration>`, opt `ease <name>` | Roll the camera (blocking) |
| `screen show` | `"texture"`, opt `fill`, opt `fade <duration>` | Show full-screen or overlay |
| `screen hide` | opt `fade <duration>` | Hide screen |
| `spawn_display` | `"entity"`, opt `at screen(x, y)`, opt `for <duration>` | Spawn display entity |
| `particles` | `"effect"`, opt `at <coord>`, opt `radius <num>`, opt `count <num>`, opt `for <duration>` | Play particles |
| `sound` | `"sound"`, opt `at <coord>`, opt `volume <num>`, opt `pitch <num>` | Play sound |
| `title` | `"text"`, opt `subtitle "text"`, opt `for <duration>`, opt `fade <duration>` | Show title/subtitle |
| `weather` | `clear` \| `rain` \| `thunder` | Change weather |
| `time` | `<num>` | Set world time |
| `clear_effects` | — | Remove all effects |
| `give_effect` | `"effect"`, opt `for <duration>`, opt `level <num>` | Apply status effect |
| `teleport_player` | `<coord>` | Teleport player |
| `heal` | — | Full heal |
| `set_flag` | `"name"` | Set a custom flag |
| `call` | `"function"` | Invoke a script function |
| `emit` | `"event"` | Emit a script event |
| `mark_seen` | `"id"` | Mark cutscene as seen |
| `actor.play` | `"animation"`, opt `loop` | Play entity animation |
| `actor.say` | `"text"`, opt `for <duration>` | Actor dialogue |
| `actor.emote` | `"emote"` | Play emote |
| `actor.teleport` | `<coord>` | Teleport actor |
| `actor.face` | `<target>` | Face toward target |
| `actor.move` | `<coord>`, `over <duration>` | Move actor (blocking) |
| `actor.despawn` | — | Remove actor |

Ease functions: `linear`, `in`, `out`, `inOut`, `inSine`, `outSine`, `inOutSine`, `inQuad`, `outQuad`, `inOutQuad`, `inCubic`, `outCubic`, `inOutCubic`.

## Example

```cinema
cutscene "first_meeting" {
  cast hero = player
  cast mira = entity "openchara:mira" at (120, 64, -30)
  mode letterbox
  lock cinematic
  
  camera cut to (118, 66, -25) look_at mira
  wait 1.5s
  camera move to (118, 65, -29) over 3s ease inOutSine look_at mira
  mira.play "wave"
  wait 2s
  camera pan_up over 0.6s ease in
  screen show "space_bg" fill fade 0.3s
  spawn_display "big_robot" at screen(0.5, 0.4) for 3s
  wait 3s
  screen hide
  camera cut to (140, 70, -10)
  particles "robot_slash" at (140, 64, -10) count 50 for 2s
  call "aoe_wave"
  fade out 0.5s
  unlock
  
  on skip {
    fade out 0.2s
    mark_seen "first_meeting"
  }
}
```

## Linting

The compiler checks for warnings:
- Cutscenes longer than 5 minutes
- `lock free` (free-cam requires every angle looks good)
- Consecutive `camera cut` at the same tick
- `screen show` without a later `screen hide`
- `particles` with count > 500

Warnings print to the console but do not fail the build.
