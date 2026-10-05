// `openrock scaffold <name> [--deps=a,b] [--hooks=x,y] [--api=fn1,fn2] [--desc=text] [--runtime] [--out=dir]`
// Generates a first-party library skeleton in the libs/i18n layout: manifest,
// package.json, README, LICENSE, src/register.js (TODO-throwing API stubs),
// and a smoke test, then appends that test to the root package.json chain.
"use strict";

const fs = require("fs");
const path = require("path");

const flagValue = (flags, name) => flags.find(f => f.startsWith(`--${name}=`))?.slice(name.length + 3);
const list = v => (v ? v.split(",").map(s => s.trim()).filter(Boolean) : []);
const camel = s => s.replace(/-(\w)/g, (_, c) => c.toUpperCase());

function cmdScaffold(name, flags = [], root) {
    if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) throw new Error("Usage: openrock scaffold <name> (lowercase letters, digits, hyphens)");
    const pkgName = `@openrock/${name}`;
    const libsDir = path.join(root, "libs");
    const dir = path.resolve(flagValue(flags, "out") ?? path.join(libsDir, name));
    if (fs.existsSync(dir)) throw new Error(`Directory already exists: ${dir}`);

    const deps = list(flagValue(flags, "deps"));
    const hooks = list(flagValue(flags, "hooks"));
    const api = list(flagValue(flags, "api"));
    const desc = flagValue(flags, "desc") ?? `OpenRock library: ${name}.`;
    const runtime = flags.includes("--runtime");

    const manifest = {
        openrockVersion: 1, kind: "library", name: pkgName, version: "0.1.0", entry: "src/register.js",
        ...(deps.length ? { dependsOn: Object.fromEntries(deps.map(d => [d.startsWith("@") ? d : `@openrock/${d}`, { type: "library" }])) } : {}),
        provides: { ...(runtime ? { api: "src/register.js" } : {}), hookNamespaces: hooks.length ? hooks : [name] },
        ...(runtime ? { scripts: { runtime: true } } : {}),
    };
    const w = (rel, text) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };

    w("openrock.library.json", JSON.stringify(manifest, null, 2) + "\n");
    w("package.json", JSON.stringify({ name: pkgName, version: "0.1.0", description: desc, license: "MPL-2.0", private: true, main: "src/register.js" }, null, 2) + "\n");
    w("README.md", `# ${pkgName}\n\n${desc}\n\nSTATUS: stub. Every API function currently throws "not implemented"; the shape below is the contract to implement.\n\n## API\n\n${api.map(a => `- \`${a}\``).join("\n") || "- (none declared yet)"}\n`);
    const license = path.join(libsDir, "i18n", "LICENSE");
    w("LICENSE", fs.existsSync(license) ? fs.readFileSync(license, "utf8") : "MPL-2.0 - see https://mozilla.org/MPL/2.0/\n");

    const fns = api.map(a => `    ${camel(a)}() { throw new Error("${pkgName}: ${camel(a)} is not implemented"); },`).join("\n");
    w("src/register.js", `// ${pkgName} - ${desc}\n// Stub: replace each TODO-throwing function with a real implementation.\n// Pure functions stay real top-level exports; register() exposes the same API through the kernel.\n"use strict";\n\nconst api = {\n${fns}\n};\n\nfunction register(kernel, ctx) {\n    return { api };\n}\n\nmodule.exports = Object.assign(register, api);\n`);
    w(`test/${name}.test.js`, `#!/usr/bin/env node\n"use strict";\n\nconst assert = require("assert");\nconst path = require("path");\nconst { loadManifestFile } = require(path.join(__dirname, "..", "..", "..", "src", "manifest.js"));\nconst lib = require("../src/register.js");\n\nlet passed = 0;\nfunction test(name, fn) {\n    try { fn(); passed++; console.log(\`ok - \${name}\`); }\n    catch (e) { console.error(\`FAIL - \${name}\`); console.error(e); process.exitCode = 1; }\n}\n\ntest("${name}: manifest validates", () => {\n    const { manifest } = loadManifestFile(path.join(__dirname, ".."));\n    assert.strictEqual(manifest.name, "${pkgName}");\n});\n\ntest("${name}: register() exposes the declared API; every stub fails loudly", () => {\n    const { api } = lib();\n    for (const [k, fn] of Object.entries(api)) {\n        assert.strictEqual(typeof fn, "function", k);\n        assert.throws(() => fn(), /not implemented/, k);\n    }\n});\n\nconsole.log(\`\n\${passed} passed\`);\n`);

    const pj = path.join(root, "package.json");
    const rel = `libs/${name}/test/${name}.test.js`;
    if (path.resolve(dir) === path.join(libsDir, name) && fs.existsSync(pj)) {
        const p = JSON.parse(fs.readFileSync(pj, "utf8"));
        if (!p.scripts.test.includes(rel)) { p.scripts.test += ` && node ${rel}`; fs.writeFileSync(pj, JSON.stringify(p, null, 2) + "\n"); }
    }
    console.log(`Created ${pkgName} at ${dir}`);
    return { ok: true, dir };
}

module.exports = { cmdScaffold };
