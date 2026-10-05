# rebugger

A debugger for the Scratch player, driven from the console or from an on-page panel (`Alt+Shift+D`): read and write variables and lists, freeze them, find them by value, save and restore state, record and replay, and change the project's speed. It started life as `vmprobe`. It is kept separate from Scratchpiler, shares no code with it and lives outside both repos.

It runs on `https://scratch.mit.edu/projects/*` (the player and the editor), finds the Scratch VM through React's fiber tree, and publishes `window.rebugger`, also available as `window.rb`.

## Install

Build it, then add `rebugger.user.js` to Tampermonkey or Violentmonkey. Chrome-based browsers only so far; Firefox's sandbox may need `exportFunction` and is untested.

```sh
node build.js        # writes rebugger.user.js
node build.js --watch
```

The build borrows `esbuild` from `../scratchpiler`, so run `npm install` there first.

## Console output

Messages from rebugger itself (the ready banner, confirmations, warnings, errors, `status()` and `help()`) are styled with `%c`: a coloured `rebugger` badge, purple for info, amber for warnings and red for errors. In `help()` and `status()` the labels are lined up in one column. Return values such as `info()` or `vars()` stay plain data so `console.table` and the object inspector work on them. A `%` in a message is escaped, so a variable called `100%d` can't be read as a format specifier. Thrown errors are ordinary errors and can't be styled.

**Confirmations.** On the page, each state-changing command prints one line saying what happened, for example `froze "score" at 500`, `saved "state-1": 12 variables, 2 lists` or `scan: 3 hits: score=5, hp=5, lives=5`. Returned values are unchanged. `rebugger.quiet()` silences them and `rebugger.quiet(false)` brings them back. They are off by default in `makeRebugger` (so the tests stay quiet) and switched on by the userscript. Loading a savestate over frozen variables warns that they will snap back.

**Typos.** A wrong variable or sprite name suggests the closest ones: `no variable named "scor" (did you mean "score"?)`. Matching is by substring and by edit distance (a swapped pair of letters counts as one edit), and nothing is suggested when nothing is close.

**`rebugger.table(rows)`** prints `vars()`, `find()`, `scan()`, `states()` or `recs()` results through `console.table`, with long lists shortened to `[n] first items…` so the table stays readable. **`rebugger.status()`** prints what is running (speed or paused, what is frozen, scan, savestates, recording, playback); `info()` is the same facts as data. **`rebugger.help('freeze')`** shows only the help groups that mention the topic.

## Panel

`Alt+Shift+D` or `rebugger.ui()` opens an on-page panel; the same key, the close button or `Escape` (with focus in the panel) hides it, and `rebugger.ui(true)` / `rebugger.ui(false)` open and close it explicitly. Nothing is added to the page until it is first opened. `Alt+Shift+D` was chosen because `Ctrl+Shift+D` bookmarks every tab in Chrome and Firefox; the shortcut is matched on the physical key, so it works on any layout, and it is swallowed so the project never sees it.

The panel is a compact, draggable, resizable window (364 by 440 by default, with about eight variables visible at once; drag the header, pull the bottom-right corner, `–` collapses it to the header). It remembers its position, size, tab, collapsed state and whether it was open in `localStorage` and comes back after a reload. If storage is blocked it just forgets. A bar at the bottom is always visible whichever tab is showing.

| Part | What it does |
|---|---|
| Header | state chip: running at some speed, paused, recording a name, or playing a name |
| Variables | every variable and list, sorted by sprite then name. Filter by name or `/regex/` (the box shows how many rows there are), pick a sprite, show only what is frozen, include clones. Click a value to edit it (Enter writes it, Escape cancels). **Freeze** holds the current value (a list gets **Blank**); the pill reads Frozen, Blanked or Shitposting and a click releases it. The chevron opens a drawer: hold at a typed value, shitpost between two numbers, blank, release; for lists, every item has an editable field, a **lock** that holds just that item at its current value while the rest stays free, and a remove button; below are add, **Hold all** and **Release held**, **Wipe rows** (every row becomes empty text, the rows stay), **Clear** (removes every row) and **Blank** (keeps the list empty every frame). A list with held items shows a small lock badge with the count on its row, and the **Frozen** filter finds it |
| Scan | value box with a tolerance, **Scan** (becomes **Narrow** once a scan is running), **Snapshot** (before a scan) or **Reset** (during one) in the same slot, and a segmented row: Changed, Unchanged, Increased, Decreased. Hits are the same editable, freezable rows as the Variables tab |
| Savestates | **Save** with an optional name, **Load**, **Export** (downloads the savestate as JSON), **Drop**, **Import…** from a file; checkboxes for restoring sprite positions and recreating deleted variables |
| Record | **Record** / **Stop** with an optional name filter, lists, sprite motion and a limit on how much to keep (a number with a **Frames** or **Seconds** unit; each unit remembers its own number, and Seconds follows project time, not the frame rate); each recording has **Replay** (opens the replay deck below) and **Drop** |
| Bottom bar | **Pause** / **Resume**, **Step** and **+10** (run one or ten frames while paused), speed buttons .25, .5, 1, 2, 5 and ∞ (times normal speed; the header chip shows the current one), all on one row, and a status line for the last result or error |

**The replay deck.** **Replay** on a recording opens a deck above the list, and the project follows it live:

- *Timeline.* The recording drawn as a plot of one variable (it picks the first one that actually changes; the dropdown switches), a shaded played region and a playhead. Press anywhere on it or drag to scrub: the project jumps to that moment immediately, even while the project is paused, and a replay that was playing pauses while you hold the timeline and resumes when you let go.
- *Transport.* Play and pause, previous and next frame (Shift jumps ten), speed from 0.25× to 4×, and **Loop**. Play at the end starts over. The replay parks on its last frame when it ends, so you can scrub back instead of losing it; **Close** (or **Stop** on the recording) ends it.
- *Readouts.* `0:01.70 of 0:02.39`, `frame 53 of 74`, and the plotted variable's value at the playhead.
- *Keyboard.* With the timeline focused: arrows step a frame (Shift: ten), Home and End jump to the ends, Space plays and pauses. The timeline is a real range input with an `aria-valuetext` that reads the time and frame.
- A replay started from the console with `rebugger.playrec(...)` shows up in the deck as well, and the deck's changes show up on its handle. Long recordings are thinned to about 240 plot points, keeping each stretch's highest and lowest value so spikes survive. The playhead follows `requestAnimationFrame` only while a replay is playing and the Record tab is showing.

Things worth knowing:

- **Look.** Built like a small piece of hardware: an outer shell holds an inner core with concentric corners and a lit top edge, the tabs are a segmented track with a raised thumb that slides to the active tab, and the speed controls sit in a floating dock. Surfaces are neutral white and grey (charcoal in dark mode, following the system setting), separated by translucent hairlines and inset row dividers instead of grey borders, with cool-tinted soft shadows. The sky blue appears only where it means something: the value pills, primary buttons, the focus ring and the active tab. Each value is a pill coloured by state: sky for a variable, aqua for a list, deep blue while frozen, grey while blanked, coral while shitposting, so what is held stands out in a long list. An expanded row gets a coloured edge in its pill's colour. Icons are thin 1.5px line SVGs (`icons.js`). Pill text is dark navy on the light fills and white on the deep blue to keep contrast readable. The font is a rounded system stack (`ui-rounded`, Arial Rounded, Nunito, Trebuchet MS, then the system font) because a userscript can't count on loading web fonts past the page's CSP. There is deliberately no backdrop blur: the panel floats over the live stage, and blurring a canvas that redraws 30 times a second would cost real frames.
- **Motion.** Kept deliberately small, and every animation answers something you did: the panel pops in when opened; a highlight slides under the active tab; the pill pops once when its state changes (held, blanked, released); pages and drawers rise in; status messages fade in and errors give one small shake; buttons dip when pressed. Nothing pulses: a changing value just updates in place, and the recording indicator is a steady dot. Only `opacity` and `transform` are animated, through the Web Animations API (`animate.js`), so there is no class toggling or forced reflow. Rows use CSS `contain`, and a refresh skips any DOM write whose value hasn't changed. The shared curve is a spring, `cubic-bezier(.32, .72, 0, 1)`. Everything is skipped when the system asks for reduced motion.
- **The panel drives the same commands as the console** (`set`, `freeze`, `scan`, `load`, `startrec`, ...), so a freeze made in either place shows up in the other and in `rebugger.frozen()`. It calls them without the console confirmations; results and errors go to its own status line, which says what happened and never throws.
- **Typed values.** Text that reads as a number and round-trips (`42`, `-3.5`) is stored as a number, anything else as text, matching how Scratch compares them. `007` and `1e3` stay text. Cells show floats to 10 significant digits (`98.5`, not `98.50000000000009`); the tooltip and the editor show the stored value.
- **Live values and cost.** The visible tab refreshes four times a second while the project runs, once a second while it is paused (nothing can change by itself then, and your own edits refresh immediately), and not at all while the panel is closed, collapsed to its header, or the tab is hidden. A refresh that takes long pushes the next one out so the panel stays under about a tenth of the main thread. The variable list reads lists by reference instead of copying them (`find(query, { live: true })`, read-only), builds a row for only the 200 shown, and sorts with a pre-built collator. On a stress project (12 sprites, 4,800 variables, three 100k-item lists) one refresh went from 36 ms to under 6 ms. A value that changes simply updates in place; a value being edited is never overwritten.
- **Limits.** 200 rows are drawn (a line says how many matched when there are more), and a list drawer shows the first 100 items. Narrow the filter for the rest.
- **Keyboard.** The panel stops `keydown`, `keyup` and `keypress` at its edge, so typing into it never triggers the project's key blocks. Tabs are a real tablist (arrow keys move between them), controls are buttons with labels and `aria-pressed`, there is a visible focus ring, motion respects `prefers-reduced-motion`, and the colours hold up in forced-colours mode.
- **Style isolation.** It lives in a shadow root, so the page's CSS can't restyle it and its CSS can't leak out.

## Commands

| Command | Does |
|---|---|
| `rebugger.vars([scope])` | rows of `{ sprite, name, kind, cloud, value }`; try `console.table(rebugger.vars())` |
| `rebugger.find(text)` / `rebugger.find(/regex/)` | find variables and lists by name: a string is a case-insensitive substring, a regex is tested as written. Rows are `{ sprite, clone, name, cloud, value, kind }`; `{ kind, sprite, clones }` narrows it. List values are copies; `{ live: true }` returns the lists themselves (read-only, no copying, for tools that poll) |
| `rebugger.sprites()` | names of the stage and every original sprite |
| `rebugger.get(name)` / `rebugger.set(name, value)` | read / write a variable |
| `rebugger.list(name)` | copy of a list |
| `rebugger.push(name, item)` | append; returns the new length |
| `rebugger.insert(name, index, item)` | insert at a 1-based index (`length + 1` appends) |
| `rebugger.setAt(name, index, item)` / `rebugger.removeAt(name, index)` | replace / delete at a 1-based index |
| `rebugger.clear(name)` | empty a list (removes every row) |
| `rebugger.wipe(name)` | set every row of a list to `""` and keep the rows; returns how many rows there are. Held items (`freezeAt`) are put back on the next frame |
| `rebugger.watch(name, fn, { kind })` | call `fn(new, old, name)` when the value changes; `kind: 'list'` for lists; returns a stop function |
| `rebugger.freeze(name[, value])` | hold a value every frame; returns an unfreeze function |
| `rebugger.freezeAll([{ except, sprite, clones }])` | freeze every variable at its current value; returns a release function with a `count` property. `except` is a list of names, `sprite` limits it to one sprite (`Stage` for globals), `clones: true` includes clones |
| `rebugger.freezeAt(name, index[, value][, scope])` | hold one item of a list (1-based) at its current value, or at `value`, before and after every step, while the rest of the list stays free; returns a release function. `index` must be an existing item |
| `rebugger.unfreezeAt(name, index[, scope])` | release one held item |
| `rebugger.shitpost(name, low, high[, scope])` | set a variable to a random number from `low` to `high` before and after every step; returns a stop function. Whole-number bounds give whole numbers, anything else gives fractions, and the bounds can be in either order |
| `rebugger.speed([n])` | run the project at `n` times speed: `0.1` is slow motion, `5` is fast forward, `Infinity` runs as many frames as fit in half a frame. No argument reads the current speed; `speed(1)` goes back to normal |
| `rebugger.pause()` / `rebugger.resume()` | stop the project's frames, and carry on |
| `rebugger.step([n])` | while paused, run `n` frames (default 1) and return `n` |
| `rebugger.blank(name[, { sprite, kind }])` | hold exactly one variable at `""`, or one list empty, every frame. A name that exists on several sprites throws and asks for `{ sprite }`; `kind: 'var'` or `'list'` picks one when a sprite has both under a name. Returns a release function (`count` is 1) |
| `rebugger.blankAll([{ kind, except, sprite, clones }])` | `blank` for everything; `kind` is `'var'`, `'list'` or `'any'` (default) |
| `rebugger.unfreeze([name])` | release one freeze, or all of them, including those from `freezeAll`, `blank`, `blankAll`, `shitpost` and `freezeAt`. A name releases blanked lists and every held item of that list too |
| `rebugger.scan(value)` (alias `rebugger.grep`) | find variables holding a value; call again to narrow the previous hits. Returns rows of `{ sprite, clone, name, cloud, value }` |
| `rebugger.scan(fn)` | same, with a predicate `fn(current, previous)` |
| `rebugger.scan.snapshot()` | start a scan from every variable with no value, for when you can't read the number off the screen; returns the count |
| `rebugger.scan.changed()` / `unchanged()` / `increased()` / `decreased()` | narrow by what happened since the last scan; needs a scan in progress |
| `rebugger.scan.results()` / `rebugger.scan.reset()` | the current hits without narrowing / start over |
| `rebugger.save([name])` | snapshot every variable and list, plus each sprite's position, direction, size, visibility, draggable, rotation style and costume. Without a name it numbers them `state-1`, `state-2`. `{ clones: true }` also records the clones that exist right now |
| `rebugger.load([name])` | restore a savestate; with no name, the latest. Returns a report. `{ motion: false }` restores memory only, `{ recreate: true }` recreates variables and lists that were deleted since |
| `rebugger.states()` / `rebugger.drop([name])` | list savestates / delete one (the latest if no name) |
| `rebugger.export(name)` / `rebugger.import(data[, name])` | a savestate as plain data, and back; `import` also takes the JSON string, so a state can outlive a reload |
| `rebugger.startrec([name][, options])` | start recording every frame: all non-cloud variables and each sprite's position, direction, size, visibility and costume. Without a name it numbers them `rec-1`, `rec-2`. Options below |
| `rebugger.stoprec()` | stop recording; returns `{ name, frames, seconds, variables, sprites, dropped, stoppedBy }` |
| `rebugger.playrec(name, speed[, { restore, park, loop }])` | replay a recording into the project. `speed` is 0 or more: `0` holds the first frame, `1` is real time, `2` is double speed, `Infinity` jumps to the last frame. Returns a handle. With no name it plays the latest |
| `rebugger.stopplay()` / `rebugger.recs()` / `rebugger.droprec([name])` | stop playback / list recordings / delete one |
| `rebugger.replay()` / `rebugger.recvars(name)` / `rebugger.recseries(name, variable)` | the replay in progress (or `null`) / the variables a recording holds / one variable over time |
| `rebugger.frozen()` | what is held right now: rows of `{ sprite, clone, name, kind, mode }` where `mode` is `freeze`, `blank` or `shitpost`; a held list item is a row with an extra `index` |
| `rebugger.ui([open])` | show, hide or toggle the on-page panel; returns whether it is open |
| `rebugger.quiet([on])` / `rebugger.status()` / `rebugger.table(rows)` | silence or restore the confirmations / print what is running / print rows as a table |
| `rebugger.info()` / `rebugger.dispose()` / `rebugger.help([topic])` | status as data, release every hook and close the panel, command summary (or one topic) |
| `rebugger.vm` | the raw Scratch VM |

`scope` is `{ sprite, clone }`. With no scope a name is looked up on the stage and on every original sprite, and an ambiguous name throws with the candidates. With `{ sprite: 'Cat' }` the sprite's own variables win and the stage is the fallback. `clone: n` picks the nth clone (1-based) instead of the original. The stage's sprite name is `Stage`.

## Finding a variable

By name, `rebugger.find("alt")` lists every variable and list whose name contains "alt", and `rebugger.find(/^alt$/)` matches exactly. By value, use a scan:

```js
rebugger.grep(5000)                       // altitude on the HUD says 5000: a few hits
// climb, then read the HUD again
rebugger.grep(5200)                       // usually down to one hit
rebugger.freeze("alt", 9000, { sprite: "Plane" })
```

When you can't read the value, snapshot instead: `rebugger.scan.snapshot()`, change what you're looking for in the game, then `rebugger.scan.changed()`, and repeat with `increased()` or `decreased()` until one variable is left.

A scan that finds nothing leaves an empty session, and later scans stay empty until `rebugger.scan.reset()`. A hit's `sprite` and `clone` can be passed straight back as the scope: `rebugger.set(hit.name, v, { sprite: hit.sprite, clone: hit.clone })`.

## Savestates

```js
rebugger.save("takeoff")                  // before something silly
// crash the plane
rebugger.load("takeoff")                  // memory and sprite positions come back
copy(JSON.stringify(rebugger.export("takeoff")))   // keep it across a reload, then rebugger.import(text)
```

A savestate is a snapshot of memory, not of the whole machine. What it does not capture:

- **Running scripts.** Threads keep going from wherever they are. A script that holds state in a loop counter, a procedure argument, a `wait` or a glide in progress isn't rewound, so loading in the middle of one can leave it inconsistent with the restored variables. Loading while the project is idle, or stopped at a clean point, is the safest.
- **Clones as a whole.** Clones are recorded only with `{ clones: true }`, matched by their runtime id, and only restored while they're still alive. Clones that are gone come back as `missingTargets` in the report and are not recreated, and clones created since are left alone.
- **Everything else on the stage.** Graphic effects, sounds, the timer, the pen layer, and the extension state aren't saved.
- **Cloud variables.** They are never saved or loaded, same as `blankAll`.
- **Sprite size.** It's restored through `setSize`, which scratch-vm only applies when there's a renderer, so it's untested headlessly.

Things to know when loading:

- **Frozen variables still win.** A variable that's frozen or blanked is restored, then overwritten again by the freeze on the next step. The report's `frozen` lists them, and `unfreeze()` first if you want the loaded values to stick.
- **Pen.** Moving a sprite with its pen down draws a line, because the restore goes through `setXY`.
- **A fresh snapshot copies lists in full**, so saving a project with huge lists costs memory.
- **Persistence.** States live in memory and disappear on reload. Variable ids and sprite names are stable across reloads of the same project, so an exported state loads back in, but a state from a different project won't line up.
- **`dispose()` keeps savestates.** It only releases hooks.

## Recording and replay

```js
rebugger.startrec("flight", { only: /alt|speed|pitch|thrust/, until: () => rebugger.get("alt") < 5, tail: 30 })
// fly; it stops itself 30 frames after the altitude drops under 5
rebugger.save("now")                         // optional: so you can come back
rebugger.playrec("flight", 0.25)             // quarter-speed replay of the crash
```

`startrec` options:

| Option | Does |
|---|---|
| `only` | an array of exact names, or a string or regex matched like `find`; default is every variable |
| `except`, `sprite`, `clones` | same meaning as for `freezeAll`; `clones: true` records the clones that exist at the start |
| `lists` | also record lists. Lists that didn't change between frames are shared, not copied again |
| `motion` | `false` skips sprite position and costume |
| `maxFrames` | a ring buffer: only the latest frames are kept (default 3600, about two minutes at 30 FPS; `Infinity` for no limit). `dropped` counts what fell off the front |
| `maxSeconds` | the same ring buffer measured in project time instead of frames: only the latest this-many seconds are kept (default `Infinity`), so "the last 30 seconds" holds at any frame rate. It combines with `maxFrames`, whichever is tighter wins, and the newest frame is always kept |
| `until`, `tail` | stop on the first frame where `until()` returns true, after recording `tail` more frames. `stoppedBy` becomes `'until'`. An `until` that throws also stops the recording |

`playrec(name, speed, options)` takes `{ restore, park, loop }`. `park: true` keeps the replay open, paused on its last frame, when it reaches the end instead of finishing (so you can scrub back); `loop: true` wraps from the end to the start and keeps playing (ignored at `Infinity`).

The handle that `playrec` returns:

| Handle | Does |
|---|---|
| `handle.done` | a promise that resolves to `{ completed }`: `true` when playback reached the end, `false` when it was stopped |
| `handle.speed([n])` | read or change the speed; `0` pauses, and `handle.speed(1)` resumes |
| `handle.seek(fraction)` | jump to 0..1 of the recording (the project is updated at once, even while paused) |
| `handle.seekFrame(index)` | jump to an exact recorded frame (0-based, clamped) |
| `handle.position()` / `handle.time()` | where playback is, from 0 to 1 / in milliseconds from the start |
| `handle.frame()` | the index of the current frame; `handle.frames` is how many there are and `handle.duration` is the length in milliseconds |
| `handle.loop([on])` | read or change looping |
| `handle.stop()` | stop and leave the current frame in place |

`rebugger.replay()` returns the handle of the replay in progress, or `null`, so a replay started from the console or the panel can be picked up by either. `rebugger.recvars(name)` lists the variables a recording holds (`{ sprite, clone, name, kind }`) and `rebugger.recseries(name, variable[, { sprite }])` returns one variable over time as `[{ t, value }]`, with `t` in milliseconds from the first frame, e.g. to plot it.

What replay does and doesn't do:

- **It's a state replay, not a rewind.** Each frame, the recorded values are written back into the variables, lists and sprites, before and after the step, so scripts see them and monitors show them. The project's scripts keep running and still write their own values, which get overwritten the next frame. Variables that weren't recorded are left alone. It doesn't recreate script state, clones, sounds or anything else on the stage.
- **It stays where it ends.** Without `{ restore: true }` the project is left on the last frame (or wherever you stopped). `restore: true` snapshots the project first and puts it back when playback ends. `Infinity` with `restore` is a no-op.
- **Playback speed follows the clock.** Time advances by the real time between steps, so a slow frame rate makes playback skip frames rather than slow down. Frames are looked up by time, not by count.
- **Frozen variables win.** A freeze or blank is applied after the replay, so frozen variables keep their pinned value.
- **Pen.** Replaying sprite positions draws pen lines if the pen is down, like loading a savestate.
- **One recording and one playback at a time.** Starting a playback stops the previous one. A recording in progress can't be played until `stoprec()`.
- **Recordings live in memory.** They are lost on reload and aren't exported. `dispose()` ends any recording or playback in progress and keeps the finished recordings.
- **Memory use is roughly variables × frames.** A list that changes every frame is copied every frame, so `lists: true` on a big heap-style list gets expensive quickly; use `only` and `maxFrames`.

## Speed, pause and step

```js
rebugger.speed(4)                           // fast forward
rebugger.speed(0.1)                         // slow motion
rebugger.pause()                            // hold the project
rebugger.step(); rebugger.step(10)             // advance one frame, then ten
rebugger.watch("hp", (now, was) => console.log(was, "->", now))   // fires on the frame that changed it
rebugger.resume(); rebugger.speed(1)
```

- **It works by skipping or repeating the project's own steps.** The page's timer keeps ticking at its normal rate and rebugger decides how many project frames each tick gets: `speed(3)` runs three, `speed(0.25)` runs one every fourth tick, `pause()` runs none. One tick runs at most 1000 frames. `Infinity` runs frames until half a tick's worth of real time is spent, and at least one.
- **Project time follows the frames, not the wall clock.** While the speed isn't 1, or the project is paused, `wait`, the `timer` block and anything else that reads `runtime.currentMSecs` advances by exactly one frame's worth per frame. So `wait 1 seconds` takes one real second at 1x, half a second at 2x, and never finishes while paused. Going back to speed 1 carries on from where the project clock was, without a jump. This replaces `runtime.updateCurrentMSecs` with an own property while it's needed; `dispose()` puts it back, and any `wait` in progress then sees the clock jump to the real time.
- **Things that keep real time.** Glides (`glide to`) use their own timer and so run at normal speed, and sounds play at their normal rate. Extensions that read the real clock aren't affected either.
- **Each extra frame is a full frame.** Freezes, shitposts, watches, recordings and playback all run on every frame, so a recording at `speed(2)` gets two samples per tick. They are stamped with the real time of the tick, so playing it back skips frames that shared a tick.
- **Pause freezes recording and playback time.** The time a recording or a playback measures stops while paused, and `step()` moves it on by one frame, so a recording doesn't contain the pause and a paused playback doesn't jump when you resume.
- **A paused project can still be edited.** `set`, `load` and the rest work while paused; `watch` only fires, and freezes only reapply, when a frame runs (`step()`).
- **`step()` needs `pause()` first** and throws otherwise.

## Shitposting

```js
rebugger.shitpost("score", 1, 100)          // a new whole number from 1 to 100, every frame
rebugger.shitpost("x", -1, 1)               // whole numbers: -1, 0 or 1
rebugger.shitpost("x", -1.0001, 1)          // anything fractional gives fractions
const stop = rebugger.shitpost("hp", 0, 5, { sprite: "Cat" })
stop()                                   // or rebugger.unfreeze("hp")
```

It is a freeze that rolls a new value each time, so it follows the same rules: it's applied before and after every step (a script sees one random value and the monitor shows another), it replaces any freeze already on that variable, it's released by `unfreeze()`, and `freezeAll` skips it. Cloud variables change locally only, with the usual warning. `info().frozen` lists shitposted variables with the frozen ones.

## Behaviour worth knowing

- **Holding list items is positional.** `freezeAt('inv', 2)` holds whatever sits at position 2: it is written back before and after every step, but the hold is on the position, not on the item. Removing or inserting items above it shifts what the position holds, so the panel disables the remove button on a held item (release first). A held item never grows its list: while the list is shorter than the position the hold waits, and it applies again once the list is long enough. Editing a held item in the panel changes the value being held (an edit that isn't a hold would be undone on the next frame). `Hold all` pins every current item and is offered only for lists the drawer can show in full (100 items). Savestate loads warn about held items like any other freeze, and a blanked list can't be given item holds because it has no items.
- **`freezeAll` is a snapshot of the variables that exist right now.** It skips cloud variables and anything already frozen individually, and it does not cover variables or clones created afterwards. The release function it returns drops only the freezes it made. Freezing a project's own counters and state can make its scripts stall or loop without progress, so `except` the ones that drive the thing you want to keep running.
- **`blank` and `unfreeze` take one thing at a time.** Earlier versions of `blank(name)` pinned every variable or list with that name in the whole project, and even `blank(name, { sprite })` took the stage's same-named one along (a sprite scope falls back to the stage), so a common name like `speed` or `temp` could blank far more than the one you meant. `blank` now resolves a single variable or list exactly like `freeze` does: no scope on a name that exists in several places throws `"speed" is ambiguous (Stage, Cat, Dog); pass { sprite }`, and `{ sprite: 'Cat' }` takes Cat's own and nothing else. `unfreeze(name)` follows the same rule (it throws if several sprites hold that name; `{ sprite }` releases that sprite's only). To blank many, call `blank` per sprite or use `blankAll`. The panel always passes the row's own sprite and kind, so a button on a row can only touch that row.
- **Blanking instead of deleting.** Deleting a variable in scratch-vm doesn't make it go away: the next script that touches it recreates an empty local copy on that sprite, so a global splinters into per-sprite locals. Deleting a cloud variable on the stage also sends a delete request to the cloud server. `blank` avoids both by keeping the variable and rewriting its value after every step. Scripts still see their own writes until the step ends, and the original values are lost, since releasing only stops the blanking. `blankAll` skips cloud variables and anything already frozen. In scratch-vm, `""` counts as 0 in arithmetic and a monitor shows it as empty. Lists are emptied in place, so references to the array stay valid.
- **Freezing only some variables can make a sim diverge.** In a flight sim, freezing altitude but not speed most likely let the speed grow without bound (nothing could end the dive), until G-force reached 1.4E+28 and the sim's own glitch check fired. Freeze variables that feed each other together, or freeze the lot with `freezeAll`.
- **Scan matching follows Scratch.** Two values that both read as numbers are compared as numbers (`"100"` matches `100`), anything else as case-insensitive text. `{ within: n }` allows a numeric tolerance for floats that the HUD rounds. Scans cover variables only, not list items, and skip clones unless you pass `{ clones: true }`.
- **Values are stored as given.** `rebugger.set('x', '5')` stores a string, like a project that does the same.
- **Cloud variables change locally only.** Writes assign `variable.value` directly and never go through the cloud I/O device, so nothing is sent to the server, and the first write prints a warning. A project script that later runs `set` or `change` on that variable will send whatever value it computes.
- **List monitors.** List edits mark the monitor stale (`_monitorUpToDate = false`), the same as the list blocks do, so the on-stage monitor redraws.
- **`watch`, `freeze`, `speed` and `pause` wrap `runtime._step`.** This scratch-vm has no per-frame event. `freeze` reapplies before and after each step, so scripts see the frozen value and monitors show it. `watch` compares after each step. The wrapper is removed once nothing is watched, frozen, recorded or played back and the project is at speed 1 and not paused, unless another script wrapped `_step` after ours, in which case it stays as a passthrough.
- **Confirmed on the live site.** The user ran it on a scratch.mit.edu project page and reported that it works. The tests cover the VM lookup with fake fiber trees and everything else against a real headless scratch-vm. Firefox is still untested.

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
