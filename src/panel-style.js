export const PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }

.panel {
    --paper: #ffffff; --well: #f3f4f6; --line: #e1e3e8; --ink: #454a54; --ink-strong: #1b1e24; --muted: #646b78;
    --sky: #46b4f5; --sky-deep: #1a73c8; --on-sky: #08283f; --field: #ffffff; --danger: #c2294d;
    --aqua: #3fd0c2; --periwinkle: #8f9bff; --coral: #ff7d8f; --sunny: #ffc83d; --ok: #2fc98e;
    --pill-var: #8dd2fb; --pill-list: #7ee3d6; --pill-freeze: #1f6fd6; --pill-blank: #cfd3da; --pill-shitpost: #ff9aa8;
    --pill-ink: #0b2a43; --pill-freeze-ink: #ffffff;
    --shell: #e3e6eb; --raise: #ffffff; --hairline: rgba(22, 34, 52, .08); --hairline-strong: rgba(22, 34, 52, .14);
    --highlight: rgba(255, 255, 255, .95); --lift: rgba(22, 34, 52, .16); --spring: cubic-bezier(.32, .72, 0, 1);
    --shadow: 0 24px 48px -16px rgba(22, 34, 52, .38), 0 4px 10px rgba(22, 34, 52, .1);
    color-scheme: light dark;
    position: fixed; z-index: 2147483000; display: flex; flex-direction: column;
    min-width: 320px; min-height: 280px; max-width: 100vw; max-height: 100vh;
    resize: both; overflow: hidden; padding: 3px;
    background: var(--shell); color: var(--ink); border-radius: 15px; box-shadow: 0 0 0 1px var(--hairline-strong), var(--shadow);
    font: 12.5px/1.35 ui-rounded, 'SF Pro Rounded', 'Arial Rounded MT Bold', Nunito, 'Trebuchet MS', system-ui, sans-serif;
    animation: pop .34s var(--spring);
}
@media (prefers-color-scheme: dark) {
    .panel {
        --paper: #1f2227; --well: #17191d; --line: #34383f; --ink: #d3d6dc; --ink-strong: #f5f6f8; --muted: #9aa0ab;
        --field: #17191d; --danger: #ff9aa8; --pill-blank: #646b78; --sky-deep: #6cc3ff;
        --shell: #0f1114; --raise: #2d3138; --hairline: rgba(255, 255, 255, .07); --hairline-strong: rgba(255, 255, 255, .13);
        --highlight: rgba(255, 255, 255, .07); --lift: rgba(0, 0, 0, .5);
        --shadow: 0 24px 48px -16px rgba(0, 0, 0, .75), 0 4px 10px rgba(0, 0, 0, .35);
    }
}
.panel[hidden] { display: none; }
.panel:focus { outline: none; }
.panel.minimized { resize: none; min-height: 0; height: auto !important; }
.panel.minimized .core > :not(.bar) { display: none; }
.core { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--paper); border-radius: 12px; box-shadow: inset 0 1px 0 var(--highlight), 0 0 0 1px var(--hairline); }
[hidden] { display: none !important; }
button, input, select { font: inherit; color: inherit; }
button { cursor: pointer; }
button:disabled { cursor: default; opacity: .45; }
:focus-visible { outline: 2px solid var(--sky-deep); outline-offset: 2px; }
.btn, .pin, .icon, .tab, .segments button { transition: transform .09s ease-out, background-color .15s, border-color .15s, color .15s; }
.btn:active:not(:disabled), .pin:active:not(:disabled), .icon:active:not(:disabled), .tab:active, .segments button:active { transform: scale(.95); }
.glyph { display: block; margin: auto; }

.bar { display: flex; align-items: center; gap: 8px; padding: 4px 6px 2px 12px; cursor: grab; user-select: none; touch-action: none; }
.bar.dragging { cursor: grabbing; }
.title, .version { flex: none; }
.title { color: var(--ink-strong); font-size: 13px; font-weight: 700; letter-spacing: -.02em; }
.version { color: var(--muted); font-size: 11px; font-weight: 500; }
.chip { display: inline-flex; align-items: center; gap: 6px; min-width: 0; padding: 1px 8px 1px 6px; border-radius: 999px; background: var(--well); box-shadow: inset 0 0 0 1px var(--hairline); color: var(--ink-strong); font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chip::before { content: ''; flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ok) 25%, transparent); transition: background-color .2s, box-shadow .2s; }
.chip[data-tone="paused"]::before { background: var(--sunny); box-shadow: 0 0 0 2px color-mix(in srgb, var(--sunny) 28%, transparent); }
.chip[data-tone="record"]::before { background: var(--coral); box-shadow: 0 0 0 2px color-mix(in srgb, var(--coral) 28%, transparent); }
.chip[data-tone="play"]::before { background: var(--sky-deep); box-shadow: 0 0 0 2px color-mix(in srgb, var(--sky-deep) 25%, transparent); }
.spacer { flex: 1; }
.icon { display: inline-flex; align-items: center; justify-content: center; background: none; border: 0; border-radius: 7px; width: 22px; height: 22px; padding: 0; color: var(--muted); transition: transform .16s var(--spring), background-color .15s, color .15s; }
.icon:hover:not(:disabled) { background: var(--well); color: var(--ink-strong); }

.tabs { position: relative; display: flex; margin: 4px 6px 2px; padding: 2px; border-radius: 10px; background: var(--well); box-shadow: inset 0 0 0 1px var(--hairline); overflow-x: auto; scrollbar-width: none; }
.tab-indicator { --cat: var(--sky); position: absolute; left: 0; top: 2px; bottom: 2px; width: 0; border-radius: 8px; background: color-mix(in srgb, var(--cat) 16%, var(--raise)); box-shadow: 0 1px 2px var(--lift), 0 0 0 1px var(--hairline-strong), inset 0 1px 0 var(--highlight); pointer-events: none; }
.tab-indicator.ready { transition: transform .34s var(--spring), width .34s var(--spring); }
.tab-indicator[data-hue="sense"] { --cat: var(--aqua); }
.tab-indicator[data-hue="events"] { --cat: var(--periwinkle); }
.tab-indicator[data-hue="rec"] { --cat: var(--coral); }
.tab { --cat: var(--sky); position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex: 1 1 auto; background: none; border: 0; border-radius: 8px; padding: 2px 6px; color: var(--muted); font-size: 12.5px; font-weight: 600; white-space: nowrap; }
.tab::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--cat); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .45); transition: transform .3s var(--spring); }
.tab[data-hue="sense"] { --cat: var(--aqua); }
.tab[data-hue="events"] { --cat: var(--periwinkle); }
.tab[data-hue="rec"] { --cat: var(--coral); }
.tab:hover { color: var(--ink-strong); }
.tab[aria-selected="true"] { color: var(--ink-strong); font-weight: 700; }
.tab[aria-selected="true"]::before { transform: scale(1.3); }

.body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.page { flex: 1; min-height: 0; display: flex; flex-direction: column; animation: rise .16s ease-out; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 4px 8px; }
.toolbar input:not([type="checkbox"]), .toolbar select, .drawer input:not([type="checkbox"]) { padding: 1px 6px; }
.toolbar .btn, .btn-row .btn, .saved .btn, .drawer .btn { padding: 1px 8px; }
.time .btn { padding: 1px 7px; }
.toolbar + .toolbar { padding-top: 0; }
.toolbar label { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); }
input:not([type="checkbox"]):not([type="range"]), select { background: var(--field); border: 1px solid var(--line); border-radius: 6px; padding: 2px 7px; min-width: 0; transition: border-color .15s, box-shadow .15s; }
.toolbar input.grow { min-width: 100px; }
.keep { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; }
.keep input { width: 64px; }
.checks { display: inline-flex; align-items: center; gap: 8px; margin-left: auto; }
input:focus, select:focus { border-color: var(--sky-deep); box-shadow: 0 0 0 3px color-mix(in srgb, var(--sky) 30%, transparent); }
input[type="checkbox"] { accent-color: var(--sky-deep); }
.grow { flex: 1; min-width: 90px; }
.btn { background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 2px 9px; font-weight: 700; color: var(--ink-strong); }
.btn:hover:not(:disabled) { border-color: var(--sky-deep); }
.btn.primary { background: var(--sky); border-color: var(--sky); color: var(--on-sky); }
.btn.primary:hover:not(:disabled) { filter: brightness(1.06); }
.btn.danger { color: var(--danger); }
.btn.danger:hover:not(:disabled) { border-color: var(--danger); }

.toolbar input:not([type="checkbox"]), .toolbar select, .drawer input:not([type="checkbox"]), .drawer select { border-color: transparent; border-radius: 8px; background: var(--well); box-shadow: inset 0 0 0 1px var(--hairline-strong); }
.toolbar input:focus, .toolbar select:focus, .drawer input:focus { border-color: var(--sky-deep); background: var(--field); box-shadow: 0 0 0 3px color-mix(in srgb, var(--sky) 28%, transparent); }
.toolbar .btn, .btn-row .btn, .saved .btn, .drawer .btn, .time .btn { border-color: transparent; border-radius: 8px; font-weight: 600; box-shadow: 0 0 0 1px var(--hairline-strong), 0 1px 1px var(--hairline); transition: transform .16s var(--spring), box-shadow .2s, background-color .15s, color .15s; }
.toolbar .btn:hover:not(:disabled), .btn-row .btn:hover:not(:disabled), .saved .btn:hover:not(:disabled), .drawer .btn:hover:not(:disabled), .time .btn:hover:not(:disabled) { border-color: transparent; box-shadow: 0 0 0 1px var(--sky-deep), 0 2px 4px var(--hairline); }
.toolbar .btn:active:not(:disabled), .btn-row .btn:active:not(:disabled), .saved .btn:active:not(:disabled), .drawer .btn:active:not(:disabled), .time .btn:active:not(:disabled) { transform: scale(.96); }
.toolbar .btn.primary, .saved .btn.primary, .drawer .btn.primary { background: linear-gradient(180deg, color-mix(in srgb, var(--sky) 82%, #fff), var(--sky)); box-shadow: 0 0 0 1px color-mix(in srgb, var(--sky-deep) 55%, transparent), 0 1px 2px var(--lift), inset 0 1px 0 rgba(255, 255, 255, .5); font-weight: 700; }
.toolbar .btn.primary:hover:not(:disabled), .saved .btn.primary:hover:not(:disabled), .drawer .btn.primary:hover:not(:disabled) { box-shadow: 0 0 0 1px var(--sky-deep), 0 2px 6px var(--lift), inset 0 1px 0 rgba(255, 255, 255, .5); filter: none; }
.btn-row { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 8px 4px; }
.summary { padding: 1px 12px 3px; color: var(--muted); font-size: 12px; }
.list { flex: 1; min-height: 0; overflow: auto; box-shadow: inset 0 1px 0 var(--hairline); }
.empty { padding: 16px 14px; color: var(--muted); max-width: 34ch; line-height: 1.5; text-wrap: pretty; }

.item { --pill: var(--pill-var); --on-pill: var(--pill-ink); position: relative; contain: layout style; }
.item::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: 0; height: 1px; background: var(--hairline); }
.item::before { content: ''; position: absolute; left: 0; top: 7px; bottom: 7px; width: 3px; border-radius: 0 3px 3px 0; background: var(--pill); transform: scaleY(0); transition: transform .3s var(--spring); }
.item[data-open]::before { transform: scaleY(1); }
.item[data-mode="list"] { --pill: var(--pill-list); }
.item[data-mode="freeze"] { --pill: var(--pill-freeze); --on-pill: var(--pill-freeze-ink); }
.item[data-mode="blank"] { --pill: var(--pill-blank); }
.item[data-mode="shitpost"] { --pill: var(--pill-shitpost); }
.row { display: grid; grid-template-columns: 20px minmax(70px, 1fr) minmax(60px, auto) minmax(74px, auto); align-items: center; gap: 6px; padding: 1px 8px 1px 4px; min-height: 28px; transition: background-color .2s; }
.row:hover { background: color-mix(in srgb, var(--ink) 4%, transparent); }
.chev { display: inline-flex; align-items: center; justify-content: center; background: none; border: 0; color: var(--muted); width: 20px; height: 20px; padding: 0; transition: transform .3s var(--spring), color .15s; }
.chev[aria-expanded="true"] { transform: rotate(90deg); color: var(--ink-strong); }
.who { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
.name { color: var(--ink-strong); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { color: var(--muted); font-size: 10.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell { min-width: 0; justify-self: end; max-width: 150px; }
.slot { min-width: 0; }
.value { display: block; min-width: 60px; max-width: 150px; background: var(--pill); color: var(--on-pill); border: 0; border-radius: 6px; padding: 0 9px; text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .4), 0 1px 1px var(--lift); transition: background-color .3s var(--spring), color .3s var(--spring), transform .22s var(--spring), box-shadow .22s var(--spring); }
.value:hover { transform: translateY(-1px); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .4), 0 3px 6px var(--lift); }
.value:active { transform: scale(.97); }
.cell input { width: 140px; text-align: center; font-weight: 600; border-width: 2px; border-color: var(--sky-deep); border-radius: 6px; }
.pin { background: none; border: 0; border-radius: 8px; padding: 0 7px; white-space: nowrap; color: var(--muted); font-weight: 600; text-align: center; box-shadow: inset 0 0 0 1px var(--hairline-strong); transition: transform .16s var(--spring), background-color .3s var(--spring), color .2s, box-shadow .2s; }
.pin:hover { color: var(--ink-strong); box-shadow: inset 0 0 0 1px var(--sky-deep); }
.pin[aria-pressed="true"] { background: var(--pill); color: var(--on-pill); font-weight: 700; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .4), 0 1px 1px var(--lift); }

.drawer { display: flex; flex-direction: column; gap: 4px; padding: 6px 10px 8px 28px; background: var(--well); box-shadow: inset 0 1px 0 var(--hairline), inset 0 -1px 0 var(--hairline); animation: rise .24s var(--spring); }
.drawer .line { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; }
.drawer .label { color: var(--muted); min-width: 60px; font-weight: 600; }
.drawer input { width: 80px; }
.drawer input.wide { flex: 1; width: auto; min-width: 80px; }
.items { display: flex; flex-direction: column; gap: 3px; max-height: 160px; overflow: auto; }
.items .line { flex-wrap: nowrap; }
.idx { color: var(--muted); min-width: 28px; text-align: right; font-variant-numeric: tabular-nums; }
.note { color: var(--muted); font-size: 12px; }
.icon.hold { color: var(--muted); }
.icon.hold[aria-pressed="true"] { background: var(--pill-freeze); color: var(--pill-freeze-ink); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .4), 0 1px 1px var(--lift); }
.line.held input { background: color-mix(in srgb, var(--pill-freeze) 12%, var(--well)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--pill-freeze) 55%, transparent); }
.held-badge { display: inline-flex; align-items: center; gap: 2px; margin-left: 6px; padding: 0 4px; border-radius: 5px; background: var(--pill-freeze); color: var(--pill-freeze-ink); font-size: 10px; font-weight: 700; vertical-align: middle; }

.saved { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1px 8px; padding: 4px 10px; align-items: center; animation: rise .24s var(--spring); }
.saved::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: 0; height: 1px; background: var(--hairline); }
.saved strong { color: var(--ink-strong); font-weight: 600; }
.saved .detail { color: var(--muted); font-size: 12px; }
.saved .actions { display: flex; gap: 5px; grid-row: span 2; grid-column: 2; }
.progress { grid-column: 1 / -1; width: 100%; accent-color: var(--sky-deep); }

.time { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin: 2px 4px 0; padding: 3px; border-radius: 10px; background: var(--well); box-shadow: inset 0 0 0 1px var(--hairline); }
.segments { display: inline-flex; padding: 1px; gap: 1px; border-radius: 8px; background: var(--paper); box-shadow: 0 0 0 1px var(--hairline-strong), 0 1px 1px var(--hairline); }
.segments button { background: none; border: 0; border-radius: 7px; padding: 1px 5px; min-width: 22px; font-weight: 600; color: var(--ink); transition: background-color .25s var(--spring), color .2s, transform .16s var(--spring); }
.segments button:hover { background: var(--well); color: var(--ink-strong); }
.segments button[aria-pressed="true"] { background: var(--sunny); color: #2b2100; font-weight: 700; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .55), 0 1px 1px var(--lift); }
.status { display: flex; align-items: center; gap: 7px; min-height: 22px; max-height: 3.4em; padding: 2px 12px 5px; color: var(--muted); overflow: hidden; text-wrap: pretty; }
.status::before { content: ''; flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--muted); opacity: .4; transition: background-color .25s, opacity .25s; }
.status[data-tone="hint"]::before { display: none; }
.status[data-tone="ok"]::before { background: var(--ok); opacity: 1; }
.status[data-tone="error"]::before { background: var(--danger); opacity: 1; }
.status[data-tone="error"] { color: var(--danger); font-weight: 600; }
.status[data-tone="ok"] { color: var(--ink-strong); }

.deck { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; background: var(--well); border-top: 1px solid var(--line); animation: rise .18s ease-out; }
.deck-head, .deck-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.deck-row.wrap { flex-wrap: wrap; }
.deck-title { color: var(--ink-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.track { position: relative; height: 46px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); overflow: hidden; }
.track:focus-within { outline: 2px solid var(--sky-deep); outline-offset: 1px; }
.spark { position: absolute; inset: 0; width: 100%; height: 100%; }
.plot-area { fill: color-mix(in srgb, var(--sky) 22%, transparent); }
.plot-line { fill: none; stroke: var(--sky-deep); stroke-width: 1.5; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.played { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: color-mix(in srgb, var(--sky) 14%, transparent); pointer-events: none; }
.playhead { position: absolute; top: 0; bottom: 0; left: 0; width: 2px; margin-left: -1px; background: var(--ink-strong); pointer-events: none; }
.playhead::before { content: ''; position: absolute; top: -1px; left: -4px; width: 10px; height: 10px; border-radius: 50%; background: var(--ink-strong); }
.scrub { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0; border: 0; opacity: 0; cursor: ew-resize; touch-action: none; }
.tbtn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 26px; padding: 0; background: var(--paper); border: 1px solid var(--line); border-radius: 6px; color: var(--ink-strong); transition: transform .09s ease-out, background-color .15s, border-color .15s; }
.tbtn:hover { border-color: var(--sky-deep); }
.tbtn:active { transform: scale(.94); }
.tbtn.primary { width: 38px; background: var(--sky); border-color: var(--sky); color: var(--on-sky); }
.deck-clock { margin-left: 4px; color: var(--ink-strong); font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.deck-frame, .deck-plot { color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.deck-plot { color: var(--ink-strong); font-weight: 700; }
.btn[aria-pressed="true"] { background: var(--sky); border-color: var(--sky); color: var(--on-sky); }

@keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.975); } to { opacity: 1; transform: none; } }
@keyframes rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
}
@media (forced-colors: active) {
    .core { outline: 1px solid CanvasText; }
    .tab-indicator { border: 2px solid Highlight; background: none; }
    .pin[aria-pressed="true"], .segments button[aria-pressed="true"] { outline: 2px solid Highlight; }
    .value { border: 1px solid CanvasText; }
}
`;
