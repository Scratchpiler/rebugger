# rebugger internals

The parts of rebugger that nobody needs to know to use it, moved out of the README so the README can be about what it does. If you are here to freeze a variable, you are in the wrong file.

## How the panel is built

- **Look.** Built like a small piece of hardware: an outer shell holds an inner core with concentric corners and a lit top edge, the tabs are a segmented track with a raised thumb that slides to the active tab, and the speed controls sit in a floating dock. Surfaces are neutral white and grey (charcoal in dark mode, following the system setting), separated by translucent hairlines and inset row dividers instead of grey borders, with cool-tinted soft shadows. The sky blue appears only where it means something: the value pills, primary buttons, the focus ring and the active tab. Each value is a pill coloured by state: sky for a variable, aqua for a list, deep blue while frozen, grey while blanked, coral while shitposting, so what is held stands out in a long list. An expanded row gets a coloured edge in its pill's colour. Icons are thin 1.5px line SVGs (`icons.js`). Pill text is dark navy on the light fills and white on the deep blue to keep contrast readable. The font is a rounded system stack (`ui-rounded`, Arial Rounded, Nunito, Trebuchet MS, then the system font) because a userscript can't count on loading web fonts past the page's CSP. There is deliberately no backdrop blur: the panel floats over the live stage, and blurring a canvas that redraws 30 times a second would cost real frames.
- **Motion.** Kept deliberately small, and every animation answers something you did: the panel pops in when opened; a highlight slides under the active tab; the pill pops once when its state changes (held, blanked, released); pages and drawers rise in; status messages fade in and errors give one small shake; buttons dip when pressed. Nothing pulses: a changing value just updates in place, and the recording indicator is a steady dot. Only `opacity` and `transform` are animated, through the Web Animations API (`animate.js`), so there is no class toggling or forced reflow. Rows use CSS `contain`, and a refresh skips any DOM write whose value hasn't changed. The shared curve is a spring, `cubic-bezier(.32, .72, 0, 1)`. Everything is skipped when the system asks for reduced motion.
- **Live values and cost.** The visible tab refreshes four times a second while the project runs, once a second while it is paused (nothing can change by itself then, and your own edits refresh immediately), and not at all while the panel is closed, collapsed to its header, or the tab is hidden. A refresh that takes long pushes the next one out so the panel stays under about a tenth of the main thread. The variable list reads lists by reference instead of copying them (`find(query, { live: true })`, read-only), builds a row for only the 200 shown, and sorts with a pre-built collator. On a stress project (12 sprites, 4,800 variables, three 100k-item lists) one refresh went from 36 ms to under 6 ms. A value that changes simply updates in place; a value being edited is never overwritten.
- **Limits.** 200 rows are drawn (a line says how many matched when there are more), and a list drawer shows the first 100 items. Narrow the filter for the rest.
- **Keyboard.** The panel stops `keydown`, `keyup` and `keypress` at its edge, so typing into it never triggers the project's key blocks. Tabs are a real tablist (arrow keys move between them), controls are buttons with labels and `aria-pressed`, there is a visible focus ring, motion respects `prefers-reduced-motion`, and the colours hold up in forced-colours mode.
- **Style isolation.** It lives in a shadow root, so the page's CSS can't restyle it and its CSS can't leak out.

## How speed, pause and step work

- **It works by skipping or repeating the project's own steps.** The page's timer keeps ticking at its normal rate and rebugger decides how many project frames each tick gets: `speed(3)` runs three, `speed(0.25)` runs one every fourth tick, `pause()` runs none. One tick runs at most 1000 frames. `Infinity` runs frames until half a tick's worth of real time is spent, and at least one.
- **Project time follows the frames, not the wall clock.** While the speed isn't 1, or the project is paused, `wait`, the `timer` block and anything else that reads `runtime.currentMSecs` advances by exactly one frame's worth per frame. So `wait 1 seconds` takes one real second at 1x, half a second at 2x, and never finishes while paused. Going back to speed 1 carries on from where the project clock was, without a jump. This replaces `runtime.updateCurrentMSecs` with an own property while it's needed; `dispose()` puts it back, and any `wait` in progress then sees the clock jump to the real time.
- **Things that keep real time.** Glides (`glide to`) use their own timer and so run at normal speed, and sounds play at their normal rate. Extensions that read the real clock aren't affected either.
- **Each extra frame is a full frame.** Freezes, shitposts, watches, recordings and playback all run on every frame, so a recording at `speed(2)` gets two samples per tick. They are stamped with the real time of the tick, so playing it back skips frames that shared a tick.
- **Pause freezes recording and playback time.** The time a recording or a playback measures stops while paused, and `step()` moves it on by one frame, so a recording doesn't contain the pause and a paused playback doesn't jump when you resume.
- **A paused project can still be edited.** `set`, `load` and the rest work while paused; `watch` only fires, and freezes only reapply, when a frame runs (`step()`).
- **`step()` needs `pause()` first** and throws otherwise.

## Hooks

- **Cloud variables change locally only.** Writes assign `variable.value` directly and never go through the cloud I/O device, so nothing is sent to the server, and the first write prints a warning. A project script that later runs `set` or `change` on that variable will send whatever value it computes.
- **List monitors.** List edits mark the monitor stale (`_monitorUpToDate = false`), the same as the list blocks do, so the on-stage monitor redraws.
- **`watch`, `freeze`, `speed` and `pause` wrap `runtime._step`.** This scratch-vm has no per-frame event. `freeze` reapplies before and after each step, so scripts see the frozen value and monitors show it. `watch` compares after each step. The wrapper is removed once nothing is watched, frozen, recorded or played back and the project is at speed 1 and not paused, unless another script wrapped `_step` after ours, in which case it stays as a passthrough.

## Layout

`rebugger.user.js` is generated; edit `src/`.

| Module | Owns |
|---|---|
| `userscript.js` | the page entry: finds the VM, publishes `rebugger` and `rb`, installs the hotkey |
| `rebugger.js` | `makeRebugger(vm, { clock, random, announce, document, storage, restorePanel, download })`: builds the modules below into a quiet core, then wraps it for the console (`announce.js`) and gives the core to the panel |
| `vm-lookup.js` | finding the VM through React's fiber tree |
| `world.js` | targets, scopes, name lookup, `hold`, cloud warnings |
| `stepper.js` | the single `runtime._step` wrapper, `speed`, `pause`, `step`, and the project clock |
| `pins.js` | `freeze`, `freezeAll`, `blank`, `blankAll`, `shitpost`, `unfreeze` |
| `watching.js` | `watch` |
| `variables.js` | `vars`, `get`, `set`, list edits, `find` |
| `scan.js` | `scan` and its narrowing helpers |
| `motion.js` | sprite pose capture and apply |
| `savestates.js` | `save`, `load`, `states`, `drop`, `export`, `import` |
| `recording.js` | `startrec`, `stoprec`, `playrec` and the rest |
| `log.js`, `help.js`, `table.js` | styled console output, the help text, table cells |
| `announce.js` | the one-line confirmations: wraps the core's commands without changing what they return |
| `hotkey.js` | `Alt+Shift+D` matching and `installHotkey` |
| `panel.js` | the panel shell: window, drag, tabs, bottom bar, refresh loop, saved placement |
| `panel-tabs.js`, `panel-rows.js`, `panel-deck.js` | the four tabs, the variable row with its drawer plus the keyed `reconcile`, and the replay deck |
| `panel-model.js` | pure panel logic: value parsing and display, filters, row building with pin modes |
| `panel-style.js`, `dom.js`, `icons.js` | the panel's CSS, a tiny `h(tag, props, ...children)` with an SVG twin, and the line icons |
| `animate.js` | the motion vocabulary (keyframes and durations) and a reduced-motion-aware player |

Only `stepper.js` touches `runtime._step`. Every other module registers a tap with an `order`, and the stepper runs every tap's `before`, then the real step, then every tap's `after`, in order: playback (10), pins (20), recording (30), watchers (40). A tap's `active()` tells the stepper when the wrapper can come off.
