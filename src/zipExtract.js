// Minimal ZIP reader (inflate via Node's zlib) - the real, symmetric
// counterpart to src/zip.js's writer, zero npm dependency, needed for
// OR-Track Q1's real BDS archive extraction. Reads the End Of Central
// Directory record backwards from the buffer's tail (the standard,
// real way to locate it - a ZIP's central directory is trailer-anchored,
// not header-anchored), then walks the central directory (never the local
// headers directly - the central directory is the authoritative entry
// list; local headers can lie via data-descriptor-deferred sizes) to
// find each entry's real local-header offset, name, and compressed data.
"use strict";

const zlib = require("zlib");

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

function findEndOfCentralDirectory(buf) {
    // The EOCD record is 22 bytes plus up to 65535 bytes of trailing
    // comment - search backwards from the end for its signature, the same
    // real approach every real ZIP reader uses (there's no fixed offset).
    const maxCommentLen = 65535;
    const start = Math.max(0, buf.length - 22 - maxCommentLen);
    for (let i = buf.length - 22; i >= start; i--) {
        if (buf.readUInt32LE(i) === EOCD_SIG) return i;
    }
    throw new Error("zipExtract: not a real ZIP file - no End Of Central Directory record found");
}

/**
 * @param {Buffer} buf - a real, complete ZIP file's bytes.
 * @returns {Array<{name: string, data: Buffer, isDirectory: boolean}>}
 */
function extractZip(buf) {
    const eocdOffset = findEndOfCentralDirectory(buf);
    const entryCount = buf.readUInt16LE(eocdOffset + 10);
    const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

    const entries = [];
    let offset = centralDirOffset;
    for (let i = 0; i < entryCount; i++) {
        if (buf.readUInt32LE(offset) !== CENTRAL_SIG) {
            throw new Error(`zipExtract: expected a central directory entry at offset ${offset}, found a different signature - the archive is truncated or corrupt`);
        }
        const compressionMethod = buf.readUInt16LE(offset + 10);
        const compressedSize = buf.readUInt32LE(offset + 20);
        const uncompressedSize = buf.readUInt32LE(offset + 24);
        const nameLen = buf.readUInt16LE(offset + 28);
        const extraLen = buf.readUInt16LE(offset + 30);
        const commentLen = buf.readUInt16LE(offset + 32);
        const localHeaderOffset = buf.readUInt32LE(offset + 42);
        const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen);

        entries.push({ name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
        offset += 46 + nameLen + extraLen + commentLen;
    }

    return entries.map(entry => {
        const lh = entry.localHeaderOffset;
        if (buf.readUInt32LE(lh) !== LOCAL_SIG) {
            throw new Error(`zipExtract: "${entry.name}" - expected a local file header at offset ${lh}, found a different signature`);
        }
        // The local header's OWN name/extra-field lengths (not the central
        // directory's, which can legitimately differ) determine where this
        // entry's real compressed data starts.
        const localNameLen = buf.readUInt16LE(lh + 26);
        const localExtraLen = buf.readUInt16LE(lh + 28);
        const dataStart = lh + 30 + localNameLen + localExtraLen;
        const compressed = buf.subarray(dataStart, dataStart + entry.compressedSize);
        const data = entry.compressionMethod === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed);
        return { name: entry.name, data, isDirectory: entry.name.endsWith("/") };
    });
}

module.exports = { extractZip, findEndOfCentralDirectory };
