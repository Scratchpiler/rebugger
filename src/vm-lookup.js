const FIBER_KEY = /^__react(Fiber|Container|InternalInstance)\$/;

export const isValidVM = v => v != null
    && typeof v.runtime === 'object'
    && v.runtime.targets !== undefined
    && typeof v.on === 'function';

export function fiberRoot() {
    const candidates = [document.getElementById('app'), document.body, ...document.querySelectorAll('*')];
    for (const el of candidates) {
        const key = el && Object.keys(el).find(k => FIBER_KEY.test(k));
        if (!key) continue;
        let fiber = el[key];
        while (fiber?.return) fiber = fiber.return;
        if (fiber) return fiber;
    }
    return null;
}

export function bfsFindVM(root) {
    const queue = [root];
    const seen = new Set();
    for (let i = 0; i < queue.length; i++) {
        const node = queue[i];
        if (!node || seen.has(node)) continue;
        seen.add(node);
        for (const props of [node.memoizedProps, node.pendingProps, node.stateNode?.props]) {
            if (isValidVM(props?.vm)) return props.vm;
        }
        queue.push(node.child, node.sibling);
    }
    return null;
}
