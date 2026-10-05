// Unbundled "dev layout" of a package's scripts, for unit tests that import engine modules directly in Node
// (with a stubbed @minecraft/server). Libraries land at <out>/scripts/, the root mod's scripts at <out>/scripts/content/.
// Virtual modules are written over the shim files that re-export them; remaining bare package specifiers
// ("@openchara/core") become relative imports.
"use strict";

const fs = require("fs");
const path = require("path");
const { resolveBuildPlan, renderEntryContent } = require("./buildPipeline.js");
const { extractVirtualModules, SPECIFIER_PREFIX } = require("./virtualModules.js");

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) walk(f, out); else out.push(f);
    }
    return out;
}

function writeLooseScripts(modDir, outDir, opts = {}) {
    const plan = resolveBuildPlan(modDir, opts);
    const bp = new Map(), rp = new Map();
    for (const entry of plan.ordered) renderEntryContent(entry, { bp, rp }, plan.datagenApi, plan.modManifest, plan.dir);
    const virtuals = extractVirtualModules(bp);

    const placed = new Map(); // absolute source file -> absolute output file
    for (const { name, root } of plan.scriptRoots) {
        const base = path.join(outDir, "scripts", name === plan.modManifest.name ? "content" : "");
        for (const f of walk(root)) {
            const out = path.join(base, path.relative(root, f));
            fs.mkdirSync(path.dirname(out), { recursive: true });
            fs.writeFileSync(out, fs.readFileSync(f));
            placed.set(f, out);
        }
    }
    const specifiers = new Map(); // bare specifier -> output file
    for (const [spec, abs] of plan.resolveMap) if (placed.has(abs)) specifiers.set(spec, placed.get(abs));

    for (const out of placed.values()) {
        if (!out.endsWith(".js")) continue;
        let text = fs.readFileSync(out, "utf8");
        text = text.replace(/(from\s+|import\s+)(["'])([^"']+)\2/g, (m, pre, q, spec) => {
            if (spec.startsWith(SPECIFIER_PREFIX)) return m; // virtual: handled below
            const target = specifiers.get(spec);
            if (!target) return m;
            let rel = path.relative(path.dirname(out), target).split(path.sep).join("/");
            if (!rel.startsWith(".")) rel = `./${rel}`;
            return `${pre}${q}${rel}${q}`;
        });
        const shim = /^export \* from "@openrock\/virtual\/([^"]+)";\s*$/m.exec(text);
        if (shim && virtuals.has(shim[1]) && text.split("\n").filter(l => l && !l.startsWith("//")).length === 1) text = virtuals.get(shim[1]);
        fs.writeFileSync(out, text);
    }
    return { outDir, files: [...placed.values()] };
}

module.exports = { writeLooseScripts };
