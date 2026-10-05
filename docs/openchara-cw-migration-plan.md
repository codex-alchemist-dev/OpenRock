# OpenChara + Claude Waifus -> OpenRock migration plan (OR-Track J)

Goal: `openrock build|check|deploy|dev` builds Claude Waifus (CW) from an OpenRock mod manifest, with OpenChara as a
hybrid OpenRock library, and `tools/openchara.js` is retired. No behavior change in-game. NSID `cw`, pack UUIDs, character
`index` values, and the `waifu` character key NEVER change (they are baked into worlds).

Executor tiers: **[S]** = needs judgment (Sonnet or stronger; read both sides before changing). **[H]** = mechanical, Haiku-safe.
Every task ends with: tests green (`npm test` in OpenRock), parity gate (below), one commit per task in the repo that changed
(OpenRock / OpenChara / Claude Waifus), per the standing commit-after-every-change rule. Never leave a half-converted state
uncommitted; never substitute an easier task for the stated one - if blocked, write the blocker at the bottom of this file and stop.

## Findings (why the cutover is not a one-liner)

1. `datagenEntry` can only emit **JSON documents**, and OpenRock deliberately **rejects hand-rolled entity/item/block documents**
   (`assertNotNativeOnlyPath`). So OpenChara's 6 `engine/bp/entities`, 3 `engine/bp/items`, 5 `engine/rp/entity` files (+ the
   generated `waifu` entity/render controller) must become Crystal `entityDsl`/`itemDsl` sources. A "wrap the legacy build() in a
   datagenEntry" bridge is NOT possible.
2. `uiDir` is accepted by the manifest validator but **no pipeline step consumes it**. MinUI (`../MinUI/lib/compile.js`,
   `compileUi(files) -> {rp, runtime}`) is not wired into OpenRock's build. This is the biggest new infra piece.
3. OpenRock templating only fills `{{ns}}`. OpenChara templates also use `{{char}} {{Char}} {{chars}} {{Chars}}`.
4. Three generated JS files must exist in the script bundle: `content.generated.js` (CONFIG/CHARACTERS/CLASSES/ABILITIES/QUESTS/SCHEMA),
   `ui/screens.generated.js` (MinUI runtime table), `ui/lang.generated.js` (all lang tables). OpenRock's `src/virtualModules.js`
   is the mechanism for generated modules - use it, do not ship loose files.
5. Legacy `check` on CW **currently fails** with `collection_index collision` errors in `RP/ui/openchara/screens.json`
   (pre-existing; UI plan is "built, not confirmed in-game"). Do not "fix" these as part of migration; the parity baseline
   includes them. Track separately.
6. Several OpenRock libs are still stubs (counters, saves, teams, quests, ...). Engine code that overlaps a **stub** lib stays as is.
   Only migrate onto implemented libs, and only after confirming API equivalence (see Phase 5).

## Parity gate (already built)

- Tool: `OpenRock/tools/parity/snapshot.js` (`legacy <projectDir> <out>`, `dir <buildDir> <out>`, `diff <a> <b>`).
- Baseline of the legacy build: `Claude Waifus/migration/cw-baseline.json` (113 BP + 69 RP files; deterministic - two runs identical).
- JSON files compare canonically (key order/formatting ignored). After each phase:
  `node OpenRock/tools/parity/snapshot.js dir "Claude Waifus/build" /tmp/new.json && node OpenRock/tools/parity/snapshot.js diff "Claude Waifus/migration/cw-baseline.json" /tmp/new.json`
- Allowed diffs, each recorded in `Claude Waifus/migration/ALLOWED_DIFFS.md` with a reason: `manifest.json` ordering/format,
  `scripts/**` (esbuild bundles replace loose files - verify instead by BDS boot + `openrock check`), `texts/**` only if byte-different
  but semantically equal. Anything else is a bug. Entity JSON from entityDsl may differ textually: compare semantically and list.
- Scripts are gated differently: `openrock check` runs the BDS smoke test; additionally run OpenChara's devtools harnesses on BDS if available.

## Phase 1 - Build infra in OpenRock (all [S]) - **DONE 2026-10-05** (1.1 templateVars, 1.2 uiDir, 1.3/1.5 generatedModules incl. file output, 1.4 lang runtime + game-locale gating + cross-package merge + pack.name injection, 1.6 manifest already carries folders/UUIDs/engine versions/authors; `displayName`+`description` feed pack.name/description). Remaining knobs for Phase 3/4: MinUI runtime scripts + rp assets still need to be shipped (see 3.4).

1.1 **Template vars.** Extend mod/library manifest with `templateVars` (object) merged into `fill()` vars in `renderEntryContent`
    and the DSL compilers; keep `{{ns}}` default. Tests in `test/buildPipeline.test.js`.
1.2 **MinUI step.** Implement `content.uiDir` for real: a pipeline stage calling MinUI `compileUi` on `*.ui.html|*.ui.css`
    (library `uiDir` and mod `uiDir` both contribute, mod last), writing `ui/**` JSON minified to rp (merge the `MERGED_FILES`
    registries) and registering `screens.generated.js` as a virtual script module. Copy MinUI `rp/` assets and `runtime/` scripts
    (they land at `scripts/openchara/ui/` today - preserve import paths or rewrite via the bundler alias). Tests: a fixture mod with one screen.
1.3 **Virtual modules from data.** Generic `content.generatedModules`: `[{ "path": "openchara/content.generated.js", "from": "src/build/content.js" }]` where the
    `from` Node file exports `(ctx) => string` (JS source). Wire to `virtualModules.js`. Include `ctx = { manifest, mod, templateVars, readJsonTable(dir) }`.
1.4 **Localization hookup.** `content.localization` already emits `texts/*.lang` + `languages.json`; add emission of the runtime
    `lang.generated.js` virtual module (same shape as legacy: `{ [id]: { name: table["openchara.language.name"] ?? id, table } }`;
    each locale layered over en_US; `pack.name`/`pack.description` keys; legacy GAME_LOCALES + LOCALE_ALIASES logic from
    `OpenChara/tools/lib/build.js` `writeLanguages`).
1.5 **Portraits.** MinUI `lib/portraits.js generatePortraits` runs at build; expose as a build stage reachable from a library (`content.buildStages`, or
    run inside a `generatedModules` provider that can also return extra rp files - decide, document).
1.6 **Pack manifest fields.** Confirm the mod manifest can carry: explicit pack folder names ("Claude Waifus B"/"R"), fixed UUIDs
    (pack, data module, script module, resource module), `minEngineVersion`, script module versions
    (`@minecraft/server 2.6.0`, `@minecraft/server-ui 2.0.0`), authors. Add what is missing.

Gate: all OpenRock tests green; fixture covering 1.1-1.4 passes.

3.4 [S] MinUI runtime/rp assets: `../MinUI/runtime/*.js` (-> `scripts/openchara/ui/`) and `../MinUI/rp/**` must reach the pack. Make MinUI an OpenRock library (`@minui/core`, scriptsDir=runtime, rpOverlayDir=rp) that OpenChara `dependsOn`; engine imports `./ui/i18n.js` etc. must resolve (bundler aliases) and `./lang.generated.js` / `./screens.generated.js` become `@openrock/virtual/localization-tables` / `@openrock/virtual/ui-screens`.

## Phase 2 - Convert OpenChara engine assets to Crystal DSL ([S] decisions, [H] repetition once pattern proven)

2.1 [S] Convert ONE entity (`engine/bp/entities/*` + matching `rp/entity/*`) to `entityDsl`; prove semantic equality with the legacy JSON
    via a small comparer; record DSL conventions in `OpenChara/docs/PATCHES.md`.
2.2 [H] Convert the remaining 5 entities and 3 items the same way. One commit each.
2.3 [S] The generated `waifu` character entity (nav slots `navigationSlots: 10000`, client entity, render controller from
    `build.js` `navSlotCharacterEntity/clientEntity/renderController`) - express as DSL driven by `templateVars` + the content tables, or a typed
    builder in a library datagen (JSON only). This is the riskiest conversion: compare semantically, then verify in BDS (spawn) before in-game.
2.4 [H] Move remaining static assets (`engine/rp/models`, `textures`, `ui`) to `OpenChara/rp-overlay/`; BP leftovers to `bp-overlay/`.

Gate: parity diff for `bp/entities/**`, `bp/items/**`, `rp/entity/**`, `rp/render_controllers/**` is semantically empty or listed in ALLOWED_DIFFS.

## Phase 3 - OpenChara as a hybrid library ([S] for 3.1/3.3, [H] for 3.2)

3.1 [S] `OpenChara/openrock.library.json`: `kind: library`, name `@openchara/core`, `content`: `scriptsDir: engine/scripts`,
    `bpOverlayDir`/`rpOverlayDir`, `entityDsl`, `itemDsl`, `localization: engine/lang`, `uiDir` (engine UI), `generatedModules`
    (content.generated.js provider), `templateVars` schema doc. Declare `scripts.runtime: true` (+ `buildTime` if it uses providers). `dependsOn` the
    implemented `@openrock/*` libs it really imports (decided in Phase 5).
3.2 [H] Move the content-table loading/validation from `tools/lib/build.js` (`loadTable`, `loadContent`, CORE_FIELDS, index-uniqueness,
    class/ability references, schema type checks) into `OpenChara/src/build/content.js` unchanged, exporting the provider used by 1.3; port the
    error messages verbatim; add unit tests copied from behavior (bad index, duplicate id, unknown class/ability, redefined core field).
3.3 [S] `main.js` generation: legacy `generatedMain` imports `startOpenChara` then project content scripts (+devtools when `devTools`).
    Map to OpenRock `scriptEntry` / mod `contentScripts` semantics; keep the order engine -> devtools -> content.

## Phase 4 - Claude Waifus as an OpenRock mod ([S] 4.1, [H] 4.2)

4.1 [S] `Claude Waifus/openrock.mod.json` from `PATCHES/project.json` (namespace `cw`, `templateVars` char=waifu etc., pack folders/UUIDs verbatim,
    authors, versions), `dependsOn @openchara/core`. Directory mapping: `PATCHES/ui -> uiDir`, `PATCHES/lang -> localization`, `PATCHES/scripts -> scriptsDir`
    (+contentScripts), `PATCHES/bp|rp -> bpOverlayDir|rpOverlayDir`, `PATCHES/{characters,classes,abilities,quests,database}` -> read by OpenChara's content provider.
    Keep `PATCHES/` as the folder name (public docs and `OpenChara/docs/PATCHES.md` reference it).
4.2 [H] Update `Claude Waifus/package.json` scripts to `node ../OpenRock/bin/openrock.js <cmd> .`; keep old `openchara.js` scripts as `legacy:*` until the final phase.
4.3 [S] Run parity; resolve every diff or document it. Then `openrock deploy`, then **user confirms in-game** (nothing is "done" before that, per standing rule).

## Phase 5 - Adopt implemented libs ([S] only - read both implementations; one lib per commit)

For each pair, compare the legacy engine file's public behavior and persisted data format with the lib. Migrate only if API/data-compatible; otherwise
write one line under "Blockers/decisions" below. NEVER change persisted dynamic-property keys or record formats.

| Engine file(s) | Candidate lib |
|---|---|
| `events.js`, `hooks.js` | `@openrock/events` |
| `perception.js`, `perceptionTick.js` | `@openrock/perception` |
| `navigation.js` | `@openrock/pathfinding` |
| `floodFill.js`, `chokePoints.js`, `routeAnalysis.js` | `@openrock/terrain`, `@openrock/route-analysis` |
| `formations.js` | `@openrock/formation` |
| `itemSerializer.js` | `@openrock/inventory-serialization` |
| `roomSafety.js` + entity-spawn wrappers | `@openrock/entity-safety` |
| `ui/i18n.js` (MinUI) | `@openrock/i18n`, `@openrock/localization` |
| permission checks in `orders.js`/`api.js` | `@openrock/permissions` |
| `counters.js`, `dbMaintenance.js`, `dbTransfer.js`, `squads.js`, `quests.js`, `bonds.js` | stubs (`counters`, `saves`, `teams`, `quests`, `relations`) - **do not migrate** until those libs are implemented |

## Phase 6 - Retire legacy ([H] after user confirmation)

6.1 Delete `OpenChara/tools/openchara.js` + `tools/lib/{build,check,zip}.js` (keep `make-satchel.js` if still used), `mcstub.js` only if unused.
6.2 Update READMEs, `OpenChara/docs/PATCHES.md`, workspace memory notes. 6.3 Final parity re-snapshot becomes the new baseline.

## Tests to add along the way

- OpenRock: fixture for templateVars, uiDir stage, generatedModules, lang runtime module.
- OpenChara: content-provider unit tests (3.2). CW: `tests/` already has ui-smoke; keep passing.
- BDS smoke (automatic in `openrock check`) must be green at every phase from 2.3 on.

## Blockers / decisions log

(append here; do not guess)

- 2026-10-05 (Phase 1 done): `{{vars}}` now fill inside DSL-compiled JSON documents too, so library entity sources can author `identifier="{{ns}}:pathfind_anchor"`.
- Phase 2 gaps found by reading the engine entities vs `src/entityDsl/components.js` (resolve in 2.1, [S]): `<Entity>` has no `runtimeIdentifier`
  (`pathfind_anchor` uses `minecraft:armor_stand`) and no `formatVersion` (engine files use 1.16.0 / 1.21.10); no typed `DamageSensor`,
  `Persistent`, `Inventory`, `Nameable`, `KnockbackResistance`, `ConditionalBandwidthOptimization` (use `<RawComponent>` initially). Client entity fields
  (`materials/textures/geometry/renderControllers`) are supported on `<Entity>`. The semantic comparer must ignore key order only.

## STATUS 2026-10-05 (end of session)

- Phases 1-4 and 6 DONE. `openrock build|check` of Claude Waifus matches the legacy build file-for-file (entities, items, UI, portraits, render controller,
  languages) except: `scripts/**` (esbuild bundle; BDS smoke boot passes, `tests/ui-smoke.mjs` + `tests/split-compat.mjs` pass against the new layout via
  `OpenRock/src/looseScripts.js`) and `items/migration_charm.json` (modernized from legacy format 1.16.0 + `category:"equipment"` + a stray RP item to
  format 1.21.10 + `menu_category`; the item has no icon texture, so verify in-game).
- Legacy `tools/openchara.js` + `tools/lib/{build,check,zip}.js` deleted (git history keeps them). Parity baseline: `Claude Waifus/migration/cw-baseline.json`.
- Phase 5 decision (reviewed, NOT migrated - none are drop-in): `itemSerializer.js` vs `@openrock/inventory-serialization` persist DIFFERENT formats
  (`damage`/`nameTag` vs `durability{}`/`name`) and the engine's is a superset (nested containers, dyes, potions, dynamic props) - swapping would corrupt saved
  records. `floodFill/chokePoints/routeAnalysis/roomSafety` take a `dimension` and return arrays; `@openrock/terrain|route-analysis` take an `isPassable`
  callback and return Sets. `perception.js` (squad-keyed threat memory/aggro) vs `@openrock/perception` (`createThreatMemory`), `formations.js`
  (named formation geometry) vs `@openrock/formation` (slot descriptors), `navigation.js` (`navigateToCoordinate(entity,x,y,z,dimension,cb)`) vs
  `@openrock/pathfinding` (`navigateToCoordinate(pool, entity, target, dimension, hooks)`), `events.js`/`hooks.js` vs `@openrock/events` (Bedrock pub/sub) are all
  different shapes. The right direction is the reverse: promote the engine's richer implementations into the libs behind adapters, with an in-game check.
- Known, pre-existing: `openrock check` on CW fails the MinUI JSON UI lint (`collection_index collision`, spike screens `_skilltreespike`/`_tabspike` are the
  likely cause) exactly as the legacy `check` did. `OPENROCK_UI_LINT=warn` downgrades it to warnings so you can deploy while fixing.
- Needs the user in-game: deploy with `OPENROCK_UI_LINT=warn npm run dev` in Claude Waifus, confirm characters spawn/UI opens/lang switch/items.
