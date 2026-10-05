// Spreadsheet round-trip for localization catalogs (CSV/XLSX).
// Exported functions: readCsv, readXlsx, writeCsv, writeXlsx
"use strict";

const fs = require("fs");
const path = require("path");

function readCsv(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    if (lines.length === 0) return { catalog: [], languages: [] };

    const header = lines[0].split("\t").map(h => h.trim());
    const languages = header.slice(3).filter(h => !["status", "notes"].includes(h));
    const catalog = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const cells = line.split("\t");
        const entry = {
            key: cells[0]?.trim() || "",
            context: cells[1]?.trim() || "",
            source: cells[2]?.trim() || "",
            translations: {},
            status: cells[3 + languages.length]?.trim() || "source",
            notes: cells[4 + languages.length]?.trim() || "",
        };
        for (let j = 0; j < languages.length; j++) {
            entry.translations[languages[j]] = cells[3 + j]?.trim() || "";
        }
        if (entry.key) catalog.push(entry);
    }
    return { catalog, languages };
}

function writeCsv(filePath, catalog, languages) {
    const header = ["key", "context", "source", ...languages, "status", "notes"];
    const lines = [header.join("\t")];
    for (const entry of catalog) {
        const row = [
            entry.key,
            entry.context || "",
            entry.source || "",
            ...languages.map(lang => entry.translations[lang] || ""),
            entry.status || "source",
            entry.notes || "",
        ];
        lines.push(row.join("\t"));
    }
    fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

function readXlsx(filePath) {
    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    return workbook.xlsx.readFile(filePath).then(() => {
        const worksheet = workbook.worksheets[0];
        if (!worksheet) return { catalog: [], languages: [] };

        const header = [];
        worksheet.getRow(1).eachCell({ dense: false }, (cell, colNum) => {
            header[colNum - 1] = cell.value ? String(cell.value).trim() : "";
        });

        const languages = header.slice(3).filter(h => !["status", "notes"].includes(h));
        const catalog = [];

        for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
            const row = worksheet.getRow(rowNum);
            const key = String(row.getCell(1).value || "").trim();
            if (!key) continue;

            const entry = {
                key,
                context: String(row.getCell(2).value || "").trim(),
                source: String(row.getCell(3).value || "").trim(),
                translations: {},
                status: String(row.getCell(4 + languages.length)?.value || "source").trim(),
                notes: String(row.getCell(5 + languages.length)?.value || "").trim(),
            };
            for (let j = 0; j < languages.length; j++) {
                entry.translations[languages[j]] = String(row.getCell(4 + j)?.value || "").trim();
            }
            catalog.push(entry);
        }
        return { catalog, languages };
    });
}

function writeXlsx(filePath, catalog, languages) {
    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Localization");

    const header = ["key", "context", "source", ...languages, "status", "notes"];
    worksheet.addRow(header);
    worksheet.getRow(1).font = { bold: true };

    for (const entry of catalog) {
        const row = [
            entry.key,
            entry.context || "",
            entry.source || "",
            ...languages.map(lang => entry.translations[lang] || ""),
            entry.status || "source",
            entry.notes || "",
        ];
        worksheet.addRow(row);
    }

    worksheet.columns = [
        { key: "key", width: 20, readOnly: true },
        { key: "context", width: 30 },
        { key: "source", width: 40, readOnly: true },
        ...languages.map(lang => ({ key: lang, width: 25 })),
        { key: "status", width: 12 },
        { key: "notes", width: 20 },
    ];

    return workbook.xlsx.writeFile(filePath);
}

function parseCsv(text) {
    const rows = [];
    let current = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];

        if (inQuotes) {
            if (ch === '"' && next === '"') {
                cell += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                cell += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === "," || ch === "\n" || (ch === "\r" && next === "\n")) {
                current.push(cell);
                cell = "";
                if (ch === "\n" || (ch === "\r" && next === "\n")) {
                    rows.push(current);
                    current = [];
                    if (ch === "\r") i++;
                }
            } else if (ch !== "\r") {
                cell += ch;
            }
        }
    }
    if (cell || current.length) {
        current.push(cell);
        if (current.length) rows.push(current);
    }
    return rows;
}

function toCsv(rows) {
    return rows.map(row =>
        row.map(cell => {
            if (typeof cell !== "string") cell = String(cell || "");
            if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
                return `"${cell.replace(/"/g, '""')}"`;
            }
            return cell;
        }).join(",")
    ).join("\n");
}

function catalogToRows(catalog, languages) {
    const rows = [["key", "context", "source", ...languages, ...languages.map(l => `${l}:status`)]];
    for (const [key, entry] of Object.entries(catalog.entries || {})) {
        const row = [
            key,
            entry.context || "",
            entry.source || "",
            ...languages.map(lang => entry.translations[lang]?.text || ""),
            ...languages.map(lang => entry.translations[lang]?.status || "source"),
        ];
        rows.push(row);
    }
    return rows;
}

function importRows(catalog, rows) {
    if (rows.length < 2) return { applied: 0, skipped: [] };
    const header = rows[0];
    const langs = header.slice(3).filter(l => !l.includes(":"));
    const langCount = langs.length;
    const applied = [];
    const skipped = [];

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const key = row[0];
        if (!key) continue;

        const entry = catalog.entries?.[key];
        if (!entry) continue;

        const source = row[2];
        if (source !== entry.source) {
            // Ignore source edits
        }

        for (let j = 0; j < langCount; j++) {
            const lang = langs[j];
            const text = row[3 + j];
            const status = row[3 + langCount + j];
            const current = entry.translations[lang];

            if (text === (current?.text || "")) {
                if (status && status !== current?.status) {
                    entry.translations[lang] = { ...current, status };
                    applied.push({ key, lang });
                }
            } else if (text) {
                const placeOld = (current?.text || "").match(/%(?:\d+\$)?s/g) || [];
                const placeNew = text.match(/%(?:\d+\$)?s/g) || [];
                if (placeOld.length !== placeNew.length) {
                    skipped.push({ key, lang, reason: "placeholders differ" });
                } else {
                    entry.translations[lang] = { text, status: "reviewed", from: entry.sourceHash };
                    applied.push({ key, lang });
                }
            }
        }
    }

    return { applied: applied.length, skipped };
}

module.exports = { parseCsv, toCsv, catalogToRows, importRows, readCsv, readXlsx, writeCsv, writeXlsx };
