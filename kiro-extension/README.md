# Doraemon Coding Companion: Kiro Desktop Pet

<p align="center">
  <a href="https://open-vsx.org/extension/AlleyBo55/doraemon-coding-companion"><img src="https://img.shields.io/open-vsx/v/AlleyBo55/doraemon-coding-companion?label=Open%20VSX&color=1677ff" alt="Open VSX version"></a>
  <a href="https://open-vsx.org/extension/AlleyBo55/doraemon-coding-companion"><img src="https://img.shields.io/open-vsx/dt/AlleyBo55/doraemon-coding-companion?label=downloads&color=1f9d55" alt="Open VSX downloads"></a>
  <a href="#platform-support"><img src="https://img.shields.io/badge/macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-supported-20232a" alt="macOS, Windows and Linux"></a>
  <a href="#privacy"><img src="https://img.shields.io/badge/privacy-fully%20offline-f2b84b" alt="Fully offline"></a>
</p>

## Your AI agent got smarter. Its status indicator didn't.

A spinner tells you to wait. Doraemon tells you what is happening.

**Doraemon Coding Companion is a Shimeji-style Kiro desktop pet, AI coding
companion and floating desktop mascot for macOS, Windows and Linux.** He walks
across your screen and reacts to code, saves, tests, errors, Git, terminals,
debugging and Kiro's agent status.

Most coding extensions ask you to open another panel. Doraemon walks out of Kiro
and meets you on the desktop: borderless, always on top, draggable and throwable.

**One Kiro extension. No separate app. No account. No telemetry. Fully offline.**

[**Install from Kiro's Open VSX marketplace →**](https://open-vsx.org/extension/AlleyBo55/doraemon-coding-companion)

[Download the latest universal VSIX](https://github.com/AlleyBo55/doraemon/releases/latest)

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

Not a trick, and not a compromise. A small native Rust companion wraps the
webview your operating system already has. macOS has WebKit. Windows has
WebView2. Linux has WebKitGTK. Nobody needs a second copy of Chromium to animate
a cartoon cat.

The whole extension is **4.5 MB to download**, and 92% of that is the artwork.

---

## Install in Kiro

1. Open **Extensions** in Kiro (`Ctrl+Shift+X` on Windows/Linux,
   `Cmd+Shift+X` on macOS).
2. Search for **Doraemon Coding Companion** or
   `AlleyBo55.doraemon-coding-companion`.
3. Select the extension published by **AlleyBo55** and choose **Install**.
4. Reload Kiro if it asks. Doraemon launches on your desktop automatically.

Prefer a file? Download the
[latest universal VSIX](https://github.com/AlleyBo55/doraemon/releases/latest),
then run **Extensions: Install from VSIX...** from Kiro's command palette.

No separate desktop app. No API key. No account. No network call, ever.

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

## Frequently asked questions

### Is this a Kiro extension or a separate desktop app?

It is one Kiro extension. The tiny native companion that creates the transparent,
always-on-top window is bundled inside the extension and exits with Kiro. There
is no second installer or background service.

### Is this a Shimeji desktop pet?

Yes. Doraemon uses Shimeji-style physics: walking, climbing, falling, bouncing,
dragging and throwing. Unlike a decorative mascot, he also reacts to real editor,
terminal, Git, debugger, diagnostics and Kiro agent events.

### Does it work on macOS, Windows and Linux?

Platform-specific builds are published for Apple Silicon Mac, Intel Mac, Windows
x64 and Linux x64. Linux transparency needs a compositing window manager; Wayland
also prevents applications from positioning their own windows, so Doraemon
animates in place there. See [Platform support](#platform-support).

### Does Doraemon send my code to an AI service?

No. The extension is fully offline and has no telemetry. It reads local editor
events only long enough to choose a reaction; nothing leaves your machine.

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
| Desktop binary | **verified** | CI-built | CI-built | CI-built |
| Desktop rendering | **verified** | needs field validation | renders; 0.1.2 transparency fix needs field validation | renders; 0.1.2 transparency fix needs field validation |

Sidebar and window mode use editor APIs and behave identically everywhere.
Activity detection does too.

Desktop binaries are built and published for `darwin-arm64`, `darwin-x64`,
`win32-x64` and `linux-x64`. The resolver looks for
`bin/<platform>-<arch>/`; users on an architecture without a binary fall back to
window mode. `linux-arm64`, `linux-armhf` and `win32-arm64` are not built yet.

Linux needs WebKitGTK and a compositing window manager for transparency. On
Wayland the mascot appears and animates but cannot walk, because the protocol
does not let applications position their own windows. X11 sessions have the full
range of movement.

---

## Known limits

**macOS is ad-hoc signed, not notarized.** Downloads can arrive with Apple's
quarantine flag, which stops the companion before it starts. The extension
detects this and asks for explicit consent to clear the flag from its bundled
binary only. Declining keeps the security control intact and falls back to window
mode. Full notarization still requires an Apple Developer ID.

**Windows and Linux transparency in 0.1.2 needs field validation.** Both native
branches compile and package in CI. Windows and Linux users confirmed that the
mascot renders; 0.1.2 changes how each platform composites the transparent
surface, and still needs confirmation on real machines before it is called
verified.

**Wayland cannot provide full movement.** It deliberately prevents applications
from positioning their own windows, so Doraemon animates in place. Use an X11
session for desktop walking.

**Approve-in-bubble is not implemented.** By choice, explained above.

---

## Development

```bash
npm run watch            # rebuild JS on change
npm run typecheck        # tsc --noEmit
npm run build-companion  # cargo release build, stages into bin/
npm test                 # typecheck + build + 34 host checks
npm run release          # platform-specific VSIX into release/
```

The test suite stubs the editor API and drives activation, every command, every
reaction and the negatives — a removed breakpoint stays quiet, a zero exit code
is not a failure, a repeated window-state event does not re-fire.

`verify-sprites` resolves the real animation table and asserts all
**595 frame references across 107 animations** exist on disk, because a missing
PNG only shows up as an invisible mascot.

`verify-coverage` asserts the reverse: that **all 40 generated sprite sets can
actually be triggered** by something. Unreachable artwork is dead weight in the
VSIX and invisible by definition — nobody notices an animation that never plays.
The build fails if a set has no route to the screen.

## Publishing

Kiro installs from Open VSX. One-time: sign in at
[open-vsx.org](https://open-vsx.org), accept the Publisher Agreement, then set
`OVSX_PAT`. The namespace is created automatically on first publish.

```bash
npm run release:publish
```

The companion is a native binary, so each platform is packaged **on** that
platform and published under its own `--target`. The release script refuses to
package if the binary for the current platform is missing, rather than shipping a
build with desktop mode silently absent. It also refuses to publish when the git
tag disagrees with the version in `package.json`, since Open VSX will not let a
published version be replaced.

### Two kinds of VSIX

**Platform-specific** (`-darwin-arm64.vsix`, `-win32-x64.vsix`, ...) declares
`TargetPlatform` in its manifest. A mismatched host **refuses to install it**.
This is what a registry wants: each user is served only their own build.

**Universal** (`-universal.vsix`) declares no `TargetPlatform` and carries every
companion binary that was staged, so one file installs on any OS. This is what
you want for a direct download link or a GitHub release asset.

```bash
npm run release:universal
```

Locally that only bundles what you can compile, and it warns loudly about the
platforms it had to leave out — those users get window mode rather than the
floating mascot. CI produces a complete one: each platform job uploads its
binary, and the `universal` job assembles all four into a single VSIX.

## Privacy

No telemetry. No network requests. Nothing leaves your machine. Language IDs,
file paths and diagnostic counts are read only to pick a reaction, and held in
memory for the session.
