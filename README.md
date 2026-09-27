# OpenRock Mod Packager

An open-source library system for Minecraft Bedrock addon development.
Plain JS/Node modules + a manifest.json (no custom DSL) for libraries and
mods.

**Status: OR-Phase 0-4, OR-Track A, OR-Track B, OR-Track F (F0 the real
CLI, F1 multi-mod dev mode), OR-Track C Tier 1 + Tier 2 Stage 1 (log tailer
+ VS Code debugger launch config), and OR-Track G (resource-pack-only
mods) are all done. Nothing wired to a real addon yet.** `OpenChara`/`Claude
Waifus` keep building via `node tools/openchara.js <cmd>` exactly as
before - this repo has zero effect on that workflow until OR-Track J's
actual, deliberate cutover.

**A real `openrock` CLI now exists** (`bin/openrock.js`): `build`,
`check`, `export`, `deploy`, `dev`, `log` all work end to end, tested
against dummy fixture mods/libraries and via real child-process CLI
invocations (`test/buildPipeline.test.js`, `test/cli.test.js`) - never
against real Claude Waifus, so none of this carries any cutover risk. See
"Build pipeline & CLI" below.

The full phased design (manifest shape, library lifecycle, MCLite's
generalized API, submodule wiring, the OR-Track A-J ecosystem expansion,
and the migration order with testing checkpoints for every phase) lives in
the project's plan document under "OpenRock Mod Packager — Phased
Implementation Plan" and "OpenRock Ecosystem Expansion Roadmap". Read that
before touching any phase past this one.

## Target architecture (summary)

- **Library** (`kind: "library"`, e.g. OpenChara): a reusable engine
  layer. Depends only on other libraries/submodules, `provides` an API +
  hook namespaces for others to register into.
- **Mod** (`kind: "mod"`, e.g. Claude Waifus): a leaf content package.
  Depends on a library by name, never `provides` anything, carries the
  engine-facing fields (packs, character, content, rules) that get built
  into a real `.mcaddon`.
- **MinUI** and **MCLite** are git submodules under `vendor/`, pinned to a
  commit - real version tracking, replacing today's hardcoded relative
  paths (`../MinUI`, `../OpenChara`).
- **Kernel**: `createRegistry(name, {validate})` generalizes the
  `Map`/register/safe-default/try-catch-and-warn pattern already proven
  twice in OpenChara (`hooks.js`, `conditions.js`). A library's `entry`
  module exports one `register(kernel, ctx)` function, called after every
  dependency has already registered (topological load order, mods last).
- **Dependency resolution v2** (OR-Track A): `dependsOn` entries support an
  npm-style `versionRange` alongside the exact-pin `version`, plus
  `optional`/`soft` flags; top-level `breaks`/`conflicts`/`recommends`/
  `suggests` arrays mirror Modrinth's real `dependency_type` categories.
  See "Manifest v2: dependency model" below.

## Directory layout

- `bin/openrock.js` - the real CLI (`build`/`check`/`export`/`deploy`/
  `dev`/`log`, OR-Track F0).
- `src/kernel.js` - the registry core (`createRegistry`/`createKernel`).
- `src/libLoader.js` - topological load ordering (`topoSort`/`loadLibraries`).
- `src/manifest.js` - manifest schema + validator + `loadManifestFile()`.
- `src/resolver.js` - version/breaks/conflicts resolution across a whole
  load set, run before `topoSort` (OR-Track A3).
- `src/semver.js` - a scoped-down, dependency-free semver range
  implementation (`^`, `~`, x-ranges, hyphen ranges, comparators; no `||`
  alternative-set support - see the file header).
- `src/compat.js` - version-keyed API selection (`isVersionedApi`,
  `selectApiVersion`), applied automatically by `libLoader.js` (OR-Track B2).
- `src/fsTree.js` - generic directory walking + diff-based tree writing
  (`walk`/`writeTree`) and the shared/merged-registry-file logic
  (`MERGED_FILES`/`mergeRegistry`), OR-Track F0.
- `src/buildPipeline.js` - `buildMod()`: a mod manifest + its resolved
  dependency tree -> BP/RP file maps, OR-Track F0.
- `src/zip.js` - a dependency-free `.mcaddon` ZIP writer.
- `test/` - `kernel.test.js`, `semver.test.js`, `resolver.test.js`,
  `compat.test.js`, `buildPipeline.test.js`, `cli.test.js` (a real
  child-process CLI invocation), plus a `*-integration.test.js` per feature
  that needs a real `loadLibraries()` call to prove (not just the unit's
  own isolated logic), and dummy fixture libraries/mods `kernel.test.js`
  and `buildPipeline.test.js` load.
- `libs/` - OpenRock's own first-party API-surface libraries (OR-Track B,
  now complete: `@openrock/registries`, `@openrock/capabilities`,
  `@openrock/compat`, `@openrock/config`, `@openrock/events`,
  `@openrock/networking`, `@openrock/datagen`) plus local library dev
  checkouts for anything else.
- `mods/` - local mod dev checkouts (empty for now).
- `vendor/` - git submodules (MinUI, MCLite), pinned to
  `github.com/codex-alchemist-dev/{MinUI,MCLite}`.

## Manifest v2: dependency model (OR-Track A)

A `dependsOn` entry of `type: "library"` can now carry:

```json
"dependsOn": {
  "mclite": { "type": "library", "versionRange": "^1.0.0" },
  "analytics": { "type": "library", "optional": true },
  "debug-overlay": { "type": "library", "soft": true }
}
```

- `versionRange` - an npm-style semver range (`^1.2.3`, `~1.2`, `1.2.x`,
  `>=1.0.0 <2.0.0`, `1.2.3 - 2.3.4`). If the dependency is present but its
  version doesn't satisfy the range, loading throws. Absent means "any
  version is fine."
- `optional` - if the named library isn't in the load set at all, loading
  proceeds and `ctx.dependencies.<name>` is simply `undefined`, instead of
  failing. If it IS present, it's version-checked and wired normally.
- `soft` - load-order-only. The dependency (if present) is guaranteed to
  load first, but the dependent never receives it via `ctx.dependencies` -
  useful for "integrate with X if it happens to be around, but don't
  actually call into it."
- `apiVersion` (OR-Track B2) - a **separate concept from `versionRange`**,
  deliberately its own field: `versionRange` checks the provider's own
  package version (`manifest.version`); `apiVersion` picks which internal
  API *generation* to receive from a provider whose exported API is
  version-keyed (`{ "1.0.0": apiV1, "2.0.0": apiV2 }` - see
  `src/compat.js`), for a provider that keeps an old shape alive alongside
  a new one without its package version needing to track every consumer's
  pinned generation. Resolved per-consumer, so two different mods
  depending on the same library can each get the generation they asked
  for. Absent means "give me the highest exposed generation."

A manifest can also declare, at the top level, arrays of `{name,
versionRange?}` matching Modrinth's real `dependency_type` categories:

- `breaks` - **hard failure** at load time if the named package (matching
  the version range, if given) is present. Use for genuine incompatibility.
- `conflicts` - a **warning**, collected and returned from `loadLibraries()`
  but never thrown - a strong hint, not a hard rule.
- `recommends` / `suggests` - purely advisory. Never evaluated by the
  loader at all; read directly off the manifest by future tooling (a
  registry client, `openrock info`).

All of this is resolved by `src/resolver.js`'s `resolveManifestSet()`,
which runs before `topoSort` - by the time `topoSort` sees the entry list,
every absent optional/soft edge has already been dropped, so its own
"Unknown library dependency" check only ever fires for a genuinely
required-but-missing dependency.

## API surface libraries (OR-Track B)

Fabric/NeoForge-style shared building blocks, each a normal `kind:
"library"` package under `libs/`, loadable by any mod/library via the same
`dependsOn`/`libLoader.js` mechanism as anything else:

- **`@openrock/registries`** (`libs/registries/`) - typed, STRICT registries
  per Bedrock domain (items, custom components, recipes, loot-table
  fragments, or any domain name a caller picks). Unlike `kernel.js`'s own
  `createRegistry()` (which silently overwrites on a duplicate key - the
  right default for hooks), `api.domain(name).register(id, def)` **throws**
  if `id` already exists in that domain - two mods both defining
  `cw:frost_bow` is a genuine content collision, and fails loudly at load
  time instead of one mod's content silently vanishing.
- **`@openrock/capabilities`** (`libs/capabilities/`) - a thin, typed
  convenience layer directly on MCLite (a `"submodule"`-type dependency,
  the first real consumer of `libLoader.js`'s submodule-resolution
  support). `registerCapability(kind, schema)` generates a validator from a
  flat field-name → type schema (`"string"`, `"number"`, `"boolean"`,
  `"object"`, `"any"`, or `"<type>[]"`) and wraps MCLite's
  `registerRecordKind` - "a capability" is just a typed MCLite record kind.
  An explicit `validate()` can still be passed to override the
  schema-generated one for anything the flat schema language can't
  express.
- **`@openrock/compat`** (`libs/compat/`) - the requireable-by-name surface
  of `src/compat.js`'s version-selection logic (`isVersionedApi`,
  `selectApiVersion`), which `libLoader.js` already applies automatically
  to every "library"-type dependency's `apiVersion` field (see "Manifest
  v2" above) - this library is for anything that wants the same resolution
  manually (a debugging tool, a future `openrock info` CLI command).
- **`@openrock/config`** (`libs/config/`) - per-mod configuration, two ways.
  `bakeConfig(modName, overrides)` is the build-time-baked path: merges
  declared defaults with an overrides object (whatever a future build step
  reads from `mod.config.json`) and validates the result, throwing on
  anything invalid rather than silently falling back - `bin/openrock.js`
  (OR-Track F0) exists now, but doesn't yet call `bakeConfig` as part of a
  real build; wiring that in is a CLI change, not a redesign of this
  module. `readRuntimeConfig`/`writeRuntimeConfig` are the runtime-mutable
  path, built directly on `@openrock/capabilities` - real and testable
  today even though the in-game screen for editing it (Track D, or
  OR-Track K's add-ons menu) doesn't exist yet.
- **`@openrock/events`** (`libs/events/`) - a pub/sub layer over Bedrock's
  own `world.beforeEvents`/`afterEvents`. OpenRock makes the ONE real
  `.subscribe()` call per native event (`bindNativeEvent()`, idempotent -
  safe even if two libraries both wire up the same native event); every
  mod/library instead calls `on(eventName, handlerName, fn)` and gets
  fanned out to by `dispatch()`, each handler wrapped in its own try/catch
  so one throwing handler never breaks another's. Handler order is
  registration order, which - since every library's `register()` already
  runs in `libLoader.js`'s topologically-sorted dependency order - is
  dependency-graph order for free. Never imports `@minecraft/server`
  (`bindNativeEvent`'s `subscribeFn` is supplied by the real bootstrap
  code), so it's fully unit-testable.
- **`@openrock/networking`** (`libs/networking/`) - an addressable
  `namespace:channel` request/response API over Bedrock's own
  `/scriptevent` mechanism, with a chunked-JSON-payload convention (a real
  scriptevent message has a length ceiling that's varied across Bedrock
  versions, so any payload is transparently split into fixed-size chunks
  and reassembled before a handler ever sees it). `send()` is
  fire-and-forget; `request()` returns a Promise resolving with the
  responder's return value (or rejecting on timeout);
  `registerHandler(channel, fn)` answers both. **Real bug caught while
  writing its tests, worth knowing about**: since a real scriptevent
  broadcasts to every subscriber *including the sender*, a requester would
  otherwise "answer its own request" (with whatever its own handler for
  that channel returns, or `undefined`) and race that bogus self-answer
  against the real responder's reply - guarded against explicitly (a
  `pending.has(reqId)` check skips a self-broadcast "request" envelope),
  with a regression test locking it in. Never imports `@minecraft/server`
  (`bindTransport({send, subscribe})` is supplied by the real bootstrap
  code).
- **`@openrock/datagen`** (`libs/datagen/`) - Node-side, build-time-only
  typed builders for Bedrock content JSON: `buildShapelessRecipe`,
  `buildShapedRecipe`, `buildFurnaceRecipe`, `buildLootTable`, `buildItem`,
  `buildBlock`. Nothing here runs in-game; `bin/openrock.js` doesn't yet
  call these as part of a real build (a mod's own build script/content
  scripts call them directly today). Deliberately scoped to the common,
  well-documented shapes - not every
  possible recipe/component variant - with structural validation
  (namespaced ids, required fields) on every builder.

**All seven OR-Track B API-surface libraries are now built**: `registries`,
`capabilities`, `compat`, `config`, `events`, `networking`, `datagen`.

## Build pipeline & CLI (OR-Track F0)

`bin/openrock.js build|check|export|deploy|dev|log <modDir>` - a real,
working CLI, generalized from OpenChara's own `tools/lib/build.js` but with
zero character/species/quest-specific logic. Given a mod's
`openrock.mod.json`, it:

1. Resolves the mod's full dependency tree - `"submodule"`-type deps
   against `<modDir>/vendor/`, `"library"`-type deps against OpenRock's own
   bundled `libs/*` by name (`resolveBundledLibraryDirs()`) - and orders
   everything via `libLoader.js`'s own `topoSort` (dependency order, mod
   last), the exact same ordering the runtime kernel uses.
2. For every package in that order (each library, then the mod itself),
   copies its declared `content.bpOverlayDir`/`rpOverlayDir` files into the
   output (with `{{ns}}` filled from that package's own namespace, and
   `fsTree.js`'s `MERGED_FILES` registry-merge for shared files like
   `item_texture.json` - a library's and a mod's own entries both survive),
   and its `content.scriptsDir` files into `scripts/<package>/`.
3. Generates `scripts/main.js` (imports every package's own scripts, in
   dependency order) and a real BP/RP `manifest.json` from the mod's
   `packs`/`version`/`engine` fields.
4. `writeTree()` (also `fsTree.js`) writes the result as a diff - only
   changed files touched, stale ones removed - the same mechanism
   `dev`'s watch loop and `deploy` both rely on.

**A real, load-bearing open question surfaced while building this** (see
`buildPipeline.js`'s own header comment for the full writeup): `scriptsDir`
files are copied as opaque bytes and only ever referenced by a generated
`import` line - this pipeline never requires or executes them. That's
correct for ITS job, but it means OR-Track B's kernel/libLoader/library
system (all plain Node CommonJS, so it's testable with `node test.js`) has
never been shown to actually run inside Minecraft's real script engine,
which only supports ES modules. Whether/how that gets bridged is genuinely
unresolved - OR-Track D/J's problem once OpenChara's real in-game code
actually consumes these libraries, not assumed solved here.

Tested against dummy fixture mods/libraries only
(`test/fixtures/build-lib`, `build-mod`) and via real child-process CLI
invocations producing a genuine `.mcaddon` ZIP - never against real Claude
Waifus, so none of OR-Track F0 carries cutover risk.

### Multi-mod dev mode (OR-Track F1)

`openrock dev` accepts either a single mod directory (the behavior above)
**or a mods folder** - a directory whose immediate subdirectories are each
their own mod (`discoverMods()` in `buildPipeline.js` tells them apart:
does the path itself have an `openrock.mod.json`, or do its children?).
In multi-mod mode:

- Every discovered mod gets its **own independent** watch+debounce+
  redeploy loop - one mod's rebuild failing or being slow never blocks or
  breaks another's.
- `resolver.js`'s `resolveManifestSet()` runs once across the **whole**
  discovered set before anything deploys, so a `breaks` conflict between
  two mods in the same folder is caught immediately, not discovered
  piecemeal later (verified with a real fixture: `mod-b` declaring
  `breaks: [{name: "mod-a"}]` makes `dev` refuse to start at all,
  end to end through a real CLI invocation).

## Resource-pack-only mods (OR-Track G)

A mod with no scripts/behavior at all - a pure texture/asset pack - sets
`"packs": { "behavior": false, "resource": {...} }` instead of the full
`packs.behavior` descriptor object. Every CLI command handles this
correctly: `build`/`deploy`/`export` produce/write/zip only the resource
pack (no behavior pack folder is ever created, not an empty one);
`debug --launch-vscode` refuses outright (there's nothing to attach a
script debugger to); a `dependsOn` entry of type `"library"` is rejected at
validation time (a resource-only mod has no script context to call a
library's API from) - a `"submodule"`-type dependency is still fine, for
sharing raw assets between packs.

`buildMod()` returns `bp: null` (not an empty `Map`) for a resource-only
mod, so callers can tell "genuinely no behavior pack" apart from "an empty
one" at a glance.

## Debugger (OR-Track C)

- **Tier 1, `openrock log <modDir> [--all] [--follow] [--filter=<regex>]`**:
  tails Minecraft's own content log (JSON UI and entity-definition errors
  never surface in-game, only there), scoped to this mod's pack
  folders/namespace by default. `--filter=<regex>` narrows further to a
  caller-chosen pattern, on top of (or with `--all`, instead of) the
  default project scoping - no new protocol work, purely a refinement.
- **Tier 2 Stage 1, `openrock debug <modDir> --launch-vscode
  [--mode=connect|listen]`**: writes a real `.vscode/launch.json` entry for
  Mojang's own official "minecraft-js" VS Code debugger extension - a
  genuine Debug Adapter Protocol client against Minecraft's real built-in
  script debug port, **19144**. Orchestrating the official extension
  (rather than building a DAP client from scratch) is pure glue, and it's
  also the exact source-map wiring OR-Track D2's future TypeScript
  authoring pipeline will need - worth having now even before real `.map`
  files exist. Re-running updates the same config entry (matched by mod
  name) rather than duplicating it.
- **Tier 2 Stage 2** (a minimal in-house terminal DAP client, for working
  without VS Code at all) is explicitly **not attempted** - it needs its
  own dedicated research spike against a real, running Minecraft instance
  to verify the actual wire handshake, which isn't something to guess at
  from documentation alone.

## Submodule workflow

`vendor/minui` and `vendor/mclite` are real git submodules pinned to
`github.com/codex-alchemist-dev/{MinUI,MCLite}` at a specific commit - that
pin is what gives OpenRock actual version tracking, replacing the old
hardcoded relative-path `require()`s this whole ecosystem used before.

MinUI and MCLite are developed against their own standalone checkouts as
usual - `git submodule` doesn't change that. After committing a change in
one of those repos and pushing it, bump OpenRock's pointer to it:

```bash
cd vendor/minui && git checkout main && git pull origin main
cd ../..
git add vendor/minui
git commit -m "Bump minui submodule"
```

It's easy to forget this step - a submodule pointer that isn't bumped
means OpenRock silently keeps using the OLD commit even though the actual
MinUI checkout has moved on. If something in OpenRock behaves like an old
version of MinUI/MCLite, check `git submodule status` first.

## Development

```bash
npm test   # kernel, semver, resolver, buildPipeline, cli, every *-integration.test.js, and every libs/*/test
```

## Contributing

This is a young, actively-evolving project - expect the manifest/kernel
API to keep shifting for a while. Contributions, issues, and questions are
welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the pull request
process and coding conventions (no dependencies, plain CommonJS in
tooling, ESM at the in-game script layer, `node --check` every touched
file before opening a PR).

## License

[MPL-2.0](LICENSE).
