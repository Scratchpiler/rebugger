# rebugger internals

The parts of rebugger that nobody needs to know to use it, moved out of the README so the README can be about what it does. If you are here to freeze a variable, you are in the wrong file.

## How the panel is built

- **Look.** Built like a small piece of hardware: an outer shell holds an inner core with concentric corners and a lit top edge, the tabs are a segmented track with a raised thumb that slides to the active tab, and the speed controls sit in a floating dock. Surfaces are neutral white and grey (charcoal in dark mode, following the system setting), separated by translucent hairlines and inset row dividers instead of grey borders, with cool-tinted soft shadows. The sky blue appears only where it means something: the value pills, primary buttons, the focus ring and the active tab. Each value is a pill coloured by state: sky for a variable, aqua for a list, deep blue while frozen, grey while blanked, coral while shitposting, so what is held stands out in a long list. An expanded row gets a coloured edge in its pill's colour. Icons are thin 1.5px line SVGs (`icons.js`). Pill text is dark navy on the light fills and white on the deep blue to keep contrast readable. The font is a rounded system stack (`ui-rounded`, Arial Rounded, Nunito, Trebuchet MS, then the system font) because a userscript can't count on loading web fonts past the page's CSP. There is deliberately no backdrop blur: the panel floats over the live stage, and blurring a canvas that redraws 30 times a second would cost real frames.
- **Motion.** Kept deliberately small, and every animation answers something you did: the panel pops in when opened; a highlight slides under the active tab; the pill pops once when its state changes (held, blanked, released); pages and drawers rise in; status messages fade in and errors give one small shake; buttons dip when pressed. Nothing pulses: a changing value just updates in place, and the recording indicator is a steady dot. Only `opacity` and `transform` are animated, through the Web Animations API (`animate.js`), so there is no class toggling or forced reflow. Rows use CSS `contain`, and a refresh skips any DOM write whose value hasn't changed. The shared curve is a spring, `cubic-bezier(.32, .72, 0, 1)`. Everything is skipped when the system asks for reduced motion.
- **Live values and cost.** The visible tab refreshes four times a second while the project runs, once a second while it is paused (nothing can change by itself then, and your own edits refresh immediately), and not at all while the panel is closed, collapsed to its header, or the tab is hidden. A refresh that takes long pushes the next one out so the panel stays under about a tenth of the main thread. The variable list reads lists by reference instead of copying them (`find(query, { live: true })`, read-only), builds a row for only the 200 shown, and sorts with a pre-built collator. On a stress project (12 sprites, 4,800 variables, three 100k-item lists) one refresh went from 36 ms to under 6 ms. A value that changes simply updates in place; a value being edited is never overwritten.
- **Tabs.** Five of them now, so the tab labels are 11.5px with tight padding. A tab may define `leave()`, called when it stops being visible.
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

## How the Threads tab works

- **Where the data comes from.** `threads.js` reads `runtime.threads` directly: each thread's `stack` is the chain of blocks being executed (the block running at each nesting level, hat excluded), `topBlock` is the hat, and `stackFrames[i].params` holds a procedure's arguments. `block-labels.js` turns an opcode into Scratch's words and fills in the field or menu value (`when I receive jump`, `set score to`, `create clone of myself`); an opcode it doesn't know falls back to a split of the opcode. Ids are handed out the first time a thread is seen and kept in a `WeakMap`, so they survive refreshes and never collide.
- **What "running" and "waiting" mean.** After a frame scratch-vm resets every yielded thread to `STATUS_RUNNING`, so the status alone can't say. Only a promise wait (`STATUS_PROMISE_WAIT`) is visible, so waiting is that, or the current block's opcode being one of the known waiting blocks (`WAITING` in `block-labels.js`). Time at the same block comes from comparing each poll's stack and status, so it is only as exact as the refresh rate.
- **Kill and restart use the VM's own calls.** `runtime._stopThread` is the same call as pressing stop on a script, and `runtime._restartThread` replaces the thread in place, so the new thread keeps its position in the execution order. Starting a script is `_pushThread` with `stackClick`, after stopping any earlier click-started copy, so it behaves like clicking the stack. `broadcast` calls `startHats` with a fresh match object, because `startHats` upper-cases the one it is given.
- **Pause and step wrap `sequencer.stepThread`, and a skipped thread must yield.** A paused thread is simply not stepped. But a thread left in `STATUS_RUNNING` counts as active, so the sequencer would keep looping the frame until its work-time budget ran out, running every other script many extra times. The wrapper marks a skipped thread `STATUS_YIELD_TICK`, which `stepThreads` neither steps nor counts, and clears once per frame, where the wrapper sets it again. `step` lets exactly one `stepThread` call through. The wrapper is installed only while something is paused or profiled, and removed (deleting the own property if there wasn't one) when nothing is.
- **Cost.** With profiling on, the same wrapper times each `stepThread` call and sums them per thread per frame; a tap at order 50 folds that into a smoothed average and lets finished threads go. It is on only while the Threads tab is open: the panel calls each tab's optional `leave()` when you switch tabs, collapse, close, or the page is hidden. With 3,000 threads it added under a millisecond a frame.
- **Why the list doesn't jump.** Clones and broadcast receivers start and finish constantly, so a naive list inserts and removes rows all over it. Four things hold it still. Order is by first sight, so new scripts append at the bottom and nothing above them moves (the other orders re-sort at most every two seconds, and never while the pointer or keyboard focus is in the list or while it is scrolled). A script that ends stays in place greyed out as `ended` for 1.5 seconds, and indefinitely while the pointer is over the list, so the Kill button you are about to press can't leave. A row that was dropped is remembered until the VM stops listing it, so a killed thread in a paused project doesn't flicker back. And whatever still changes, `keepScroll` (`panel-rows.js`) remembers the first visible row and its offset before the update and puts it back after, falling back to the next few rows if that one is gone, and does nothing at the top of the list. The list sets `overflow-anchor: none` so the browser's own anchoring doesn't fight it. In Chromium with a project spawning a clone every 40 ms, a row being watched stayed at exactly the same pixel through 1,700 insertions and removals; with `keepScroll` off it left the screen.
- **Broadcast completion.** `messages()` reads the stage's broadcast variables and counts `event_whenbroadcastreceived` hats per message. The box ranks exact, then prefix, then word start, then substring, then by how many scripts listen. Tab completes the top suggestion, arrows move, Enter sends, and Escape closes the list without closing the panel.
- **Testing headless needs a redraw.** Without a renderer nothing requests a redraw, so a `forever` loop spins until the sequencer's work-time budget runs out and a script moves hundreds of thousands of times per frame. The thread tests wrap `motion_changexby` to request one, as a real stage does.

## Hooks

- **Cloud variables change locally only.** Writes assign `variable.value` directly and never go through the cloud I/O device, so nothing is sent to the server, and the first write prints a warning. A project script that later runs `set` or `change` on that variable will send whatever value it computes.
- **List monitors.** List edits mark the monitor stale (`_monitorUpToDate = false`), the same as the list blocks do, so the on-stage monitor redraws.
- **`watch`, `freeze`, `speed` and `pause` wrap `runtime._step`.** This scratch-vm has no per-frame event. `freeze` reapplies before and after each step, so scripts see the frozen value and monitors show it. `watch` compares after each step. The wrapper is removed once nothing is watched, frozen, recorded or played back and the project is at speed 1 and not paused, unless another script wrapped `_step` after ours, in which case it stays as a passthrough.

## CI

`.github/workflows/ci.yml` runs on pushes to `main`, pull requests and by hand. The `test` job runs `npm ci` and `npm test` (which builds the userscript, then runs every test) on Node 22, 24 and 26, then checks that `rebugger.user.js` exists and its `@version` matches `package.json`; the Node 24 run uploads it as the `rebugger-userscript` artifact. On a push to `main`, once the tests pass, the `release` job replaces the rolling `latest` release with that file, the same way Scratchpiler does, so the install link never changes. The repo is self-contained: `esbuild`, `jsdom` and `scratch-vm` are dev dependencies, with a lockfile, so a fresh clone needs nothing from the sibling folders.

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
| `threads.js`, `block-labels.js` | `threads` and its kill, pause, step, restart, frames and profile, `broadcast`, `messages`, `scripts`, `startScript`; and turning a block into its Scratch wording |
| `log.js`, `help.js`, `table.js` | styled console output, the help text, table cells |
| `announce.js` | the one-line confirmations: wraps the core's commands without changing what they return |
| `hotkey.js` | `Alt+Shift+D` matching and `installHotkey` |
| `panel.js` | the panel shell: window, drag, tabs, bottom bar, refresh loop, saved placement |
| `panel-tabs.js`, `panel-rows.js`, `panel-deck.js`, `panel-threads.js` | the Variables, Scan, Savestates and Record tabs, the variable row with its drawer plus the keyed `reconcile` and `keepScroll`, the replay deck, and the Threads tab with its broadcast box |
| `panel-model.js` | pure panel logic: value parsing and display, filters, row building with pin modes |
| `panel-style.js`, `dom.js`, `icons.js` | the panel's CSS, a tiny `h(tag, props, ...children)` with an SVG twin, and the line icons |
| `animate.js` | the motion vocabulary (keyframes and durations) and a reduced-motion-aware player |

Only `stepper.js` touches `runtime._step`. Every other module registers a tap with an `order`, and the stepper runs every tap's `before`, then the real step, then every tap's `after`, in order: playback (10), pins (20), recording (30), watchers (40), thread cost (50). A tap's `active()` tells the stepper when the wrapper can come off.
