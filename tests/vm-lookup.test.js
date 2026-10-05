import { VirtualMachine, test, assert } from './helpers.js';
import { bfsFindVM } from '../src/vm-lookup.js';

test('bfsFindVM finds a vm among fiber props', () => {
    const vm = new VirtualMachine();
    const leaf = { memoizedProps: { vm } };
    const root = { memoizedProps: {}, child: { memoizedProps: {}, sibling: { memoizedProps: {}, child: leaf } } };
    assert.equal(bfsFindVM(root), vm);
    assert.equal(bfsFindVM({ memoizedProps: { vm: {} } }), null);
    assert.equal(bfsFindVM(null), null);
});

test('in a page it finds the vm through the react container and publishes rebugger and rb', async () => {
    const { readFileSync } = await import('node:fs');
    const vm = new VirtualMachine();
    const el = { '__reactContainer$abc': { memoizedProps: {}, child: { memoizedProps: { vm } } } };
    const page = {};
    const infos = [];
    const fakeConsole = { info: message => infos.push(message), warn() {}, log() {} };
    const document = { getElementById: () => el, body: el, querySelectorAll: () => [] };
    const keyListeners = [];
    const window = { addEventListener: (type, fn, capture) => keyListeners.push({ type, fn, capture }) };
    new Function('unsafeWindow', 'document', 'window', 'console', readFileSync(new URL('../rebugger.user.js', import.meta.url), 'utf8'))(page, document, window, fakeConsole);
    assert.equal(page.rebugger, undefined);
    await new Promise(resolve => setTimeout(resolve, 700));
    assert.equal(page.rebugger.vm, vm);
    assert.equal(page.rb, page.rebugger);
    assert.match(infos[0], /ready/);
    assert.match(infos[0], /Alt\+Shift\+D/);
    assert.deepEqual(keyListeners.map(({ type, capture }) => [type, capture]), [['keydown', true]]);
});
