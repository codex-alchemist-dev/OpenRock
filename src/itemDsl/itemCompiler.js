// Crystal Manifest-Item's real compiler entry point (OR-Track M5),
// mirroring src/blockDsl/blockCompiler.js's own proven shape exactly -
// real tsc, real requireCompiled(), OR-Track Q6's real compile cache.
"use strict";

const { tsPaths, withAlias } = require("../dslAlias.js");

const fs = require("fs");
const path = require("path");
const { compileWithRealTsc, requireCompiled } = require(path.join(__dirname, "..", "..", "vendor", "minui", "src", "jsxCompile.js"));
const { buildItem } = require("./itemBuilder.js");
const { signatureForFiles, withCompileCache } = require("../devCache.js");
const { formatTscFailure } = require("../buildDiagnostics.js");

const TEMPLATE_TSCONFIG = path.join(__dirname, "tsconfig.template.json");
const RUNTIME_FILES = [path.join(__dirname, "jsx-runtime.js"), path.join(__dirname, "components.js"), path.join(__dirname, "itemBuilder.js")];
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
 * Compiles every `.item.tsx`/`.item.ts` file under `itemDslDir` into real
 * Bedrock item JSON.
 * @param {string} itemDslDir - a mod's real `content.itemDsl` directory.
 * @param {object} [opts]
 * @param {string} [opts.outDir]
 * @returns {{bp: Record<string, object>, rp: Record<string, object>}} - bp
 *   keys look like "items/foo.json"; `rp` is always empty (kept for
 *   shape-uniformity with the other Crystal Manifest-* compilers, see
 *   src/buildPipeline.js's DIRECTORY_DSLS).
 */
function compileItemDsl(itemDslDir, { outDir } = {}) {
    if (!fs.existsSync(itemDslDir)) return { bp: {}, rp: {} };
    const sourceFiles = fs.readdirSync(itemDslDir).filter(f => /\.item\.tsx?$/.test(f));
    if (sourceFiles.length === 0) return { bp: {}, rp: {} };

    const sourceAbsPaths = sourceFiles.map(f => path.join(itemDslDir, f));
    const signature = signatureForFiles([...sourceAbsPaths, ...RUNTIME_FILES]);
    const cacheKey = `${itemDslDir}::${outDir ?? ""}`;

    return withCompileCache(compileCache, cacheKey, signature, [__dirname], () => {
        const realOutDir = outDir ?? path.join(itemDslDir, ".item-dsl-dist");
        const template = JSON.parse(fs.readFileSync(TEMPLATE_TSCONFIG, "utf8"));
        const tsconfig = { ...template, compilerOptions: { ...template.compilerOptions, outDir: realOutDir, ...tsPaths("item", itemDslDir) }, include: sourceFiles };
        const tsconfigPath = path.join(itemDslDir, "tsconfig.item-dsl.json");
        fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));
        try {
            compileWithRealTsc(tsconfigPath, { cwd: itemDslDir });
        } catch (err) {
            throw new Error(formatTscFailure(err, { cwd: itemDslDir, dialect: "Crystal Manifest-Item" }));
        } finally {
            fs.rmSync(tsconfigPath, { force: true });
        }

        const output = {};
        for (const sourceFile of sourceFiles) {
            const baseName = sourceFile.replace(/\.item\.tsx?$/, "");
            const compiledPath = findCompiledFile(realOutDir, `${baseName}.item.js`);
            if (!compiledPath) throw new Error(`itemCompiler: couldn't find compiled output for "${sourceFile}" under ${realOutDir} - real tsc succeeded but produced no matching file`);
            const mod = withAlias("item", () => requireCompiled(compiledPath));
            const itemNode = mod.default ?? mod;
            if (!itemNode || itemNode.tag !== "Item") {
                throw new Error(`itemCompiler: "${sourceFile}" must default-export a real <Item> node, got ${JSON.stringify(itemNode)}`);
            }
            const identifier = itemNode.attrs.identifier;
            const shortName = identifier.includes(":") ? identifier.split(":")[1] : identifier;
            output[`items/${shortName}.json`] = buildItem(itemNode);
        }
        return { bp: output, rp: {} };
    });
}

module.exports = { compileItemDsl };
