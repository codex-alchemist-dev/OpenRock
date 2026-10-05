// Key extraction: finds translation keys used in source text without
// understanding any particular file format - MinUI `{t:key}` markers
// (works in .ui.html, .screen.tsx strings, .cinema/.dialogue text) and
// script-side translate("key") calls.
"use strict";

const fs = require("fs");
const path = require("path");

const MARKER_RE = /\{t:([A-Za-z0-9_.-]+)/g;
const CALL_RE = /\btranslate\(\s*["'`]([A-Za-z0-9_.-]+)["'`]/g;
const DEFAULT_EXTS = [".html", ".tsx", ".ts", ".js", ".mjs", ".cinema", ".dialogue"];
const SKIP_DIRS = new Set(["node_modules", ".git", "build", "dist"]);

/** @returns {Array<{key: string, line: number}>} */
function extractKeysFromText(text) {
    const found = [];
    text.split(/\r?\n/).forEach((lineText, i) => {
        const hits = [];
        for (const re of [MARKER_RE, CALL_RE]) {
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(lineText))) hits.push({ key: m[1], line: i + 1, col: m.index });
        }
        hits.sort((a, b) => a.col - b.col);
        for (const { key, line } of hits) found.push({ key, line });
    });
    return found;
}

/** Walks `dir`; returns { usedKeys: Set, refs: Map<key, "relpath:line"[]> }. */
function extractKeysFromDir(dir, { exts = DEFAULT_EXTS } = {}) {
    const usedKeys = new Set();
    const refs = new Map();
    (function walk(d) {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) walk(path.join(d, entry.name)); continue; }
            if (!exts.includes(path.extname(entry.name))) continue;
            const full = path.join(d, entry.name);
            const rel = path.relative(dir, full).split(path.sep).join("/");
            for (const { key, line } of extractKeysFromText(fs.readFileSync(full, "utf8"))) {
                usedKeys.add(key);
                if (!refs.has(key)) refs.set(key, []);
                refs.get(key).push(`${rel}:${line}`);
            }
        }
    })(dir);
    return { usedKeys, refs };
}

module.exports = { extractKeysFromText, extractKeysFromDir };
