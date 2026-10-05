import { nameMatcher, snapshot } from './util.js';

export function createVariables(world) {
    const { find, targetsFor, spriteName, noteCloud, everyVariable, rowOf, typesFor } = world;

    function listIndex(list, index, { allowEnd = false } = {}) {
        const max = list.length + (allowEnd ? 1 : 0);
        if (!Number.isInteger(index) || index < 1 || index > max) {
            throw new RangeError(`index ${index} is outside 1..${max}`);
        }
        return index - 1;
    }

    function editList(name, scope, edit) {
        const { variable } = find(name, 'list', scope);
        edit(variable.value);
        variable._monitorUpToDate = false;
        return variable.value.length;
    }

    return {
        vars: scope => targetsFor(scope).flatMap(target =>
            Object.values(target.variables)
                .filter(v => v.type === '' || v.type === 'list')
                .map(v => ({
                    sprite: spriteName(target),
                    name: v.name,
                    kind: v.type === 'list' ? 'list' : 'var',
                    cloud: !!v.isCloud,
                    value: snapshot(v.value),
                }))),

        get: (name, scope) => find(name, 'var', scope).variable.value,

        set(name, value, scope) {
            const { variable } = find(name, 'var', scope);
            noteCloud(variable);
            variable.value = value;
            return value;
        },

        list: (name, scope) => [...find(name, 'list', scope).variable.value],

        push: (name, item, scope) => editList(name, scope, list => { list.push(item); }),

        insert: (name, index, item, scope) =>
            editList(name, scope, list => { list.splice(listIndex(list, index, { allowEnd: true }), 0, item); }),

        setAt: (name, index, item, scope) =>
            editList(name, scope, list => { list[listIndex(list, index)] = item; }),

        removeAt: (name, index, scope) =>
            editList(name, scope, list => { list.splice(listIndex(list, index), 1); }),

        clear: (name, scope) => editList(name, scope, list => { list.length = 0; }),

        wipe: (name, scope) => editList(name, scope, list => { list.fill(''); }),

        sprites: () => targetsFor().map(spriteName),

        find(query, { kind = 'any', sprite, clones = false, live = false } = {}) {
            const matches = nameMatcher(query);
            return everyVariable(clones, typesFor(kind))
                .filter(({ target, variable }) =>
                    matches(variable.name) && (sprite === undefined || spriteName(target) === sprite))
                .map(entry => ({
                    ...rowOf(entry),
                    kind: entry.variable.type === 'list' ? 'list' : 'var',
                    value: live ? entry.variable.value : snapshot(entry.variable.value),
                }));
        },
    };
}
