// build-lib's own in-game runtime script - real esbuild-bundled into
// build-mod's scripts/main.js (see build-mod/scripts/mod_runtime.js's own
// comment), proving real cross-package `import ... from "build-lib"`
// resolution rather than the old flat-copy mechanism.
export const LIB_MARKER = "build-lib-loaded";
