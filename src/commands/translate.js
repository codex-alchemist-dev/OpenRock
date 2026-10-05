// `openrock translate <extract|status|export|import|mtl|check> [modDir]`
// Thin CLI over @openrock/localization. Flags: --lang=xx_XX, --out=<file>,
// --file=<file>, --json. The package must declare content.localization.
"use strict";

const fs = require("fs");
const path = require("path");
const { loadManifestFile } = require("../manifest.js");
const loc = require("../../libs/localization/src/register.js");

const SUBCOMMANDS = ["extract", "status", "export", "import", "mtl", "check"];

const flagValue = (flags, name) => flags.find(f => f.startsWith(`--${name}=`))?.slice(name.length + 3);

function openProject(modDir) {
    const { manifest, dir } = loadManifestFile(modDir);
    const rel = manifest.content?.localization;
    if (!rel) throw new Error(`"${manifest.name}" doesn't declare content.localization - add it to openrock.mod.json (a directory holding <lang>.lang)`);
    const project = loc.loadProject(path.resolve(dir, rel), dir);
    const langs = loc.collectLangs(project.catalog, project.config);
    return { manifest, project, langs };
}

async function cmdTranslate(sub, modDir, flags = []) {
    if (!SUBCOMMANDS.includes(sub)) throw new Error(`Usage: openrock translate <${SUBCOMMANDS.join("|")}> [modDir]`);
    const json = flags.includes("--json");
    const { project, langs } = openProject(modDir);
    const say = text => { if (!json) console.log(text); };
    let report = { ok: true };

    switch (sub) {
        case "extract": {
            const r = loc.syncCatalog(project);
            loc.saveCatalog(project);
            report = { ok: r.undefinedKeys.length === 0, ...r };
            say(`catalog synced: +${r.added.length} added, ${r.changed.length} changed, ${r.orphaned.length} orphaned, ${r.revived.length} revived`);
            if (r.undefinedKeys.length) say(`USED BUT NOT DEFINED in ${project.catalog.sourceLang}.lang: ${r.undefinedKeys.join(", ")}`);
            break;
        }
        case "status": {
            loc.syncCatalog(project);
            report = { ok: true, languages: loc.summarize(project.catalog, langs) };
            for (const [l, c] of Object.entries(report.languages)) say(`${l}: ${c.reviewed} reviewed, ${c.machine} machine, ${c.stale} stale, ${c.missing} missing (of ${c.total})`);
            break;
        }
        case "export": {
            loc.syncCatalog(project);
            const out = path.resolve(flagValue(flags, "out") ?? path.join(project.locDir, "translations.csv"));
            fs.writeFileSync(out, loc.toCsv(loc.catalogToRows(project.catalog, langs)));
            report = { ok: true, out };
            say(`wrote ${out}`);
            break;
        }
        case "import": {
            const file = path.resolve(flagValue(flags, "file") ?? path.join(project.locDir, "translations.csv"));
            const r = loc.importRows(project.catalog, loc.parseCsv(fs.readFileSync(file, "utf8")));
            loc.saveCatalog(project);
            report = { ok: r.skipped.length === 0, applied: r.applied, skipped: r.skipped };
            say(`imported ${r.applied} translations from ${file}`);
            for (const s of r.skipped) say(`SKIPPED ${s.key} [${s.lang}]: ${s.reason}`);
            break;
        }
        case "mtl": {
            loc.syncCatalog(project);
            const only = flagValue(flags, "lang");
            const targets = only ? [only] : langs;
            if (targets.length === 0) throw new Error("no target languages - set \"languages\" in localization.json or pass --lang=xx_XX");
            const provider = loc.resolveProvider(project.config.provider, { baseDir: project.scanDir });
            const glossaryFile = path.join(project.locDir, "glossary.json");
            const glossary = fs.existsSync(glossaryFile) ? JSON.parse(fs.readFileSync(glossaryFile, "utf8")) : {};
            const cache = loc.fileCache(path.join(project.scanDir, ".openrock-cache", "mtl"));
            report = { ok: true, languages: {} };
            for (const lang of targets) {
                const r = await loc.translateMissing({ catalog: project.catalog, lang, provider, cache, glossary });
                report.languages[lang] = r;
                if (r.failed.length) report.ok = false;
                say(`${lang}: ${r.translated} translated, ${r.cached} cached, ${r.failed.length} failed`);
                for (const f of r.failed) say(`  FAILED ${f.key}: ${f.reason}`);
            }
            loc.saveCatalog(project);
            break;
        }
        case "check": {
            const r = loc.syncCatalog(project);
            const problems = [];
            if (r.undefinedKeys.length) problems.push({ kind: "undefined-key", keys: r.undefinedKeys });
            for (const lang of langs) {
                const bad = [];
                for (const [key, e] of Object.entries(project.catalog.entries)) {
                    if (e.orphaned) continue;
                    const t = e.translations[lang];
                    if (t && !loc.comparePlaceholders(e.source, t.text).ok) bad.push(key);
                }
                if (bad.length) problems.push({ kind: "placeholder-mismatch", lang, keys: bad });
            }
            const summary = loc.summarize(project.catalog, langs);
            const incomplete = Object.entries(summary).filter(([, c]) => c.missing > 0);
            if (flags.includes("--strict")) for (const [lang, c] of incomplete) problems.push({ kind: "missing-translations", lang, count: c.missing });
            report = { ok: problems.length === 0, problems };
            for (const p of problems) say(`${p.kind}${p.lang ? " [" + p.lang + "]" : ""}: ${p.keys ? p.keys.join(", ") : p.count}`);
            if (report.ok) say("localization check passed");
            break;
        }
    }
    if (json) console.log(JSON.stringify(report));
    if (report.ok === false) process.exitCode = 1;
    return report;
}

module.exports = { cmdTranslate, SUBCOMMANDS };
