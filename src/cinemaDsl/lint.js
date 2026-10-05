// Crystal Cinema lint: warnings that don't fail the build.
"use strict";

function lintTimeline(timeline) {
    const warnings = [];

    if (timeline.durationTicks > 6000) {
        warnings.push(`cutscene "${timeline.id}" is longer than 5 minutes (${(timeline.durationTicks / 20).toFixed(1)}s) - consider breaking it into smaller scenes`);
    }

    const eventsByOp = {};
    for (const ev of timeline.events) {
        if (!eventsByOp[ev.op]) eventsByOp[ev.op] = [];
        eventsByOp[ev.op].push(ev);
    }

    if (eventsByOp["lock"]) {
        for (const ev of eventsByOp["lock"]) {
            if (ev.args.pos?.[0] === "free") {
                warnings.push(`lock free at t=${ev.t}: free-cam requires that every angle looks good - creator, verify this`);
            }
        }
    }

    const cuts = eventsByOp["camera.cut"] || [];
    for (let i = 1; i < cuts.length; i++) {
        if (cuts[i].t === cuts[i - 1].t) {
            warnings.push(`camera cut at t=${cuts[i].t} immediately follows another - verify this is intentional`);
        }
    }

    if (eventsByOp["screen.show"]) {
        const shows = new Set(eventsByOp["screen.show"].map(e => JSON.stringify(e.args)));
        const hides = new Set(eventsByOp["screen.hide"]?.map(e => e.t) ?? []);
        for (const show of eventsByOp["screen.show"]) {
            if (hides.size === 0) {
                warnings.push(`screen show at t=${show.t} never hidden - cutscene ends with screen visible`);
            }
        }
    }

    if (eventsByOp["particles"]) {
        for (const ev of eventsByOp["particles"]) {
            const count = ev.args.count ?? 0;
            if (count > 500) {
                warnings.push(`particles at t=${ev.t} requests ${count} particles - may cause lag, recommend max 500`);
            }
        }
    }

    return warnings;
}

module.exports = { lintTimeline };
