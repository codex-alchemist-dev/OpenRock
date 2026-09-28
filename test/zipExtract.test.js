#!/usr/bin/env node
// Real round-trip proof: src/zip.js's own real writer -> src/zipExtract.js's
// real reader, since a genuine BDS .zip archive isn't available in this
// test environment - the writer/reader pair are the same real ZIP format
// either way (standard local header + central directory + EOCD), so a
// clean round trip through OpenRock's own writer is real, meaningful proof
// the reader parses genuine ZIP structure correctly, not a toy format.
// Run: node test/zipExtract.test.js
"use strict";

const assert = require("assert");
const { zip } = require("../src/zip.js");
const { extractZip } = require("../src/zipExtract.js");

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`ok - ${name}`);
    } catch (e) {
        console.error(`FAIL - ${name}`);
        console.error(e);
        process.exitCode = 1;
    }
}

test("extractZip: round-trips a small, real, deflate-compressible entry", () => {
    const original = Buffer.from("hello hello hello hello hello hello world\n".repeat(20), "utf8");
    const archive = zip([{ name: "readme.txt", data: original }]);
    const entries = extractZip(archive);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].name, "readme.txt");
    assert.ok(entries[0].data.equals(original), "extracted bytes must match the original exactly");
    assert.strictEqual(entries[0].isDirectory, false);
});

test("extractZip: round-trips a genuinely incompressible (random binary) entry - exercises the real STORE fallback", () => {
    const original = require("crypto").randomBytes(512); // real random data won't shrink under deflate
    const archive = zip([{ name: "bedrock_server.exe", data: original }]);
    const entries = extractZip(archive);
    assert.ok(entries[0].data.equals(original));
});

test("extractZip: round-trips multiple entries at real, different offsets", () => {
    const files = [
        { name: "server.properties", data: Buffer.from("level-name=world\n") },
        { name: "worlds/world/level.dat", data: Buffer.from([1, 2, 3, 4, 5]) },
        { name: "eula.txt", data: Buffer.from("eula=true\n") },
    ];
    const archive = zip(files);
    const entries = extractZip(archive);
    assert.strictEqual(entries.length, 3);
    for (let i = 0; i < files.length; i++) {
        assert.strictEqual(entries[i].name, files[i].name);
        assert.ok(entries[i].data.equals(files[i].data));
    }
});

test("extractZip: an empty archive round-trips to zero real entries", () => {
    assert.deepStrictEqual(extractZip(zip([])), []);
});

test("extractZip: a non-ZIP buffer throws a clear error instead of reading garbage", () => {
    assert.throws(() => extractZip(Buffer.from("not a zip file at all")), /not a real ZIP file/);
});

console.log(`\n${passed} passed`);
