# Doraemon Coding Companion

**A real desktop pet. Inside your IDE. In one install.**

Doraemon walks across your desktop, climbs your windows, naps when you go quiet,
and tells you when Kiro needs you. Transparent. Always on top. Draggable.
Throwable.

Install the extension. That's the whole setup.

---

## 792 kilobytes

Every desktop pet you have ever installed shipped a browser to draw itself.
Electron alone is **274 MB**.

Ours is **792 KB**. Under one megabyte, for the same transparent always-on-top
window, the same 247 sprites, the same physics engine.

| | Size |
|---|---|
| Electron runtime | 274 MB |
| **Doraemon companion** | **792 KB** |

Not a trick, and not a compromise. The companion is 288 lines of Rust wrapping
the webview your operating system already has. macOS has WebKit. Windows has
WebView2. Linux has WebKitGTK. Nobody needs a second copy of Chromium to animate
a cartoon cat.

The whole extension is **4.5 MB to download**, and 92% of that is the artwork.

---

## Install

```bash
cd kiro-extension
npm install
npm run package
```

```bash
/Applications/Kiro.app/Contents/Resources/app/bin/code \
  --install-extension doraemon-coding-companion-0.1.0.vsix
```

Reload the window. Doraemon appears on your desktop.

No desktop app. No API key. No account. No network call, ever.

---

## Three places he can live

**Desktop.** The real thing: transparent, borderless, always on top, roaming your
whole screen. Runs as a bundled companion process, because an extension cannot
create an OS window itself. Appears when you open the IDE, leaves when you close
it. This is the default whenever the bundled binary exists for your platform.

**Window.** A separate OS window outside the IDE frame, using the editor's
auxiliary-window support. Park it on a second monitor. It is a real window, so it
has chrome and a background: not transparent, not always on top. Always-on-top
inside the editor is still an
[open feature request](https://github.com/microsoft/vscode/issues/318237), not
something an extension can opt into.

**Sidebar.** Docked in the panel. Same reactions, same sprites.

Exactly one surface drives him at a time, so you never get two Doraemons
reacting to the same keystroke.

**You never have to pick.** The default `auto` tries the bundled companion first,
and falls back to a detached window if there is no binary for your platform.
Either way Doraemon appears outside the IDE on first install with no settings
touched. Sidebar mode only happens if you ask for it.

---

## He notices 33 things

Not "detects activity". Thirty-three distinct signals, each with its own
reaction, all from first-party editor APIs — no polling, no `ps` scraping, no
guesswork.

**Editing**

| Event | Reaction |
|---|---|
| Typing | focused, coding animation (throttled to once per 20s) |
| Saving a file | satisfied |
| Switching files | a line specific to that language |
| Selecting 12+ lines | thoughtful, reads as reviewing rather than writing |
| File created / deleted / renamed | excited / wistful / curious, names the file |

**Correctness**

| Event | Reaction |
|---|---|
| Errors appear | concerned, frustrated past 5 |
| Errors cleared in the file | proud |
| Whole project goes error-free | satisfied |

**Terminal and tasks**

| Event | Reaction |
|---|---|
| Terminal opened | curious |
| Command run | recognises tests, builds, push/pull, installs, docker, `rm -rf` |
| Command exits non-zero | frustrated |
| Task started / passed / failed | focused / joyful / concerned, names the task |

**Debugging and source control**

| Event | Reaction |
|---|---|
| Debug session starts / stops | determined / thoughtful |
| Breakpoint added | curious |
| Commit | proud |
| Branch switch | time-travel animation, names the branch |
| Merge conflict | protective |

**Presence**

| Event | Reaction |
|---|---|
| Window focused / blurred | greets you / settles down quietly |
| No edits for a while | sleepy, naps |
| Long coding streak | suggests a break |
| Clicking the sprite | playful |

He draws from **2,046 written lines** (`thoughts.json` 1,785 and
`coding-thoughts.json` 261), so he repeats himself slowly. Language lines are
matched to the file's actual language rather than sampled at random — a
TypeScript file never gets told that CSS is nice.

---

## The part that matters when you walk away

Kiro is running. You went to make coffee. It hit a prompt and stopped.

Doraemon holds that message on your desktop for **five minutes**, and clicking
the bubble brings Kiro back to the front.

| Agent state | Reaction |
|---|---|
| Thinking | thoughtful |
| Working | focused |
| **Waiting on your approval** | concerned, holds 5 minutes |
| Finished | proud, click to jump back |
| Failed | frustrated, click to jump back |

An extension cannot un-minimise its own window. The mascot is a separate
process, so it can ask the OS to do it. That is the whole reason this works.

### Wiring it up

The Kiro agent extension exposes no API. Hooks are the sanctioned route: they can
run shell commands, so they write a small file the extension watches at
`.kiro/doraemon/agent-state.json`.

```json
{ "state": "confirm", "message": "Kiro needs your approval." }
```

Valid states: `thinking`, `working`, `confirm`, `done`, `failed`. Unknown states
and malformed JSON are ignored rather than crashing the watcher. Identical
repeated writes are deduplicated.

**The extension installs these for you.** On activation it writes three hooks into
`.kiro/hooks/doraemon-agent-*.kiro.hook`, wired to `userPromptSubmit`,
`preToolUse` and `agentStop`, then offers to reload — Kiro only picks up new hook
files on reload. Existing files are never overwritten, so your edits survive. Set
`doraemon.installAgentHooks` to `false` to opt out.

The commands are generated for your platform: POSIX shell on macOS and Linux,
PowerShell on Windows.

> **The file extension matters.** Kiro loads `hooks/**/*.kiro.hook` only. A hook
> named `.json` is silently ignored, and it also needs `"enabled": true`. Worth
> checking your own hooks folder for this.

**"Waiting on your approval" is inferred, not reported.** Kiro's hook API has no
such trigger. Instead, if the agent goes quiet mid-task for
`doraemon.agentStallSeconds` (25s default) without reporting that it finished,
Doraemon escalates. A genuinely slow tool looks identical from outside, which is
why the bubble says *"Kiro has gone quiet, it may be waiting for you"* rather
than asserting it. Finishing cancels the escalation.

The hook commands are POSIX shell; on Windows use:

```
powershell -NoProfile -Command "New-Item -ItemType Directory -Force .kiro/doraemon | Out-Null; Set-Content .kiro/doraemon/agent-state.json '{\"state\":\"working\"}'"
```

**Approving from the bubble is deliberately not implemented.** A hook would have
to block while polling for your answer, stalling the agent for as long as you are
away and hanging it outright if the mascot died mid-wait. One click through to
the IDE cannot wedge anything. Reliability beat the demo.

---

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `doraemon.target` | `auto` | `auto`, `desktop`, `window` or `sidebar` |
| `doraemon.desktopAppPath` | `""` | Override the companion binary. Empty uses the bundled one |
| `doraemon.showThoughts` | `true` | Show the speech bubble |
| `doraemon.thoughtIntervalSeconds` | `45` | How often he shares an idle thought |
| `doraemon.reactToDiagnostics` | `true` | React to errors appearing and clearing |
| `doraemon.breakReminderMinutes` | `60` | Break reminder threshold, `0` disables |
| `doraemon.agentStallSeconds` | `25` | Quiet period before Doraemon suspects Kiro is waiting on you, `0` disables |
| `doraemon.installAgentHooks` | `true` | Write the agent-state hooks into `.kiro/hooks/` on activation |
| `doraemon.idleMinutes` | `5` | Minutes without edits before he gets sleepy |

## Commands

- `Doraemon: Show Companion`
- `Doraemon: Trigger Emotion`
- `Doraemon: Show Coding Stats`
- `Doraemon: Reset Position`
- `Doraemon: Open in Separate Window`
- `Doraemon: Close Separate Window`
- `Doraemon: Restart Desktop Companion`
- `Doraemon: Stop Desktop Companion`
- `Doraemon: Locate Desktop App...`
- `Doraemon: Diagnose` — prints exactly what the extension resolved and why

---

## How it is built

One brain, three bodies. The animation engine
(`src/renderer/core/engine/shimeji.ts`), sprite definitions
(`src/renderer/core/constants/sprites.ts`) and thought pools are **imported** from
the desktop app in the parent directory, not copied. Sidebar, window and desktop
mode all run the same engine.

The companion is a small window that Rust **repositions** as Doraemon walks,
rather than a fullscreen click-through overlay. That one decision removes the
need for mouse-event forwarding entirely — which is why he stays draggable on
Linux, where Electron's `forward` option does not exist.

The webview computes motion and posts `{type:'move',x,y}`; Rust moves the window.
Sprites are served over a custom `dora://` protocol from the extension's own
`media/` directory. Reactions arrive as JSON on a file channel. Lifetime is tied
to the IDE's process ID, so a hard kill never leaves an orphaned cat on screen.

**Size breakdown**

| | |
|---|---|
| Installed total | 9.7 MB |
| 247 sprite PNGs | 8.7 MB |
| Companion binary | 792 KB |
| Extension JS | 112 KB |
| VSIX download | 4.5 MB |

---

## Platform support

| | macOS arm64 | macOS x64 | Windows | Linux |
|---|---|---|---|---|
| Sidebar mode | verified | yes | yes | yes |
| Window mode | verified | yes | yes | yes |
| All 33 signals | verified | yes | yes | yes |
| Desktop mode | **verified** | not built | not built | not built |

Sidebar and window mode are pure editor APIs and behave identically everywhere.
Activity detection too.

Desktop mode needs the companion compiled for each platform. Only
`darwin-arm64` has been built and verified end to end. The resolver looks for
`bin/<platform>-<arch>/`, so adding a platform is a build step, not a code
change — but until that build exists, those users silently fall back to window or
sidebar mode.

Linux additionally needs a compositing window manager for transparency, and
WebKitGTK at runtime.

---

## Known limits

Read this part before shipping it to anyone.

**macOS Gatekeeper will block a downloaded build.** The companion is ad-hoc
signed, not notarized. Measured, same binary, same command:

| | Output | Started |
|---|---|---|
| Local build | `mascot window ready` | yes |
| With `com.apple.quarantine` | *nothing* | **no** |

A VSIX from a marketplace carries that quarantine flag. It works locally only
because a locally compiled binary has no flag. Fixing this needs an Apple
Developer ID with notarization, or stripping the attribute on first run — which
is deliberately defeating a security control and should be your call.

**Only one platform is built.** See the table above.

**Approve-in-bubble is not implemented.** By choice, explained above.

**Linux desktop mode has never been compiled or run.** The reasoning is sound
and the crates support it; that is not the same as working.

---

## Development

```bash
npm run watch            # rebuild JS on change
npm run typecheck        # tsc --noEmit
npm run build-companion  # cargo release build, stages into bin/
npm test                 # typecheck + build + 29 host checks
npm run release          # platform-specific VSIX into release/
```

The test suite stubs the editor API and drives activation, every command, every
reaction and the negatives — a removed breakpoint stays quiet, a zero exit code
is not a failure, a repeated window-state event does not re-fire.

`verify-sprites` resolves the real animation table and asserts all
**595 frame references across 107 animations** exist on disk, because a missing
PNG only shows up as an invisible mascot.

## Publishing

Kiro installs from Open VSX. One-time: sign in at
[open-vsx.org](https://open-vsx.org), accept the Publisher Agreement, create a
namespace matching the `publisher` field, then set `OVSX_PAT`.

```bash
npm run release:publish
```

The companion is a native binary, so each platform must be packaged **on** that
platform and published under its own `--target`. The release script refuses to
package if the binary for the current platform is missing, rather than shipping a
build with desktop mode silently absent.

## Privacy

No telemetry. No network requests. Nothing leaves your machine. Language IDs,
file paths and diagnostic counts are read only to pick a reaction, and held in
memory for the session.
