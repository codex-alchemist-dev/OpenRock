# OpenRock Mod Packager

An open-source library system for Minecraft Bedrock addon development.
Plain JS/Node modules + a manifest.json (no custom DSL) for libraries and
mods.

**Status: OR-Phase 3 (kernel + manifest built and tested; nothing wired to
a real addon yet).** `OpenChara`/`Claude Waifus` keep building via
`node tools/openchara.js <cmd>` exactly as before - this repo has zero
effect on that workflow until OR-Phase 6.

The full phased design (manifest shape, library lifecycle, MClite's
generalized API, submodule wiring, and the migration order with testing
checkpoints for every phase) lives in the project's plan document under
"OpenRock Mod Packager — Phased Implementation Plan". Read that before
touching any phase past this one.

## Target architecture (summary)

- **Library** (`kind: "library"`, e.g. OpenChara): a reusable engine
  layer. Depends only on other libraries/submodules, `provides` an API +
  hook namespaces for others to register into.
- **Mod** (`kind: "mod"`, e.g. Claude Waifus): a leaf content package.
  Depends on a library by name, never `provides` anything, carries the
  engine-facing fields (packs, character, content, rules) that get built
  into a real `.mcaddon`.
- **MinUI** and **MClite** are git submodules under `vendor/`, pinned to a
  commit - real version tracking, replacing today's hardcoded relative
  paths (`../MinUI`, `../OpenChara`).
- **Kernel**: `createRegistry(name, {validate})` generalizes the
  `Map`/register/safe-default/try-catch-and-warn pattern already proven
  twice in OpenChara (`hooks.js`, `conditions.js`). A library's `entry`
  module exports one `register(kernel, ctx)` function, called after every
  dependency has already registered (topological load order, mods last).

## Directory layout

- `bin/openrock.js` - future CLI entry point (unwired until OR-Phase 6).
- `src/kernel.js` - the registry core (`createRegistry`/`createKernel`).
- `src/libLoader.js` - topological load ordering (`topoSort`/`loadLibraries`).
- `src/manifest.js` - manifest schema + validator/resolver.
- `test/` - `kernel.test.js` plus dummy fixture libraries it loads.
- `libs/` - local library dev checkouts (empty for now).
- `mods/` - local mod dev checkouts (empty for now).
- `vendor/` - git submodules (MinUI, MClite).

## Submodule workflow

**Submodule URLs are local paths for now** (`.gitmodules` points at
`../MinUI`/`../MClite`, relative sibling checkouts) - proves the submodule
mechanics work without needing to push either repo's commits to GitHub
first. Before this is real for any other machine/collaborator, repoint
`.gitmodules` at the real GitHub URLs once those repos' current commits
are pushed.

MinUI and MClite are developed against their own standalone checkouts as
usual - `git submodule` doesn't change that. After committing a change in
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

## Development

```bash
npm test   # runs test/kernel.test.js against the dummy fixture libraries
```

## Contributing

This is a young, actively-evolving project - expect the manifest/kernel
API to keep shifting for a while. Contributions, issues, and questions are
welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the pull request
process and coding conventions (no dependencies, plain CommonJS in
tooling, ESM at the in-game script layer, `node --check` every touched
file before opening a PR).

## License

[MIT](LICENSE).
