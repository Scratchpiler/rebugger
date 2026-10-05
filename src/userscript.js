import { HOTKEY_LABEL, installHotkey } from './hotkey.js';
import { log } from './log.js';
import { makeRebugger } from './rebugger.js';
import { VERSION } from './version.js';
import { bfsFindVM, fiberRoot, isValidVM } from './vm-lookup.js';

let attempts = 0;
const timer = setInterval(() => {
    const vm = isValidVM(unsafeWindow.vm) ? unsafeWindow.vm : bfsFindVM(fiberRoot());
    if (vm) {
        clearInterval(timer);
        const rebugger = makeRebugger(vm, { announce: true, restorePanel: true });
        unsafeWindow.rebugger = unsafeWindow.rb = rebugger;
        installHotkey(window, () => rebugger.ui());
        log.ready(VERSION, HOTKEY_LABEL);
    } else if (++attempts >= 240) {
        clearInterval(timer);
        log.warn('gave up looking for the Scratch VM after 2 minutes');
    }
}, 500);
