#!/usr/bin/env node
// templateVars: a library's {{placeholders}} are filled from the ROOT mod's values.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildMod } = require("../src/buildPipeline.js");
const { validateManifest } = require("../src/manifest.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

const FIXTURES = path.join(__dirname, "fixtures");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tv-"));
fs.cpSync(FIXTURES, tmp, { recursive: true });
const modDir = path.join(tmp, "build-mod");
const libDir = path.join(tmp, "build-lib");

const modJson = JSON.parse(fs.readFileSync(path.join(modDir, "openrock.mod.json"), "utf8"));
modJson.templateVars = { char: "waifu", Char: "Waifu" };
fs.writeFileSync(path.join(modDir, "openrock.mod.json"), JSON.stringify(modJson, null, 2));
fs.mkdirSync(path.join(libDir, "bp", "templates"), { recursive: true });
fs.writeFileSync(path.join(libDir, "bp", "templates", "{{char}}_card.json"), JSON.stringify({ id: "{{ns}}:{{char}}", title: "{{Char}} {{unset}}" }));
const libJson = JSON.parse(fs.readFileSync(path.join(libDir, "openrock.library.json"), "utf8"));
libJson.content = { ...(libJson.content ?? {}), bpOverlayDir: "bp" };
fs.writeFileSync(path.join(libDir, "openrock.library.json"), JSON.stringify(libJson, null, 2));

test("templateVars: library templates (path + content) use the mod's variables and namespace", () => {
    const { bp } = buildMod(modDir, { vendorDir: tmp });
    const file = bp.get("templates/waifu_card.json");
    assert.ok(file, "path placeholder {{char}} filled");
    assert.deepStrictEqual(JSON.parse(file.toString()), { id: "bm:waifu", title: "Waifu {{unset}}" });
});

test("templateVars: validation rejects bad names, reserved ns, non-strings", () => {
    const base = { openrockVersion: 1, kind: "mod", name: "m", version: "1.0.0", namespace: "m", packs: modJson.packs };
    assert.throws(() => validateManifest({ ...base, templateVars: { "bad-name": "x" } }), /not a valid variable name/);
    assert.throws(() => validateManifest({ ...base, templateVars: { ns: "x" } }), /reserved/);
    assert.throws(() => validateManifest({ ...base, templateVars: { a: 1 } }), /must be a string/);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed`);
