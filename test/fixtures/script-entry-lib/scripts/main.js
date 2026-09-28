// Real relative-import usage, proving esbuild bundles + keeps genuinely
// used code from a same-package file reached via a relative import (not
// just a bare side-effect import, which real tree-shaking would legally
// drop if nothing were actually used from it - see buildPipeline.test.js).
import { HELPER } from "./helper.js";
export const ENTRY = HELPER;
