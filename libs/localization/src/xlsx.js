// XLSX wrapper over the same rows catalogToRows/importRows use. Key and source
// columns are visually locked (grey); importRows ignores source edits anyway.
"use strict";

async function writeXlsx(filePath, rows) {
    const ExcelJS = require("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Localization");
    for (const r of rows) ws.addRow(r);
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
    ws.columns.forEach((c, i) => { c.width = i === 0 ? 28 : i === 1 ? 24 : 40; });
    for (let r = 2; r <= rows.length; r++) {
        for (const c of [1, 3]) ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
    }
    await wb.xlsx.writeFile(filePath);
}

async function readXlsx(filePath) {
    const ExcelJS = require("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const width = ws.getRow(1).cellCount;
    const rows = [];
    ws.eachRow({ includeEmpty: false }, row => {
        const out = [];
        for (let c = 1; c <= width; c++) {
            const v = row.getCell(c).value;
            out.push(v === null || v === undefined ? "" : typeof v === "object" ? (v.text ?? v.result ?? String(v)) : String(v));
        }
        rows.push(out);
    });
    return rows;
}

module.exports = { writeXlsx, readXlsx };
