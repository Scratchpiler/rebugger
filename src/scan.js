import { matches, same, toNumber } from './util.js';

export function createScan(world) {
    let session = null;

    function narrow(keep, { clones = false } = {}) {
        session ??= world.everyVariable(clones);
        session = session.filter(entry => {
            if (entry.target.variables[entry.variable.id] !== entry.variable) return false;
            const current = entry.variable.value;
            const kept = keep(current, entry.last);
            entry.last = current;
            return kept;
        });
        return session.map(world.rowOf);
    }

    const requireSession = () => {
        if (!session) throw new Error('no scan in progress: start with scan(value) or scan.snapshot()');
    };

    const scan = (query, { within = 0, clones = false } = {}) => narrow(
        typeof query === 'function' ? query : current => matches(current, query, within),
        { clones });
    scan.snapshot = ({ clones = false } = {}) => (session = world.everyVariable(clones)).length;
    scan.reset = () => { session = null; };
    scan.results = () => session ? session.map(world.rowOf) : [];
    scan.changed = () => { requireSession(); return narrow((now, before) => !same(now, before)); };
    scan.unchanged = () => { requireSession(); return narrow((now, before) => same(now, before)); };
    scan.increased = () => { requireSession(); return narrow((now, before) => toNumber(now) > toNumber(before)); };
    scan.decreased = () => { requireSession(); return narrow((now, before) => toNumber(now) < toNumber(before)); };

    return { scan, pending: () => session ? session.length : null };
}
