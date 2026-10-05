# Implementation plan for Haiku: boilerplate and coding work

The hard infrastructure is built, tested, and committed. This document is everything left that is
mechanical enough to hand to a smaller model. Read "Rules" first, then pick tasks in order. Each task
names exact files, signatures, and an acceptance test. Do not redesign anything listed under
"Already built".

## Rules (apply to every task)

1. Work in `V:\git\OpenChara Workspace\OpenRock`. Run `npm test` before and after; it must exit 0.
2. Plain Node CommonJS, `"use strict"`, **LF line endings** (never CRLF), 4-space indent, no new
   dependencies unless the task says so. No comments that restate code; one short line max when the WHY is non-obvious.
3. Tests are plain-Node files with the hand-rolled `test(name, fn)` + `assert` pattern (copy `test/scriptsDecl.test.js`).
   Every new test file must be appended to the `scripts.test` chain in `package.json`.
4. Everything modular: one concern per file, no function over ~60 lines, no catch-all utils files.
5. **Libraries are general-purpose.** They provide mechanisms and registries, never game design. No
   waifus, classes, squads, stat names, ranks, or fixed rules. Anything opinionated is a registry/hook the
   consuming mod fills in. If unsure, make it a registration function.
6. Bedrock APIs (`@minecraft/server`) are never imported in library logic. They are injected through an
   adapter object so the logic runs under plain Node tests. Copy the pattern in `libs/cinema/src/player.js`.
7. Never claim in-game behavior is verified. Tests with fakes prove logic only. Anything touching real
   camera/input/entity behavior stays marked `UNVERIFIED-IN-GAME` in its file header until the user confirms it.
8. Commit after each finished task. Message ends with `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>`.
   Never push to a remote you did not create; `git push` to the existing `origin` is fine.
9. Do not edit these hard-infrastructure files except where a task says so: `src/buildPipeline.js`,
   `src/manifest.js`, `src/scriptsDecl.js`, `src/virtualModules.js`, `src/cinemaDsl/{lexer,parser,timeline}.js`,
   `libs/cinema/src/player.js`, `libs/localization/src/{placeholders,catalog,mtl,emit}.js`. If a task seems to need
   a change there, stop and write the problem at the bottom of this file instead.

## Already built (do not redo)

- Manifest `scripts` declaration + `openrock info` (`src/scriptsDecl.js`, `src/commands/info.js`).
- Crystal Cinema language: `src/cinemaDsl/{lexer,verbs,parser,timeline,cinemaCompiler}.js`. A mod declares
  `content.cinemaDsl: "<dir>"`; `*.cinema` files compile into a generated module importable as
  `@openrock/virtual/openrock-cinema-data` (exports `CUTSCENES`, keyed by cutscene id) plus `cinema/<id>.json`.
  Verbs live in `verbs.js` (`registerVerb(name, {pos, kw, durationKw})`). Language reference: see
  `test/cinemaDsl.test.js` for working examples.
- Virtual script modules (`src/virtualModules.js`): a DSL compiler emits a bp entry at
  `.openrock-virtual/<name>.js`; scripts import it as `@openrock/virtual/<name>`; it never ships as a loose file.
- `@openrock/cinema` runtime player core (`libs/cinema/src/player.js`): `createPlayer({ops, onError})`,
  `start(timeline, env)` -> `{tick, skip, stop, state, onCleanup}`, `stopAll`, `activeCount`.
- `@openrock/localization`: placeholders, `.lang` parse/serialize, catalog with derived staleness, MTL
  pipeline (provider contract, cache, glossary, retry), CSV round-trip, key extraction, emission,
  `content.localization` build integration (also resource-pack-only mods), `openrock translate <sub>`,
  opt-in `autoTranslate` prebuild. Provider contract: `{ id: string, translate(items:[{key,text}], from, to) -> Promise<Map|object key->text> }`.
  Texts passed to a provider contain opaque `⟦n⟧` sentinels that must be returned unchanged.

---

## Track 1 - Cinema follow-ups

### 1.1 `openrock cinema check|preview` command
- New `src/commands/cinema.js` exporting `async function cmdCinema(sub, modDir, flags)`; register `"cinema"` in
  `COMMANDS` and the switch in `bin/openrock.js` (positional layout: `openrock cinema <sub> [modDir]`, same
  handling as `translate` there).
- `check`: load the manifest (`loadManifestFile`), compile `content.cinemaDsl` via `compileCinemaDsl`, print one
  line per cutscene (`id, duration in seconds, event count`). Errors already carry file:line:col and a code
  frame; print `e.message` and exit 1. Support `--json` -> `{ok, cutscenes:[{id,seconds,events}]}`.
- `preview`: print an ASCII timeline per cutscene: one row per event, `00:03.50  camera.move  to=(1,2,3) over=60t`.
- Test `test/cinemaCli.test.js`: temp mod with one good and (separately) one broken `.cinema`; assert output/exit codes.

### 1.2 More verbs
Add to `src/cinemaDsl/verbs.js` using `registerVerb` (keep each a one-liner; add an enum for any fixed choices):
`camera dolly` (kw `by` coord, `over` dur required), `camera roll` (pos num, kw `over`), `weather` (pos ident enum clear|rain|thunder),
`time` (pos num), `clear_effects`, `give_effect` (pos str, kw `for` dur, `level` num), `teleport_player` (pos coord),
`heal` (no args), `set_flag` (pos str) and `if_flag` is OUT OF SCOPE (needs grammar changes, not mechanical).
For each: a parse test and a compile test in `test/cinemaDsl.test.js` style (append, do not edit existing tests).

### 1.3 Lint warnings
New `src/cinemaDsl/lint.js` exporting `lintTimeline(timeline) -> string[]` (pure). Warnings: cutscene longer than
5 minutes; `lock free` used (message: "free-cam: every angle must look good"); a `camera cut` immediately followed
by another at the same tick; `screen show` without a later `screen hide`; `particles` count over 500.
Print them from `openrock cinema check` (do not fail the build). Test each warning.

### 1.4 Default Bedrock op handlers (UNVERIFIED-IN-GAME)
Directory `libs/cinema/src/ops/`, one file per group, each exporting `createXOps(bedrock) -> {op: handler}` where
`bedrock` is an injected adapter. Handlers receive `(ctx, args, event)` as in `player.js`; `ctx.env.players` is the
array of bound players and `ctx.env.cast` maps cast names to bound objects.
- `lock.js`: `lock`, `unlock`, `mode`, `fade`. Register restoring cleanup via `ctx.onCleanup` on every `lock`
  (copy the discipline in `OpenChara/engine/scripts/openchara/ui/rts.js`: restore input permissions on every exit path).
  Real calls: `player.inputPermissions.setPermissionCategory(InputPermissionCategory.Camera|Movement, false/true)`,
  `player.camera.fade(...)`. Mapping: `lock cinematic` = Camera+Movement off; `lock position` = Movement off only; `lock free` = Movement off, Camera on.
- `camera.js`: `camera.cut/move/look_at/follow/orbit/shake/fov/pan_up`. Use `player.camera.setCamera("minecraft:free", {location, rotation, easeOptions:{easeTime, easeType}})`
  (see rts.js); compute rotation from `look_at`. Map `ease` names to Bedrock `EasingType` values. `over` durations are ticks / 20 seconds.
  Clear with `player.camera.clear()` in cleanup.
- `fx.js`: `particles`, `sound`, `title`. `player.spawnParticle`, `player.playSound`, `player.onScreenDisplay.setTitle`.
- `actors.js`: `actor.play/say/emote/teleport/face/move/despawn` operating on `ctx.env.cast[event.actor]`
  (`entity.playAnimation`, `entity.teleport`, `entity.dimension.runCommand` for say via `tellraw`). 
- `flow.js`: `call` (looks up `ctx.env.functions[name]`, throws a clear error if absent), `emit` (`ctx.env.emit(name)`), `mark_seen`.
- `index.js`: `createDefaultOps(bedrock) -> merged ops`; throws if two groups register the same op.
- NOT in this task (needs in-game spikes, leave a `TODO(spike)` op that throws "not implemented"): `screen.show`, `screen.hide`, `spawn_display`.
- Tests: `libs/cinema/test/ops.test.js` with a recording fake `bedrock`/player proving the exact calls, that
  `lock` cleanup restores permissions even when a later op throws (use `createPlayer`), and that `lock position` keeps Camera enabled.

### 1.5 Runtime glue
`libs/cinema/src/runtime.js` exporting `createCinemaRuntime({ bedrock, cutscenes, functions, ops })`:
`play(id, players, {onFinish})`, `skip(player)`, `stopAll()`. It owns one `createPlayer`, drives `session.tick(1)` from
`bedrock.system.runInterval(fn, 1)`, binds cast (`player` kinds by index into `players`; `entity` kinds spawned/located via the adapter),
stops a session when its player leaves (`bedrock.onPlayerLeave`). Fake-adapter tests for: tick driving, skip routing,
player-leave cleanup, unknown cutscene id error. Export from `register.js`.

### 1.6 Docs
`docs/cinema.md`: language reference. Generate the verb table from `allVerbs()` with a script `tools/genCinemaDocs.js`
(prints markdown) and paste the output into the doc. Include the time model (copy the header comment of `timeline.js`)
and the five working examples from `test/cinemaDsl.test.js`. Test: every registered verb name appears in the doc.

---

## Track 2 - Localization follow-ups

### 2.1 HTTP provider adapters
`libs/localization/src/providers/{claude,deepl,libretranslate}.js`, each `module.exports = env => ({id, translate})`,
taking an injectable `env.fetch` (default global `fetch`) so tests use a fake. Credentials from env vars
(`ANTHROPIC_API_KEY`, `DEEPL_API_KEY`, `LIBRETRANSLATE_URL`+optional key). Each must send the items in one request,
tell the model/engine to leave `⟦n⟧` tokens untouched, and return a `Map(key -> text)`. Claude adapter: JSON in/out via the
Messages API, model from `env.OPENROCK_MTL_MODEL` default `claude-haiku-4-5-20251001`. Add `providers/index.js` that calls
`registerProvider` for all three, required from `register.js`. Tests with fake fetch: request shape, auth header present, missing key -> clear error, non-200 -> clear error, sentinel round trip.

### 2.2 XLSX
Add `exceljs` to `package.json` dependencies. `libs/localization/src/xlsx.js`: `rowsToXlsxBuffer(rows)` / `xlsxBufferToRows(buf)`
(async). Style: bold frozen header, columns `key`/`context`/`source` read-only-looking (grey fill), wrap text, `<lang>:status` column
with a data-validation list `machine,reviewed`. Extend `src/commands/translate.js`: `export --format=xlsx` and `import --file=x.xlsx`
(dispatch on extension). Test: rows -> xlsx -> rows equality.

### 2.3 Per-player runtime + tab-label gap
`libs/localization/src/runtime.js`: `createLocalizer({ getPlayerLang, tables })` -> `t(player, key, params)` that returns a RawMessage
`{translate, with}` when the player has no override and a literal string from `tables[lang]` when they do (copy the logic in
`libs/i18n/src/register.js`; do NOT add a dependency on `@openrock/i18n`). Tests as in `libs/i18n/test/i18n.test.js`.
Document, in `libs/localization/README.md`, the known MinUI gap (`MinUI/docs/UI.md` line ~107: `<tab label>` follows the client language only). Do not change MinUI.

### 2.4 Glossary command
`openrock translate glossary add-dnt <term>` / `add-term <lang> <from> <to>` / `list`, editing `<locDir>/glossary.json`. Add to `SUBCOMMANDS` in `src/commands/translate.js`. Test through the CLI.

### 2.5 Docs
`docs/localization.md` (workflow: author source `.lang` -> `extract` -> `mtl` or `export` sheet -> `import` -> `check` -> build) using the CLI tests as the worked example.

---

## Track 3 - Library catalog boilerplate

### 3.0 Scaffold generator
`tools/newLibrary.js <dirName> <@openrock/name> "<description>" [--dep=@openrock/x ...]` creates `libs/<dirName>/` with:
`package.json`, `openrock.library.json` (kind library, entry `src/register.js`, `provides.api` same, `hookNamespaces:[dirName]`, `scripts:{runtime:true}`),
`LICENSE` (copy `libs/cinema/LICENSE`), `README.md` (name, one-line purpose, "General-purpose: mechanisms, no policy."), `src/register.js`
(`api` object + `register()` + `Object.assign(register, api)` exactly like `libs/cinema/src/register.js`), `test/<dirName>.test.js` (one smoke test).
It also appends the test to `package.json`'s test chain. Test: run it into a temp copy and assert files + that the smoke test passes.

### 3.1 Per-library stubs
For each library below run the generator, then in `src/` create the listed files, each exporting the listed functions with real signatures
and a body that throws `new Error("<lib>.<fn>: not implemented")`, and put one test per function asserting it throws that message
(these tests flip to real tests when a stronger model implements the body). Use `scripts:{runtime:true}` unless noted. Pure logic only; storage is injected as a `store` adapter `{get(key), set(key, value), delete(key), keys(prefix)}`.

1. **teams** `@openrock/teams` - architecture only. Files: `graph.js`, `queries.js`, `rules.js`. API:
   `createTeamGraph({store, events})`; `createTeam(id, {parent, tags})`, `removeTeam(id)`, `addMember(teamId, memberId, {tags})`, `removeMember(teamId, memberId)`,
   `setParent(teamId, parentId|null)` (must reject cycles), `membersOf(teamId, {recursive})`, `teamsOf(memberId, {recursive})`, `tagsOf(teamId, memberId)`,
   `registerRule(name, {check(ctx)->{ok,reason}})`, `isAlly(a, b)` (uses `setRelation(fn)` supplied by the mod; default: share any team). No size caps, captains, invites, or friendly fire built in.
2. **dialogue** `@openrock/dialogue` - `parser.js` (`.dialogue` DSL: reuse `src/cinemaDsl/lexer.js` style), `engine.js`. API: `parseDialogue(source, filename)`, `createDialogueEngine({ui})`, `start(player, id, ctx)`, `registerCondition(name, fn)`, `registerAction(name, fn)`.
3. **quests** `@openrock/quests` - `engine.js`, `objectives.js`. API: `createQuestEngine({store, events})`, `defineQuest(def)`, `registerObjectiveType(name, {onEvent(state, event)->state})`, `registerRewardType(name, fn)`, `progress(subjectId, questId)`, `accept(subjectId, questId)`, `abandon(...)`.
4. **progression** `@openrock/progression` - `curves.js`, `graph.js`, `derive.js`. API: `defineValue(name, {base})`, `defineCurve(name, fn)`, `levelForXp(curve, xp)`, `xpForLevel(curve, level)`, `defineNode(id, {requires, cost})`, `canUnlock(state, nodeId)`, `unlock(state, nodeId)`, `registerDerivation(name, fn)`, `derive(state, name)`. No built-in stat names.
5. **relations** `@openrock/relations` - `pairs.js`. API: `pairKey(a, b)` (canonical order), `createRelations({store})`, `get(a, b, track)`, `add(a, b, track, delta)`, `partnersOf(id)`, `defineTrack(name, {min, max})`.
6. **abilities** `@openrock/abilities` - `cooldowns.js`, `meters.js`, `registry.js`. API: `createCooldowns({store, now})`, `start(owner, abilityId, ticks)`, `remaining(owner, abilityId)`; `createMeter(owner, key, {max})`, `add/spend/get`; `registerAbility(id, {activate, canUse})`, `use(owner, id, ctx)`. Optional dependency on `@openrock/molang-safe` for predicates.
7. **counters** `@openrock/counters` - `counters.js`. API: `createCounters({store, maxBytes: 30000})`, `increment(subjectId, category, key, by)`, `get(subjectId, category, key)`, `snapshot(subjectId)`, `sizeBytes(subjectId)`, `flush()`.
8. **saves** `@openrock/saves` - `slots.js`, `checksum.js`, `trash.js`. API: `createSaves({store})`, `read(kind, id)`, `write(kind, id, mutate)` (A/B slot, validate before commit, checksum, mirror recovery), `softDelete(kind, id)`, `restore(kind, id)`, `purgeOlderThan(ms)`.
9. **behavior** `@openrock/behavior` - `tree.js`, `utility.js`. API: `createBehaviorTree(root)`, node helpers `sequence/selector/condition/action`, `registerNodeType(name, factory)`, `tick(tree, ctx)`; `utilityPick(options)`.
10. **schedule** `@openrock/schedule` - API: `createScheduler({now, store})`, `at(timeOfDay, id, fn)`, `every(ticks, id, fn)`, `cancel(id)`, `catchUp(id, fromTick)`.
11. **notify** `@openrock/notify` - API: `createNotifier({display})`, `push(player, {text, priority, ttl, dedupeKey})`, `clear(player)`; queue ordering by priority then arrival.
12. **audio** `@openrock/audio` - API: `createAudio({play, stop})`, `definePlaylist(id, tracks)`, `setState(player, stateId)`, `duck(player, factor, ticks)`.
13. **fx** `@openrock/fx` - API: `defineEffect(id, steps)`, `registerStepType(name, fn)`, `play(effectId, target, ctx)`.
14. **waypoints** `@openrock/waypoints` - API: `createWaypoints({store})`, `add(id, {pos, dimension, tags})`, `remove(id)`, `nearest(pos, {tag})`, `route(fromId, toId)`.
15. **economy** `@openrock/economy` - API: `createEconomy({store})`, `defineCurrency(id, {decimals})`, `balance(owner, currency)`, `transfer(from, to, currency, amount, {reason})`, `ledger(owner)`; transfers atomic or throw.
16. **loot** `@openrock/loot` - API: `defineTable(id, pools)`, `roll(tableId, {seed, context})`, `registerCondition(name, fn)`, `pity(tableId, subjectId)`; plus `toDatagen(table)` emitting a vanilla loot table JSON.
17. **input** `@openrock/input` - API: `createInput({read})`, `bind(action, {keys, buttons, touch})`, `poll(player)` returns pressed actions.
18. **help** `@openrock/help` - API: `parseMarkdownPages(md)`, `createHelp({localizer})`, `search(query)`, `open(player, pageId)`.
19. **test** `@openrock/test` - API: `createHarnessPlan(manifest)` (lists every entity/block/item to spawn/place/use, reusing `src/bdsTestHarness.js` helpers), `collectContentLogErrors(logText)`.
20. **debug** `@openrock/debug` - API: `createProfiler({now})`, `time(label, fn)`, `report()`, `propertySizeReport(store)`.

Each stub's README states its API in one table. After stubs, the maintainer (not Haiku) decides which get real implementations.

---

## Needs the user (do not attempt, do not mark done)

- Cinema in-game spikes S1-S5: camera lock matrix (Camera vs Movement permission categories, 360 mode), full-screen background technique and HD textures, entity animation triggering on arbitrary entities, multi-player sync + chunk loading at distant camera, `attachToEntity` smoothness on `@minecraft/server` 2.6.0.
- Visual acceptance of any cutscene.
- Creating GitHub repos / submodule remotes for the new libs (`localization`, `cinema` currently live as plain directories in `libs/`).
- Deciding which catalog libraries get real implementations.

## Problems found by Haiku (append here instead of editing hard-infrastructure files)

(none yet)
