#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { cmdScaffold } = require("../src/commands/scaffold.js");
const { loadManifestFile } = require("../src/manifest.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}
const root = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-"));

test("scaffold: generates a manifest that validates, with deps and stubs", () => {
    const out = path.join(tmp, "demo");
    cmdScaffold("demo", ["--deps=events", "--runtime", "--api=do-thing,other", `--out=${out}`], root);
    const { manifest } = loadManifestFile(out);
    assert.strictEqual(manifest.name, "@openrock/demo");
    assert.ok(manifest.dependsOn["@openrock/events"]);
    assert.throws(() => require(path.join(out, "src", "register.js")).doThing(), /not implemented/);
});
test("scaffold: refuses bad names and existing directories", () => {
    assert.throws(() => cmdScaffold("Bad_Name", [], root), /Usage/);
    assert.throws(() => cmdScaffold("demo", [`--out=${path.join(tmp, "demo")}`], root), /already exists/);
});
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed`);
