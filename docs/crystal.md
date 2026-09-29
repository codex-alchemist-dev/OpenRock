# Crystal

**Crystal** is the real, official name for OpenRock's own family of
LANGUAGES - real, human-authored source formats that compile down into
genuine Minecraft Bedrock output. Crystal names languages specifically,
never a tool or compiler as such: MinUI's own UI compiler stays named
MinUI, not folded into Crystal, since "MinUI" is that system's own real
identity, not a language name. Before Crystal existed, each dialect below
was only referred to by its OR-Track letter in conversation and code
comments - real, working systems with no shared identity of their own.

## Crystal TS

The shared foundation every Crystal Manifest-* dialect below is built on:
a classic JSX pragma over real TypeScript, compiled by real `tsc` (never a
restricted subset), sharing one real compile bridge
(`vendor/minui/src/jsxCompile.js`'s `compileWithRealTsc()`/
`requireCompiled()`, proven first by MinUI's own OR-Track D2 UI compiler)
and one real compile cache (`src/devCache.js`, OR-Track Q6). Crystal TS
itself has no document shape of its own - it's the authoring foundation,
not a dialect. Each Crystal Manifest-* dialect below is "Crystal TS
targeting one specific real Bedrock document shape."

## The real Crystal Manifest dialects (all implemented)

- **Crystal Manifest** (`*.manifest.tsx`, `src/manifestDsl/`, OR-Track O) -
  real Bedrock `manifest.json` documents: `<Header>`, `<Module>`,
  `<Dependency>`, `<Capability>`, `<Metadata>`, `<Setting>`, `<Subpack>`.
  Emission backend:
  [`src/manifestDsl/manifestBuilder.js`](../src/manifestDsl/manifestBuilder.js)
  (declarative, tree-walking - manifest fields have no ordering/allocation
  semantics).
- **Crystal Manifest-Entity** (`*.entity.tsx`, `src/entityDsl/`, OR-Track
  M) - real Bedrock entity documents: `<Entity>`, `<Health>`,
  `<Pathfinding slots={5}/>`, and the rest of the real component
  vocabulary in [`src/entityDsl/components.js`](../src/entityDsl/components.js).
  Emission backend: [`src/entityDsl/entityBuilder.js`](../src/entityDsl/entityBuilder.js)
  (imperative, allocation-ordered - component groups have real ordering/
  tag-bookkeeping semantics across siblings, unlike a plain manifest).
- **Crystal Manifest-Block** (`*.block.tsx`, `src/blockDsl/`, OR-Track M4)
  - real Bedrock block documents: `<Block>`, `<Permutation condition="...">`,
  and a real, confirmed-via-live-docs-fetch component vocabulary
  (`<CollisionBox>`, `<Friction>`, `<LightEmission>`, `<DestructibleByMining>`,
  `<Flammable>`, `<Tick>`, `<Movable>`, and more - see
  [`src/blockDsl/components.js`](../src/blockDsl/components.js)). Emission
  backend: [`src/blockDsl/blockBuilder.js`](../src/blockDsl/blockBuilder.js)
  (declarative - a block's own components have no ordering semantics
  across siblings, same reasoning as Crystal Manifest itself).
  Live-verified: a real `<Block>`-authored block genuinely placed inside a
  real booted BDS instance via OR-Track Q3's own smoke test.
- **Crystal Manifest-Item** (`*.item.tsx`, `src/itemDsl/`, OR-Track M5) -
  real Bedrock item documents: `<Item>`, `<Icon>`, `<Food>`, `<Durability>`,
  `<Wearable>`, `<Digger>`, and more - see
  [`src/itemDsl/components.js`](../src/itemDsl/components.js). Emission
  backend: [`src/itemDsl/itemBuilder.js`](../src/itemDsl/itemBuilder.js)
  (declarative, same reasoning as Crystal Manifest-Block).

Every dialect follows `src/entityDsl/components.js`'s own established
precedent: typed convenience components for the common, real, confirmed
cases, plus a real `<RawComponent type="..." value={...}/>` escape hatch
covering literally any component by its real Bedrock name - nothing is
ever inexpressible just because it lacks a typed wrapper yet.
`src/buildPipeline.js`'s `DIRECTORY_DSLS` table is the one real, shared
piece of plumbing that lets a mod declare `content.entityDsl`/
`content.blockDsl`/`content.itemDsl` and have it compiled, incrementally
rebuilt (OR-Track Q6), and merged into the pack - adding a future Crystal
Manifest-* dialect is a one-line addition to that table, not a
copy-pasted render/classify/cache path.

## Real, physical enforcement: OpenRock cannot compile hand-rolled native Bedrock documents

A standing architectural rule, enforced in code, not just documented:
OpenRock is a genuinely different format from native Minecraft, so it must
be physically impossible to smuggle a hand-authored, native
`entities/*.json`/`entity/*.json`/`blocks/*.json`/`items/*.json` file
through a mod's plain `content.bpOverlayDir`/`rpOverlayDir`, OR through
`content.datagenEntry` (real, arbitrary Node JS is a second real path
that writes documents directly, not just static overlay files) - the
overlay/datagen escape hatch exists for real content NO Crystal dialect
owns yet (textures, sounds, loot tables, recipes, and so on), never for
the exact document shapes a Crystal dialect fully owns.
`src/buildPipeline.js`'s `assertNotNativeOnlyPath()` runs on every real
overlay file AND every real datagenEntry output path, in both the full
build and the incremental `dev`-mode path, and fails the whole build
loudly - naming the real Crystal dialect that owns the document - the
moment a file lands at one of those paths (this also covers a
hand-rolled `manifest.json`, which previously wasn't blocked - it just
silently lost to the real generated one, a confusing footgun rather than
a real bypass, but still worth a loud error). See
[`test/nativeOnlyEnforcement.test.js`](../test/nativeOnlyEnforcement.test.js)
for the real, live proof - including two real bypasses (the datagenEntry
path, and the silent-manifest.json-footgun) a deliberately paranoid
re-audit found and closed AFTER this rule's first real implementation,
not on the first pass. `mods/pathfinding-demo` itself used to hand-roll
its own `rp/entities/*.json` client-visual documents before this rule
existed - migrating it off that (onto Crystal Manifest-Entity's own real
visual props, below) is what actually closed the loophole, and incidentally
fixed a real, latent bug: that hand-rolled overlay used the wrong plural
`entities/` folder name for an RP document, which Bedrock's own real
convention requires singular (`entity/`) - Crystal Manifest-Entity gets
this right by construction now.

## One real OpenRock format, not a BP/RP split - Crystal Manifest-Entity's own RP visual props, and per-subject asset co-location (OR-Track M6)

Native Minecraft splits a mod's content into two separate packs (behavior
and resource) with two separate document shapes for the same real
subject - an entity's BP behavior document and its RP `client_entity`
visual document are two different files, in two different pack trees,
that a mod author has to keep in sync by hand. **OpenRock's own mod format
has no such split for the author** - a real subject (an entity today;
blocks and items are the same real pattern, described below) is authored
as ONE real directory, and OpenRock's own compiler is responsible for
producing whichever real Bedrock-side documents that subject needs, BP
and RP alike.

Concretely, for Crystal Manifest-Entity today:

- `<Entity>` accepts real RP visual props directly - `materials`,
  `textures`, `geometry`, `renderControllers`, `spawnEgg`,
  `enableAttachables`, `hideArmor` - and `entityBuilder.js`'s
  `buildClientEntityDoc()` produces a real `minecraft:client_entity`
  document from them, alongside the BP behavior document, from the exact
  same `<Entity>` node. No RP document at all is produced if none of these
  props are given - a real, deliberate choice (a summon-only helper entity
  with no client presence), never a hand-authored fallback.
- **Per-subject asset co-location**: a real sibling directory named
  exactly after the entity's own short name (e.g. `critter/` next to
  `critter.entity.tsx`) can hold that entity's own real texture files -
  its ENTIRE contents are copied verbatim into the real Bedrock RP path
  `textures/entity/<shortName>/`. This already covers real Vibrant Visuals
  PBR sets for free: Bedrock's own real PBR convention is sibling files at
  the same base path (`critter.png`, `critter_normal.png`,
  `critter_mer.png`, `critter_heightmap.png`) - genuinely "one real folder
  holds everything for that subject" once you look at Bedrock's own actual
  file layout, which is exactly what OpenRock's own per-subject folder
  convention mirrors. If the author didn't already give `textures`
  explicitly, and a file matching the entity's own short name exists in
  that folder, `textures.default` is auto-derived (the real Bedrock
  convention of referencing the path WITHOUT its extension) - an author
  never hand-writes a Bedrock RP path string. An explicit `textures` prop
  always wins over auto-derivation. See
  [`test/entityDslAssets.test.js`](../test/entityDslAssets.test.js) for the
  real proof (including a real, live end-to-end build whose texture bytes
  were confirmed byte-identical in the real built output).

**Real, honest scope of what's built vs. genuinely next** (not "someday
maybe" - this is the direct continuation of the same real feature):
Crystal Manifest-Entity's asset co-location covers real texture files
today. Extending the identical real pattern to Crystal Manifest-Block and
Crystal Manifest-Item (their own per-subject asset folders, e.g.
`textures/blocks/<shortName>/`, `textures/items/<shortName>/`), and real
embedded geometry/model authoring (today, `geometry`/`Geometry` only
*reference* an existing Bedrock geometry identifier by name - a mod can't
yet ship its own custom `.geo.json` model file through the DSL directly,
only through a real `bpOverlayDir`/`rpOverlayDir` overlay, which is NOT
blocked by the native-only enforcement above since no Crystal dialect owns
model files yet) are the next real slices of this same feature, not a
separate, lower-priority track.

## Crystal JS

Real, genuinely importable OpenRock library code (OR-Track N) compiled,
alongside a mod's own script entry, into one real Minecraft-native JS
bundle via the shared `esbuild` backend (`src/buildPipeline.js`'s
`bundleScripts()`). This is the actual, working half of demand 2's "same
compiler...compiles JS that uses OpenRock functions into JS that is
minecraft-native" - not a new syntax, a real compiled-output guarantee for
ordinary TypeScript/JavaScript already using `@openrock/*` package names.

## Why keep the existing file extensions

`.entity.tsx`/`.manifest.tsx`/`.block.tsx`/`.item.tsx` all stay exactly as
they are - Crystal is a name for the language family, not a mandate to
invent new file extensions or a custom syntax highlighter. This mirrors
real precedent: Vue's own Single-File Components are still just `.vue`
even though "Vue SFC" is its own named thing, and a JSX file authored
against React is still `.tsx` despite "JSX" having its own name. Renaming
file extensions here would be a real, risky, purely cosmetic change to
every existing Crystal source file and every compiler's own file-
discovery glob (`entityCompiler.js`'s `/\.entity\.tsx?$/`,
`manifestCompiler.js`'s `/\.manifest\.tsx?$/`, `blockCompiler.js`'s
`/\.block\.tsx?$/`, `itemCompiler.js`'s `/\.item\.tsx?$/`) for zero real
functional benefit - the name lives in documentation and conversation,
not in a file's own suffix.

## OR-Track P's multi-frontend contract, in Crystal terms

[`docs/multi-frontend.md`](./multi-frontend.md)'s `FrontendAdapter`
contract is what a future NON-Crystal-JS frontend (a GDScript-like
language, a Kotlin-to-JS target) would implement - Crystal JS itself is
squarely inside the existing TS/JS frontend the multi-frontend document
describes, not a second, competing pipeline. A future Kotlin/GDScript
frontend and Crystal JS both ultimately hand off to the same real
`bundleScripts()` backend.
