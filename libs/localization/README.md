# @openrock/localization

General-purpose localization toolkit for OpenRock mods and the MinUI declarative UI.

- **Source text** lives in `<dir>/en_US.lang` (human-authored). Declare the directory with `content.localization` in `openrock.mod.json`.
- **Catalog** (`catalog.json`, generated) stores per-language translations and the source hash each was made from. "Stale" is derived, never stored.
- **Extraction**: `{t:key}` markers (UI, `.cinema`, `.dialogue`) and `translate("key")` calls are scanned from the package; used-but-undefined keys are reported.
- **Spreadsheet**: `openrock translate export` / `import` round-trip CSV (`key, context, source, <lang>, <lang>:status`). Edited cells become `reviewed`; placeholder-breaking cells are rejected.
- **MTL**: pluggable providers (`{ id, translate(items, from, to) }`), placeholder + glossary masking with verification, content-hash cache (`.openrock-cache/mtl/`), machine output never overwrites a current reviewed string. Set `"autoTranslate": true`, `"languages": [...]`, `"provider"` in `localization.json` to translate automatically before build/check/export/deploy/dev.
- **Output**: `texts/<lang>.lang` + `texts/languages.json` in both packs (resource-pack-only mods included).

CLI: `openrock translate <extract|status|export|import|mtl|check> [modDir]`.

`localization.json`: `{ "sourceLang": "en_US", "languages": ["es_ES"], "autoTranslate": false, "provider": "name" | { "module": "./provider.js" } }`.
Credentials come from environment variables read by the provider, never from config.
