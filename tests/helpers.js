import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { makeRebugger } from '../src/rebugger.js';

const slvmRequire = createRequire(new URL('../../slvm/package.json', import.meta.url));
export const VirtualMachine = slvmRequire('scratch-vm');
const Sprite = slvmRequire(join(dirname(slvmRequire.resolve('scratch-vm')), '..', '..', 'src', 'sprites', 'sprite.js'));

export { test, assert };

export const addTarget = (vm, { name, stage = false, vars = {}, lists = {}, cloud = [], blocks = [] }) => {
    const sprite = new Sprite(null, vm.runtime);
    sprite.name = name;
    const target = sprite.createClone();
    target.isStage = stage;
    vm.runtime.addTarget(target);
    for (const [varName, value] of Object.entries(vars)) {
        target.createVariable(`${name}:${varName}`, varName, '', cloud.includes(varName));
        target.variables[`${name}:${varName}`].value = value;
    }
    for (const [listName, value] of Object.entries(lists)) {
        target.createVariable(`${name}:${listName}`, listName, 'list');
        target.variables[`${name}:${listName}`].value = value;
    }
    for (const block of blocks) target.blocks.createBlock(block);
    return target;
};

export const incrementOnFlag = variableId => [
    { id: 'hat', opcode: 'event_whenflagclicked', next: 'inc', parent: null, topLevel: true, shadow: false, inputs: {}, fields: {} },
    {
        id: 'inc', opcode: 'data_changevariableby', next: null, parent: 'hat', topLevel: false, shadow: false,
        inputs: { VALUE: { name: 'VALUE', block: 'one', shadow: 'one' } },
        fields: { VARIABLE: { name: 'VARIABLE', id: variableId, value: 'score' } },
    },
    { id: 'one', opcode: 'math_number', next: null, parent: 'inc', topLevel: false, shadow: true, inputs: {}, fields: { NUM: { name: 'NUM', value: '1' } } },
];

export const runFrame = vm => {
    vm.runtime.currentStepTime = 1000 / 30;
    vm.runtime._step();
};

export const project = () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, vars: { score: 5 }, lists: { inv: ['a', 'b', 'c'] }, blocks: incrementOnFlag('Stage:score') });
    addTarget(vm, { name: 'Cat', vars: { hp: 10 } });
    addTarget(vm, { name: 'Dog', vars: { hp: 20 } });
    return { vm, probe: makeRebugger(vm) };
};

export const flight = () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, vars: { score: 100, label: 'Hello' } });
    addTarget(vm, { name: 'Plane', vars: { alt: 5000, speed: 250, fuel: 100 } });
    return { vm, probe: makeRebugger(vm) };
};

export const cockpit = () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, vars: { score: 100, 'Alt-Hold': 0 }, lists: { altLog: [1, 2] } });
    addTarget(vm, { name: 'Plane', vars: { alt: 5000, altitude_ft: 5000, speed: 250 }, lists: { alerts: ['x'] } });
    return { vm, probe: makeRebugger(vm) };
};

export const catOf = vm => vm.runtime.targets.find(t => t.sprite.name === 'Cat');
export const stageOf = vm => vm.runtime.targets.find(t => t.isStage);

export const rigged = () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, vars: { score: 0 }, lists: { log: [] } });
    addTarget(vm, { name: 'Cat', vars: { hp: 10 } });
    const clock = { t: 0 };
    const probe = makeRebugger(vm, { clock: () => clock.t });
    const frame = (ms = 100) => { clock.t += ms; runFrame(vm); };
    const record = (name, scores = [1, 2, 3, 4, 5], options = {}) => {
        probe.startrec(name, options);
        for (const score of scores) { probe.set('score', score); frame(); }
        return probe.stoprec();
    };
    return { vm, probe, clock, frame, record };
};

export const scoreAfterFrames = ({ probe, frame }, count) => {
    const seen = [];
    for (let i = 0; i < count; i++) { frame(); seen.push(probe.get('score')); }
    return seen;
};

export const counted = rig => {
    const counter = { frames: 0 };
    const original = rig.vm.runtime._step;
    rig.vm.runtime._step = function () { counter.frames++; return original.call(this); };
    return counter;
};

export const sequence = values => () => values.shift();
