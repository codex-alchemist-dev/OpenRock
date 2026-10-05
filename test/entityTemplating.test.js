#!/usr/bin/env node
"use strict";
const assert = require("assert");
const path = require("path");
const { buildMod } = require("../src/buildPipeline.js");

try {
    const { bp } = buildMod(path.join(__dirname, "fixtures", "ns-entity-mod"), { vendorDir: path.join(__dirname, "fixtures") });
    const key = [...bp.keys()].find(k => k.startsWith("entities/") && k.endsWith(".json"));
    const doc = JSON.parse(bp.get(key).toString());
    assert.strictEqual(doc["minecraft:entity"].description.identifier, "nem:waifu_nav");
    assert.ok(!JSON.stringify(doc).includes("{{"));
    console.log("ok - entityDsl: {{ns}}/{{char}} in an authored identifier are filled from the mod\n\n1 passed");
} catch (e) { console.error("FAIL - entityDsl templating"); console.error(e); process.exitCode = 1; }
