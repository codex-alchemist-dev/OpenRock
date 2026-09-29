// OpenRock entity DSL, real name "Crystal Manifest-Entity" (see
// docs/crystal.md for the full naming rationale) - the real compiler entry
// point (OR-Track M1), mirroring MinUI's own proven screenCompiler.js
// exactly: real tsc compiles a mod's `.entity.tsx` files, the compiled
// output is loaded as an ordinary Node module (requireCompiled(), shared
// with MinUI - never a second implementation), and each file's default-
// exported `<Entity>` node is walked through entityBuilder.js's real,
// proven emission backend.
"use strict";

const fs = require("fs");
const path = require("path");
const { compileWithRealTsc, requireCompiled } = require(path.join(__dirname, "..", "..", "vendor", "minui", "src", "jsxCompile.js"));
const { buildEntity } = require("./entityBuilder.js");
const { signatureForFiles, withCompileCache } = require("../devCache.js");
const { walk } = require("../fsTree.js");
const { formatTscFailure } = require("../buildDiagnostics.js");

// Real per-entity asset co-location (OR-Track M6, per the user's own
// explicit standing architectural rule: OpenRock's own mod format is ONE
// real directory per real thing - unlike native Bedrock, which splits
// behavior and resource into two separate packs/folders entirely).
// Alongside "<shortName>.entity.tsx", a real sibling directory literally
// named "<shortName>/" can hold that entity's own textures (and, as this
// grows, models/PBR maps) - its ENTIRE contents are copied verbatim into
// the real Bedrock RP path "textures/entity/<shortName>/", so a real
// Vibrant Visuals PBR set (base.png + base_normal.png + base_mer.png,
// Bedrock's own real sibling-file convention - already naturally
// "one folder per subject" once you look at its real file layout) just
// works by dropping all of them in the one folder, no per-file DSL
// bookkeeping. If the author didn't already give `<Entity textures=.../>`
// explicitly, and a file matching the entity's own short name exists in
// that folder (a real, simple, discoverable "the default texture is named
// after you" convention), textures.default is auto-derived - the whole
// point being an author never hand-writes a Bedrock RP path string at all.
const TEXTURE_EXTENSIONS = new Set([".png", ".tga"]);

function collectEntityAssets(entityDslDir, shortName) {
    const assetDir = path.join(entityDslDir, shortName);
    if (!fs.existsSync(assetDir) || !fs.statSync(assetDir).isDirectory()) return { rpFiles: {}, defaultTexturePath: null };
    const rpFiles = {};
    let defaultTexturePath = null;
    for (const rel of walk(assetDir)) {
        const outRel = `textures/entity/${shortName}/${rel}`;
        rpFiles[outRel] = fs.readFileSync(path.join(assetDir, rel));
        const ext = path.extname(rel);
        const base = path.basename(rel, ext);
        if (TEXTURE_EXTENSIONS.has(ext) && base === shortName) {
            defaultTexturePath = outRel.slice(0, -ext.length); // Bedrock's own real convention: reference the path WITHOUT its extension
        }
    }
    return { rpFiles, defaultTexturePath };
}

// Every real file under every immediate subdirectory of entityDslDir
// (excluding the generated dist output) is a potential per-entity asset -
// folded into the real Q6 compile-cache signature below, so editing JUST a
// texture (no *.entity.tsx change at all) still invalidates the cache
// correctly instead of serving stale asset bytes forever.
function collectAllAssetSourcePaths(entityDslDir) {
    const paths = [];
    if (!fs.existsSync(entityDslDir)) return paths;
    for (const entry of fs.readdirSync(entityDslDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === ".entity-dsl-dist") continue;
        const assetDir = path.join(entityDslDir, entry.name);
        for (const rel of walk(assetDir)) paths.push(path.join(assetDir, rel));
    }
    return paths;
}

const TEMPLATE_TSCONFIG = path.join(__dirname, "tsconfig.template.json");
// This DSL's own shared runtime files - part of every compile's real
// signature (a change here must invalidate every cached entity DSL
// directory's output, not just the one currently being edited) and busted
// from require.cache on every real recompile (OR-Track Q6's fix for
// requireCompiled() only busting the ONE compiled file it loads, never its
// transitive requires).
const RUNTIME_FILES = [path.join(__dirname, "jsx-runtime.js"), path.join(__dirname, "components.js"), path.join(__dirname, "entityBuilder.js")];
const compileCache = new Map(); // entityDslDir -> {signature, value: output}

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
 * @returns {{bp: Record<string, object>, rp: Record<string, object>}} - bp
 *   keys look like "entities/nav_test.json" (the real behavior document,
 *   always present); rp keys look like "entity/nav_test.json" (the real
 *   client_entity visual document, only when the author gave real visual
 *   props on `<Entity>` - see entityBuilder.js's buildClientEntityDoc()).
 */
function compileEntityDsl(entityDslDir, { outDir } = {}) {
    if (!fs.existsSync(entityDslDir)) return { bp: {}, rp: {} };
    const sourceFiles = fs.readdirSync(entityDslDir).filter(f => /\.entity\.tsx?$/.test(f));
    if (sourceFiles.length === 0) return { bp: {}, rp: {} };

    const sourceAbsPaths = sourceFiles.map(f => path.join(entityDslDir, f));
    const signature = signatureForFiles([...sourceAbsPaths, ...RUNTIME_FILES, ...collectAllAssetSourcePaths(entityDslDir)]);
    const cacheKey = `${entityDslDir}::${outDir ?? ""}`; // outDir is part of the real cache identity - a different outDir needs a real recompile, never a stale cached path

    return withCompileCache(compileCache, cacheKey, signature, [__dirname], () => {
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
        } catch (err) {
            throw new Error(formatTscFailure(err, { cwd: entityDslDir, dialect: "Crystal Manifest-Entity" }));
        } finally {
            fs.rmSync(tsconfigPath, { force: true }); // a real, generated build artifact - never left behind as a stray file
        }

        const bp = {};
        const rp = {};
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

            // Real per-entity asset co-location (OR-Track M6) - collect
            // real texture files from a real sibling "<shortName>/" folder
            // BEFORE building the client_entity doc, so an auto-derived
            // default texture path can be injected into the SAME node
            // buildEntity() sees (never a second, drifting code path for
            // "what textures does this entity have").
            const { rpFiles, defaultTexturePath } = collectEntityAssets(entityDslDir, shortName);
            let effectiveNode = entityNode;
            if (!entityNode.attrs.textures && defaultTexturePath) {
                effectiveNode = { ...entityNode, attrs: { ...entityNode.attrs, textures: { default: defaultTexturePath } } };
            }

            const { bp: bpDoc, rp: rpDoc } = buildEntity(effectiveNode);
            bp[`entities/${shortName}.json`] = bpDoc;
            // Real Bedrock convention, confirmed: BP entity documents live
            // under "entities/" (plural); RP client_entity documents live
            // under "entity/" (SINGULAR) - a real, easy-to-miss asymmetry
            // (pathfinding-demo's own old hand-rolled rp/entities/ overlay
            // got this wrong before this migration, a real latent bug this
            // DSL now gets right by construction).
            if (rpDoc) rp[`entity/${shortName}.json`] = rpDoc;
            // Real texture (and, as this grows, model/PBR) files, copied
            // verbatim - real Buffer values, not JSON documents (see
            // buildPipeline.js's DIRECTORY_DSLS consumption, which checks
            // Buffer.isBuffer() before deciding whether to JSON.stringify).
            Object.assign(rp, rpFiles);
        }
        return { bp, rp };
    });
}

module.exports = { compileEntityDsl };
