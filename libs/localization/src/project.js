// A localization "project": the on-disk trio (source .lang, catalog.json,
// localization.json) plus the workflow operations the CLI and prebuild share.
"use strict";

const fs = require("fs");
const path = require("path");
const { parseLang } = require("./langFile.js");
const { createCatalog, reconcile } = require("./catalog.js");
const { extractKeysFromDir } = require("./extract.js");

function readJsonIfExists(file, fallback) {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
}

/**
 * @param {string} locDir the package's content.localization directory
 * @param {string} scanDir directory scanned for used keys (the package root)
 */
function loadProject(locDir, scanDir) {
    const config = readJsonIfExists(path.join(locDir, "localization.json"), {});
    const sourceLang = config.sourceLang ?? "en_US";
    const catalog = readJsonIfExists(path.join(locDir, "catalog.json"), null) ?? createCatalog(sourceLang);
    catalog.sourceLang = sourceLang;
    const sourceFile = path.join(locDir, `${sourceLang}.lang`);
    if (!fs.existsSync(sourceFile)) throw new Error(`localization: ${sourceFile} (the source-language text) doesn't exist`);
    return { locDir, scanDir, config, catalog, sourceTexts: parseLang(fs.readFileSync(sourceFile, "utf8")) };
}

/** Re-scans used keys and reconciles the catalog with the source texts. */
function syncCatalog(project) {
    const { usedKeys, refs } = extractKeysFromDir(project.scanDir);
    const report = reconcile(project.catalog, project.sourceTexts, { refs, usedKeys });
    return report;
}

function saveCatalog(project) {
    const sorted = Object.fromEntries(Object.entries(project.catalog.entries).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(path.join(project.locDir, "catalog.json"), JSON.stringify({ ...project.catalog, entries: sorted }, null, 2) + "\n");
}

module.exports = { loadProject, syncCatalog, saveCatalog };
