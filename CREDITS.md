# Credits

External projects and research this codebase draws on, and exactly what
was taken from each - see [AUTHORS.md](AUTHORS.md) for the people behind
OpenRock itself.

## Modrinth (dependency model)

Modrinth's real `dependency_type` categories (`required`/`optional`/
`incompatible`/`embedded`) shaped OpenRock's own `dependsOn`
`optional`/`soft` flags and the top-level `breaks`/`conflicts`/
`recommends`/`suggests` arrays (`src/resolver.js`, `src/manifest.js`).
Adapted to OpenRock's own vocabulary, not a copy of Modrinth's code or API.

## Mojang's `minecraft-debugger` (MIT)

<https://github.com/Mojang/minecraft-debugger> - the real, official Debug
Adapter Protocol client against Minecraft's built-in script debug port,
**19144**. `openrock debug --launch-vscode` (OR-Track C2 Stage 1)
orchestrates Mojang's own "minecraft-js" VS Code extension rather than
reimplementing a DAP client, generating the exact `launch.json` shape that
extension expects. Credited for the port number and launch-config
convention; no code copied.

## bedrock-core/ui, EasyUIBuilder, mcbejsonuimasterAI

Research grounding for OR-Track D (MinUI v2) and the container-screen
fixes that originated this whole expansion - see MinUI's own `CREDITS.md`
for the actual code/design credit, since that's where those findings are
applied. Referenced here for completeness since OR-Track D is part of the
same roadmap.

## Fedora Silverblue / OSTree

The atomic-deployment terminology and model (`deployment 0/1`, `pin`,
`rollback`, `status`) - see MCLite's own `CREDITS.md`, since MCLite is
where that pattern is actually implemented.

## SQLite

Naming/conceptual inspiration for MCLite's `query`/`VACUUM`/`ATTACH`/
`PRAGMA integrity_check` analogs - see MCLite's own `CREDITS.md`.
