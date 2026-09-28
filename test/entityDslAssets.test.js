#!/usr/bin/env node
// Real proof for OR-Track M6 (per-entity asset co-location): a real
// sibling "<shortName>/" folder next to "<shortName>.entity.tsx" has its
// ENTIRE contents copied verbatim into the real Bedrock RP path
// "textures/entity/<shortName>/", and a texture file matching the
// entity's own short name auto-derives textures.default - an author never
// hand-writes a Bedrock RP path string.
// Run: node test/entityDslAssets.test.js
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { compileEntityDsl } = require("../src/entityDsl/entityCompiler.js");

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

const ABS_SRC_DIR = path.join(__dirname, "..", "src").split(path.sep).join("/");

// A real entity DSL dir must live on the same drive as the repo (tsc's
// rootDir inference needs a common ancestor - see entityDsl.test.js's own
// note on this exact real constraint).
function makeEntityDslDir() {
    return fs.mkdtempSync(path.join(__dirname, "fixtures", "openrock-entity-assets-test-"));
}

function writeEntityTsx(dir, textureProp = "") {
    fs.writeFileSync(path.join(dir, "critter.entity.tsx"), `
import * as OpenRockEntity from "${ABS_SRC_DIR}/entityDsl/jsx-runtime.js";
import { Entity, Health } from "${ABS_SRC_DIR}/entityDsl/components.js";
export default (
    <Entity identifier="prd:critter"${textureProp}>
        <Health value={10} />
    </Entity>
);
`);
}

test("compileEntityDsl: a real sibling asset folder's files are copied verbatim into textures/entity/<shortName>/", () => {
    const dir = makeEntityDslDir();
    writeEntityTsx(dir);
    fs.mkdirSync(path.join(dir, "critter"));
    fs.writeFileSync(path.join(dir, "critter", "critter.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]));
    fs.writeFileSync(path.join(dir, "critter", "critter_normal.png"), Buffer.from([9, 9, 9]));

    const { rp } = compileEntityDsl(dir);
    assert.ok(Buffer.isBuffer(rp["textures/entity/critter/critter.png"]));
    assert.ok(rp["textures/entity/critter/critter.png"].equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])), "real bytes must round-trip exactly, never mangled by JSON.stringify");
    assert.ok(rp["textures/entity/critter/critter_normal.png"].equals(Buffer.from([9, 9, 9])), "a real PBR sibling file (e.g. _normal) copies through too, no special-casing needed");

    fs.rmSync(dir, { recursive: true, force: true });
});

test("compileEntityDsl: textures.default is auto-derived from a real file matching the entity's own short name - no hand-written Bedrock path", () => {
    const dir = makeEntityDslDir();
    writeEntityTsx(dir);
    fs.mkdirSync(path.join(dir, "critter"));
    fs.writeFileSync(path.join(dir, "critter", "critter.png"), Buffer.from([1]));

    const { rp } = compileEntityDsl(dir);
    const clientEntity = rp["entity/critter.json"]["minecraft:client_entity"];
    assert.strictEqual(clientEntity.description.textures.default, "textures/entity/critter/critter", "the real Bedrock convention: reference the path WITHOUT its extension");

    fs.rmSync(dir, { recursive: true, force: true });
});

test("compileEntityDsl: an explicit <Entity textures={...}/> always wins over the real auto-derived default", () => {
    const dir = makeEntityDslDir();
    writeEntityTsx(dir, ' textures={{ default: "textures/entity/zombie/zombie" }}');
    fs.mkdirSync(path.join(dir, "critter"));
    fs.writeFileSync(path.join(dir, "critter", "critter.png"), Buffer.from([1]));

    const { rp } = compileEntityDsl(dir);
    const clientEntity = rp["entity/critter.json"]["minecraft:client_entity"];
    assert.strictEqual(clientEntity.description.textures.default, "textures/entity/zombie/zombie", "an explicit override must never be silently replaced by auto-derivation");
    // The real texture file is still copied (an author might reference a
    // vanilla texture by name while ALSO shipping their own real asset for
    // a different purpose) - auto-derivation is skipped, copying isn't.
    assert.ok(rp["textures/entity/critter/critter.png"]);

    fs.rmSync(dir, { recursive: true, force: true });
});

test("compileEntityDsl: no real sibling asset folder at all is a real no-op, not an error", () => {
    const dir = makeEntityDslDir();
    writeEntityTsx(dir);
    const { bp, rp } = compileEntityDsl(dir);
    assert.ok(bp["entities/critter.json"]);
    assert.strictEqual(rp["entity/critter.json"], undefined, "no visual props at all (no textures given, no asset folder to auto-derive from) means genuinely no RP document - a real, deliberate choice, not a bug");
    fs.rmSync(dir, { recursive: true, force: true });
});

test("compileEntityDsl (OR-Track Q6): editing ONLY a texture file (no *.entity.tsx change) still invalidates the real compile cache", () => {
    const dir = makeEntityDslDir();
    writeEntityTsx(dir);
    fs.mkdirSync(path.join(dir, "critter"));
    fs.writeFileSync(path.join(dir, "critter", "critter.png"), Buffer.from([1, 1, 1]));

    const before = compileEntityDsl(dir);
    assert.ok(before.rp["textures/entity/critter/critter.png"].equals(Buffer.from([1, 1, 1])));

    fs.writeFileSync(path.join(dir, "critter", "critter.png"), Buffer.from([2, 2, 2]));
    const after = compileEntityDsl(dir);
    assert.ok(after.rp["textures/entity/critter/critter.png"].equals(Buffer.from([2, 2, 2])), "a real texture-only edit must be picked up, not masked by the cache");

    fs.rmSync(dir, { recursive: true, force: true });
});

console.log(`\n${passed} passed`);
