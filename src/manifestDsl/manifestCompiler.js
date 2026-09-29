// OpenRock manifest DSL, real name "Crystal Manifest" (see docs/crystal.md
// for the full naming rationale) - the real compiler entry point
// (OR-Track O), mirroring src/entityDsl/entityCompiler.js's own proven
// shape: real tsc compiles a mod's single `.manifest.tsx` file, the
// compiled output is loaded via MinUI's shared, proven requireCompiled(),
// and the default-exported <ManifestSet> node is walked through
// manifestBuilder.js's real, declarative emission backend.
"use strict";

const fs = require("fs");
const path = require("path");
const { compileWithRealTsc, requireCompiled } = require(path.join(__dirname, "..", "..", "vendor", "minui", "src", "jsxCompile.js"));
const { buildManifestSet } = require("./manifestBuilder.js");
const { signatureForFiles, withCompileCache } = require("../devCache.js");
const { formatTscFailure } = require("../buildDiagnostics.js");

const TEMPLATE_TSCONFIG = path.join(__dirname, "tsconfig.template.json");
// OR-Track Q6: this DSL's own shared runtime files - see entityCompiler.js's
// identical RUNTIME_FILES for the full rationale (cache invalidation +
// require-cache busting for files a compiled unit transitively requires).
const RUNTIME_FILES = [path.join(__dirname, "jsx-runtime.js"), path.join(__dirname, "components.js"), path.join(__dirname, "manifestBuilder.js")];
const compileCache = new Map(); // `${manifestDslFile}::${outDir}` -> {signature, value}

// Same real, confirmed tsc rootDir-inference issue entityCompiler.js's own
// findCompiledFile() works around - not shared as one util because each
// compiler is intentionally self-contained (see jsx-runtime.js's own note).
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
 * Compiles one mod's `.manifest.tsx` file into real manifest.json override
 * documents.
 * @param {string} manifestDslFile - a mod's real `content.manifestDsl` file
 *   (an absolute path to a single `.manifest.tsx`/`.manifest.ts` file - a
 *   pack has exactly one real manifest.json per side, so unlike the entity
 *   DSL's directory-of-many-files, this compiles one file).
 * @param {object} [opts]
 * @param {string} [opts.outDir] - where tsc writes compiled `.js` output;
 *   defaults to a `.manifest-dsl-dist` directory next to the source file.
 * @returns {{bp: object|null, rp: object|null}|null} `null` if the file
 *   doesn't exist (no manifest DSL authored for this mod - not an error).
 */
function compileManifestDsl(manifestDslFile, { outDir } = {}) {
    if (!fs.existsSync(manifestDslFile)) return null;
    if (!/\.manifest\.tsx?$/.test(manifestDslFile)) {
        throw new Error(`manifest DSL: content.manifestDsl "${manifestDslFile}" must be a real ".manifest.tsx" or ".manifest.ts" file`);
    }

    const dir = path.dirname(manifestDslFile);
    const fileName = path.basename(manifestDslFile);
    const signature = signatureForFiles([manifestDslFile, ...RUNTIME_FILES]);
    const cacheKey = `${manifestDslFile}::${outDir ?? ""}`;

    return withCompileCache(compileCache, cacheKey, signature, [__dirname], () => {
        const realOutDir = outDir ?? path.join(dir, ".manifest-dsl-dist");
        const template = JSON.parse(fs.readFileSync(TEMPLATE_TSCONFIG, "utf8"));
        const tsconfig = {
            ...template,
            compilerOptions: { ...template.compilerOptions, outDir: realOutDir },
            include: [fileName],
        };
        const tsconfigPath = path.join(dir, "tsconfig.manifest-dsl.json");
        fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));
        try {
            compileWithRealTsc(tsconfigPath, { cwd: dir });
        } catch (err) {
            throw new Error(formatTscFailure(err, { cwd: dir, dialect: "Crystal Manifest" }));
        } finally {
            fs.rmSync(tsconfigPath, { force: true });
        }

        const baseName = fileName.replace(/\.manifest\.tsx?$/, "");
        const compiledPath = findCompiledFile(realOutDir, `${baseName}.manifest.js`);
        if (!compiledPath) throw new Error(`manifestCompiler: couldn't find compiled output for "${fileName}" under ${realOutDir} - real tsc succeeded but produced no matching file`);
        const mod = requireCompiled(compiledPath);
        const node = mod.default ?? mod;
        return buildManifestSet(node);
    });
}

module.exports = { compileManifestDsl };
