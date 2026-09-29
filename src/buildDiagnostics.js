// The real "build debugger" - turns a compile failure (real tsc output,
// real esbuild errors, a real JSON.parse SyntaxError) into an intricate,
// actionable report: which file, which exact line/column, the real source
// text around it with a caret pointing at the problem, tsc's own real
// message, and a plain-English hint for the common real failure classes
// this DSL family actually produces (a mistyped prop, a missing required
// prop, a bad import, a raw JSX syntax slip).
//
// Deliberately its own small module, not folded into buildPipeline.js or
// jsxCompile.js: this is pure, dependency-free formatting logic (no tsc
// invocation, no esbuild invocation happens here) that every real compile
// site (entityCompiler/blockCompiler/itemCompiler/manifestCompiler, plus
// buildPipeline.js's own esbuild script bundling) calls into identically,
// per the standing "no monolithic files, no copy-pasted logic" rule -
// one real place that knows how to turn a raw compiler failure into a
// genuinely readable report, reused everywhere a real compile can fail.
"use strict";

const fs = require("fs");
const path = require("path");

// A real tsc diagnostic line, exactly as `tsc` itself prints it:
//   some/file.entity.tsx(12,34): error TS2554: Expected 2 arguments, but got 1.
// Captured: relative/absolute file path, 1-based line, 1-based column,
// severity, the real "TSxxxx" code, and the message. Multiline messages
// (a following line with no "(line,col):" prefix) are appended to the
// previous diagnostic's message, matching tsc's own real wrapping.
const TSC_DIAGNOSTIC_LINE = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.*)$/;

// Plain-English fixes for the real TypeScript diagnostic codes this DSL
// family's own authors actually hit in practice (mistyped/missing props,
// bad imports, raw JSX syntax slips) - not an attempt to cover every TS
// code that exists. Anything not in this table still gets a real, useful
// generic hint (see hintForTsCode() below), never a blank line.
const TS_HINTS = {
    TS2304: "That name isn't defined here. Check you imported it from \"components.js\"/\"jsx-runtime.js\" (or the right relative path), and check the spelling.",
    TS2307: "That module path doesn't resolve. Check the import path is spelled right and the file actually exists relative to this file.",
    TS2322: "The value you gave doesn't match the type this prop expects. Check the component's real prop type in its own components.js and compare it against what you passed.",
    TS2339: "That prop/property doesn't exist on this component. Check the exact prop name (and casing) against the component's real definition in components.js - a typo here is the single most common cause.",
    TS2345: "An argument's type doesn't match what this function/component expects. Compare the value you passed against the parameter's real declared type.",
    TS2554: "You passed the wrong number of arguments. Check how many props/children this component call is supposed to take.",
    TS2739: "A required prop is missing from this object. Add the missing field(s) named in the message above.",
    TS2741: "A required prop is missing. Add it - this component's type doesn't allow leaving it out.",
    TS2769: "None of this component's valid call shapes match what you wrote. Open its definition in components.js and compare your JSX attributes against one of its real accepted shapes.",
    TS17004: "JSX syntax needs a \".tsx\" file, not \".ts\". Rename this file's extension.",
    TS1005: "Syntax error - usually a missing comma, closing bracket, or closing tag right before this location.",
    TS1381: "Unexpected token in JSX - check for an unclosed tag or a stray bracket near this location.",
    TS1382: "Unexpected token in JSX - check for an unclosed tag or a stray bracket near this location.",
    TS1109: "An expression was expected here - you likely have an empty `{}` or a trailing operator with nothing after it.",
    TS1161: "Unterminated string literal - check for a missing closing quote on this line.",
    TS6053: "That file doesn't exist on disk. Check the path is correct relative to this file.",
    TS2532: "This value can be `undefined` here - add a check (or a `!`/`??`) before using it, or make the prop itself always-present.",
    TS2698: "Spread types may only be created from object types - check what you're spreading here is actually a plain object.",
};

function hintForTsCode(code) {
    return TS_HINTS[code] ?? "Check TypeScript's own explanation for this code (search \"" + code + "\") against the exact syntax at this location, or compare it with a working file in the same directory.";
}

/**
 * Parses tsc's own real, unmodified compiler output into structured
 * diagnostics. Never throws on unparseable input - lines that aren't a
 * real "file(line,col): error TSxxxx: message" diagnostic are either
 * folded into the previous diagnostic's message (tsc's own real multi-line
 * wrapping) or dropped (banner/summary lines like "Found 3 errors.").
 * @param {string} rawOutput - tsc's own real stdout+stderr text.
 * @param {string} cwd - the real directory tsc was invoked FROM (paths in
 *   its output are relative to this, since OpenRock always invokes tsc
 *   with a tsconfig whose `include` uses bare filenames).
 * @returns {Array<{file:string, relFile:string, line:number, column:number, severity:string, code:string, message:string}>}
 */
function parseTscOutput(rawOutput, cwd) {
    const diagnostics = [];
    for (const line of (rawOutput ?? "").split(/\r?\n/)) {
        const m = TSC_DIAGNOSTIC_LINE.exec(line);
        if (m) {
            const [, relFile, lineNo, colNo, severity, code, message] = m;
            diagnostics.push({
                file: path.resolve(cwd, relFile),
                relFile,
                line: parseInt(lineNo, 10),
                column: parseInt(colNo, 10),
                severity,
                code,
                message,
            });
        } else if (diagnostics.length && line.trim() && !/^Found \d+ error/.test(line)) {
            // A real, genuine tsc continuation line (long messages wrap) -
            // appended to whichever diagnostic is currently being built,
            // never dropped.
            diagnostics[diagnostics.length - 1].message += ` ${line.trim()}`;
        }
    }
    return diagnostics;
}

/**
 * Builds a real source-code frame around one `line`/`column` (both
 * 1-based, matching tsc's/esbuild's own convention) - `contextLines` real
 * lines of surrounding source above and below, each prefixed with its own
 * real line number, and a `^` caret placed under the exact real column on
 * the offending line. Returns null if the source file can't be read (e.g.
 * it was deleted between compiling and reporting) - a missing code frame
 * is a real, acceptable degradation, never a crash of the reporter itself.
 */
function codeFrame(sourceText, line, column, contextLines = 2) {
    if (!sourceText) return null;
    const lines = sourceText.split(/\r?\n/);
    const targetIdx = line - 1;
    if (targetIdx < 0 || targetIdx >= lines.length) return null;
    const start = Math.max(0, targetIdx - contextLines);
    const end = Math.min(lines.length - 1, targetIdx + contextLines);
    const gutterWidth = String(end + 1).length;
    const rows = [];
    for (let i = start; i <= end; i++) {
        const lineNo = String(i + 1).padStart(gutterWidth, " ");
        const marker = i === targetIdx ? ">" : " ";
        rows.push(`  ${marker} ${lineNo} | ${lines[i]}`);
        if (i === targetIdx) {
            const caretPad = " ".repeat(Math.max(0, column - 1));
            rows.push(`  ${" ".repeat(gutterWidth)}   | ${caretPad}^`);
        }
    }
    return rows.join("\n");
}

function readSourceSafely(absPath) {
    try { return fs.readFileSync(absPath, "utf8"); } catch { return null; }
}

/**
 * Renders ONE diagnostic into its full, intricate real-report block:
 * file:line:col header, tsc's own real code + message, a real source code
 * frame with a caret at the exact column, and a plain-English fix hint.
 */
function formatOneDiagnostic(d, index, total) {
    const frame = codeFrame(readSourceSafely(d.file), d.line, d.column);
    const header = `[${index + 1}/${total}] ${d.relFile ?? d.file}:${d.line}:${d.column} - ${d.severity} ${d.code}`;
    const parts = [header, `  ${d.message}`];
    if (frame) parts.push(frame);
    parts.push(`  Fix: ${hintForTsCode(d.code)}`);
    return parts.join("\n");
}

/**
 * The real, top-level entry point every Crystal Manifest / Crystal TS
 * compiler (entityCompiler.js/blockCompiler.js/itemCompiler.js/
 * manifestCompiler.js) calls when `compileWithRealTsc()` throws: turns
 * that one real Error (whose `.message` already contains tsc's genuine,
 * unmodified stdout+stderr) into the full intricate report described
 * above, listing EVERY real diagnostic tsc reported - not just the first -
 * so one real build run surfaces every real problem at once instead of a
 * fix-one-rebuild-find-the-next loop.
 * @param {Error} tscError - the real Error compileWithRealTsc() threw.
 * @param {object} opts
 * @param {string} opts.cwd - the real directory tsc was invoked from.
 * @param {string} [opts.dialect] - the real Crystal dialect name (for the
 *   report's own header), e.g. "Crystal Manifest-Entity".
 * @returns {string} the full, multi-diagnostic report text.
 */
function formatTscFailure(tscError, { cwd, dialect } = {}) {
    const diagnostics = parseTscOutput(tscError.message, cwd);
    if (!diagnostics.length) {
        // A real tsc invocation failure that wasn't a diagnostic at all
        // (e.g. tsc itself couldn't even start) - surface its raw real
        // output verbatim rather than claiming "0 errors" and hiding it.
        return `${dialect ? `${dialect}: ` : ""}real tsc invocation failed with no parseable diagnostics:\n${tscError.message}`;
    }
    const label = dialect ? `${dialect} ` : "";
    const plural = diagnostics.length === 1 ? "" : "s";
    const blocks = diagnostics.map((d, i) => formatOneDiagnostic(d, i, diagnostics.length));
    return `${label}failed to build - ${diagnostics.length} real error${plural} found:\n\n${blocks.join("\n\n")}`;
}

/**
 * The esbuild-side counterpart to formatTscFailure() - esbuild's own
 * `result.errors` are already structured (no text-parsing needed), each
 * with a real `location` giving the exact file/line/column and the source
 * line text esbuild itself already extracted. Used by buildPipeline.js's
 * bundleScripts() so a real script bundling failure gets the same
 * file/line/code-frame/hint treatment as a DSL compile failure.
 * @param {Array<{text:string, location:{file:string,line:number,column:number,lineText:string}|null}>} errors
 * @param {string} [modName]
 */
function formatEsbuildFailure(errors, modName) {
    const plural = errors.length === 1 ? "" : "s";
    const blocks = errors.map((e, i) => {
        if (!e.location) return `[${i + 1}/${errors.length}] ${e.text}`;
        const { file, line, column, lineText } = e.location;
        const header = `[${i + 1}/${errors.length}] ${file}:${line}:${column + 1} - error`;
        const parts = [header, `  ${e.text}`];
        if (lineText != null) {
            const gutter = String(line).length;
            parts.push(`  > ${String(line).padStart(gutter, " ")} | ${lineText}`);
            parts.push(`  ${" ".repeat(gutter)}   | ${" ".repeat(column)}^`);
        }
        parts.push(`  Fix: Check the import/reference at this exact location - esbuild couldn't resolve or parse it as written. If this is a cross-package import, confirm the dependency is declared in openrock.mod.json's "dependsOn" and actually exports the name you're importing.`);
        return parts.join("\n");
    });
    return `esbuild failed bundling${modName ? ` "${modName}"'s` : ""} scripts - ${errors.length} real error${plural} found:\n\n${blocks.join("\n\n")}`;
}

function posToLineCol(sourceText, pos) {
    const upToPos = sourceText.slice(0, pos);
    const line = (upToPos.match(/\n/g)?.length ?? 0) + 1;
    const column = pos - upToPos.lastIndexOf("\n");
    return { line, column };
}

// Real, confirmed-by-testing V8 divergence: older Node/V8 JSON.parse()
// errors say "... at position N" (a real, direct character offset); newer
// V8 versions (confirmed live against this project's own Node install)
// instead say `Unexpected token 'X', ..."<truncated source context>"... is
// not valid JSON` - no position number at all, just a truncated snippet OF
// the real source text. Both are handled for real here, rather than
// assuming one fixed message shape across every Node version this project
// might run on.
function locateJsonError(err, sourceText) {
    const posMatch = /at position (\d+)/.exec(err.message);
    if (posMatch) return posToLineCol(sourceText, parseInt(posMatch[1], 10));

    const snippetMatch = /\.\.\."([\s\S]*?)"\.\.\./.exec(err.message);
    if (snippetMatch) {
        const idx = sourceText.indexOf(snippetMatch[1]);
        if (idx >= 0) return posToLineCol(sourceText, idx);
    }
    return null;
}

/**
 * The JSON-side counterpart to formatTscFailure()/formatEsbuildFailure():
 * a real `JSON.parse()` SyntaxError carries no structured line/column of
 * its own - only either a character position or a truncated source-text
 * snippet, depending on the real Node/V8 version (see locateJsonError()
 * above) - so this recovers a real line/column from whichever one that
 * Error actually gives, then builds the same real code-frame treatment.
 * Falls back to a plain message when neither can be recovered, rather than
 * guessing at a location.
 * @param {SyntaxError} err - what JSON.parse() threw.
 * @param {string} filePath - the real file that failed to parse.
 * @param {string} sourceText - that file's real, raw text.
 */
function formatJsonSyntaxError(err, filePath, sourceText) {
    const loc = locateJsonError(err, sourceText);
    if (!loc) return `"${filePath}" is not valid JSON: ${err.message}`;
    const { line, column } = loc;
    const frame = codeFrame(sourceText, line, column);
    const parts = [`"${filePath}":${line}:${column} - not valid JSON`, `  ${err.message}`];
    if (frame) parts.push(frame);
    parts.push("  Fix: check for a missing/trailing comma, an unclosed brace or bracket, or an unquoted key right at this location.");
    return parts.join("\n");
}

module.exports = {
    parseTscOutput, codeFrame, hintForTsCode,
    formatTscFailure, formatEsbuildFailure, formatJsonSyntaxError,
};
