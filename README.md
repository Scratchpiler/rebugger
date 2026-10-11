# rebugger

A debugger for the Scratch player. Open a project, press `Alt+Shift+D`, and you can read and write every variable and list, hold them in place, find the one that holds your score, save the state of the world before doing something regrettable, record the regret, and play it back at quarter speed.

Scratch ships with a green flag and a stop sign. This adds the rest of the dashboard.

It used to be called `vmprobe`. It is a userscript, it runs on `scratch.mit.edu/projects/*` (player and editor), and it shares no code with Scratchpiler, which is how it likes it. Everything is also available from the console as `window.rebugger`, or `rb` if you value your wrists.

## Install

```sh
node build.js        # writes rebugger.user.js
node build.js --watch
```

Add `rebugger.user.js` to Tampermonkey or Violentmonkey. The build borrows `esbuild` from `../scratchpiler`, so run `npm install` there first. Chrome-based browsers work. Firefox is untested and will have opinions.

## What you can do to a project

**Edit anything.** Every variable and list on the stage and every sprite, with a filter box that takes plain text or `/regex/`. Click a value, type a new one, press Enter. Lists get per-item editing, add, remove and clear. From the console, `set` stores whatever you hand it, as given, so you can expose a variable from a children's programming language to the full range of JavaScript: strings where numbers were promised, `NaN`, `undefined`, an object, whatever you're holding. Scratch's block semantics were designed around a few types and a lot of optimism, and the undefined behavior that follows is yours to enjoy. Cloud variables can be edited too, locally only: nothing is sent to the server, and you get a warning the first time so you can't claim you weren't told.

**Freeze it.** A frozen variable gets its value put back before and after every frame, so scripts and monitors both see it. Freeze everything at once with `freezeAll` and watch the project discover what a world without change feels like. You can also freeze a single *list item* while the rest of the list carries on without it.

**Blank it.** Deleting a variable in Scratch doesn't work, since the next script that touches it grows a fresh empty copy on whichever sprite got there first. Blanking keeps the variable and quietly sets it to nothing every frame instead. Lists get emptied. `wipe` empties every row but keeps the rows, for when the length matters and the contents don't.

**Shitpost it.** A freeze that rolls a new random number every frame. `rebugger.shitpost("score", 1, 100)`. It is as useful as it sounds, and sometimes more.

**Find it.** You don't know which of the 400 variables is the health. Look at the HUD, scan for the number, take a hit, scan for the new number. Down to one, usually in two rounds. Can't read the number off the screen? Snapshot, do the thing, ask for what *changed*, *increased* or *decreased*, repeat. It is the Cheat Engine loop, for a cat.

**Control time.** `speed(0.1)` is slow motion, `speed(8)` is fast forward, `speed(Infinity)` runs as many frames as fit in half a frame. `pause()`, then `step()` to advance one frame, or `step(10)` for ten. `wait` blocks and the timer follow the project's frames, not the wall clock, so slow motion doesn't confuse the project about how much time has passed. It confuses it in other ways.

**Save and load.** Snapshot every variable, list, and each sprite's position, direction, size, visibility and costume. Load it later. Export it as JSON to survive a reload. This is a snapshot of *memory*, not of the machine: scripts mid-loop keep going from where they are, which is occasionally the most entertaining outcome.

**Record and replay.** Record every frame of chosen variables and sprite motion, with a ring buffer so it doesn't eat your RAM (last N frames or last N seconds), and an `until` condition that stops it a few frames after the thing you wanted happened. Replay it at any speed, scrub it, loop it, plot any recorded variable over time. Bug reports with evidence.

**Watch it.** `rebugger.watch("hp", (now, was) => console.log(was, "->", now))`, called on the frame the value changed.

## The panel

`Alt+Shift+D`, or `rebugger.ui()`. A small draggable, resizable window with tabs. It remembers where you left it, and it doesn't touch the page until you first open it. The shortcut is `Alt+Shift+D` because `Ctrl+Shift+D` bookmarks every tab in Chrome and Firefox. The key is matched by position, so it works on any layout.

| Tab | For |
|---|---|
| Variables | every variable and list. Click to edit, **Freeze** to hold, chevron for the drawer: hold at a value, shitpost between two numbers, blank, and for lists a lock on each item, **Hold all**, **Wipe rows**, **Clear**. Values are coloured by state, so a held thing stands out in a long list |
| Scan | the find-it loop above, with a tolerance for HUDs that round |
| Savestates | save, load, drop, export to a file, import from a file. Checkboxes for restoring sprite positions and recreating deleted variables |
| Record | record with a name filter and a limit in frames or seconds; replay or drop what you have |

The bar at the bottom is always there: pause, step, step ten, and speed buttons from .25 to ∞.

**The replay deck.** Hit Replay on a recording and a deck opens with the recording plotted as a timeline of one variable (the first one that moves, with a dropdown for the rest). Drag the timeline and the project jumps to that moment, even while paused. Play, pause, frame step (Shift for ten), 0.25× to 4×, loop. The replay parks on its last frame instead of vanishing, so you can scrub back. With the timeline focused, arrows step frames, Home and End jump, Space plays.

Things the panel gets right on purpose:

- Typing in it never reaches the project. Your `w` is not a keypress to the platformer underneath.
- It does exactly what the console does, so a freeze set in one shows up in the other.
- It lives in a shadow root, so the page can't restyle it and it can't restyle the page.
- It stays out of the way: refreshes are cheap, skipped when it's closed, collapsed or hidden, and proportional to the rows shown, not the size of the project. A four-thousand-variable stress test is not a problem. Values you are editing are never overwritten under your cursor.
- Dark mode, reduced motion and forced colours are respected. There are no pulsing animations anywhere, and there never will be.

Details on how it's built are in [docs/internals.md](docs/internals.md).

## The console

Everything the panel does, `rebugger` does, with confirmations: `froze "score" at 500`, `saved "state-1": 12 variables, 2 lists`. `rebugger.quiet()` mutes them. Typos get helpful: `no variable named "scor" (did you mean "score"?)`. `rebugger.status()` says what is currently running, frozen, recording or playing. `rebugger.help("freeze")` shows only the relevant bit. `rebugger.table(rows)` prints any result set as a table. Return values stay plain data.

```js
rebugger.grep(5000)                              // altitude on the HUD says 5000: a few hits
rebugger.grep(5200)                              // climb, scan again: usually one
rebugger.freeze("alt", 9000, { sprite: "Plane" })

rebugger.save("takeoff")                         // before something silly
rebugger.load("takeoff")                         // after it

rebugger.startrec("flight", { only: /alt|speed|pitch/, until: () => rebugger.get("alt") < 5, tail: 30 })
rebugger.playrec("flight", 0.25)                 // the crash, in quarter speed
```

### Commands

`scope` is `{ sprite, clone }`. With no scope, a name is looked up on the stage and every sprite, and an ambiguous name throws with the candidates. `{ sprite: "Cat" }` prefers the cat's own and falls back to the stage. `clone: n` picks the nth clone. The stage is called `Stage`.

| Command | Does |
|---|---|
| `vars([scope])`, `find(text or /regex/)`, `sprites()` | what exists. `find` takes `{ kind, sprite, clones }` |
| `get(name)`, `set(name, value)` | read, write |
| `list(name)`, `push`, `insert`, `setAt`, `removeAt`, `clear`, `wipe` | list edits, 1-based |
| `watch(name, fn, { kind })` | call `fn(new, old, name)` on change; returns a stop function |
| `freeze(name[, value])`, `freezeAll({ except, sprite, clones })` | hold values; both return a release function |
| `freezeAt(name, index[, value])`, `unfreezeAt(name, index)` | hold one list item |
| `blank(name)`, `blankAll({ kind, except, sprite, clones })` | hold at empty |
| `shitpost(name, low, high)` | random value every frame. Whole-number bounds give whole numbers |
| `unfreeze([name])` | release one, or everything |
| `frozen()` | what is held right now |
| `scan(value or fn)` (alias `grep`) | find variables holding a value; call again to narrow |
| `scan.snapshot()`, `.changed()`, `.unchanged()`, `.increased()`, `.decreased()`, `.results()`, `.reset()` | the blind loop |
| `speed([n])`, `pause()`, `resume()`, `step([n])` | time |
| `save([name])`, `load([name])`, `states()`, `drop([name])`, `export(name)`, `import(data)` | savestates |
| `startrec([name], options)`, `stoprec()`, `recs()`, `droprec([name])` | recording |
| `playrec(name, speed, { restore, park, loop })`, `stopplay()`, `replay()` | playback |
| `recvars(name)`, `recseries(name, variable)` | what a recording holds, and one variable over time as `[{ t, value }]` |
| `ui([open])`, `quiet([on])`, `status()`, `table(rows)`, `info()`, `help([topic])` | the meta ones |
| `dispose()` | release every hook and close the panel. Savestates and recordings are kept |
| `vm` | the raw Scratch VM, for when this wasn't enough |

`startrec` options: `only` (names, string, or regex), `except`, `sprite`, `clones`, `lists`, `motion: false`, `maxFrames` (default 3600), `maxSeconds`, `until` and `tail`.

`playrec` returns a handle: `done` (a promise), `speed(n)`, `seek(0..1)`, `seekFrame(i)`, `position()`, `time()`, `frame()`, `frames`, `duration`, `loop(on)`, `stop()`.

## Sharp edges

- **Freezing half a simulation ends badly.** In a flight sim, freezing altitude but not speed let the speed grow until the G-force reached 1.4E+28 and the game's own glitch check gave up. Freeze things that feed each other together, or use `freezeAll` and `except` the counters that drive what you're watching.
- **`blank` and `unfreeze` take exactly one thing.** An earlier version of `blank("speed")` blanked every variable called `speed` in the project, and a sprite scope dragged the stage's one along too. Now an ambiguous name throws and asks for `{ sprite }`. To blank many, use `blankAll`. The panel always passes the row's own sprite, so a button can only touch its own row.
- **Frozen variables win.** Load a savestate or replay a recording over a freeze and the freeze puts it back on the next frame. `unfreeze()` first if you want the loaded values to stick. Loading warns you.
- **Savestates don't capture running scripts**, clones unless you ask (`{ clones: true }`), graphic effects, sounds, the timer, the pen layer, extension state, or cloud variables. Loading while the project is idle is safest. Loading with the pen down draws a line, because moving a sprite does that.
- **Replay is a state replay, not a rewind.** Recorded values are written back every frame, scripts keep running and keep writing their own values, and those get overwritten next frame. Variables you didn't record are left alone.
- **Recordings and savestates live in memory.** A reload ends them. Export a savestate if you want to keep one; recordings aren't exportable yet. Memory use is roughly variables × frames, so `lists: true` on a heap-sized list gets expensive: use `only` and `maxFrames`.
- **Held list items are positional.** `freezeAt("inv", 2)` holds whatever is at position 2, not the item. Insert above it and the hold doesn't follow. The panel disables remove on held items for this reason. A hold never grows a list.
- **Glides and sounds keep real time.** `speed(0.1)` slows everything except those. This is a limitation of the Scratch VM and not an opinion.
- **`step()` needs `pause()` first.** A paused project can still be edited, but `watch` and freezes only act on frames that run.
- **Values are stored as given.** The panel stores text that looks like a number (`42`, `-3.5`) as a number and leaves `007` and `1e3` as text, like Scratch would compare them. From the console, `set("x", "5")` stores a string.
- **Scans cover variables, not list items,** and skip clones unless you pass `{ clones: true }`. Numbers compare as numbers, everything else as case-insensitive text. `{ within: n }` forgives HUDs that round.
- **The panel draws 200 rows and shows the first 100 items of a list.** Narrow the filter for the rest.

## Status

The panel, the console and everything under them are tested against a real headless scratch-vm, with the panel in jsdom, plus the built userscript installing itself into a page. `npm test`. It has been run on a live scratch.mit.edu project and works. Firefox is untested.
