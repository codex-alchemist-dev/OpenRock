# OpenRock Mod Packager

An open-source library system for Minecraft Bedrock addon development.
Plain JS/Node modules + a manifest.json (no custom DSL) for libraries and
mods.

**Status: OR-Phase 0-4 done, OR-Track A (manifest & dependency model v2)
done. Nothing wired to a real addon yet.** `OpenChara`/`Claude Waifus` keep
building via `node tools/openchara.js <cmd>` exactly as before - this repo
has zero effect on that workflow until OR-Track F0 (the real CLI) and
OR-Track J (the actual cutover).

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

- `bin/openrock.js` - future CLI entry point (unwired until OR-Track F0).
- `src/kernel.js` - the registry core (`createRegistry`/`createKernel`).
- `src/libLoader.js` - topological load ordering (`topoSort`/`loadLibraries`).
- `src/manifest.js` - manifest schema + validator.
- `src/resolver.js` - version/breaks/conflicts resolution across a whole
  load set, run before `topoSort` (OR-Track A3).
- `src/semver.js` - a scoped-down, dependency-free semver range
  implementation (`^`, `~`, x-ranges, hyphen ranges, comparators; no `||`
  alternative-set support - see the file header).
- `test/` - `kernel.test.js`, `semver.test.js`, `resolver.test.js`, plus
  dummy fixture libraries `kernel.test.js` loads.
- `libs/` - local library dev checkouts (empty for now).
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
npm test   # runs kernel.test.js, semver.test.js, and resolver.test.js
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
