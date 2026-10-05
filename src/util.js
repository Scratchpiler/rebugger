export const snapshot = value => Array.isArray(value) ? [...value] : value;

export const same = (a, b) => Array.isArray(a)
    ? Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i])
    : a === b;

export const toNumber = value => typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')
    ? Number(value)
    : NaN;

export function matches(current, wanted, within) {
    const a = toNumber(current);
    const b = toNumber(wanted);
    if (!Number.isNaN(a) && !Number.isNaN(b)) return Math.abs(a - b) <= within;
    return String(current).toLowerCase() === String(wanted).toLowerCase();
}

export function nameMatcher(query) {
    if (query instanceof RegExp) {
        const plain = new RegExp(query.source, query.flags.replace(/[gy]/g, ''));
        return name => plain.test(name);
    }
    const needle = String(query).toLowerCase();
    return name => name.toLowerCase().includes(needle);
}

export function named(map, name, noun) {
    const item = name === undefined ? [...map.values()].at(-1) : map.get(name);
    if (item) return item;
    throw new Error(name === undefined
        ? `no ${noun}s yet`
        : `no ${noun} named "${name}" (have: ${[...map.keys()].join(', ') || 'none'})`);
}

export function makeNamer() {
    const counters = {};
    return (prefix, taken) => {
        let name;
        do name = `${prefix}-${counters[prefix] = (counters[prefix] ?? 0) + 1}`; while (taken.has(name));
        return name;
    };
}

function editDistance(a, b) {
    const rows = [Array.from({ length: b.length + 1 }, (_, j) => j)];
    for (let i = 1; i <= a.length; i++) {
        rows[i] = [i];
        for (let j = 1; j <= b.length; j++) {
            const swapped = i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1];
            rows[i][j] = Math.min(
                rows[i - 1][j] + 1,
                rows[i][j - 1] + 1,
                rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
                swapped ? rows[i - 2][j - 2] + 1 : Infinity,
            );
        }
    }
    return rows[a.length][b.length];
}

export function suggest(wanted, candidates, limit = 3) {
    const needle = wanted.toLowerCase();
    const tolerance = Math.max(1, Math.floor(needle.length / 3));
    const scored = [...new Set(candidates)].flatMap(candidate => {
        const hay = candidate.toLowerCase();
        if (candidate === wanted) return [];
        if (hay.includes(needle) || needle.includes(hay)) return [[0, candidate]];
        const distance = editDistance(needle, hay);
        return distance <= tolerance ? [[distance, candidate]] : [];
    });
    return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map(([, candidate]) => candidate);
}

export const didYouMean = (wanted, candidates) => {
    const options = suggest(wanted, candidates);
    return options.length ? ` (did you mean ${options.map(o => `"${o}"`).join(' or ')}?)` : '';
};
