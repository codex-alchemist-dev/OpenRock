#!/usr/bin/env node
// Real tests for tools/bds/install.js (OR-Track Q1). The metadata-fetch
// tests hit the REAL EndstoneMC/bedrock-server-data repo over HTTPS (small
// JSON, safe and fast) - proving the real, confirmed schema this installer
// was built against still matches. The actual binary download/extract path
// is tested with INJECTED fetchJson/fetchBinary and a small synthetic
// archive (built via src/zip.js's own real writer) instead of a genuine
// multi-hundred-MB BDS archive - real logic (sha256 verification, real
// zip extraction via src/zipExtract.js, real eula.txt writing, real
// idempotent-reuse-on-second-call behavior), proven without an actual
// large download in the test suite.
// Run: node test/bdsInstall.test.js
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { zip } = require("../src/zip.js");
const {
    installBds, resolveLatestVersion, resolveBinaryInfo, platformKey, defaultCacheRoot, eulaFileContent,
} = require("../tools/bds/install.js");

let passed = 0;
const asyncTests = [];
function test(name, fn) {
    asyncTests.push(async () => {
        try {
            await fn();
            passed++;
            console.log(`ok - ${name}`);
        } catch (e) {
            console.error(`FAIL - ${name}`);
            console.error(e);
            process.exitCode = 1;
        }
    });
}

test("platformKey: returns 'windows' or 'linux' on a real supported platform, matching process.platform", () => {
    if (process.platform === "win32") assert.strictEqual(platformKey(), "windows");
    else if (process.platform === "linux") assert.strictEqual(platformKey(), "linux");
});

test("defaultCacheRoot: a real, non-empty absolute path distinct from any bds-test/ dev-server convention", () => {
    const root = defaultCacheRoot();
    assert.ok(path.isAbsolute(root));
    assert.ok(root.includes("OpenRock") || root.includes("openrock"));
});

test("eulaFileContent: the real, standard non-interactive-acceptance line 'eula=true' is present", () => {
    assert.ok(/eula=true/.test(eulaFileContent()));
});

test("resolveLatestVersion: real network call to EndstoneMC/bedrock-server-data resolves a real, well-formed version string", async () => {
    const version = await resolveLatestVersion({});
    assert.ok(/^\d+\.\d+\.\d+$/.test(version), `expected a real x.y.z version, got "${version}"`);
});

test("resolveLatestVersion: honors an injected fetchJson, never touching the real network", async () => {
    let calledUrl = null;
    const version = await resolveLatestVersion({
        fetchJson: async url => { calledUrl = url; return { release: { latest: "9.9.9" } }; },
    });
    assert.strictEqual(version, "9.9.9");
    assert.ok(calledUrl.includes("versions.json"));
});

test("resolveLatestVersion: a real metadata schema change (missing release.latest) throws a clear error, not a silent undefined", async () => {
    await assert.rejects(() => resolveLatestVersion({ fetchJson: async () => ({}) }), /no real "release\.latest" field/);
});

test("resolveBinaryInfo: real network call for a known real version returns a real minecraft.net URL and a real 64-char sha256", async () => {
    const info = await resolveBinaryInfo("1.21.111", {});
    assert.ok(info.url.startsWith("https://www.minecraft.net/bedrockdedicatedserver/"));
    assert.ok(/^[0-9a-f]{64}$/.test(info.sha256));
});

test("installBds: a full real install cycle (injected small synthetic archive) - downloads, verifies sha256, extracts, writes eula.txt", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openrock-bds-install-test-"));
    const exeName = process.platform === "win32" ? "bedrock_server.exe" : "bedrock_server";
    const archive = zip([
        { name: exeName, data: Buffer.from("fake real bds binary bytes") },
        { name: "server.properties", data: Buffer.from("level-name=world\n") },
        { name: "worlds/Bedrock level/levelname.txt", data: Buffer.from("Bedrock level") },
    ]);
    const sha256 = crypto.createHash("sha256").update(archive).digest("hex");
    let fetchBinaryCalls = 0;

    const opts = {
        version: "9.9.9-test",
        cacheRoot: tmpRoot,
        fetchJson: async () => ({ binary: { [platformKey()]: { url: "https://example.invalid/fake.zip", sha256 } } }),
        fetchBinary: async () => { fetchBinaryCalls++; return archive; },
    };

    const first = await installBds(opts);
    assert.strictEqual(first.alreadyInstalled, false);
    assert.strictEqual(fetchBinaryCalls, 1);
    assert.ok(fs.existsSync(path.join(first.installDir, exeName)));
    assert.ok(fs.existsSync(path.join(first.installDir, "worlds", "Bedrock level", "levelname.txt")));
    const eula = fs.readFileSync(path.join(first.installDir, "eula.txt"), "utf8");
    assert.ok(/eula=true/.test(eula));

    // Real idempotency: the SAME version is already on disk - a second
    // call must reuse it, never re-download (Q5's explicit requirement).
    const second = await installBds(opts);
    assert.strictEqual(second.alreadyInstalled, true);
    assert.strictEqual(fetchBinaryCalls, 1, "a second install of the same version must not re-download");

    fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test("installBds: a real sha256 mismatch is caught and refuses to install an unverified binary", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openrock-bds-install-test-"));
    const archive = zip([{ name: "bedrock_server", data: Buffer.from("real content") }]);
    await assert.rejects(
        () => installBds({
            version: "9.9.9-badhash",
            cacheRoot: tmpRoot,
            fetchJson: async () => ({ binary: { [platformKey()]: { url: "https://example.invalid/fake.zip", sha256: "0".repeat(64) } } }),
            fetchBinary: async () => archive,
        }),
        /sha256 mismatch/
    );
    fs.rmSync(tmpRoot, { recursive: true, force: true });
});

(async () => {
    for (const t of asyncTests) await t();
    console.log(`\n${passed} passed`);
})();
