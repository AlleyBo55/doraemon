//! Lists other apps' on-screen windows, so the mascot can walk on, ride, climb
//! and land on them.
//!
//! One polling loop feeds two consumers. Companion mode pushes snapshots into the
//! mascot's own webview, mapped into the logical space its engine moves in. The
//! `--window-probe` CLI prints native-space snapshots as JSON lines for the
//! Electron desktop app, which maps them itself.

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "linux")]
use self::linux as platform;
#[cfg(target_os = "macos")]
use self::macos as platform;
#[cfg(target_os = "windows")]
use self::windows as platform;

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
mod platform {
    pub const SPACE: &str = "physical";

    pub struct Probe;

    impl Probe {
        pub fn open() -> Result<Self, String> {
            Err(format!("no window probe for {}", std::env::consts::OS))
        }

        pub fn windows(&mut self, _exclude: &[u32]) -> Option<Vec<super::WindowRect>> {
            None
        }
    }
}

use std::{
    fmt::Write as _,
    io::{self, Read, Write},
    sync::mpsc::{self, RecvTimeoutError},
    thread,
    time::{Duration, Instant},
};

const IDLE_POLL: Duration = Duration::from_millis(150);
/// Polling speeds up for a while after any change, so a window being dragged is
/// tracked smoothly rather than in jumps.
const ACTIVE_POLL: Duration = Duration::from_millis(40);
const ACTIVE_FOR: Duration = Duration::from_millis(1500);
/// Anything smaller is a widget or a sliver, not something to stand on.
const MIN_W: i64 = 64;
const MIN_H: i64 = 32;

/// One window in the platform's native space: CG global points on macOS,
/// physical pixels on Windows and X11.
pub struct WindowRect {
    pub id: u64,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Maps native window coordinates onto the logical space the webview engine
/// moves the mascot in: `logical = (native - origin) / scale`.
#[derive(Clone, Copy)]
pub struct LogicalSpace {
    origin_x: f64,
    origin_y: f64,
    scale: f64,
}

impl LogicalSpace {
    /// Leaves native coordinates as they are.
    pub const NATIVE: Self = Self {
        origin_x: 0.0,
        origin_y: 0.0,
        scale: 1.0,
    };

    /// Takes the primary monitor's physical position and scale factor as tao
    /// reports them.
    pub fn from_primary(x: f64, y: f64, scale: f64) -> Self {
        let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };

        if cfg!(target_os = "macos") {
            // CG global points already are logical px, origin at the main display.
            Self::NATIVE
        } else if cfg!(target_os = "linux") {
            // tao moves GTK windows in root-relative logical px, so the primary
            // monitor's offset is not part of the space the mascot moves in.
            Self {
                origin_x: 0.0,
                origin_y: 0.0,
                scale,
            }
        } else {
            Self {
                origin_x: x,
                origin_y: y,
                scale,
            }
        }
    }

    /// Rounded `[x, y, w, h]`, or `None` when the window is below the size floor.
    fn project(&self, window: &WindowRect) -> Option<[i64; 4]> {
        let w = (window.w / self.scale).round() as i64;
        let h = (window.h / self.scale).round() as i64;
        if w < MIN_W || h < MIN_H {
            return None;
        }
        let x = ((window.x - self.origin_x) / self.scale).round() as i64;
        let y = ((window.y - self.origin_y) / self.scale).round() as i64;
        Some([x, y, w, h])
    }
}

/// `{"space":..,"windows":[{"id","x","y","w","h"},..]}`, front-to-back. The
/// webview only ever sees its own space, so it gets no `space` field.
fn render(space: Option<&str>, windows: &[WindowRect], mapping: LogicalSpace) -> String {
    let mut json = String::with_capacity(32 + windows.len() * 64);
    json.push('{');
    if let Some(space) = space {
        let _ = write!(json, "\"space\":\"{space}\",");
    }
    json.push_str("\"windows\":[");
    for window in windows {
        let Some([x, y, w, h]) = mapping.project(window) else {
            continue;
        };
        if !json.ends_with('[') {
            json.push(',');
        }
        let id = window.id;
        let _ = write!(json, "{{\"id\":{id},\"x\":{x},\"y\":{y},\"w\":{w},\"h\":{h}}}");
    }
    json.push_str("]}");
    json
}

fn unsupported(reason: &str) -> String {
    let reason = serde_json::to_string(reason).unwrap_or_else(|_| "\"unknown\"".to_owned());
    format!("{{\"space\":\"physical\",\"windows\":[],\"unsupported\":{reason}}}")
}

/// Runs until `emit` or `wait` returns false. The first snapshot goes out at
/// once; after that only snapshots that serialise differently do.
fn poll(
    mut snapshot: impl FnMut() -> Option<String>,
    mut emit: impl FnMut(&str) -> bool,
    mut wait: impl FnMut(Duration) -> bool,
) {
    let mut last = String::new();
    let mut last_change: Option<Instant> = None;

    loop {
        if let Some(json) = snapshot() {
            if json != last {
                if !emit(&json) {
                    return;
                }
                last = json;
                last_change = Some(Instant::now());
            }
        }

        let active = last_change.is_some_and(|at| at.elapsed() < ACTIVE_FOR);
        if !wait(if active { ACTIVE_POLL } else { IDLE_POLL }) {
            return;
        }
    }
}

fn warn(message: &str) {
    let _ = writeln!(io::stderr(), "{message}");
}

/// Polls on a background thread and hands every changed snapshot to `push`,
/// already mapped into `space`. Stops once `push` returns false.
pub fn spawn_companion(space: LogicalSpace, mut push: impl FnMut(String) -> bool + Send + 'static) {
    let spawned = thread::Builder::new()
        .name("window-probe".into())
        .spawn(move || {
            let mut probe = match platform::Probe::open() {
                Ok(probe) => probe,
                Err(reason) => {
                    warn(&format!("[companion] window probe unavailable: {reason}"));
                    return;
                }
            };
            let exclude = [std::process::id()];

            poll(
                || probe.windows(&exclude).map(|windows| render(None, &windows, space)),
                |json| push(json.to_owned()),
                |delay| {
                    thread::sleep(delay);
                    true
                },
            );
        });

    if let Err(err) = spawned {
        warn(&format!("[companion] could not start the window probe: {err}"));
    }
}

/// True when started as `doraemon-companion --window-probe`.
pub fn cli_requested() -> bool {
    std::env::args_os().skip(1).any(|arg| arg == "--window-probe")
}

/// The headless probe for the desktop app: one JSON line per change on stdout,
/// until stdin closes or stdout breaks. Always exits 0.
pub fn run_cli() -> ! {
    probe_until_closed();
    std::process::exit(0)
}

fn probe_until_closed() {
    let mut exclude = excluded_pids();
    exclude.push(std::process::id());

    #[cfg(target_os = "windows")]
    platform::use_physical_pixels();

    let mut probe = match platform::Probe::open() {
        Ok(probe) => probe,
        Err(reason) => {
            print_line(&unsupported(&reason));
            return;
        }
    };
    let stdin_closed = watch_stdin();

    poll(
        || {
            probe
                .windows(&exclude)
                .map(|windows| render(Some(platform::SPACE), &windows, LogicalSpace::NATIVE))
        },
        print_line,
        |delay| {
            matches!(
                stdin_closed.recv_timeout(delay),
                Err(RecvTimeoutError::Timeout)
            )
        },
    );
}

/// Every `--exclude-pid <pid>`; the flag may repeat.
fn excluded_pids() -> Vec<u32> {
    let mut pids = Vec::new();
    let mut args = std::env::args_os().skip(1);

    while let Some(arg) = args.next() {
        if arg != "--exclude-pid" {
            continue;
        }
        match args.next().and_then(|value| value.to_str()?.trim().parse().ok()) {
            Some(pid) => pids.push(pid),
            None => warn("[window-probe] --exclude-pid needs a numeric process id"),
        }
    }
    pids
}

/// The parent closing our stdin is the signal to quit, so a dedicated thread
/// blocks on it and reports EOF or any read error through the channel. If that
/// thread cannot start, its sender is dropped, which reads as closed too.
fn watch_stdin() -> mpsc::Receiver<()> {
    let (closed, receiver) = mpsc::channel();

    let spawned = thread::Builder::new()
        .name("window-probe-stdin".into())
        .spawn(move || {
            let mut stdin = io::stdin().lock();
            let mut buffer = [0u8; 256];
            loop {
                match stdin.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(_) => {}
                    Err(err) if err.kind() == io::ErrorKind::Interrupted => {}
                    Err(_) => break,
                }
            }
            let _ = closed.send(());
        });

    if let Err(err) = spawned {
        warn(&format!("[window-probe] could not watch stdin: {err}"));
    }
    receiver
}

/// False once stdout is gone, e.g. EPIPE after the reader exited.
fn print_line(line: &str) -> bool {
    let mut stdout = io::stdout().lock();
    writeln!(stdout, "{line}").and_then(|()| stdout.flush()).is_ok()
}
