import { log } from './log.js';
import { didYouMean, same } from './util.js';

export const KIND_TYPES = { var: [''], list: ['list'], any: ['', 'list'] };
const KIND_NOUN = { var: 'variable', list: 'list', any: 'variable or list' };

export function createWorld(runtime) {
    const warnedCloud = new Set();

    const stage = () => runtime.targets.find(t => t.isStage);
    const spriteName = target => target.isStage ? 'Stage' : target.sprite.name;

    function targetsFor({ sprite, clone } = {}) {
        if (sprite === undefined) return runtime.targets.filter(t => t.isStage || t.isOriginal);
        const named = runtime.targets.filter(t => spriteName(t) === sprite);
        if (!named.length) {
            throw new Error(`no sprite named "${sprite}"${didYouMean(sprite, runtime.targets.map(spriteName))}`);
        }
        const own = clone ? named.filter(t => !t.isOriginal)[clone - 1] : named.find(t => t.isOriginal);
        if (!own) throw new Error(`"${sprite}" has no clone #${clone}`);
        return own.isStage ? [own] : [own, stage()];
    }

    const hitsFor = (kind, name, targets) => targets.flatMap(target =>
        Object.values(target.variables)
            .filter(v => KIND_TYPES[kind].includes(v.type) && v.name === name)
            .map(variable => ({ target, variable })));

    const namesOf = (targets, types) => targets.flatMap(target =>
        Object.values(target.variables).filter(v => types.includes(v.type)).map(v => v.name));

    function find(name, kind, scope) {
        const targets = targetsFor(scope);
        const hits = hitsFor(kind, name, targets);
        if (!hits.length) {
            const other = kind === 'var' ? 'list' : 'var';
            const hint = hitsFor(other, name, targets).length
                ? ` (a ${KIND_NOUN[other]} has that name)`
                : didYouMean(name, namesOf(targets, KIND_TYPES[kind]));
            throw new Error(`no ${KIND_NOUN[kind]} named "${name}"${hint}`);
        }
        if (scope?.sprite === undefined && hits.length > 1) {
            throw new Error(`"${name}" is ambiguous (${hits.map(h => spriteName(h.target)).join(', ')}); pass { sprite }`);
        }
        return hits[0];
    }

    function noteCloud(variable) {
        if (!variable.isCloud || warnedCloud.has(variable.id)) return;
        warnedCloud.add(variable.id);
        log.warn(`"${variable.name}" is a cloud variable: changed locally only, not sent to the server`);
    }

    function hold(variable, value) {
        if (variable.type !== 'list') {
            variable.value = value;
        } else if (!same(variable.value, value)) {
            variable.value.length = 0;
            for (const item of value) variable.value.push(item);
            variable._monitorUpToDate = false;
        }
    }

    const cloneNumber = target => target.isOriginal
        ? 0
        : runtime.targets.filter(t => t.sprite === target.sprite && !t.isOriginal).indexOf(target) + 1;

    const rowOf = ({ target, variable }) => ({
        sprite: spriteName(target),
        clone: cloneNumber(target),
        name: variable.name,
        cloud: !!variable.isCloud,
        value: variable.value,
    });

    const targetsWithClones = clones => clones ? runtime.targets : runtime.targets.filter(t => t.isStage || t.isOriginal);

    const everyVariable = (clones, types = ['']) => targetsWithClones(clones).flatMap(target =>
        Object.values(target.variables)
            .filter(v => types.includes(v.type))
            .map(variable => ({ target, variable, last: variable.value })));

    const typesFor = kind => {
        if (!KIND_TYPES[kind]) throw new Error(`kind must be one of ${Object.keys(KIND_TYPES).join(', ')}`);
        return KIND_TYPES[kind];
    };

    const stateKey = target => target.isStage
        ? 'stage'
        : target.isOriginal ? `sprite:${target.sprite.name}` : `clone:${target.id}`;

    function liveTarget(key) {
        if (key === 'stage') return stage();
        if (key.startsWith('sprite:')) {
            return runtime.targets.find(t => t.isOriginal && !t.isStage && t.sprite.name === key.slice('sprite:'.length));
        }
        return runtime.targets.find(t => t.id === key.slice('clone:'.length));
    }

    return {
        stage, spriteName, targetsFor, hitsFor, find, noteCloud, hold, rowOf,
        targetsWithClones, namesOf, cloneNumber, everyVariable, typesFor, stateKey, liveTarget,
    };
}
