#!/usr/bin/env node
// Run: node test/cinemaCli.test.js
"use strict";

const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

const CLI = path.join(__dirname, "..", "bin", "openrock.js");

test("cinema check: good cutscene shows id/duration/count, exits 0", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "or-cine-"));
    try {
        fs.mkdirSync(path.join(tmp, "cine"));
        fs.writeFileSync(path.join(tmp, "cine", "intro.cinema"), `cutscene "intro" {
  lock cinematic
  wait 2s
  unlock
}\n`);
        fs.writeFileSync(path.join(tmp, "openrock.mod.json"), JSON.stringify({
            openrockVersion: 1, kind: "mod", name: "test-cine", version: "1.0.0", namespace: "tc",
            packs: {
                behavior: { folder: "B", uuid: "11111111-1111-1111-1111-111111111111", dataModuleUuid: "22222222-2222-2222-2222-222222222222", scriptModuleUuid: "33333333-3333-3333-3333-333333333333" },
                resource: { folder: "R", uuid: "44444444-4444-4444-4444-444444444444", moduleUuid: "55555555-5555-5555-5555-555555555555" },
            },
            content: { cinemaDsl: "cine" },
        }));
        const out = execFileSync("node", [CLI, "cinema", "check", tmp], { encoding: "utf8" });
        assert.match(out, /intro.*2\.00s.*2 events/);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("cinema check --json: outputs JSON with cutscenes array", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "or-cine-"));
    try {
        fs.mkdirSync(path.join(tmp, "cine"));
        fs.writeFileSync(path.join(tmp, "cine", "test.cinema"), `cutscene "t" {
  fade in 0.5s
}\n`);
        fs.writeFileSync(path.join(tmp, "openrock.mod.json"), JSON.stringify({
            openrockVersion: 1, kind: "mod", name: "test-cine", version: "1.0.0", namespace: "tc",
            packs: {
                behavior: { folder: "B", uuid: "11111111-1111-1111-1111-111111111111", dataModuleUuid: "22222222-2222-2222-2222-222222222222", scriptModuleUuid: "33333333-3333-3333-3333-333333333333" },
                resource: { folder: "R", uuid: "44444444-4444-4444-4444-444444444444", moduleUuid: "55555555-5555-5555-5555-555555555555" },
            },
            content: { cinemaDsl: "cine" },
        }));
        const out = execFileSync("node", [CLI, "cinema", "check", tmp, "--json"], { encoding: "utf8" });
        const r = JSON.parse(out);
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.cutscenes.length, 1);
        assert.strictEqual(r.cutscenes[0].id, "t");
        assert.strictEqual(r.cutscenes[0].events, 1);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("cinema preview: shows ASCII timeline of events", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "or-cine-"));
    try {
        fs.mkdirSync(path.join(tmp, "cine"));
        fs.writeFileSync(path.join(tmp, "cine", "test.cinema"), `cutscene "t" {
  lock cinematic
  wait 1s
  camera cut to (0, 0, 0)
  unlock
}\n`);
        fs.writeFileSync(path.join(tmp, "openrock.mod.json"), JSON.stringify({
            openrockVersion: 1, kind: "mod", name: "test-cine", version: "1.0.0", namespace: "tc",
            packs: {
                behavior: { folder: "B", uuid: "11111111-1111-1111-1111-111111111111", dataModuleUuid: "22222222-2222-2222-2222-222222222222", scriptModuleUuid: "33333333-3333-3333-3333-333333333333" },
                resource: { folder: "R", uuid: "44444444-4444-4444-4444-444444444444", moduleUuid: "55555555-5555-5555-5555-555555555555" },
            },
            content: { cinemaDsl: "cine" },
        }));
        const out = execFileSync("node", [CLI, "cinema", "preview", tmp], { encoding: "utf8" });
        assert.match(out, /#.*t.*1\.00s/);
        assert.match(out, /lock.*pos=.*cinematic/);
        assert.match(out, /camera\.cut/);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("cinema check: missing cinemaDsl declaration is an error", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "or-cine-"));
    try {
        fs.writeFileSync(path.join(tmp, "openrock.mod.json"), JSON.stringify({
            openrockVersion: 1, kind: "mod", name: "test-cine", version: "1.0.0", namespace: "tc",
            packs: {
                behavior: { folder: "B", uuid: "11111111-1111-1111-1111-111111111111", dataModuleUuid: "22222222-2222-2222-2222-222222222222", scriptModuleUuid: "33333333-3333-3333-3333-333333333333" },
                resource: { folder: "R", uuid: "44444444-4444-4444-4444-444444444444", moduleUuid: "55555555-5555-5555-5555-555555555555" },
            },
        }));
        let threw = false;
        try { execFileSync("node", [CLI, "cinema", "check", tmp], { encoding: "utf8" }); }
        catch (e) { threw = true; assert.match(e.message, /doesn't declare content\.cinemaDsl/); }
        assert.strictEqual(threw, true);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

console.log(`\n${passed} passed`);
