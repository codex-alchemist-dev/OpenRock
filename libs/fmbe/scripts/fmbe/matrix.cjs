"use strict";

// Rotation math in the advanced FMBE system's own convention, taken from its rotation-matrix variables
// (v.F.r0..r8 in wikiSystems "advancedXXX"): with s/c = sin/cos of xrot (x), yrot (y), zrot (z), degrees,
//   R = [ sx sy sz + cy cz   -sx sy cz + cy sz   -sy cx ]
//       [ -sz cx              cz cx               -sx    ]
//       [ -sx cy sz + sy cz   sx cy cz + sy sz     cy cx ]
// which equals Ry(-y) * Rx(x) * Rz(-z) (checked in the tests). Used for display groups (parent/child transforms) and
// to preview what a spec renders as. Matrices are row-major arrays of 9 numbers.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

const identity = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];

function eulerToMatrix(x, y, z) {
    const sx = Math.sin(x * RAD), cx = Math.cos(x * RAD), sy = Math.sin(y * RAD), cy = Math.cos(y * RAD), sz = Math.sin(z * RAD), cz = Math.cos(z * RAD);
    return [
        sx * sy * sz + cy * cz, -sx * sy * cz + cy * sz, -sy * cx,
        -sz * cx, cz * cx, -sx,
        -sx * cy * sz + sy * cz, sx * cy * cz + sy * sz, cy * cx,
    ];
}

const mul = (a, b) => {
    const o = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    return o;
};
const transpose = m => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const apply = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];

/** Inverse of eulerToMatrix: [x, y, z] degrees. At gimbal lock (x = +-90) z is set to 0 and y absorbs the rest. */
function matrixToEuler(m) {
    const sx = Math.max(-1, Math.min(1, -m[5]));
    const x = Math.asin(sx) * DEG;
    let y, z;
    if (Math.abs(sx) < 0.999999) {
        y = Math.atan2(-m[2], m[8]) * DEG;
        z = Math.atan2(-m[3], m[4]) * DEG;
    } else {
        z = 0;
        y = Math.atan2(m[6], m[0]) * DEG;
    }
    const clean = n => { const r = Math.round(n * 1e9) / 1e9; return Object.is(r, -0) ? 0 : r; };
    return [clean(x), clean(y), clean(z)];
}

/**
 * A child placed inside a parent. Transform = { pos:[x,y,z] blocks, rot:[x,y,z] degrees, scale:number }.
 * World position = parent.pos + R_parent * (parent.scale * child.pos); rotation composes as R_parent * R_child; scales multiply.
 * `handedness` -1 flips the composition order for rotations if in-game calibration shows FMBE's angles act as the transpose.
 */
function composeTransforms(parent, child, { handedness = 1 } = {}) {
    const Rp = eulerToMatrix(...parent.rot), Rc = eulerToMatrix(...child.rot);
    const offset = apply(Rp, child.pos.map(v => v * parent.scale));
    const R = handedness === 1 ? mul(Rp, Rc) : mul(Rc, Rp);
    return { pos: parent.pos.map((v, i) => v + offset[i]), rot: matrixToEuler(R), scale: parent.scale * child.scale };
}

module.exports = { identity, eulerToMatrix, matrixToEuler, mul, transpose, apply, composeTransforms };
