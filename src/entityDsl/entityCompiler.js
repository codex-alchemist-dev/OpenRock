// OpenRock entity DSL - the real compiler entry point (OR-Track M1),
// mirroring MinUI's own proven screenCompiler.js exactly: real tsc compiles
// a mod's `.entity.tsx` files, the compiled output is loaded as an
// ordinary Node module (requireCompiled(), shared with MinUI - never a
// second implementation), and each file's default-exported `<Entity>` node
// is walked through entityBuilder.js's real, proven emission backend.
"use strict";

const fs = require("fs");
const path = require("path");
const { compileWithRealTsc, requireCompiled } = require(path.join(__dirname, "..", "..", "vendor", "minui", "src", "jsxCompile.js"));
const { buildEntity } = require("./entityBuilder.js");

const TEMPLATE_TSCONFIG = path.join(__dirname, "tsconfig.template.json");

// Real behavior, confirmed (not assumed): without an explicit "rootDir",
// tsc computes the common ancestor of EVERY file it processes - including
// allowJs-imported dependency files like jsx-runtime.js/components.js,
// which live outside entityDslDir - so the compiled output for one source
// file doesn't land at a fixed, predictable path. Searching for it by
// basename is simpler and more robust than trying to replicate tsc's own
// rootDir-inference logic.
function findCompiledFile(dir, filename) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const found = findCompiledFile(full, filename);
            if (found) return found;
        } else if (entry.name === filename) {
            return full;
        }
    }
    return null;
}

/**
 * Compiles every `.entity.tsx`/`.entity.ts` file under `entityDslDir` into
 * real Bedrock entity JSON.
 * @param {string} entityDslDir - a mod's real entity-DSL source directory
 *   (its `content.entityDsl` manifest field).
 * @param {object} [opts]
 * @param {string} [opts.outDir] - where tsc writes real compiled `.js`
 *   output; defaults to a `.entity-dsl-dist` directory next to `entityDslDir`.
 * @returns {Record<string, object>} outputPath (relative, e.g.
 *   "entities/nav_test.json") -> the real, final Bedrock entity document.
 */
function compileEntityDsl(entityDslDir, { outDir } = {}) {
    if (!fs.existsSync(entityDslDir)) return {};
    const sourceFiles = fs.readdirSync(entityDslDir).filter(f => /\.entity\.tsx?$/.test(f));
    if (sourceFiles.length === 0) return {};

    const realOutDir = outDir ?? path.join(entityDslDir, ".entity-dsl-dist");
    const template = JSON.parse(fs.readFileSync(TEMPLATE_TSCONFIG, "utf8"));
    const tsconfig = {
        ...template,
        compilerOptions: { ...template.compilerOptions, outDir: realOutDir },
        include: sourceFiles,
    };
    const tsconfigPath = path.join(entityDslDir, "tsconfig.entity-dsl.json");
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));
    try {
        compileWithRealTsc(tsconfigPath, { cwd: entityDslDir });
    } finally {
        fs.rmSync(tsconfigPath, { force: true }); // a real, generated build artifact - never left behind as a stray file
    }

    const output = {};
    for (const sourceFile of sourceFiles) {
        const baseName = sourceFile.replace(/\.entity\.tsx?$/, "");
        const compiledPath = findCompiledFile(realOutDir, `${baseName}.entity.js`);
        if (!compiledPath) throw new Error(`entityCompiler: couldn't find compiled output for "${sourceFile}" under ${realOutDir} - real tsc succeeded but produced no matching file`);
        const mod = requireCompiled(compiledPath);
        const entityNode = mod.default ?? mod;
        if (!entityNode || entityNode.tag !== "Entity") {
            throw new Error(`entityCompiler: "${sourceFile}" must default-export a real <Entity> node, got ${JSON.stringify(entityNode)}`);
        }
        const identifier = entityNode.attrs.identifier;
        const shortName = identifier.includes(":") ? identifier.split(":")[1] : identifier;
        output[`entities/${shortName}.json`] = buildEntity(entityNode);
    }
    return output;
}

module.exports = { compileEntityDsl };
