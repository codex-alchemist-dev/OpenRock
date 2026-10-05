# OpenRock first-party libraries

Libraries are general mechanisms, never game policy: consuming mods (OpenChara, Claude Waifus) supply rules via registries/hooks. Scaffold new ones with `openrock scaffold <name> --deps=a,b --hooks=x --api=fnA,fnB --desc=... [--runtime]`.

Stubs (every API function throws "not implemented" until built) are marked **stub**.

| Package | Status | Purpose |
|---|---|---|
| @openrock/abilities | stub | Cooldowns, resource meters, charge triggers and an ability registry with activation hooks. No preset abilities. |
| @openrock/audio | stub | Sound/music director: playlists, crossfade by state/region, ducking during cinema/dialogue. |
| @openrock/behavior | stub | Behavior-tree / utility-AI runner for scripted entities; nodes registered by the mod. |
| @openrock/capabilities | implemented | A thin, typed convenience layer directly on MCLite - a capability is just a typed MCLite record kind, so a mod declares a shape once and gets a real, checksum-checked, atomically-written record kind for free. |
| @openrock/cinema | implemented | Crystal Cinema runtime: plays compiled .cinema timelines with guaranteed cleanup, skip, and multi-session isolation. Bedrock access is injected via op handlers. |
| @openrock/compat | implemented | Version-selection for a library whose exported API is keyed by version - a provider exposing a version-keyed API object resolves per-consumer against that consumer own declared apiVersion range. |
| @openrock/config | implemented | Per-mod configuration, build-time-baked (bakeConfig) and runtime-mutable (readRuntimeConfig/writeRuntimeConfig via Capabilities), both validated against one declared schema. |
| @openrock/counters | stub | Sharded two-level counters (category -> subject) with size accounting vs the 32KB property limit and batched flush. |
| @openrock/datagen | implemented | Node-side, build-time-only typed builders for Bedrock content JSON (recipes, loot tables, items, blocks) - generate this JSON from typed calls instead of hand-writing it. |
| @openrock/debug | stub | In-game debug overlay: per-subsystem tick cost, entity counts, property sizes vs limits. |
| @openrock/dialogue | stub | Branching conversation engine with a .dialogue text DSL; conditions/actions registered by the mod. |
| @openrock/economy | stub | Currencies, audited transactions, and trade/price-table primitives. |
| @openrock/entity-safety | implemented | Safe wrappers for three real, previously-reproduced Bedrock timing/bounds traps: early-execution-unsafe world calls, dimension-change event location drift, and per-dimension Y-bounds clamping. |
| @openrock/events | implemented | A pub/sub layer over Bedrock's own world.beforeEvents/afterEvents - OpenRock makes the one real .subscribe() call per native event and fans out to every registered handler, each isolated by its own try/catch. |
| @openrock/formation | implemented | Terrain-aware slot-descriptor resolution with anti-jank hysteresis - a slot is a descriptor resolved fresh against real terrain, never a literal fixed coordinate, and a candidate only wins by a real scoring margin. |
| @openrock/fx | stub | Named effect recipes (particle + sound + animation sequences) shared by cinema and abilities. |
| @openrock/help | stub | In-game docs/tutorial pages from markdown: searchable and localized. |
| @openrock/i18n | implemented | A real Bedrock RawMessage/per-player-override translation mechanism - the client localizes text itself in its own game language by default, with a per-player literal-table override for languages Bedrock doesn't ship natively. |
| @openrock/input | stub | Unified keybind/controller/touch abstraction over inputInfo for custom modes. |
| @openrock/inventory-serialization | implemented | Round-trips a real Bedrock ItemStack (durability, enchantments, name, lore) to/from plain JSON, since ItemStack objects can't be stored directly as dynamic-property data. |
| @openrock/localization | implemented | Localization toolkit: string catalog with stale tracking, placeholder-safe machine translation with a pluggable provider contract, spreadsheet (CSV) round-trip, and .lang emission for the declarative UI. |
| @openrock/loot | stub | Weighted/conditional loot tables beyond vanilla, with pity and per-subject seeds; datagen emitter. |
| @openrock/molang-safe | implemented | A validated Molang-expression builder encoding real, in-game-confirmed client-crashing patterns (no >=, no bare '', no division on a string-typed property) as both a validator and safe builder functions. |
| @openrock/networking | implemented | A scriptevent-based request/response API over Bedrock's real scriptevent mechanism, with chunking for payloads over the real scriptevent size limit and a timeout-based request() helper. |
| @openrock/notify | stub | Toast/action-bar/title queue with priorities and dedupe; localization-aware. |
| @openrock/pathfinding | implemented | The real, hard-won answer to Bedrock native pathfinder having no query API - a proven follow_mob + tag-filtered slot-pool technique for real native pathfinding to an arbitrary coordinate. |
| @openrock/perception | implemented | Line-of-sight plus decaying threat memory - losing sight of a threat means investigate the last-known spot, never instant omniscience or instant amnesia. |
| @openrock/permissions | implemented | OP-check plus a stored, MCLite-backed, salted-and-hashed password gate - never plaintext, never a one-off reimplementation per mod. |
| @openrock/progression | stub | Generic named values, xp curves and prerequisite/cost unlock graphs; derived values from registered formulas. No built-in stats. |
| @openrock/quests | stub | Generic objective/state-machine engine; objective and reward types registered by the mod; per-subject state. |
| @openrock/registries | implemented | Typed, STRICT per-domain registries for Bedrock content (items, custom components, recipes, loot-table fragments) - a duplicate id fails loudly at load time instead of one mod silently overwriting another's content. |
| @openrock/relations | stub | Open-ended pairwise relationship tracks between any two ids; track names and growth rules defined by the mod. |
| @openrock/route-analysis | implemented | Escape-route detection and blocker assignment, reusing Terrain's bounded flood-fill - a room's exits and a target's flee routes are literally the same computation, re-centered. |
| @openrock/saves | stub | A/B-slot copy-validate-commit persistence with checksums, mirror recovery and soft-delete windows, generic over record kinds. |
| @openrock/scan-scheduler | implemented | The tiered active/idle/dormant update-rate discipline this project has already been burned by not following once - nothing should tick unconditionally every game tick regardless of whether anyone is nearby. |
| @openrock/schedule | stub | Time-of-day/calendar task scheduler for any subjects with catch-up semantics for unloaded chunks. |
| @openrock/teams | stub | Generic team ARCHITECTURE: nested membership graph over any ids; all policy (caps, captains, invites, friendly fire) is opt-in via rules/hooks. |
| @openrock/terrain | implemented | Bounded flood-fill, choke-point detection, and room-safety coverage tracking - Bedrock has no native concept of a room, a connected area, or a choke point, so this fills that real gap. |
| @openrock/test | stub | Reusable BDS harness: spawn-all/place-all/use-all driver and content-log error collector, generalizing OR-Track Q. |
| @openrock/waypoints | stub | Markers, HUD pointers and an optional travel graph. |
