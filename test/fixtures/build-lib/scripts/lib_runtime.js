// build-lib's own in-game runtime script. Illustrative content only - the
// build pipeline copies this file's bytes and generates an import
// statement for it; nothing in these tests actually executes it (it's a
// real Bedrock ES module, not something Node's CommonJS test runner could
// run anyway).
export const LIB_MARKER = "build-lib-loaded";
