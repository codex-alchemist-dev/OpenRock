// build-mod's own in-game runtime script - proves real cross-package
// bundling: this imports build-lib's export by PACKAGE NAME (a bare
// specifier, no relative path, no node_modules tree), resolved by
// buildPipeline.js's esbuild plugin to build-lib's own declared script
// entry. The bundled output (test/buildPipeline.test.js) is checked for
// both markers appearing in ONE real bundle, proving esbuild actually
// followed this import rather than the old system's flat file copying.
import { LIB_MARKER } from "build-lib";
export const MOD_MARKER = "build-mod-loaded";
export const COMBINED = `${LIB_MARKER}+${MOD_MARKER}`;
