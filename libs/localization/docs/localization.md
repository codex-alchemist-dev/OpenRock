# @openrock/localization — game localization for Minecraft mods

A complete localization system for Bedrock mods: catalog-based translation workflow, machine translation pipeline, spreadsheet round-trip editing, and per-player language overrides.

## Manifest

```json
{
  "dependencies": ["@openrock/i18n"],
  "content": { "localization": "lang" },
  "scripts": {
    "runtime": true,
    "buildTime": true,
    "external": [
      { "name": "mtl-provider", "path": "src/providers/*.js", "runs": "build", "why": "optional HTTP translation API adapters" }
    ]
  }
}
```

## Source text and catalog

Store source-language text (human-authored) in a .lang file matching Minecraft format:

```
# lang/en_US.lang
ui.title=Hello, %s!
ui.button.ok=OK
menu.goodbye=Goodbye
```

When you build, extract discovers all {t:key} uses in templates and scripts, then syncCatalog reconciles with source text:

```bash
openrock translate extract
openrock translate status
```

Output: per-language .lang files and a catalog.json holding translation state and metadata.

**Catalog structure:**

```json
{
  "version": 1,
  "sourceLang": "en_US",
  "entries": {
    "ui.title": {
      "source": "Hello, %s!",
      "sourceHash": "abc123def4",
      "context": "screen title",
      "refs": ["MinUI/screens/home.ui.html:42"],
      "orphaned": false,
      "translations": {
        "es_ES": { "text": "Hola, %s!", "status": "reviewed", "from": "abc123def4" },
        "fr_FR": { "text": "Bonjour, %s!", "status": "machine", "from": "abc123def4" }
      }
    }
  }
}
```

**Status values:**

- source: placeholder, untranslated
- machine: translated by MTL, never reviewed
- reviewed: human-approved translation
- stale: source text changed since translation was made (derived at runtime from from vs sourceHash)

## Workflow

### Step 1: Extract keys

```bash
openrock translate extract
```

Scans the mod and updates the catalog with new keys, marks source changes as stale.

### Step 2: Export to spreadsheet

```bash
openrock translate export [--out=file.csv]
```

Creates a CSV with columns: key, context, source, [per-language columns], status, notes.

Edit in your spreadsheet tool:
- Locked columns: key, source (cannot edit)
- Translation columns: enter translated text
- Status column: leave empty or set to "reviewed" to approve

### Step 3: Import from spreadsheet

```bash
openrock translate import [--file=file.csv]
```

Merges edited rows back into the catalog:
- New translations marked as reviewed (human input)
- Placeholder count validated (rejects mismatches)
- Source edits ignored (cannot edit locked columns)
- Never downgrades reviewed status to machine

### Step 4: Machine translation (optional)

```bash
openrock translate mtl [--lang=es_ES]
```

Translates missing and stale keys using a pluggable provider (Claude, DeepL, LibreTranslate):

```json
{
  "provider": "claude",
  "batchSize": 20,
  "autoTranslate": true
}
```

Set autoTranslate: true in localization.json to run MTL at build time.

**Environment variables:**

- ANTHROPIC_API_KEY — Claude provider (default model: claude-haiku-4-5-20251001)
- OPENROCK_MTL_MODEL — override default Claude model
- DEEPL_API_KEY — DeepL provider (auto-detects free vs paid by :fx suffix)
- LIBRETRANSLATE_URL — LibreTranslate endpoint
- LIBRETRANSLATE_API_KEY — optional API key

Results are marked machine and cached in .openrock-cache/mtl/ so rebuilds are offline and deterministic.

### Step 5: Validate

```bash
openrock translate check [--strict]
```

Verifies:
- All used keys are defined
- Placeholder counts match (e.g., %s markers)
- Optional: no missing translations (with --strict)

## Glossary (MTL control)

Do-not-translate terms and forced translations live in lang/glossary.json:

```json
{
  "doNotTranslate": ["OpenChara", "Bedrock"],
  "terms": {
    "es_ES": {
      "hello": "hola",
      "you": "tu"
    }
  }
}
```

CLI:

```bash
openrock translate glossary --action=list
openrock translate glossary --action=add-term --arg1=OpenChara
openrock translate glossary --action=set --arg1=es_ES --arg2=hello --arg3=hola
openrock translate glossary --action=remove --arg1=es_ES --arg2=hello
```

## Runtime: Per-player language override

By default, screens show text in the game language. Players can override:

```javascript
import { setPlayerLanguage, getPlayerLanguage, translate } from "@openrock/i18n";

setPlayerLanguage(player, "es_ES");          // player sees Spanish
const lang = getPlayerLanguage(player);      // "es_ES" or null
const text = translate("es_ES", "ui.title", ["Alice"]);
```

**Handling tab labels:** Tab label attributes are currently resolved by the game language (not per-player override). Use the runtime helper:

```javascript
import { resolveTabLabel } from "@openrock/localization";

const label = resolveTabLabel(player, "tab.skills", i18nModule);
```

Or filter a screen object before display:

```javascript
import { applyPlayerLanguageFilter } from "@openrock/localization";

const screenWithOverrides = applyPlayerLanguageFilter(screenData, player, i18nModule);
```

## API reference

All functions are exported from @openrock/localization.

### Catalog

- createCatalog(sourceLang) -> catalog
- reconcile(catalog, sourceTexts, {refs?, usedKeys?, contexts?}) -> {added, changed, orphaned, revived, undefinedKeys}
- statusOf(entry, lang) -> "missing" | "stale" | "machine" | "reviewed"
- setTranslation(catalog, key, lang, text, status) -> bool
- saveCatalog(project), loadCatalog(project)
- summarize(catalog, langs) -> {[lang]: {total, reviewed, machine, stale, missing}}

### Extraction

- extractPlaceholders(text) -> string[] (format specs, slots, keys, color codes)
- comparePlaceholders(source, text) -> {ok, missing[], extra[]}
- mask(text, doNotTranslate) -> {masked, tokens}
- unmask(text, tokens) -> {ok, text}

### Sheets (CSV/XLSX)

- parseCsv(text) -> string[][]
- toCsv(rows) -> string
- readCsv(filePath) -> {catalog, languages}
- writeCsv(filePath, catalog, languages)
- readXlsx(filePath) -> Promise<{catalog, languages}>
- writeXlsx(filePath, catalog, languages) -> Promise
- catalogToRows(catalog, languages) -> string[][]
- importRows(catalog, rows) -> {applied, skipped[]}

### Machine translation

- registerProvider(id, factory) — register a provider
- resolveProvider(config, {baseDir}) -> provider instance
- memoryCache(), fileCache(dir) — cache backends
- translateMissing({catalog, lang, provider, cache, glossary, batchSize, onlyKeys}) -> Promise<{translated, cached, failed[]}>

### Glossary

- loadGlossary(filePath) -> {doNotTranslate, terms}
- saveGlossary(filePath, glossary)
- addDoNotTranslate(glossary, term), removeDoNotTranslate(...)
- setForcedTerm(glossary, lang, original, translation), removeForcedTerm(...)
- listDoNotTranslate(glossary), listForcedTerms(glossary, lang)

### Runtime (per-player)

- resolveTabLabel(player, key, langModule, args) -> string
- applyPlayerLanguageFilter(object, player, langModule) -> filtered object

### Lang files

- parseLang(text) -> Map<key, value>
- serializeLang(map) -> string
- formatMessage(text, args) — apply %s placeholders

### Building

- syncCatalog(project) — reconcile with source files
- loadProject(locDir, modDir) -> {catalog, config, locDir, scanDir}
- collectLangs(catalog, config) -> lang IDs

### Providers

Built-in HTTP adapters:

- **Claude** (claude): ANTHROPIC_API_KEY, OPENROCK_MTL_MODEL
- **DeepL** (deepl): DEEPL_API_KEY (auto-detects free vs paid)
- **LibreTranslate** (libretranslate): LIBRETRANSLATE_URL, LIBRETRANSLATE_API_KEY

Each provider is a factory: (env) -> {id, translate(items, from, to) -> Promise<Map>}.

## Example: a full localization workflow

**1. Create source text**

```
# lang/en_US.lang
greet.hello=Hello, %s!
greet.goodbye=Goodbye, %s!
```

**2. Use in UI**

```html
<label text="{t:greet.hello:Alice}" />
```

**3. Extract and sync**

```bash
openrock translate extract
# Outputs: catalog synced: +2 added
```

**4. Export and translate**

```bash
openrock translate export
# Edit translations.csv in your spreadsheet tool
openrock translate import
```

**5. Run MTL for missing**

```bash
ANTHROPIC_API_KEY=sk-... openrock translate mtl --lang=es_ES
# es_ES: 2 translated, 0 cached, 0 failed
```

**6. Verify**

```bash
openrock translate check --strict
# localization check passed
```

**7. Build**

```bash
openrock build
# Generates lang/<lang>.lang files and lang.generated.js for runtime overrides
```

**8. Runtime**

```javascript
// Player can now switch language:
import { setPlayerLanguage } from "@openrock/i18n";
setPlayerLanguage(player, "es_ES");
// Next screen shows Spanish text
```
