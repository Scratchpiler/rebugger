import { DECK_SPEEDS, displayValue, formatClock, pickMoving, sparkline, speedLabel } from './panel-model.js';

const ICONS = {
    play: 'M8 5v14l11-7z',
    pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
    back: 'M6 6h2v12H6zm3.5 6 8.5 6V6z',
    forward: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z',
};
const SCRUB_STEPS = 1000;
const BIG_STEP = 10;

const setText = (element, text) => {
    if (element.textContent !== text) element.textContent = text;
};

export function createDeck({ h, ctx }) {
    const { s } = ctx;
    let handle = null;
    let plot = null;
    let dragging = null;
    let frameRequest = null;
    let lastPosition = -1;
    let shownIcon = '';
    let variables = [];

    const icon = name => s('svg', { viewBox: '0 0 24 24', width: '16', height: '16', 'aria-hidden': 'true' }, s('path', { d: ICONS[name], fill: 'currentColor' }));
    const title = h('strong', { class: 'deck-title' });
    const close = h('button', { class: 'btn', onClick: () => ctx.run(() => ctx.api.stopplay(), 'replay closed') }, 'Close');

    const area = s('polygon', { class: 'plot-area', points: '' });
    const line = s('polyline', { class: 'plot-line', points: '' });
    const spark = s('svg', { class: 'spark', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, area, line);
    const played = h('div', { class: 'played' });
    const playhead = h('div', { class: 'playhead' });
    const scrub = h('input', { class: 'scrub', type: 'range', min: '0', max: String(SCRUB_STEPS), step: '1', 'aria-label': 'Replay position' });
    const track = h('div', { class: 'track' }, spark, played, playhead, scrub);

    const back = h('button', { class: 'tbtn', 'aria-label': 'Previous frame', title: 'Previous frame (Shift: 10)' }, icon('back'));
    const play = h('button', { class: 'tbtn primary' });
    const forward = h('button', { class: 'tbtn', 'aria-label': 'Next frame', title: 'Next frame (Shift: 10)' }, icon('forward'));
    const clock = h('span', { class: 'deck-clock' });
    const frames = h('span', { class: 'deck-frame' });
    const loop = h('button', { class: 'btn', 'aria-pressed': 'false', title: 'Start over when the replay reaches the end' }, 'Loop');
    const plotSelect = h('select', { class: 'grow', 'aria-label': 'Variable to plot' });
    const plotValue = h('span', { class: 'deck-plot' });
    const speed = h('select', { 'aria-label': 'Replay speed' },
        ...DECK_SPEEDS.map(value => h('option', { value: String(value), selected: value === 1 }, speedLabel(value))));

    const el = h('div', { class: 'deck', role: 'group', 'aria-label': 'Replay', hidden: true },
        h('div', { class: 'deck-head' }, title, h('span', { class: 'spacer' }), loop, close),
        track,
        h('div', { class: 'deck-row wrap' }, back, play, forward, clock, frames),
        h('div', { class: 'deck-row' }, plotSelect, plotValue, speed));

    const pausedAtEnd = () => handle.speed() === 0 && handle.position() >= 1;

    function togglePlay() {
        if (handle.speed() > 0) return handle.speed(0);
        if (pausedAtEnd()) handle.seek(0);
        handle.speed(Number(speed.value));
        follow();
    }

    function stepFrames(count) {
        handle.speed(0);
        handle.seekFrame(handle.frame() + count);
        paint();
    }

    function drawPlot(index) {
        const chosen = variables[index];
        plot = null;
        line.setAttribute('points', '');
        area.setAttribute('points', '');
        if (!chosen) return;
        try {
            const series = ctx.api.recseries(handle.name, chosen.name, { sprite: chosen.sprite });
            const shape = sparkline(series, handle.duration);
            if (shape) {
                line.setAttribute('points', shape.line);
                area.setAttribute('points', shape.area);
            }
            plot = { series, name: chosen.name, drawn: !!shape };
        } catch (error) {
            ctx.fail(error);
        }
    }

    function openRecording() {
        variables = ctx.api.recvars(handle.name).filter(variable => variable.kind === 'var');
        const duplicate = name => variables.filter(variable => variable.name === name).length > 1;
        plotSelect.replaceChildren(...variables.map((variable, index) =>
            h('option', { value: String(index) }, duplicate(variable.name) ? `${variable.name} (${variable.sprite})` : variable.name)));
        const series = variables.map(variable => {
            try {
                return ctx.api.recseries(handle.name, variable.name, { sprite: variable.sprite });
            } catch {
                return [];
            }
        });
        const index = pickMoving(series);
        plotSelect.value = String(index);
        drawPlot(index);
    }

    function paint() {
        const position = handle.position();
        const percent = `${position * 100}%`;
        playhead.style.left = percent;
        played.style.width = percent;
        if (!dragging) scrub.value = String(Math.round(position * SCRUB_STEPS));
        const clockText = `${formatClock(handle.time())} of ${formatClock(handle.duration)}`;
        const frameText = `frame ${handle.frame() + 1} of ${handle.frames}`;
        setText(clock, clockText);
        setText(frames, frameText);
        scrub.setAttribute('aria-valuetext', `${clockText}, ${frameText}`);
        const point = plot?.series[handle.frame()];
        setText(plotValue, point ? `${plot.name} ${displayValue(point.value)}` : 'nothing to plot');
        const playing = handle.speed() > 0;
        const wanted = playing ? 'pause' : 'play';
        if (shownIcon !== wanted) {
            shownIcon = wanted;
            play.replaceChildren(icon(wanted));
            play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
            play.title = playing ? 'Pause (Space)' : 'Play (Space)';
        }
        const moved = position !== lastPosition;
        lastPosition = position;
        return moved;
    }

    function follow() {
        if (frameRequest !== null || !ctx.win.requestAnimationFrame) return;
        frameRequest = ctx.win.requestAnimationFrame(() => {
            frameRequest = null;
            if (!handle || !ctx.visible()) return;
            if (paint() && handle.speed() > 0) follow();
        });
    }

    back.addEventListener('click', event => stepFrames(-(event.shiftKey ? BIG_STEP : 1)));
    forward.addEventListener('click', event => stepFrames(event.shiftKey ? BIG_STEP : 1));
    play.addEventListener('click', () => { togglePlay(); paint(); });
    loop.addEventListener('click', () => {
        handle.loop(!handle.loop());
        loop.setAttribute('aria-pressed', String(handle.loop()));
    });
    speed.addEventListener('change', () => {
        if (handle.speed() > 0) handle.speed(Number(speed.value));
    });
    plotSelect.addEventListener('change', () => { drawPlot(Number(plotSelect.value)); paint(); });

    scrub.addEventListener('pointerdown', () => {
        dragging = { wasPlaying: handle.speed() > 0 };
        if (dragging.wasPlaying) handle.speed(0);
    });
    scrub.addEventListener('input', () => {
        handle.seek(Number(scrub.value) / SCRUB_STEPS);
        paint();
    });
    const release = () => {
        if (dragging?.wasPlaying && handle.position() < 1) handle.speed(Number(speed.value));
        dragging = null;
        follow();
    };
    scrub.addEventListener('pointerup', release);
    scrub.addEventListener('pointercancel', release);

    el.addEventListener('keydown', event => {
        if (!handle) return;
        const { tagName } = event.target;
        if (tagName === 'SELECT' || (tagName === 'BUTTON' && event.key === ' ')) return;
        const step = event.shiftKey ? BIG_STEP : 1;
        const shortcuts = {
            ArrowLeft: () => stepFrames(-step),
            ArrowRight: () => stepFrames(step),
            Home: () => { handle.seek(0); paint(); },
            End: () => { handle.speed(0); handle.seek(1); paint(); },
            ' ': () => { togglePlay(); paint(); },
        };
        const shortcut = shortcuts[event.key];
        if (!shortcut) return;
        shortcut();
        event.preventDefault();
    });

    return {
        el,
        sync() {
            const next = ctx.api.replay();
            if (next !== handle) {
                handle = next;
                lastPosition = -1;
                if (handle) openRecording();
            }
            el.hidden = !handle;
            if (!handle) return;
            setText(title, handle.name);
            loop.setAttribute('aria-pressed', String(handle.loop()));
            const current = String(handle.speed());
            if (handle.speed() > 0 && [...speed.options].some(option => option.value === current)) speed.value = current;
            paint();
            if (handle.speed() > 0) follow();
        },
    };
}
