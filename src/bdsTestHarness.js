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
 * Installs a real built mod's {bp, rp, manifest} into a BDS instance's own
 * pack folders and a disposable test world, using the exact real mechanism
 * BDS itself expects (confirmed via direct research, not assumed):
 * world_behavior_packs.json / world_resource_packs.json referencing each
 * pack's real header UUID + version.
 */
function installIntoBds(bdsDir, built) {
    const { bp, rp, manifest } = built;
    const version = manifest.version.split(".").map(n => parseInt(n, 10));
    const worldDir = path.join(bdsDir, "worlds", TEST_WORLD_NAME);
    fs.mkdirSync(worldDir, { recursive: true });

    const behaviorRefs = [];
    if (bp) {
        const folder = manifest.packs.behavior.folder;
        writeTree(bp, path.join(bdsDir, "behavior_packs", folder));
        behaviorRefs.push({ pack_id: manifest.packs.behavior.uuid, version });
    }
    const folder = manifest.packs.resource.folder;
    writeTree(rp, path.join(bdsDir, "resource_packs", folder));
    const resourceRefs = [{ pack_id: manifest.packs.resource.uuid, version }];

    fs.writeFileSync(path.join(worldDir, "world_behavior_packs.json"), JSON.stringify(behaviorRefs, null, 2) + "\n");
    fs.writeFileSync(path.join(worldDir, "world_resource_packs.json"), JSON.stringify(resourceRefs, null, 2) + "\n");

    configureServerProperties(bdsDir);
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
 * Real, structural error signatures worth failing the build over -
 * mirrors MinUI's lib/lintjsonui.js's own discipline of only encoding
 * CONFIRMED failure classes, not speculative ones. A [Scripting][ERROR]
 * line (the exact class caught tonight) is the primary signal; a handful
 * of other known-fatal Content Log categories are included too.
 */
const FATAL_LOG_PATTERNS = [
    /\[Scripting\]\s*\[?ERROR\]?/i,
    /ran with error/i,
    /Unable to load behavior pack/i,
    /manifest\.json.*invalid/i,
];

function analyzeOutput(output) {
    const lines = output.split(/\r?\n/);
    const errors = lines.filter(l => FATAL_LOG_PATTERNS.some(p => p.test(l)));
    const packLoaded = lines.some(l => /Pack Stack/.test(l));
    return { ok: errors.length === 0 && packLoaded, errors, packLoaded, rawOutput: output };
}

/**
 * Boots the real BDS binary against whatever's currently installed in
 * `bdsDir` (installIntoBds() must have been called first), waits up to
 * `timeoutMs` for boot to settle (BDS never exits on its own once
 * started - this is a real, bounded smoke-test window, not "wait for
 * completion"), then force-kills it and reports what its console said.
 * @returns {Promise<{ok:boolean, errors:string[], packLoaded:boolean, rawOutput:string}>}
 */
function bootAndCollect(bdsDir, { timeoutMs = 15000 } = {}) {
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

        // Real success/failure both surface within a few seconds of boot -
        // "Server started." on success, a [Scripting][ERROR] line on
        // failure. Poll for either, but always bound by timeoutMs as a
        // hard ceiling regardless (BDS itself never exits on its own).
        const poll = setInterval(() => {
            if (/Server started\./.test(output) || FATAL_LOG_PATTERNS.some(p => p.test(output))) {
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
 * @returns {Promise<{ok:boolean, errors:string[], packLoaded:boolean, rawOutput:string, bdsDir:string}>}
 */
async function runSmokeTest(built, { bdsDir, openrockRoot = path.join(__dirname, ".."), timeoutMs = 15000 } = {}) {
    const dir = findBdsInstance(bdsDir, openrockRoot);
    if (!dir) {
        throw new Error(
            "bdsTestHarness: no real BDS instance found - set OPENROCK_BDS_DIR, pass { bdsDir }, or place one at a sibling \"bds-test\" directory. " +
            "Use --no-test-server to skip this check."
        );
    }
    installIntoBds(dir, built);
    const result = await bootAndCollect(dir, { timeoutMs });
    return { ...result, bdsDir: dir };
}

module.exports = { findBdsInstance, installIntoBds, bootAndCollect, analyzeOutput, runSmokeTest, TEST_WORLD_NAME };
