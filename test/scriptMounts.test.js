#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildMod } = require("../src/buildPipeline.js");
const { validateScriptMounts } = require("../src/scriptMounts.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

test("scriptMounts: a foreign directory is overlaid into the staged scripts root so its relative imports resolve", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mounts-"));
    const w = (rel, text) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
    w("lib/openrock.library.json", JSON.stringify({ openrockVersion: 1, kind: "library", name: "mount-lib", version: "1.0.0", entry: "scripts/api.js", provides: { api: "scripts/api.js", hookNamespaces: [] }, content: { scriptsDir: "scripts", scriptEntry: "api.js", scriptMounts: [{ from: "../foreign", at: "pkg/ui" }] } }));
    w("lib/scripts/api.js", 'import { thing } from "./pkg/ui/helper.js"; export const value = thing + 1;');
    w("lib/scripts/ids.js", "export const NS = 'lib';");
    w("lib/scripts/pkg/ids.js", "export const NS = 'lib';");
    w("foreign/helper.js", 'import { NS } from "../ids.js"; export const thing = NS.length;');
    w("foreign/helper.test.js", "throw new Error('tests are not mounted');");
    w("mod/openrock.mod.json", JSON.stringify({ openrockVersion: 1, kind: "mod", name: "mount-mod", version: "1.0.0", namespace: "mm", dependsOn: { "mount-lib": { type: "library" } }, packs: { behavior: { folder: "B", uuid: "11111111-1111-1111-1111-111111111111", dataModuleUuid: "22222222-2222-2222-2222-222222222222", scriptModuleUuid: "33333333-3333-3333-3333-333333333333" }, resource: { folder: "R", uuid: "44444444-4444-4444-4444-444444444444", moduleUuid: "55555555-5555-5555-5555-555555555555" } }, content: { scriptsDir: "scripts", scriptEntry: "main.js" } }));
    w("mod/scripts/main.js", 'import { value } from "mount-lib"; console.log(value);');
    const { bp } = buildMod(path.join(tmp, "mod"), { vendorDir: tmp, libraryDirs: { "mount-lib": path.join(tmp, "lib") } });
    const js = bp.get("scripts/main.js").toString();
    assert.ok(/NS\.length|thing/.test(js) && !/tests are not mounted/.test(js), js.slice(0, 500));
    fs.rmSync(tmp, { recursive: true, force: true });
});

test("scriptMounts: validation", () => {
    assert.throws(() => validateScriptMounts({}, "m"), /array/);
    assert.throws(() => validateScriptMounts([{ from: "a" }], "m"), /from.*at/);
    assert.throws(() => validateScriptMounts([{ from: "a", at: "../x" }], "m"), /inside/);
});
console.log(`\n${passed} passed`);
