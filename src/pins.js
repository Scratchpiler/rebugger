import { KIND_TYPES } from './world.js';

export function createPins({ world, stepper, random }) {
    const { find, hitsFor, targetsFor, hold, noteCloud, everyVariable, spriteName, typesFor, cloneNumber } = world;
    const frozen = new Map();
    const heldItems = new Map();

    function randomBetween(a, b) {
        const low = Math.min(a, b);
        const high = Math.max(a, b);
        return Number.isInteger(a) && Number.isInteger(b)
            ? () => low + Math.floor(random() * (high - low + 1))
            : () => low + random() * (high - low);
    }

    function applyFrozen() {
        for (const [variable, { target, value, roll }] of frozen) {
            if (target.variables[variable.id] !== variable) frozen.delete(variable);
            else hold(variable, roll ? roll() : value);
        }
    }

    function applyHeldItems() {
        for (const [variable, { target, items }] of heldItems) {
            if (target.variables[variable.id] !== variable) {
                heldItems.delete(variable);
                continue;
            }
            const list = variable.value;
            let changed = false;
            for (const [index, value] of items) {
                if (index <= list.length && list[index - 1] !== value) {
                    list[index - 1] = value;
                    changed = true;
                }
            }
            if (changed) variable._monitorUpToDate = false;
        }
    }

    const applyAll = () => {
        applyFrozen();
        applyHeldItems();
    };

    const isHeld = variable => frozen.has(variable) || heldItems.has(variable);

    function heldOn(name, scope) {
        const kind = scope?.kind ?? 'any';
        typesFor(kind);
        const hits = hitsFor(kind, name, targetsFor(scope)).filter(({ variable }) => isHeld(variable));
        if (!hits.length) return hits;
        const owners = [...new Set(hits.map(hit => hit.target))];
        if (scope?.sprite === undefined && owners.length > 1) {
            throw new Error(`"${name}" is held on several sprites (${owners.map(spriteName).join(', ')}); pass { sprite }`);
        }
        return hits.filter(hit => hit.target === owners[0]);
    }

    function releaseItem(variable, index) {
        const held = heldItems.get(variable);
        if (!held) return;
        held.items.delete(index);
        if (!held.items.size) heldItems.delete(variable);
        stepper.unhook();
    }

    function checkItem(list, index) {
        if (!Number.isInteger(index) || index < 1 || index > list.length) {
            throw new RangeError(`index ${index} is outside 1..${list.length}`);
        }
    }

    function pin(target, variable, value, mode, roll) {
        noteCloud(variable);
        hold(variable, value);
        frozen.set(variable, { target, value, mode, roll });
        stepper.hook();
    }

    const blankValue = variable => variable.type === 'list' ? [] : '';

    const release = variable => () => {
        frozen.delete(variable);
        stepper.unhook();
    };

    const releaser = pinned => Object.assign(() => {
        for (const { variable } of pinned) frozen.delete(variable);
        stepper.unhook();
    }, { count: pinned.length });

    function pinMatching({ except = [], sprite, clones = false }, types, mode, valueFor) {
        const pinned = everyVariable(clones, types).filter(({ target, variable }) =>
            !variable.isCloud
            && !frozen.has(variable)
            && !except.includes(variable.name)
            && (sprite === undefined || spriteName(target) === sprite));
        for (const { target, variable } of pinned) pin(target, variable, valueFor(variable), mode);
        return releaser(pinned);
    }

    stepper.tap({ order: 20, before: applyAll, after: applyAll, active: () => frozen.size > 0 || heldItems.size > 0 });

    return {
        isPinned: isHeld,
        names: () => [...new Set([...frozen.keys(), ...heldItems.keys()])].map(v => v.name),
        clear() {
            frozen.clear();
            heldItems.clear();
        },

        api: {
            freeze(name, value, scope) {
                const { target, variable } = find(name, 'var', scope);
                pin(target, variable, value === undefined ? variable.value : value, 'freeze');
                return release(variable);
            },

            freezeAll: (options = {}) => pinMatching(options, KIND_TYPES.var, 'freeze', variable => variable.value),

            shitpost(name, low, high, scope) {
                if (![low, high].every(Number.isFinite)) {
                    throw new TypeError('shitpost(name, low, high): low and high must be finite numbers');
                }
                const { target, variable } = find(name, 'var', scope);
                const roll = randomBetween(low, high);
                pin(target, variable, roll(), 'shitpost', roll);
                return release(variable);
            },

            blank(name, scope) {
                const kind = scope?.kind ?? 'any';
                typesFor(kind);
                const hit = find(name, kind, scope);
                pin(hit.target, hit.variable, blankValue(hit.variable), 'blank');
                return releaser([hit]);
            },

            blankAll: ({ kind = 'any', ...options } = {}) => pinMatching(options, typesFor(kind), 'blank', blankValue),

            freezeAt(name, index, value, scope) {
                const { target, variable } = find(name, 'list', scope);
                checkItem(variable.value, index);
                const held = heldItems.get(variable) ?? { target, items: new Map() };
                held.items.set(index, value === undefined ? variable.value[index - 1] : value);
                heldItems.set(variable, held);
                applyHeldItems();
                stepper.hook();
                return () => releaseItem(variable, index);
            },

            unfreezeAt(name, index, scope) {
                releaseItem(find(name, 'list', scope).variable, index);
            },

            unfreeze(name, scope) {
                if (name === undefined) {
                    frozen.clear();
                    heldItems.clear();
                } else {
                    const pinned = heldOn(name, scope);
                    if (!pinned.length) find(name, scope?.kind ?? 'any', scope);
                    for (const { variable } of pinned) {
                        frozen.delete(variable);
                        heldItems.delete(variable);
                    }
                }
                stepper.unhook();
            },

            frozen: () => [
                ...[...frozen].map(([variable, { target, mode }]) => ({
                    sprite: spriteName(target),
                    clone: cloneNumber(target),
                    name: variable.name,
                    kind: variable.type === 'list' ? 'list' : 'var',
                    mode,
                })),
                ...[...heldItems].flatMap(([variable, { target, items }]) => [...items.keys()].sort((a, b) => a - b).map(index => ({
                    sprite: spriteName(target),
                    clone: cloneNumber(target),
                    name: variable.name,
                    kind: 'list',
                    mode: 'freeze',
                    index,
                }))),
            ],
        },
    };
}
