// OR-Track Q6 (made real): a real, cheap mtime+size compile cache shared by
// entityDsl/entityCompiler.js and manifestDsl/manifestCompiler.js, so
// `openrock dev`'s long-running watch loop genuinely "compiles only
// changed files" at the one layer that's actually expensive - a fresh
// `tsc` child-process spawn per DSL directory on every save, even when
// that directory's own source didn't change (buildMod() itself is still
// called in full on every deploy, for real correctness; this cache
// specifically skips the compiler's own most expensive step when its
// real inputs are provably unchanged).
//
// Also fixes a real, pre-existing correctness bug this work surfaced: MinUI's
// own requireCompiled() (vendor/minui/src/jsxCompile.js) only cache-busts the
// ONE compiled file it's asked to load - it never busts the require cache for
// that file's own transitive requires (jsx-runtime.js, components.js,
// entityBuilder.js/manifestBuilder.js). In a long-running `dev` process,
// Node's own require cache would otherwise silently keep serving the FIRST
// version of those shared runtime files for the rest of the session, even
// after editing and saving them - a real "why didn't my change take effect"
// bug, not a hypothetical one. bustRequireCacheUnder() fixes this the same
// way requireCompiled() itself does it for one file, just for a whole
// directory.
"use strict";

const fs = require("fs");
const path = require("path");

/**
 * A cheap, real signature for a set of files - concatenated mtime+size per
 * file. Not a content hash (no reason to read file contents just to detect
 * "did anything change" - mtime+size is exactly what every real build
 * system's fast-path staleness check uses, e.g. Make's own mtime
 * comparison). A missing file (deleted since last compile) is included as
 * "missing" rather than throwing, so a real deletion still changes the
 * signature and forces a real recompile.
 * @param {string[]} absPaths
 */
function signatureForFiles(absPaths) {
    return absPaths.map(p => {
        try {
            const st = fs.statSync(p);
            return `${p}:${st.mtimeMs}:${st.size}`;
        } catch {
            return `${p}:missing`;
        }
    }).join("|");
}

/**
 * Deletes every require.cache entry whose resolved path lives under any of
 * `dirs` - so the NEXT require() of a file in that directory re-reads it
 * from disk instead of serving a stale in-memory copy. Used before
 * re-requiring a DSL's shared runtime files (components.js, jsx-runtime.js,
 * the emission backend) whenever a real recompile happens.
 * @param {string[]} dirs - absolute directory paths.
 */
function bustRequireCacheUnder(dirs) {
    const prefixes = dirs.map(d => path.resolve(d) + path.sep);
    for (const key of Object.keys(require.cache)) {
        if (prefixes.some(prefix => key.startsWith(prefix))) delete require.cache[key];
    }
}

/**
 * A tiny, real memoization wrapper: `cacheMap` is a plain `Map` the caller
 * owns (one entry per distinct DSL source directory/file, so different
 * mods' DSL units never collide). Returns the cached value unchanged if
 * `signature` matches what was cached last time; otherwise busts
 * `bustDirs`' require cache, computes a fresh value via `compute()`, and
 * caches it under the new signature.
 * @param {Map<string, {signature: string, value: *}>} cacheMap
 * @param {string} key
 * @param {string} signature
 * @param {string[]} bustDirs
 * @param {() => *} compute
 */
function withCompileCache(cacheMap, key, signature, bustDirs, compute) {
    const cached = cacheMap.get(key);
    if (cached && cached.signature === signature) return cached.value;
    bustRequireCacheUnder(bustDirs);
    const value = compute();
    cacheMap.set(key, { signature, value });
    return value;
}

module.exports = { signatureForFiles, bustRequireCacheUnder, withCompileCache };
