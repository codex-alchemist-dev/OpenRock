// OpenRock's real BDS auto-installer (OR-Track Q1). Triggered at CLI
// install via package.json's real "postinstall" lifecycle hook - not
// deferred to first build, per the user's own explicit wording ("have the
// OpenRock CLI at install... install... the server").
//
// This is a SEPARATE, real mechanism from the user's own manually-placed
// dev server (bds-test/, used directly by src/bdsTestHarness.js for this
// project's own development) - explicitly distinguished by the user
// ("the test server I gave you is different from how OpenRock CLI will
// install its own server when properly installed"). This installer is what
// makes a real Winget-installed `openrock` self-sufficient for an end user
// who never manually placed a BDS copy anywhere.
//
// Real, confirmed (not guessed) metadata source: EndstoneMC/bedrock-server-
// data's v2 branch - versions.json for the latest release version,
// release/<version>/metadata.json for that version's real download URLs
// + sha256 hashes (both fetched live and inspected before this file was
// written). Real, scriptable download URLs:
// https://www.minecraft.net/bedrockdedicatedserver/bin-win|bin-linux/bedrock-server-<version>.zip
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const crypto = require("crypto");
const { extractZip } = require("../../src/zipExtract.js");

const METADATA_REPO_RAW = "https://raw.githubusercontent.com/EndstoneMC/bedrock-server-data/v2";

/** win32 -> "windows"/bin-win, everything else (Linux, and WSL-hosted Linux BDS on a Windows dev box) -> "linux"/bin-linux. macOS has no official BDS build - Mojang ships Windows/Linux only, confirmed via the same real research this installer's URLs come from. */
function platformKey() {
    if (process.platform === "win32") return "windows";
    if (process.platform === "linux") return "linux";
    throw new Error(`OpenRock BDS installer: no official Bedrock Dedicated Server build exists for platform "${process.platform}" (Mojang ships Windows and Linux builds only) - install/configure BDS manually and point OpenRock at it instead`);
}

/** %LOCALAPPDATA%/OpenRock/bds on Windows, ~/.cache/openrock/bds elsewhere - real, per-platform convention, distinct from bds-test/ (the user's own manual dev instance). */
function defaultCacheRoot() {
    if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "OpenRock", "bds");
    return path.join(os.homedir(), ".cache", "openrock", "bds");
}

// A real, minimal HTTPS GET that follows redirects itself (Node's https.get
// does NOT auto-follow redirects, and minecraft.net's download URLs are
// confirmed to real-redirect through a CDN) - up to a sane real depth, not
// unbounded, so a redirect loop fails loudly instead of hanging forever.
function httpsGetBuffer(url, { maxRedirects = 5 } = {}) {
    return new Promise((resolve, reject) => {
        function get(u, redirectsLeft) {
            https.get(u, { headers: { "User-Agent": "OpenRock-BDS-Installer" } }, res => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    if (redirectsLeft <= 0) { reject(new Error(`OpenRock BDS installer: too many redirects fetching ${url}`)); return; }
                    res.resume();
                    get(new URL(res.headers.location, u).toString(), redirectsLeft - 1);
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`OpenRock BDS installer: GET ${u} failed with real HTTP status ${res.statusCode}`));
                    res.resume();
                    return;
                }
                const chunks = [];
                res.on("data", c => chunks.push(c));
                res.on("end", () => resolve(Buffer.concat(chunks)));
                res.on("error", reject);
            }).on("error", reject);
        }
        get(url, maxRedirects);
    });
}

async function httpsGetJson(url) {
    const buf = await httpsGetBuffer(url);
    return JSON.parse(buf.toString("utf8"));
}

/**
 * @param {object} [opts]
 * @param {(url: string) => Promise<object>} [opts.fetchJson] - injectable for tests.
 * @returns {Promise<string>} the resolved latest real release version, e.g. "1.26.52".
 */
async function resolveLatestVersion({ fetchJson = httpsGetJson } = {}) {
    const versions = await fetchJson(`${METADATA_REPO_RAW}/versions.json`);
    const latest = versions?.release?.latest;
    if (!latest) throw new Error(`OpenRock BDS installer: versions.json had no real "release.latest" field - real metadata schema may have changed`);
    return latest;
}

/**
 * @param {string} version
 * @param {object} [opts]
 * @param {(url: string) => Promise<object>} [opts.fetchJson]
 * @returns {Promise<{url: string, sha256: string}>} the real download info for this machine's platform.
 */
async function resolveBinaryInfo(version, { fetchJson = httpsGetJson } = {}) {
    const metadata = await fetchJson(`${METADATA_REPO_RAW}/release/${version}/metadata.json`);
    const info = metadata?.binary?.[platformKey()];
    if (!info?.url || !info?.sha256) throw new Error(`OpenRock BDS installer: metadata.json for version "${version}" has no real binary info for platform "${platformKey()}"`);
    return info;
}

// The real, standard, Mojang-sanctioned non-interactive EULA acceptance
// mechanism (confirmed via real research, not a bypass): BDS refuses to
// start until eula.txt's own "eula=" line reads "true" - the exact file
// content a human clicking "I Agree" produces, written programmatically.
function eulaFileContent() {
    return "# By changing the setting below to TRUE you are indicating your agreement to our EULA (https://minecraft.net/eula) and Privacy Policy (https://go.microsoft.com/fwlink/?LinkId=521839).\neula=true\n";
}

function writeExtractedEntries(entries, destDir) {
    for (const entry of entries) {
        const outPath = path.join(destDir, entry.name);
        if (entry.isDirectory) {
            fs.mkdirSync(outPath, { recursive: true });
            continue;
        }
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, entry.data);
    }
}

/**
 * The real, full install: resolve latest version (unless pinned) -> fetch
 * real binary metadata -> download -> verify sha256 -> extract -> write
 * eula.txt. Idempotent: a version already present under `cacheRoot` is
 * reused, never re-downloaded (Q5's "only re-download on a real version
 * bump" requirement).
 * @param {object} [opts]
 * @param {string} [opts.version] - a pinned version; omit to resolve the real latest.
 * @param {string} [opts.cacheRoot] - overrides the default per-platform cache location (test injection).
 * @param {(url: string) => Promise<object>} [opts.fetchJson] - test injection.
 * @param {(url: string) => Promise<Buffer>} [opts.fetchBinary] - test injection.
 * @returns {Promise<{version: string, installDir: string, alreadyInstalled: boolean}>}
 */
async function installBds({ version, cacheRoot = defaultCacheRoot(), fetchJson = httpsGetJson, fetchBinary = httpsGetBuffer } = {}) {
    const resolvedVersion = version ?? await resolveLatestVersion({ fetchJson });
    const installDir = path.join(cacheRoot, resolvedVersion);
    const exeMarker = path.join(installDir, process.platform === "win32" ? "bedrock_server.exe" : "bedrock_server");

    if (fs.existsSync(exeMarker)) {
        return { version: resolvedVersion, installDir, alreadyInstalled: true };
    }

    const { url, sha256 } = await resolveBinaryInfo(resolvedVersion, { fetchJson });
    const archive = await fetchBinary(url);
    const actualHash = crypto.createHash("sha256").update(archive).digest("hex");
    if (actualHash !== sha256) {
        throw new Error(`OpenRock BDS installer: sha256 mismatch for version "${resolvedVersion}" - expected ${sha256}, got ${actualHash}. The download is corrupt or the real metadata is stale; not installing an unverified binary.`);
    }

    fs.mkdirSync(installDir, { recursive: true });
    writeExtractedEntries(extractZip(archive), installDir);
    fs.writeFileSync(path.join(installDir, "eula.txt"), eulaFileContent());

    return { version: resolvedVersion, installDir, alreadyInstalled: false };
}

// Real postinstall entry point: runs installBds() but NEVER hard-fails the
// surrounding `npm install` - an offline install, a restricted CI sandbox,
// or a real network hiccup should degrade to "build/check installs on
// first use instead" (Q1's own stated fallback), not break `npm install`
// for everyone.
async function runAsPostinstall() {
    try {
        const result = await installBds({});
        if (result.alreadyInstalled) {
            console.log(`[openrock] BDS ${result.version} already installed at ${result.installDir}`);
        } else {
            console.log(`[openrock] Installed Bedrock Dedicated Server ${result.version} -> ${result.installDir}`);
        }
    } catch (err) {
        console.warn(`[openrock] Could not auto-install a Bedrock Dedicated Server during install (${err.message}). This is not fatal - "openrock build"/"openrock check" will try again on first use.`);
    }
}

if (require.main === module) {
    runAsPostinstall();
}

module.exports = {
    installBds, resolveLatestVersion, resolveBinaryInfo, platformKey, defaultCacheRoot,
    eulaFileContent, runAsPostinstall, httpsGetBuffer, httpsGetJson,
};
