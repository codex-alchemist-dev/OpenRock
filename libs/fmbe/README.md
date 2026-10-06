# @openrock/fmbe

Fox MBE display entities for OpenRock: show any block or item (modded included) with its real model and texture using only
vanilla content, scale/rotate/move/tween it with client-side animations, assemble displays into groups, and describe whole
scenes in a small DSL. Full documentation: [docs/fmbe.md](../../docs/fmbe.md).

- `scripts/fmbe/*.cjs` - pure core (wiki command systems, spec, commands, easing, tweens, rotation matrices, Molang interpreter)
- `scripts/fmbe/runtime/` - in-world runtime (spawn queue, upkeep, orphan sweep, groups, scenes, block copy)
- `src/register.js` - build-time API for tooling
- `tools/bds-verify.mjs` - replays every generated command through a real Bedrock Dedicated Server

Tests: `node test/core.test.mjs && node test/runtime.test.mjs` (and `node test/fmbeDsl.test.js` in OpenRock for the DSL).
