// Manifest "scripts" declaration: lets a package say, in its own manifest,
// whether it ships in-world scripts, runs Node at build time, and which
// "external" scripts (beyond declarative content) a user/GUI should be told
// about. Pure functions only - no filesystem access except the one explicit
// checkExternalScriptFiles(), so validateManifest() stays side-effect free.
"use strict";

const fs = require("fs");
const path = require("path");

const VALID_RUNS = ["runtime", "build"];

/** What a manifest's real content/provides fields imply, ignoring any "scripts" declaration. */
function deriveScriptFacts(manifest) {
    const c = manifest.content ?? {};
    return {
        runtime: Boolean(c.scriptsDir || manifest.provides?.api),
        buildTime: Boolean(c.datagenEntry),
    };
}

/** Structural + consistency validation of manifest.scripts. Throws on the first problem. */
function validateScripts(manifest) {
    const s = manifest.scripts;
    if (s === undefined) return;
    const where = `${manifest.kind} manifest "${manifest.name}"`;
    if (!s || typeof s !== "object" || Array.isArray(s)) throw new Error(`${where}: "scripts" must be an object`);
    for (const flag of ["runtime", "buildTime"]) {
        if (s[flag] !== undefined && typeof s[flag] !== "boolean") throw new Error(`${where}: scripts.${flag} must be a boolean`);
    }
    if (s.external !== undefined && !Array.isArray(s.external)) throw new Error(`${where}: scripts.external must be an array`);
    const external = s.external ?? [];
    external.forEach((entry, i) => {
        const at = `${where}: scripts.external[${i}]`;
        if (!entry || typeof entry !== "object") throw new Error(`${at} must be an object`);
        if (typeof entry.name !== "string" || !entry.name) throw new Error(`${at}.name is required`);
        if (typeof entry.path !== "string" || !entry.path) throw new Error(`${at}.path is required`);
        if (!VALID_RUNS.includes(entry.runs)) throw new Error(`${at}.runs must be one of ${VALID_RUNS.join("/")}, got ${JSON.stringify(entry.runs)}`);
        if (entry.why !== undefined && typeof entry.why !== "string") throw new Error(`${at}.why must be a string`);
    });

    const facts = deriveScriptFacts(manifest);
    const declaredRuntime = s.runtime ?? facts.runtime;
    const declaredBuild = s.buildTime ?? facts.buildTime;
    const externalRuns = new Set(external.map(e => e.runs));

    if (s.runtime === false && facts.runtime) throw new Error(`${where}: scripts.runtime is false but the manifest ships in-world scripts (content.scriptsDir or provides.api is set)`);
    if (s.buildTime === false && facts.buildTime) throw new Error(`${where}: scripts.buildTime is false but content.datagenEntry runs Node at build time`);
    if (s.runtime === true && !facts.runtime && !externalRuns.has("runtime")) throw new Error(`${where}: scripts.runtime is true but there is no content.scriptsDir, provides.api, or runtime external script`);
    if (s.buildTime === true && !facts.buildTime && !externalRuns.has("build")) throw new Error(`${where}: scripts.buildTime is true but there is no content.datagenEntry or build external script`);
    if (!declaredRuntime && externalRuns.has("runtime")) throw new Error(`${where}: a runtime external script is listed but scripts.runtime is false`);
    if (!declaredBuild && externalRuns.has("build")) throw new Error(`${where}: a build external script is listed but scripts.buildTime is false`);
}

/** Pure summary of a manifest's script status, for `openrock info` and a future GUI. */
function describeScripts(manifest) {
    const facts = deriveScriptFacts(manifest);
    const s = manifest.scripts ?? {};
    const external = (s.external ?? []).map(e => ({ name: e.name, path: e.path, runs: e.runs, why: e.why ?? null }));
    return {
        package: manifest.name,
        runtime: s.runtime ?? facts.runtime,
        buildTime: s.buildTime ?? facts.buildTime,
        declared: manifest.scripts !== undefined,
        external,
    };
}

/** Aggregates describeScripts over a collectEntries() Map (name -> {manifest, dir}). */
function describeScriptsTree(entries) {
    const packages = [...entries.values()].map(({ manifest }) => describeScripts(manifest));
    return {
        packages,
        anyRuntime: packages.some(p => p.runtime),
        anyBuildTime: packages.some(p => p.buildTime),
        external: packages.flatMap(p => p.external.map(e => ({ ...e, package: p.package }))),
    };
}

/** Returns the external script paths declared by `manifest` that don't exist under `dir`. */
function checkExternalScriptFiles(manifest, dir) {
    return (manifest.scripts?.external ?? [])
        .filter(e => !fs.existsSync(path.join(dir, e.path)))
        .map(e => ({ name: e.name, path: e.path }));
}

module.exports = { VALID_RUNS, deriveScriptFacts, validateScripts, describeScripts, describeScriptsTree, checkExternalScriptFiles };
