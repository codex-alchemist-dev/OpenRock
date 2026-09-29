#!/usr/bin/env node
// Real, pure-function tests for src/buildDiagnostics.js - the "build
// debugger" report formatter every Crystal Manifest-*/Crystal TS compiler
// (and esbuild's own script bundling) funnels its real failures through.
// No real tsc/esbuild invocation needed here (that's covered end-to-end by
// a real `openrock build` against a deliberately broken fixture) - these
// are deterministic tests against realistic tsc/esbuild/JSON output shapes.
// Run: node test/buildDiagnostics.test.js
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
    parseTscOutput, codeFrame, hintForTsCode,
    formatTscFailure, formatEsbuildFailure, formatJsonSyntaxError,
} = require("../src/buildDiagnostics.js");

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`ok - ${name}`);
    } catch (e) {
        console.error(`FAIL - ${name}`);
        console.error(e);
        process.exitCode = 1;
    }
}

test("parseTscOutput: extracts file/line/column/code/message from a real tsc diagnostic line", () => {
    const raw = 'nav_test.entity.tsx(12,34): error TS2554: Expected 2 arguments, but got 1.';
    const [d] = parseTscOutput(raw, "/mods/demo/entities");
    assert.strictEqual(d.relFile, "nav_test.entity.tsx");
    assert.strictEqual(d.file, path.resolve("/mods/demo/entities", "nav_test.entity.tsx"));
    assert.strictEqual(d.line, 12);
    assert.strictEqual(d.column, 34);
    assert.strictEqual(d.severity, "error");
    assert.strictEqual(d.code, "TS2554");
    assert.strictEqual(d.message, "Expected 2 arguments, but got 1.");
});

test("parseTscOutput: extracts every real diagnostic from a multi-error tsc run, never just the first", () => {
    const raw = [
        "a.entity.tsx(3,10): error TS2339: Property 'foo' does not exist on type 'EntityProps'.",
        "b.entity.tsx(7,2): error TS2554: Expected 1 arguments, but got 2.",
        "Found 2 errors.",
    ].join("\n");
    const diags = parseTscOutput(raw, "/mods/demo/entities");
    assert.strictEqual(diags.length, 2);
    assert.strictEqual(diags[0].code, "TS2339");
    assert.strictEqual(diags[1].code, "TS2554");
});

test("parseTscOutput: a wrapped multi-line tsc message is folded into the same diagnostic, not dropped or split", () => {
    const raw = [
        "a.entity.tsx(3,10): error TS2322: Type '{ value: string; }' is not assignable to type 'HealthProps'.",
        "  Object literal may only specify known properties.",
    ].join("\n");
    const [d] = parseTscOutput(raw, "/x");
    assert.match(d.message, /Object literal may only specify known properties/);
});

test("parseTscOutput: unparseable/banner lines never throw, and produce zero diagnostics when nothing real matches", () => {
    assert.deepStrictEqual(parseTscOutput("Found 0 errors.\n", "/x"), []);
    assert.deepStrictEqual(parseTscOutput("", "/x"), []);
});

test("codeFrame: places the caret under the exact real column on the exact real line, with surrounding context", () => {
    const src = "line1\nline2\nline3 BAD\nline4\nline5";
    const frame = codeFrame(src, 3, 7, 1);
    assert.match(frame, /line2/);
    assert.match(frame, /line3 BAD/);
    assert.match(frame, /line4/);
    const lines = frame.split("\n");
    const badLineIdx = lines.findIndex(l => l.includes("line3 BAD"));
    const contentLine = lines[badLineIdx];
    const caretLine = lines[badLineIdx + 1];
    // The caret's offset from "|" must match the offset of the real target
    // character ("B" of "BAD", column 7) from "|" on the content line above
    // it - i.e. the caret visually lines up under the exact real column,
    // regardless of how wide the gutter/prefix happens to be.
    const targetOffset = contentLine.indexOf("B", contentLine.indexOf("|")) - contentLine.indexOf("|");
    const caretOffset = caretLine.indexOf("^") - caretLine.indexOf("|");
    assert.strictEqual(caretOffset, targetOffset);
});

test("codeFrame: an out-of-range line returns null instead of throwing", () => {
    assert.strictEqual(codeFrame("only one line", 99, 1), null);
    assert.strictEqual(codeFrame(null, 1, 1), null);
});

test("hintForTsCode: known real codes get a specific, real fix; unknown codes still get a real generic one", () => {
    assert.match(hintForTsCode("TS2339"), /doesn't exist on this component/);
    assert.match(hintForTsCode("TS9999999"), /TS9999999/);
});

test("formatTscFailure: renders every real diagnostic with a header, code frame, and a Fix line", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "or-diag-"));
    const filePath = path.join(dir, "nav_test.entity.tsx");
    fs.writeFileSync(filePath, "const x = 1;\nconst y = brokenProp;\n");
    const tscError = new Error(
        `jsxCompile: real tsc failed compiling "x/tsconfig.json":\n` +
        `nav_test.entity.tsx(2,11): error TS2304: Cannot find name 'brokenProp'.`
    );
    const report = formatTscFailure(tscError, { cwd: dir, dialect: "Crystal Manifest-Entity" });
    assert.match(report, /Crystal Manifest-Entity failed to build - 1 real error found/);
    assert.match(report, /nav_test\.entity\.tsx:2:11/);
    assert.match(report, /TS2304/);
    assert.match(report, /brokenProp/);
    assert.match(report, /const y = brokenProp;/); // real code frame, real source line
    assert.match(report, /Fix: That name isn't defined here/);
    fs.rmSync(dir, { recursive: true, force: true });
});

test("formatTscFailure: a real tsc invocation failure with no parseable diagnostics still surfaces the raw output, never silently empty", () => {
    const err = new Error("jsxCompile: real tsc failed compiling \"x\":\nENOENT: tsc binary not found");
    const report = formatTscFailure(err, { cwd: "/x", dialect: "Crystal Manifest-Block" });
    assert.match(report, /no parseable diagnostics/);
    assert.match(report, /ENOENT/);
});

test("formatEsbuildFailure: renders a real esbuild error with its own location and a code frame from esbuild's own lineText", () => {
    const errors = [{
        text: "Could not resolve \"missing-lib\"",
        location: { file: "scripts/main.js", line: 5, column: 20, lineText: "import { X } from \"missing-lib\";" },
    }];
    const report = formatEsbuildFailure(errors, "my-mod");
    assert.match(report, /esbuild failed bundling "my-mod"'s scripts - 1 real error found/);
    assert.match(report, /scripts\/main\.js:5:21/);
    assert.match(report, /Could not resolve "missing-lib"/);
    assert.match(report, /import \{ X \} from "missing-lib";/);
    assert.match(report, /Fix: Check the import\/reference/);
});

test("formatEsbuildFailure: an error with no location still renders, never throws", () => {
    const report = formatEsbuildFailure([{ text: "some internal esbuild error", location: null }]);
    assert.match(report, /some internal esbuild error/);
});

test("formatJsonSyntaxError: converts a real JSON.parse() character position into a real line/column and code frame", () => {
    const source = '{\n  "a": 1,\n  "b": ,\n  "c": 3\n}';
    let err;
    try { JSON.parse(source); } catch (e) { err = e; }
    assert.ok(err, "the malformed JSON above must actually throw a real SyntaxError");
    const report = formatJsonSyntaxError(err, "/mods/demo/manifest.json", source);
    assert.match(report, /manifest\.json/);
    assert.match(report, /Fix: check for a missing\/trailing comma/);
});

test("formatJsonSyntaxError: a message with no recoverable position still returns a real, non-throwing message", () => {
    const report = formatJsonSyntaxError(new SyntaxError("Unexpected end of JSON input"), "/x/f.json", "{");
    assert.match(report, /not valid JSON/);
});

console.log(`\n${passed} passed`);
