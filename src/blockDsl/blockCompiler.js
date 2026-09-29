// Crystal Manifest-Block's real compiler entry point (OR-Track M4),
// mirroring src/entityDsl/entityCompiler.js's own proven shape exactly:
// real tsc compiles a mod's `.block.tsx` files, the compiled output is
// loaded via MinUI's shared, proven requireCompiled(), and each file's
// default-exported <Block> node is walked through blockBuilder.js's real,
// declarative emission backend. Also reuses OR-Track Q6's real compile
// cache (src/devCache.js) - a directory whose *.block.tsx files (and this
// DSL's own shared runtime files) haven't changed since the last compile
// skips real tsc entirely.
"use strict";

const fs = require("fs");
const path = require("path");
const { compileWithRealTsc, requireCompiled } = require(path.join(__dirname, "..", "..", "vendor", "minui", "src", "jsxCompile.js"));
const { buildBlock } = require("./blockBuilder.js");
const { signatureForFiles, withCompileCache } = require("../devCache.js");
const { formatTscFailure } = require("../buildDiagnostics.js");

const TEMPLATE_TSCONFIG = path.join(__dirname, "tsconfig.template.json");
const RUNTIME_FILES = [path.join(__dirname, "jsx-runtime.js"), path.join(__dirname, "components.js"), path.join(__dirname, "blockBuilder.js")];
const compileCache = new Map();

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
 * Compiles every `.block.tsx`/`.block.ts` file under `blockDslDir` into
 * real Bedrock block JSON.
 * @param {string} blockDslDir - a mod's real `content.blockDsl` directory.
 * @param {object} [opts]
 * @param {string} [opts.outDir]
 * @returns {{bp: Record<string, object>, rp: Record<string, object>}} - bp
 *   keys look like "blocks/foo.json" (blocks have no separate RP-side
 *   document format the way entities do, so `rp` is always empty - kept
 *   for shape-uniformity with the other Crystal Manifest-* compilers, see
 *   src/buildPipeline.js's DIRECTORY_DSLS).
 */
function compileBlockDsl(blockDslDir, { outDir } = {}) {
    if (!fs.existsSync(blockDslDir)) return { bp: {}, rp: {} };
    const sourceFiles = fs.readdirSync(blockDslDir).filter(f => /\.block\.tsx?$/.test(f));
    if (sourceFiles.length === 0) return { bp: {}, rp: {} };

    const sourceAbsPaths = sourceFiles.map(f => path.join(blockDslDir, f));
    const signature = signatureForFiles([...sourceAbsPaths, ...RUNTIME_FILES]);
    const cacheKey = `${blockDslDir}::${outDir ?? ""}`;

    return withCompileCache(compileCache, cacheKey, signature, [__dirname], () => {
        const realOutDir = outDir ?? path.join(blockDslDir, ".block-dsl-dist");
        const template = JSON.parse(fs.readFileSync(TEMPLATE_TSCONFIG, "utf8"));
        const tsconfig = { ...template, compilerOptions: { ...template.compilerOptions, outDir: realOutDir }, include: sourceFiles };
        const tsconfigPath = path.join(blockDslDir, "tsconfig.block-dsl.json");
        fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));
        try {
            compileWithRealTsc(tsconfigPath, { cwd: blockDslDir });
        } catch (err) {
            throw new Error(formatTscFailure(err, { cwd: blockDslDir, dialect: "Crystal Manifest-Block" }));
        } finally {
            fs.rmSync(tsconfigPath, { force: true });
        }

        const output = {};
        for (const sourceFile of sourceFiles) {
            const baseName = sourceFile.replace(/\.block\.tsx?$/, "");
            const compiledPath = findCompiledFile(realOutDir, `${baseName}.block.js`);
            if (!compiledPath) throw new Error(`blockCompiler: couldn't find compiled output for "${sourceFile}" under ${realOutDir} - real tsc succeeded but produced no matching file`);
            const mod = requireCompiled(compiledPath);
            const blockNode = mod.default ?? mod;
            if (!blockNode || blockNode.tag !== "Block") {
                throw new Error(`blockCompiler: "${sourceFile}" must default-export a real <Block> node, got ${JSON.stringify(blockNode)}`);
            }
            const identifier = blockNode.attrs.identifier;
            const shortName = identifier.includes(":") ? identifier.split(":")[1] : identifier;
            output[`blocks/${shortName}.json`] = buildBlock(blockNode);
        }
        return { bp: output, rp: {} };
    });
}

module.exports = { compileBlockDsl };
