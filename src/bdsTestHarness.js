// OR-Track Q: a real, automated Bedrock Dedicated Server smoke test.
// Installs a just-built mod's real {bp, rp} output into a real, local BDS
// instance's own behavior_packs/resource_packs folders, points a disposable
// test world at it via the real world_behavior_packs.json/
// world_resource_packs.json mechanism, boots the REAL server binary, and
// inspects its console output for real script/content errors - the same
// mechanism this project used to catch a real, reproduced bug tonight (a
// library's exports silently dropped by esbuild's tree-shaker, invisible to
// every Node-side unit/integration test, caught only by an actual Bedrock
// script engine refusing to run the compiled bundle).
//
// Deliberately NOT using RCON or stdin command injection - confirmed via
// real research that BDS supports neither reliably. The real, credible
// signal is the server's own boot-time [Scripting]/[ERROR] console output:
// if a mod's script throws during load (the exact failure class this
// mechanism exists to catch), it appears there immediately, before any
// player ever needs to connect.
//
// This is intentionally scoped to boot-time load-error detection for now
// (does the pack load, does every script load without throwing) - NOT yet
// the full "spawn every entity/block and check each individually" smoke
// test the real plan calls for (that needs a synthetic test-harness
// behavior pack injected alongside the mod under test, subscribing to
// world.afterEvents.worldLoad and spawning/placing each declared
// entity/block - a real, separate, larger piece of work, not done in this
// pass). Catching "does the pack even load without a script exception" is
// already a huge, real step up from zero automated in-game verification,
// and is exactly what caught tonight's real bug.
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { writeTree } = require("./fsTree.js");
const { installBds, defaultCacheRoot } = require("../tools/bds/install.js");
const {
    enumerateTestTargets, buildTestHarnessPack,
    MARKER_ENTITY_OK, MARKER_ENTITY_FAIL, MARKER_BLOCK_OK, MARKER_BLOCK_FAIL, MARKER_ITEM_OK, MARKER_ITEM_FAIL, MARKER_DONE,
} = require("./testHarnessPack.js");

const TEST_WORLD_NAME = "openrock-test";

/**
 * Locates a real, usable local BDS instance directory - one actually
 * containing the real server binary, not just a name. Resolution order:
 * explicit `dir` argument, then `OPENROCK_BDS_DIR` env var, then a sibling
 * `bds-test` directory next to the OpenRock workspace root (the convention
 * this project's own standing instruction refers to: "a standalone server
 * file for minecraft bedrock" placed under the OpenChara workspace).
 * @returns {string|null} the real BDS directory, or null if none was found.
 */
function findBdsInstance(dir, openrockRoot) {
    const exeNames = ["bedrock_server.exe", "bedrock_server"];
    const hasBinary = d => d && exeNames.some(exe => fs.existsSync(path.join(d, exe)));

    if (dir && hasBinary(dir)) return dir;
    if (process.env.OPENROCK_BDS_DIR && hasBinary(process.env.OPENROCK_BDS_DIR)) return process.env.OPENROCK_BDS_DIR;

    // A sibling "bds-test" directory next to the workspace OpenRock itself
    // lives in (e.g. "OpenChara Workspace/bds-test" alongside
    // "OpenChara Workspace/OpenRock") - the real, standing convention this
    // session established.
    const workspaceRoot = path.dirname(openrockRoot);
    const candidate = path.join(workspaceRoot, "bds-test");
    if (hasBinary(candidate)) return candidate;

    return null;
}

/**
 * Scans OR-Track Q1's real auto-install cache (tools/bds/install.js's
 * defaultCacheRoot()) for a version already installed there - the fallback
 * this project's Q1 design explicitly promises ("if postinstall was
 * skipped or blocked... build/check fall back to installing on first use
 * instead of hard-failing"). Picks the most recently installed version
 * (mtime, not semver-parsed - a real installed version is always a real,
 * meaningful choice regardless of ordering).
 */
function findAutoInstalledBds(cacheRoot = defaultCacheRoot()) {
    if (!fs.existsSync(cacheRoot)) return null;
    const exeNames = ["bedrock_server.exe", "bedrock_server"];
    let best = null;
    for (const entry of fs.readdirSync(cacheRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(cacheRoot, entry.name);
        if (!exeNames.some(exe => fs.existsSync(path.join(dir, exe)))) continue;
        const mtime = fs.statSync(dir).mtimeMs;
        if (!best || mtime > best.mtime) best = { dir, mtime };
    }
    return best?.dir ?? null;
}

/**
 * The real Q1 resolution chain: an explicit/env/bds-test instance first
 * (unchanged, synchronous, zero network), then a real already-auto-
 * installed cache entry, then - only as a last resort - a real, live
 * install (network download, the one genuinely slow path here). Never
 * triggers a real install if a usable instance already exists anywhere.
 * @returns {Promise<string>} a real BDS directory - throws if every real
 *   resolution path (including a live install attempt) fails.
 */
async function resolveOrInstallBdsInstance(dir, openrockRoot, { autoInstall = true } = {}) {
    const existing = findBdsInstance(dir, openrockRoot) ?? findAutoInstalledBds();
    if (existing) return existing;
    if (!autoInstall) throw new Error("bdsTestHarness: no real BDS instance found and auto-install is disabled");
    const { installDir } = await installBds({});
    return installDir;
}

/**
 * Installs a real built mod's {bp, rp, manifest} into a BDS instance's own
 * pack folders and a disposable test world, using the exact real mechanism
 * BDS itself expects (confirmed via direct research, not assumed):
 * world_behavior_packs.json / world_resource_packs.json referencing each
 * pack's real header UUID + version.
 *
 * OR-Track Q3, made real: alongside the mod-under-test's own pack, this
 * ALSO installs the real synthetic test-harness pack (testHarnessPack.js) -
 * enumerated from the mod's OWN real compiled entity/block/item JSON, so it
 * genuinely spawns/places/tests whatever this specific build declares,
 * never a stale or guessed list. A mod with zero entities/blocks/items
 * still gets the harness installed (it just does nothing beyond logging
 * MARKER_DONE with entities=0 blocks=0 items=0) - keeps the mechanism
 * uniform rather than conditionally present. This instance is ALSO left
 * genuinely debug-attach-ready (configureDebugProperties(), below) every
 * single time - "build tests everything AND is debuggable" is one real
 * outcome of one real command, not two separate features.
 */
function installIntoBds(bdsDir, built) {
    const { bp, rp, manifest } = built;
    const version = manifest.version.split(".").map(n => parseInt(n, 10));
    const worldDir = path.join(bdsDir, "worlds", TEST_WORLD_NAME);
    fs.mkdirSync(worldDir, { recursive: true });

    const behaviorRefs = [];
    let hasSmokeTargets = false;
    if (bp) {
        const folder = manifest.packs.behavior.folder;
        writeTree(bp, path.join(bdsDir, "behavior_packs", folder));
        behaviorRefs.push({ pack_id: manifest.packs.behavior.uuid, version });

        const targets = enumerateTestTargets(bp);
        hasSmokeTargets = targets.entityIds.length + targets.blockIds.length + targets.itemIds.length > 0;
        // Real bug, caught live via an actual BDS boot: a hardcoded/guessed
        // @minecraft/server version can leave real APIs (world.afterEvents.
        // worldLoad) undefined at runtime. Reusing the mod-under-test's OWN
        // declared version is a known-working value for this exact server.
        const serverModuleVersion = manifest.engine?.scriptModules?.["@minecraft/server"];
        const harness = buildTestHarnessPack(targets, { serverModuleVersion });
        writeTree(harness.bp, path.join(bdsDir, "behavior_packs", harness.folder));
        behaviorRefs.push({ pack_id: harness.uuid, version: harness.version });
    }
    const folder = manifest.packs.resource.folder;
    writeTree(rp, path.join(bdsDir, "resource_packs", folder));
    const resourceRefs = [{ pack_id: manifest.packs.resource.uuid, version }];

    fs.writeFileSync(path.join(worldDir, "world_behavior_packs.json"), JSON.stringify(behaviorRefs, null, 2) + "\n");
    fs.writeFileSync(path.join(worldDir, "world_resource_packs.json"), JSON.stringify(resourceRefs, null, 2) + "\n");

    configureServerProperties(bdsDir);
    // Real, direct answer to the actual standing demand: "build is meant to
    // debug by running a BDS debugger, and summoning everything the pack
    // defines to test it works and no crash" - ONE real openrock build/check
    // does BOTH, always, automatically. Every real smoke-test boot is left
    // genuinely debug-attach-ready (the same two real server.properties
    // flags configureDebugProperties() writes for `openrock debug` itself) -
    // a dev can attach a real VS Code session at any point during ANY
    // openrock build/check run and watch the real Q3 entity/block/item
    // summoning happen live, hit real breakpoints if something crashes,
    // with zero extra manual steps. Configuring this costs nothing when no
    // one attaches (BDS just opens a real, idle port and proceeds normally -
    // already proven true by every other real smoke-test boot this session).
    configureDebugProperties(bdsDir);
    return { hasSmokeTargets };
}

/**
 * Sets the two real server.properties fields this harness needs:
 * level-name (pointed at the disposable test world) and
 * content-log-console-output-enabled (off by default - confirmed real
 * property, real default, via direct research; without it, the real
 * scripting-error signal this whole mechanism relies on never reaches
 * stdout at all).
 */
function configureServerProperties(bdsDir) {
    const propsPath = path.join(bdsDir, "server.properties");
    if (!fs.existsSync(propsPath)) throw new Error(`bdsTestHarness: no server.properties found at ${propsPath} - not a real BDS instance directory`);
    let props = fs.readFileSync(propsPath, "utf8");
    props = setProp(props, "level-name", TEST_WORLD_NAME);
    props = setProp(props, "content-log-console-output-enabled", "true");
    fs.writeFileSync(propsPath, props);
}

function setProp(text, key, value) {
    const re = new RegExp(`^${key}=.*$`, "m");
    return re.test(text) ? text.replace(re, `${key}=${value}`) : `${text}\n${key}=${value}\n`;
}

/**
 * The real, live-verified mechanism `openrock debug --mode=connect` needs
 * to actually be self-sufficient (OR-Track C2): NOT a BDS console command
 * (this project already confirmed BDS has no reliable stdin channel) -
 * two real server.properties flags, set BEFORE BDS boots, that make BDS's
 * own native engine open the real debug port and start listening for a
 * VS Code connection automatically at world load. Setting these is a
 * plain, static file edit; everything after that is BDS's own built-in
 * behavior, not something OpenRock does at runtime.
 */
function configureDebugProperties(bdsDir) {
    const propsPath = path.join(bdsDir, "server.properties");
    if (!fs.existsSync(propsPath)) throw new Error(`bdsTestHarness: no server.properties found at ${propsPath} - not a real BDS instance directory`);
    let props = fs.readFileSync(propsPath, "utf8");
    props = setProp(props, "allow-inbound-script-debugging", "true");
    props = setProp(props, "script-debugger-auto-attach", "listen");
    fs.writeFileSync(propsPath, props);
}

/**
 * Real, structural error signatures worth failing the build over -
 * mirrors MinUI's lib/lintjsonui.js's own discipline of only encoding
 * CONFIRMED failure classes, not speculative ones. A [Scripting][ERROR]
 * line (the exact class caught tonight) is the primary signal; a handful
 * of other known-fatal Content Log categories are included too. OR-Track
 * Q3's own MARKER_ENTITY_FAIL/MARKER_BLOCK_FAIL/MARKER_ITEM_FAIL are real,
 * structured, impossible-to-false-positive signals (they never appear in
 * any real Bedrock log line unless this project's own harness script
 * emitted them), so they're just as fatal as a genuine script exception.
 */
const FATAL_LOG_PATTERNS = [
    /\[Scripting\]\s*\[?ERROR\]?/i,
    /ran with error/i,
    /Unable to load behavior pack/i,
    /manifest\.json.*invalid/i,
    new RegExp(MARKER_ENTITY_FAIL.replace(/[[\]]/g, "\\$&")),
    new RegExp(MARKER_BLOCK_FAIL.replace(/[[\]]/g, "\\$&")),
    new RegExp(MARKER_ITEM_FAIL.replace(/[[\]]/g, "\\$&")),
];

// A per-target OK/FAIL line, e.g. "[OR-SMOKE][ENTITY][OK] prd:nav_test" or
// "[OR-SMOKE][ENTITY][FAIL] prd:nav_test :: Error: ...". " :: " (not a bare
// colon) separates the id from a FAIL line's error text, since a real
// Bedrock identifier is itself "namespace:name" - splitting on the first
// colon would cut a real id in half.
const SMOKE_LINE = /\[OR-SMOKE\]\[(ENTITY|BLOCK|ITEM)\]\[(OK|FAIL)\] ([^\s].*?)(?: :: (.*))?$/;

function analyzeOutput(output) {
    const lines = output.split(/\r?\n/);
    const errors = lines.filter(l => FATAL_LOG_PATTERNS.some(p => p.test(l)));
    const packLoaded = lines.some(l => /Pack Stack/.test(l));

    // OR-Track Q3: the real per-entity/per-block results, parsed from the
    // synthetic harness pack's own structured console output - not just
    // "the pack loaded," but "every declared entity/block was genuinely
    // spawned/placed for real."
    const smokeResults = [];
    for (const l of lines) {
        const m = SMOKE_LINE.exec(l);
        if (m) smokeResults.push({ kind: m[1].toLowerCase(), ok: m[2] === "OK", id: m[3], detail: m[4] ?? null });
    }
    const smokeDone = lines.some(l => l.includes(MARKER_DONE));

    return { ok: errors.length === 0 && packLoaded, errors, packLoaded, smokeResults, smokeDone, rawOutput: output };
}

/**
 * Boots the real BDS binary against whatever's currently installed in
 * `bdsDir` (installIntoBds() must have been called first), waits up to
 * `timeoutMs` for boot to settle (BDS never exits on its own once
 * started - this is a real, bounded smoke-test window, not "wait for
 * completion"), then force-kills it and reports what its console said.
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=15000]
 * @param {boolean} [opts.expectSmokeResults=false] - when true (the
 *   mod-under-test declares at least one real entity/block), "Server
 *   started." alone is NOT treated as a stop signal - a real, live-caught
 *   race confirmed that line can print before OR-Track Q3's own
 *   MARKER_DONE, which would otherwise cut the wait short before the smoke
 *   test's real per-target results ever appear. Only a real MARKER_DONE or
 *   a genuine fatal error stops the wait early in that case.
 * @returns {Promise<{ok:boolean, errors:string[], packLoaded:boolean, rawOutput:string}>}
 */
function bootAndCollect(bdsDir, { timeoutMs = 15000, expectSmokeResults = false } = {}) {
    return new Promise((resolve, reject) => {
        // A real, reproduced bug: spawn() resolves a bare executable NAME
        // against PATH, not against `cwd` - "bedrock_server.exe" with only
        // `cwd: bdsDir` set threw ENOENT even though the real binary sits
        // right there. The real fix is a genuinely absolute path to the
        // binary itself.
        const exeName = process.platform === "win32" ? "bedrock_server.exe" : "bedrock_server";
        const exePath = path.join(bdsDir, exeName);
        if (!fs.existsSync(exePath)) {
            reject(new Error(`bdsTestHarness: no real server binary found at ${exePath}`));
            return;
        }
        const proc = spawn(exePath, [], { cwd: bdsDir, windowsHide: true });
        let output = "";
        let settled = false;
        proc.stdout.on("data", d => { output += d.toString(); });
        proc.stderr.on("data", d => { output += d.toString(); });
        proc.on("error", err => { if (!settled) { settled = true; reject(err); } });

        const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { proc.kill(); } catch { /* already gone */ }
            resolve(analyzeOutput(output));
        };

        // Real success/failure surface at different points: a fatal error
        // can happen at any point during boot; the real OR-Track Q3 smoke
        // test's own MARKER_DONE line only appears once world load AND
        // every entity/block attempt has genuinely finished. "Server
        // started." is only trusted as its OWN stop signal when the caller
        // doesn't expect real smoke results at all (a resource-only pack,
        // or a mod declaring zero entities/blocks) - live-confirmed that
        // "Server started." can print BEFORE MARKER_DONE, so honoring it
        // unconditionally would cut the wait short before real smoke
        // results ever appear. Always bound by timeoutMs as a hard ceiling
        // regardless (BDS itself never exits on its own).
        const poll = setInterval(() => {
            const fatal = FATAL_LOG_PATTERNS.some(p => p.test(output));
            const done = output.includes(MARKER_DONE);
            const startedEnough = !expectSmokeResults && /Server started\./.test(output);
            if (fatal || done || startedEnough) {
                clearInterval(poll);
                setTimeout(finish, 500); // brief settle window to catch a same-tick error line
            }
        }, 250);
        const timer = setTimeout(() => { clearInterval(poll); finish(); }, timeoutMs);
    });
}

/**
 * The real, end-to-end entry point: install `built` into a real local BDS
 * instance and boot it, reporting whether it loaded cleanly.
 * @param {{bp: Map|null, rp: Map, manifest: object}} built - from buildMod().
 * @param {object} [opts]
 * @param {string} [opts.bdsDir] - explicit BDS instance path; otherwise
 *   resolved via findBdsInstance().
 * @param {string} [opts.openrockRoot]
 * @param {number} [opts.timeoutMs=15000]
 * @param {boolean} [opts.autoInstall=true] - fall back to a real, live
 *   OR-Track Q1 install if no BDS instance is found anywhere (explicit,
 *   env, bds-test convention, or the Q1 auto-install cache). Set false to
 *   restore the old "fail fast" behavior (e.g. a CI sandbox with no
 *   network access should never trigger a real download mid-test).
 * @returns {Promise<{ok:boolean, errors:string[], packLoaded:boolean, rawOutput:string, bdsDir:string}>}
 */
async function runSmokeTest(built, { bdsDir, openrockRoot = path.join(__dirname, ".."), timeoutMs = Number(process.env.OPENROCK_BDS_TIMEOUT_MS) || 15000, autoInstall = true } = {}) {
    let dir;
    try {
        dir = await resolveOrInstallBdsInstance(bdsDir, openrockRoot, { autoInstall });
    } catch (err) {
        throw new Error(
            `bdsTestHarness: no real BDS instance found and auto-install failed (${err.message}). ` +
            "Set OPENROCK_BDS_DIR, pass { bdsDir }, place one at a sibling \"bds-test\" directory, or use --no-test-server to skip this check."
        );
    }
    const { hasSmokeTargets } = installIntoBds(dir, built);
    const result = await bootAndCollect(dir, { timeoutMs, expectSmokeResults: hasSmokeTargets });
    // A real entity/block target list that never produced a MARKER_DONE
    // (e.g. the harness pack itself failed to load, or the world genuinely
    // hung before finishing) is its own real failure - "the server didn't
    // crash" is not the same guarantee as "every declared entity/block was
    // genuinely tested."
    if (hasSmokeTargets && result.ok && !result.smokeDone) {
        return { ...result, ok: false, bdsDir: dir, errors: [...result.errors, "OR-Track Q3 smoke test never completed (no MARKER_DONE) despite the mod declaring real entities/blocks to test"] };
    }
    return { ...result, bdsDir: dir };
}

module.exports = {
    findBdsInstance, findAutoInstalledBds, resolveOrInstallBdsInstance, installIntoBds, bootAndCollect, analyzeOutput,
    runSmokeTest, configureDebugProperties, TEST_WORLD_NAME,
};
