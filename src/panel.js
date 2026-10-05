import { DURATION, MOTION, createAnimator } from './animate.js';
import { createH, createSvg } from './dom.js';
import { createIcons } from './icons.js';
import { HOTKEY_LABEL } from './hotkey.js';
import { SPEEDS, errorText, speedDigits, speedLabel, timeSummary } from './panel-model.js';
import { PANEL_CSS } from './panel-style.js';
import { recordingsTab, scanTab, statesTab, variablesTab } from './panel-tabs.js';
import { VERSION } from './version.js';

const PREFS_KEY = 'rebugger.panel';
const REFRESH_MS = 250;
const PAUSED_REFRESH_MS = 1000;
const MAX_DUTY = 0.1;
const GRAB_MARGIN = 80;
const HINT = `Click a value to edit it. ${HOTKEY_LABEL} hides this panel.`;
const DEFAULTS = { x: null, y: 64, width: 364, height: 440, tab: 'vars', minimized: false, open: false };

const ignoringBlockedStorage = action => {
    try {
        return action();
    } catch {
        return undefined;
    }
};

const loadPrefs = storage => ({
    ...DEFAULTS,
    ...ignoringBlockedStorage(() => JSON.parse(storage?.getItem(PREFS_KEY) ?? '{}')),
});

const savePrefs = (storage, prefs) => ignoringBlockedStorage(() => storage?.setItem(PREFS_KEY, JSON.stringify(prefs)));

function saveFile(doc, filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = doc.createElement('a');
    link.href = url;
    link.download = filename;
    doc.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createPanel({ api, document: doc, storage, restore = false, download }) {
    if (!doc) return null;
    const win = doc.defaultView;
    const h = createH(doc);
    const s = createSvg(doc);
    const icon = createIcons(s);
    const play = createAnimator(win);
    const prefs = loadPrefs(storage);
    let built = null;
    let timer = null;
    let projectPaused = false;

    const remember = patch => {
        Object.assign(prefs, patch);
        savePrefs(storage, prefs);
    };

    function build() {
        const host = h('div', { id: 'rebugger-panel' });
        const root = host.attachShadow({ mode: 'open' });
        const status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite', 'data-tone': 'hint' }, HINT);
        const chip = h('span', { class: 'chip' });
        const ctx = {
            api,
            h,
            root,
            download: download ?? ((filename, text) => saveFile(doc, filename, text)),
            refresh: () => refresh(),
            play,
            s,
            icon,
            win,
            visible: () => !!built && !built.panel.hidden && !prefs.minimized && prefs.tab === 'rec',
            say(text, tone = 'ok') {
                status.textContent = text;
                status.dataset.tone = tone;
                if (tone === 'hint') return;
                play(status, tone === 'error' ? MOTION.shake : MOTION.arrive, { duration: tone === 'error' ? DURATION.shake : DURATION.arrive });
            },
            fail: error => ctx.say(errorText(error), 'error'),
            run(action, message) {
                try {
                    const result = action();
                    if (message) ctx.say(typeof message === 'function' ? message(result) : message);
                    refresh();
                    return true;
                } catch (error) {
                    ctx.fail(error);
                    return false;
                }
            },
        };

        const tabs = [variablesTab, scanTab, statesTab, recordingsTab].map(make => make({ h, ctx }));
        const tabButtons = new Map();
        const indicator = h('span', { class: 'tab-indicator', 'aria-hidden': 'true' });
        const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Rebugger sections' }, indicator);
        const body = h('div', { class: 'body' });
        for (const tab of tabs) {
            const button = h('button', { class: 'tab', role: 'tab', 'data-hue': tab.hue, id: `tab-${tab.id}`, 'aria-controls': `page-${tab.id}`, onClick: () => select(tab.id) }, tab.label);
            tabButtons.set(tab.id, button);
            tab.el.setAttribute('role', 'tabpanel');
            tab.el.id = `page-${tab.id}`;
            tab.el.setAttribute('aria-labelledby', `tab-${tab.id}`);
            tablist.append(button);
            body.append(tab.el);
        }
        tablist.addEventListener('keydown', event => {
            const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
            if (!step) return;
            const index = tabs.findIndex(tab => tab.id === prefs.tab);
            const next = tabs[(index + step + tabs.length) % tabs.length];
            select(next.id);
            tabButtons.get(next.id).focus();
        });

        const pause = h('button', { class: 'btn', 'aria-pressed': 'false', onClick: () => ctx.run(() => (api.info().paused ? api.resume() : api.pause())) });
        const step = count => h('button', { class: 'btn', 'aria-label': `Step ${count} frame${count === 1 ? '' : 's'}`, title: `Run ${count} frame${count === 1 ? '' : 's'} while paused`, onClick: () => ctx.run(() => api.step(count), `stepped ${count} frame${count === 1 ? '' : 's'}`) }, count === 1 ? 'Step' : `+${count}`);
        const steps = [step(1), step(10)];
        const speedButtons = SPEEDS.map(value => h('button', { 'aria-pressed': 'false', 'aria-label': `Speed ${speedLabel(value)}`, title: `${speedLabel(value)} speed`, onClick: () => ctx.run(() => api.speed(value)) }, speedDigits(value)));
        const time = h('div', { class: 'time' }, pause, ...steps,
            h('span', { class: 'spacer' }),
            h('span', { class: 'segments', role: 'group', 'aria-label': 'Project speed' }, ...speedButtons));

        const minimize = h('button', { class: 'icon', 'aria-label': 'Collapse', title: 'Collapse', onClick: () => setMinimized(!prefs.minimized) }, icon('minus'));
        const close = h('button', { class: 'icon', 'aria-label': `Close (${HOTKEY_LABEL})`, title: `Close (${HOTKEY_LABEL})`, onClick: () => setOpen(false) }, icon('cross'));
        const bar = h('div', { class: 'bar' },
            h('span', { class: 'title' }, 'rebugger'), h('span', { class: 'version' }, `v${VERSION}`), chip,
            h('span', { class: 'spacer' }), minimize, close);

        const core = h('div', { class: 'core' }, bar, tablist, body, time, status);
        const panel = h('div', { class: 'panel', role: 'dialog', 'aria-label': 'Rebugger', tabindex: '-1', hidden: true }, core);
        root.append(h('style', {}, PANEL_CSS), panel);

        for (const type of ['keydown', 'keyup', 'keypress']) host.addEventListener(type, event => event.stopPropagation());
        panel.addEventListener('keydown', event => {
            if (event.key === 'Escape') setOpen(false);
        });
        enableDragging(bar, panel);
        if (typeof win?.ResizeObserver === 'function') {
            new win.ResizeObserver(() => {
                if (panel.hidden || prefs.minimized) return;
                remember({ width: panel.offsetWidth, height: panel.offsetHeight });
                moveIndicator(false);
            }).observe(panel);
        }

        return { host, panel, chip, tabs, tabButtons, indicator, pause, steps, speedButtons, minimize, ctx };
    }

    function enableDragging(bar, panel) {
        bar.addEventListener('pointerdown', event => {
            if (event.target.closest('button') || event.button !== 0) return;
            const origin = { x: event.clientX, y: event.clientY, left: panel.offsetLeft, top: panel.offsetTop };
            bar.setPointerCapture?.(event.pointerId);
            bar.classList.add('dragging');
            const move = moved => place(origin.left + moved.clientX - origin.x, origin.top + moved.clientY - origin.y);
            const end = () => {
                bar.classList.remove('dragging');
                bar.removeEventListener('pointermove', move);
                bar.removeEventListener('pointerup', end);
                bar.removeEventListener('pointercancel', end);
                remember({ x: panel.offsetLeft, y: panel.offsetTop });
            };
            bar.addEventListener('pointermove', move);
            bar.addEventListener('pointerup', end);
            bar.addEventListener('pointercancel', end);
        });
    }

    function place(x, y) {
        const { panel } = built;
        const left = Math.min(Math.max(x, GRAB_MARGIN - panel.offsetWidth), win.innerWidth - GRAB_MARGIN);
        const top = Math.min(Math.max(y, 0), win.innerHeight - 32);
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
    }

    function layout() {
        const { panel } = built;
        const width = Math.min(prefs.width, win.innerWidth - 16);
        const height = Math.min(prefs.height, win.innerHeight - 16);
        panel.style.width = `${width}px`;
        panel.style.height = `${height}px`;
        place(prefs.x ?? win.innerWidth - width - 16, Math.min(prefs.y, Math.max(0, win.innerHeight - height - 8)));
        panel.classList.toggle('minimized', prefs.minimized);
    }

    function moveIndicator(animated = true) {
        const { indicator, tabButtons, tabs } = built;
        const button = tabButtons.get(prefs.tab);
        if (!button || !button.offsetWidth) return;
        indicator.classList.toggle('ready', animated && indicator.dataset.placed === 'yes');
        indicator.dataset.hue = tabs.find(tab => tab.id === prefs.tab).hue;
        indicator.style.width = `${button.offsetWidth}px`;
        indicator.style.transform = `translateX(${button.offsetLeft}px)`;
        indicator.dataset.placed = 'yes';
    }

    function select(id) {
        if (id !== prefs.tab) built.ctx.say(HINT, 'hint');
        remember({ tab: id });
        for (const tab of built.tabs) {
            const active = tab.id === id;
            tab.el.hidden = !active;
            built.tabButtons.get(tab.id).setAttribute('aria-selected', String(active));
            built.tabButtons.get(tab.id).tabIndex = active ? 0 : -1;
        }
        moveIndicator();
        refresh();
    }

    function setMinimized(minimized) {
        remember({ minimized });
        built.panel.classList.toggle('minimized', minimized);
        built.minimize.replaceChildren(built.ctx.icon(minimized ? 'plus' : 'minus'));
        built.minimize.setAttribute('aria-label', minimized ? 'Expand' : 'Collapse');
    }

    function refresh() {
        if (!built || built.panel.hidden || doc.hidden) return;
        try {
            const info = api.info();
            const summary = timeSummary(info);
            built.chip.textContent = summary.text;
            built.chip.dataset.tone = summary.tone;
            built.pause.textContent = info.paused ? 'Resume' : 'Pause';
            built.pause.setAttribute('aria-pressed', String(info.paused));
            projectPaused = info.paused;
            for (const button of built.steps) button.disabled = !info.paused;
            SPEEDS.forEach((value, i) => built.speedButtons[i].setAttribute('aria-pressed', String(info.speed === value)));
            if (!prefs.minimized) built.tabs.find(tab => tab.id === prefs.tab)?.refresh();
        } catch (error) {
            built.ctx.fail(error);
        }
    }

    function tick() {
        const started = performance.now();
        refresh();
        const spent = performance.now() - started;
        const interval = projectPaused ? PAUSED_REFRESH_MS : REFRESH_MS;
        timer = setTimeout(tick, Math.max(interval, spent * (1 / MAX_DUTY - 1)));
    }

    function setOpen(open) {
        if (open) {
            if (!built) {
                built = build();
                built.panel.hidden = false;
                doc.body.append(built.host);
                layout();
                setMinimized(prefs.minimized);
                select(DEFAULTS.tab === prefs.tab || built.tabButtons.has(prefs.tab) ? prefs.tab : DEFAULTS.tab);
            }
            built.panel.hidden = false;
            remember({ open: true });
            clearTimeout(timer);
            tick();
        } else if (built) {
            built.panel.hidden = true;
            remember({ open: false });
            clearTimeout(timer);
            timer = null;
        }
        return !!open;
    }

    if (restore && prefs.open) setOpen(true);

    return {
        isOpen: () => !!built && !built.panel.hidden,
        setOpen,
        toggle() {
            return setOpen(!(built && !built.panel.hidden));
        },
        destroy() {
            clearTimeout(timer);
            built?.host.remove();
            built = null;
        },
    };
}
