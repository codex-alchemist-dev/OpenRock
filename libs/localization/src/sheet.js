// Spreadsheet round-trip (CSV; XLSX is a thin wrapper over the same rows).
// Columns: key, context, source, then per language `<lang>` and `<lang>:status`.
// Importing never lets a sheet corrupt placeholders and never edits sources.
"use strict";

const { statusOf, setTranslation } = require("./catalog.js");
const { comparePlaceholders } = require("./placeholders.js");

function csvEscape(v) {
    const s = String(v ?? "");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
    return "﻿" + rows.map(r => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

/** RFC 4180 parser: quoted fields, escaped quotes, embedded newlines, BOM, CRLF/LF. */
function parseCsv(text) {
    const rows = [];
    let row = [], field = "", i = 0, inQuotes = false;
    const src = text.replace(/^﻿/, "");
    while (i < src.length) {
        const c = src[i];
        if (inQuotes) {
            if (c === '"') { if (src[i + 1] === '"') { field += '"'; i += 2; continue; } inQuotes = false; i++; continue; }
            field += c; i++; continue;
        }
        if (c === '"') { inQuotes = true; i++; continue; }
        if (c === ",") { row.push(field); field = ""; i++; continue; }
        if (c === "\r" || c === "\n") {
            if (c === "\r" && src[i + 1] === "\n") i++;
            row.push(field); field = ""; rows.push(row); row = []; i++; continue;
        }
        field += c; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => !(r.length === 1 && r[0] === ""));
}

function catalogToRows(catalog, langs) {
    const header = ["key", "context", "source"];
    for (const l of langs) header.push(l, `${l}:status`);
    const rows = [header];
    for (const [key, e] of Object.entries(catalog.entries).sort(([a], [b]) => a.localeCompare(b))) {
        if (e.orphaned) continue;
        const row = [key, e.context, e.source];
        for (const l of langs) row.push(e.translations[l]?.text ?? "", statusOf(e, l));
        rows.push(row);
    }
    return rows;
}

/**
 * Merges an edited sheet back. A cell whose text differs from the catalog is a
 * human edit -> "reviewed". An unchanged cell whose status cell was set to
 * "reviewed" is an approval. Placeholder-breaking cells are skipped.
 * @returns {{applied: number, skipped: Array<{key: string, lang: string, reason: string}>}}
 */
function importRows(catalog, rows) {
    const [header, ...body] = rows;
    if (!header || header[0] !== "key") throw new Error("sheet import: first column must be \"key\"");
    const langCols = header.map((name, idx) => ({ name, idx })).filter(c => c.idx >= 3 && !c.name.endsWith(":status") && c.name);
    let applied = 0;
    const skipped = [];
    for (const row of body) {
        const key = row[0];
        const entry = catalog.entries[key];
        if (!entry || entry.orphaned) { skipped.push({ key, lang: "*", reason: "unknown or orphaned key" }); continue; }
        for (const { name: lang, idx } of langCols) {
            const text = row[idx] ?? "";
            if (text === "") continue;
            const statusCell = header.indexOf(`${lang}:status`) >= 0 ? row[header.indexOf(`${lang}:status`)] : "";
            const current = entry.translations[lang];
            const changed = !current || current.text !== text;
            const approving = !changed && statusCell === "reviewed" && current.status !== "reviewed";
            if (!changed && !approving) continue;
            const cmp = comparePlaceholders(entry.source, text);
            if (!cmp.ok) { skipped.push({ key, lang, reason: `placeholders differ (missing: ${cmp.missing.join(" ") || "-"}; extra: ${cmp.extra.join(" ") || "-"})` }); continue; }
            setTranslation(catalog, key, lang, text, "reviewed");
            applied++;
        }
    }
    return { applied, skipped };
}

module.exports = { toCsv, parseCsv, catalogToRows, importRows };
