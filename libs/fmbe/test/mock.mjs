// A minimal fake of the @minecraft/server surface the FMBE runtime touches.
export function createMock() {
    const intervals = [];
    const timeouts = [];
    const system = {
        currentTick: 0,
        runInterval(fn, every) { const h = { fn, every, live: true }; intervals.push(h); return h; },
        clearRun(h) { h.live = false; },
        runTimeout(fn, ticks) { timeouts.push({ fn, at: system.currentTick + ticks }); },
        run(fn) { timeouts.push({ fn, at: system.currentTick }); },
    };
    const entities = [];
    let nextId = 1;
    const makeDimension = id => {
        const dim = {
            id,
            commands: [],
            blocks: new Map(),
            spawnLog: [],
            spawnEntity(type, at) {
                if (dim.failSpawns > 0) { dim.failSpawns--; throw new Error("chunk not loaded"); }
                dim.spawnLog.push(type);
                const e = {
                    id: String(nextId++), typeId: type.split("<")[0], isValid: true, dimension: dim, location: { ...at },
                    tags: new Set(), props: new Map(), commands: [], effects: [], teleports: [],
                    addTag(t) { e.tags.add(t); return true; }, hasTag: t => e.tags.has(t),
                    setDynamicProperty(k, v) { e.props.set(k, v); }, getDynamicProperty: k => e.props.get(k),
                    addEffect(n, d, o) { e.effects.push([n, o?.amplifier]); },
                    runCommand(c) { e.commands.push(c); if (/^replaceitem/.test(c) && dim.badItems.some(b => c.endsWith(" " + b))) throw new Error("syntax error"); return { successCount: 1 }; },
                    teleport(p) { e.location = { ...p }; e.teleports.push({ ...p }); },
                    remove() { e.isValid = false; },
                };
                entities.push(e);
                return e;
            },
            runCommand(c) { dim.commands.push(c); return { successCount: 1 }; },
            getEntities({ type, tags } = {}) { return entities.filter(e => e.isValid && e.dimension === dim && (!type || e.typeId === type) && (!tags || tags.every(t => e.tags.has(t)))); },
            getBlock: loc => dim.blocks.get(`${loc.x},${loc.y},${loc.z}`) ?? { isAir: true },
            failSpawns: 0,
            badItems: [],
        };
        return dim;
    };
    const dims = { overworld: makeDimension("minecraft:overworld"), nether: makeDimension("minecraft:nether"), the_end: makeDimension("minecraft:the_end") };
    const loadHandlers = [];
    const world = { getDimension: id => dims[id], afterEvents: { entityLoad: { subscribe: fn => { loadHandlers.push(fn); return fn; } } } };
    function tick(n = 1) {
        for (let i = 0; i < n; i++) {
            system.currentTick++;
            for (const h of intervals) if (h.live && system.currentTick % h.every === 0) h.fn();
            for (const t of [...timeouts]) if (t.at <= system.currentTick) { timeouts.splice(timeouts.indexOf(t), 1); t.fn(); }
        }
    }
    return { system, world, dims, entities, tick, loadHandlers, overworld: dims.overworld };
}
