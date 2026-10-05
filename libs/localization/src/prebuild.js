// Pre-build step (async, so it can use the network): when a package opts in
// with `"autoTranslate": true`, bring the catalog in sync and machine-translate
// whatever is missing/stale BEFORE the (synchronous) build reads the catalog.
// Results are cached on disk, so repeat builds make zero provider calls.
"use strict";

const path = require("path");
const { loadProject, syncCatalog, saveCatalog } = require("./project.js");
const { translateMissing, fileCache } = require("./mtl.js");
const { resolveProvider } = require("./providers.js");

async function runLocalizationPrebuild({ locDir, scanDir, log = () => {}, env = process.env }) {
    const project = loadProject(locDir, scanDir);
    if (!project.config.autoTranslate) return { ran: false };
    const langs = project.config.languages ?? [];
    if (langs.length === 0) return { ran: false };

    const before = JSON.stringify(project.catalog);
    syncCatalog(project);
    const provider = resolveProvider(project.config.provider, { baseDir: scanDir, env });
    const glossaryFile = path.join(locDir, "glossary.json");
    const glossary = require("fs").existsSync(glossaryFile) ? JSON.parse(require("fs").readFileSync(glossaryFile, "utf8")) : {};
    const cache = fileCache(path.join(scanDir, ".openrock-cache", "mtl"));

    const results = {};
    for (const lang of langs) {
        results[lang] = await translateMissing({ catalog: project.catalog, lang, provider, cache, glossary });
        const r = results[lang];
        if (r.translated || r.cached || r.failed.length) log(`localization ${lang}: ${r.translated} translated, ${r.cached} cached, ${r.failed.length} failed`);
    }
    if (JSON.stringify(project.catalog) !== before) saveCatalog(project);
    const failed = Object.entries(results).flatMap(([lang, r]) => r.failed.map(f => ({ lang, ...f })));
    return { ran: true, results, failed };
}

module.exports = { runLocalizationPrebuild };
