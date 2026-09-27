# OpenRock Mod Packager

A plugin system for Minecraft Bedrock addon development. Node-based, plain
JS/Node modules + a manifest.json (no custom DSL) for plugins and mods.

**Status: OR-Phase 2 (submodules wired, still unused).** `vendor/minui` and
`vendor/mclite` are real git submodules, pinned to a commit. Nothing in
this repo is wired up to anything real yet - `OpenChara`/`Claude Waifus`
keep building via `node tools/openchara.js <cmd>` exactly as before, this
repo has zero effect on that workflow until OR-Phase 6.

**Submodule URLs are local paths for now** (`.gitmodules` points at
`../MinUI`/`../MClite`, relative sibling checkouts on this machine) -
proves the submodule mechanics work without needing to push either repo's
local commits to GitHub first. Before this becomes real for any other
machine/collaborator, repoint `.gitmodules` at the real GitHub URLs
(`github.com/Cookiesmuch/MinUI`, and MClite's once it exists there) once
those repos' current commits are actually pushed.

The full phased design (manifest shape, plugin lifecycle, MClite's
generalized API, submodule wiring, and the migration order with testing
checkpoints for every phase) lives in the project's plan document under
"OpenRock Mod Packager — Phased Implementation Plan". Read that before
touching any phase past this one.

## Target architecture (summary)

- **Plugin** (`kind: "plugin"`, e.g. OpenChara): a reusable engine layer.
  Depends only on other plugins/submodules, `provides` an API + hook
  namespaces for others to register into.
- **Mod** (`kind: "mod"`, e.g. Claude Waifus): a leaf content package.
  Depends on a plugin by name, never `provides` anything, carries the
  engine-facing fields (packs, character, content, rules) that get built
  into a real `.mcaddon`.
- **MinUI** and **MClite** are git submodules under `vendor/`, pinned to a
  commit - real version tracking, replacing today's hardcoded relative
  paths (`../MinUI`, `../OpenChara`).
- **Kernel**: `createRegistry(name, {validate})` generalizes the
  `Map`/register/safe-default/try-catch-and-warn pattern already proven
  twice in OpenChara (`hooks.js`, `conditions.js`). A plugin's `entry`
  module exports one `register(kernel, ctx)` function, called after every
  dependency has already registered (topological load order, mods last).

## Directory layout

- `bin/openrock.js` - future CLI entry point (unwired until OR-Phase 6).
- `src/kernel.js` - the registry/plugin-loading core (built in OR-Phase 3).
- `src/manifest.js` - manifest schema + validator (built in OR-Phase 3).
- `plugins/` - local plugin dev checkouts (empty for now).
- `mods/` - local mod dev checkouts (empty for now).
- `vendor/` - git submodules (MinUI, MClite - added in OR-Phase 2).

## Submodule workflow

MinUI and MClite are developed against their own standalone checkouts as
today - `git submodule` doesn't change that. After committing a change in
one of those repos, bump OpenRock's pointer to it:

```bash
cd vendor/minui && git pull   # or just commit locally as usual
cd ../..
git add vendor/minui
git commit -m "Bump minui submodule"
```

It's easy to forget this step - a submodule pointer that isn't bumped
means OpenRock silently keeps using the OLD commit even though the actual
MinUI checkout has moved on. If something in OpenRock behaves like an old
version of MinUI/MClite, check `git submodule status` first.
