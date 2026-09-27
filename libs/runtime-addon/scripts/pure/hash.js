// Pure, zero-import logic - deliberately kept out of @minecraft/server-
// touching files so it's directly testable in plain Node (see
// test/pure.test.js), matching this whole project's established
// discipline (MCLite/OpenRock's own libraries all separate pure logic
// from anything that has to run inside Minecraft).

/** Cheap, non-cryptographic - see auth.js's own header comment for the honest security scope. */
export function hash(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return h.toString(16);
}
