// `openrock scaffold <name> [path]`
// Generate a new library with boilerplate.
"use strict";

const fs = require("fs");
const path = require("path");

const MPL2_LICENSE = `Mozilla Public License Version 2.0
==================================

1. Definitions
--------------

1.1. "Contributor"
    means each individual or legal entity that creates, contributes to
    the creation of, or owns Covered Software.

1.2. "Contributor Version"
    means the contribution of a Contributor.

1.3. "Covered Software"
    means Source Code and Executable Form, with the exception that it
    does not include Source Code or Executable Form materials that are
    governed solely by the terms of this Agreement and not also governed
    by the terms of any other agreement.

2. License Grants
-----------------

2.1. The Initial Developer Grant.
    Subject to the restrictions in Section 2.2, Mozilla and each Contributor
    hereby grants You a world-wide, royalty-free, non-exclusive license to
    the Source Code version of the Covered Software.

3. Distribution Obligations
----------------------------

3.1. Application of License.
    The Source Code and Executable Form of Covered Software, and any
    Derivatives thereof, must be made available under the terms of this
    License.

3.2. Distribution of Source Form.
    If You distribute Covered Software in Source Code form, then:
    (a) it must be under the terms of this License; and
    (b) You must make source available.

3.3. Distribution of Executable Form.
    If You distribute Covered Software in Executable Form then:
    (a) it must be under the terms of this License; and
    (b) You must make source available.

6. Trademarks.
    This License does not grant permission to use the trade names, trademarks,
    service marks, or product names of the Licensor.

7. Limitation of Liability.
    Under no circumstances shall any Licensor be liable to licensee for
    any indirect, incidental, special, consequential or exemplary damages.

END OF MOZILLA PUBLIC LICENSE 2.0`;

function cmdScaffold(libName, targetPath) {
    if (!libName) throw new Error("Usage: openrock scaffold <name> [path]");
    if (!/^[a-z][a-z0-9-]*$/.test(libName)) {
        throw new Error("Name must start with letter, contain only lowercase letters, numbers, hyphens");
    }

    const dir = targetPath ? path.resolve(targetPath) : path.resolve(process.cwd(), libName);
    if (fs.existsSync(dir)) throw new Error(`Directory already exists: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });

    // Create openrock.library.json
    const libManifest = {
        name: `@openrock/${libName}`,
        provides: {
            api: "lib",
            hookNamespaces: []
        },
        dependencies: []
    };
    fs.writeFileSync(path.join(dir, "openrock.library.json"), JSON.stringify(libManifest, null, 2) + "\n");

    // Create package.json
    const pkg = {
        name: `@openrock/${libName}`,
        version: "1.0.0",
        description: `OpenRock library: ${libName}`,
        main: "src/register.js",
        scripts: {
            test: `node test/${libName}.test.js`
        },
        license: "MPL-2.0",
        keywords: ["openrock", "bedrock-edition"]
    };
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

    // Create README.md
    const readme = `# @openrock/${libName}

OpenRock library: ${libName}.

## Installation

Add to your mod's dependencies in openrock.mod.json.

## API

See src/register.js for available functions.

## License

Mozilla Public License 2.0
`;
    fs.writeFileSync(path.join(dir, "README.md"), readme);

    // Create LICENSE
    fs.writeFileSync(path.join(dir, "LICENSE"), MPL2_LICENSE + "\n");

    // Create src directory
    const srcDir = path.join(dir, "src");
    fs.mkdirSync(srcDir);

    // Create src/register.js
    const register = `// @openrock/${libName} - see README.
// Pure functions are real top-level exports; register() exposes the API
// through the kernel.
"use strict";

// TODO: Import your modules here
// const myModule = require("./myModule.js");

// TODO: Implement your API
const stubApi = {
    // greet(name) { return \`Hello, \${name}!\`; }
};

const api = { ...stubApi };

function register() {
    return { api };
}

module.exports = Object.assign(register, api);
`;
    fs.writeFileSync(path.join(srcDir, "register.js"), register);

    // Create test directory
    const testDir = path.join(dir, "test");
    fs.mkdirSync(testDir);

    // Create test file
    const testFile = `#!/usr/bin/env node
// Tests for @openrock/${libName}
"use strict";

const assert = require("assert");
const lib = require("../src/register.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(\`ok - \${name}\`); }
    catch (e) { console.error(\`FAIL - \${name}\`); console.error(e); process.exitCode = 1; }
}

test("smoke: module loads and exports register function", () => {
    assert.strictEqual(typeof lib, "function");
    const { api } = lib();
    assert.strictEqual(typeof api, "object");
});

console.log(\`\\n\${passed} passed\`);
`;
    fs.writeFileSync(path.join(testDir, `${libName}.test.js`), testFile);
    fs.chmodSync(path.join(testDir, `${libName}.test.js`), 0o755);

    console.log(`Created @openrock/${libName} at ${dir}`);
    console.log("\nNext steps:");
    console.log(`  1. cd ${dir}`);
    console.log(`  2. Edit src/register.js to implement your API`);
    console.log(`  3. npm test to run the smoke test`);
    return { ok: true, dir };
}

module.exports = { cmdScaffold };
