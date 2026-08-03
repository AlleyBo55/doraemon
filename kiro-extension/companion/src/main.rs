//! Floating Doraemon mascot, driven by the Kiro extension.
//!
//! Deliberately a *small* window that gets repositioned as the mascot walks,
//! rather than a fullscreen click-through overlay. That keeps the mascot fully
//! interactive without relying on mouse-event forwarding, which Electron only
//! supports on macOS and Windows. The tradeoff is that window position is owned
//! by Rust while motion is computed in the webview.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    borrow::Cow,
    fs,
    path::{Path, PathBuf},
    thread,
    time::Duration,
};

use tao::{
    dpi::{LogicalPosition, LogicalSize},
    event::{Event, StartCause},
    event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy},
    window::WindowBuilder,
};
use wry::{http::Response, WebViewBuilder};

/// Window is larger than the sprite to leave room for the speech bubble, which
/// sits directly above the mascot and grows upward.
const WINDOW_W: f64 = 320.0;
const WINDOW_H: f64 = 240.0;

/// wry maps custom protocols onto a different origin per platform: Windows and
/// Android rewrite them to `http://<scheme>.<host>`, while macOS and Linux use
/// `<scheme>://<host>`. Navigating to the wrong form does not error, it just
/// leaves the webview sitting on a blank page.
#[cfg(target_os = "windows")]
const INDEX_URL: &str = "http://dora.localhost/companion.html";
#[cfg(not(target_os = "windows"))]
const INDEX_URL: &str = "dora://localhost/companion.html";
const COMMAND_FILE: &str = "command.json";
const PARENT_POLL: Duration = Duration::from_secs(4);
const COMMAND_POLL: Duration = Duration::from_millis(250);

#[derive(Debug)]
enum UserEvent {
    /// Mascot asked to be somewhere else on screen.
    Move { x: f64, y: f64 },
    /// A reaction arrived from the extension.
    Command(String),
    /// User clicked the bubble; bring the IDE forward.
    RaiseIde,
    /// Time to force the webview to recomposite. Windows only; the other two
    /// platforms composite the transparent surface correctly on first paint.
    #[cfg(target_os = "windows")]
    Repaint,
    /// The IDE that spawned us is gone.
    ParentGone,
}

/// WebView2 leaves an opaque surface over a transparent window until something
/// forces it to recomposite, so the mascot arrives inside a white box that only
/// clears if the user resizes the window. A one-pixel resize round-trip is the
/// cheapest way to trigger that ourselves. Scheduled a beat after the renderer
/// reports its first frame, because nudging before anything has painted has
/// nothing to recomposite.
#[cfg(target_os = "windows")]
const REPAINT_DELAY: Duration = Duration::from_millis(120);

/// Brings the IDE window back to the front. An extension cannot un-minimise its
/// own window, but we are a separate process, so we can ask the OS.
/// Release builds are linked as a GUI subsystem app, so they own no console.
/// Spawning a console program from one makes Windows allocate a fresh console and
/// flash it on screen. Repeated on a timer that reads as the mascot window
/// blinking open and shut, so every child process must opt out explicitly.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(windows)]
fn quiet_command(program: &str) -> std::process::Command {
    use std::os::windows::process::CommandExt;
    let mut command = std::process::Command::new(program);
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

fn raise_ide() {
    let app = std::env::var("DORAEMON_IDE_APP").unwrap_or_else(|_| "Kiro".to_string());

    #[cfg(target_os = "macos")]
    let spawned = std::process::Command::new("open").arg("-a").arg(&app).spawn();

    #[cfg(target_os = "windows")]
    let spawned = quiet_command("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                "(New-Object -ComObject WScript.Shell).AppActivate('{}')",
                app.replace('\'', "")
            ),
        ])
        .spawn();

    // wmctrl is not always installed, so failure here is expected and harmless.
    #[cfg(all(unix, not(target_os = "macos")))]
    let spawned = std::process::Command::new("wmctrl").arg("-a").arg(&app).spawn();

    if let Err(err) = spawned {
        eprintln!("[companion] could not raise {app}: {err}");
    }
}

fn env_path(key: &str) -> Option<PathBuf> {
    std::env::var(key).ok().filter(|v| !v.is_empty()).map(PathBuf::from)
}

fn mime_for(path: &str) -> &'static str {
    if path.ends_with(".html") {
        "text/html"
    } else if path.ends_with(".js") {
        "text/javascript"
    } else if path.ends_with(".css") {
        "text/css"
    } else if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".json") {
        "application/json"
    } else {
        "application/octet-stream"
    }
}

/// Serves assets from the extension's media directory over a custom protocol.
/// A custom protocol keeps `file://` restrictions and CORS quirks out of play.
fn serve(asset_dir: &Path, requested: &str) -> Response<Cow<'static, [u8]>> {
    let empty = || Cow::Owned(Vec::new());
    let relative = requested.trim_start_matches('/');

    // Refuse anything trying to climb out of the asset directory.
    if relative.contains("..") {
        return Response::builder().status(403).body(empty()).unwrap();
    }

    match fs::read(asset_dir.join(relative)) {
        Ok(bytes) => Response::builder()
            .status(200)
            .header("Content-Type", mime_for(relative))
            .body(Cow::Owned(bytes))
            .unwrap(),
        Err(_) => Response::builder().status(404).body(empty()).unwrap(),
    }
}

/// Watches the command file the extension writes, one reaction at a time.
fn spawn_command_watcher(dir: PathBuf, proxy: EventLoopProxy<UserEvent>) {
    thread::spawn(move || {
        let path = dir.join(COMMAND_FILE);
        let mut last_id = String::new();

        loop {
            if let Ok(raw) = fs::read_to_string(&path) {
                let id = serde_json::from_str::<serde_json::Value>(&raw)
                    .ok()
                    .and_then(|v| v.get("id").and_then(|i| i.as_str()).map(str::to_owned));

                if let Some(id) = id {
                    if id != last_id {
                        last_id = id;
                        let _ = proxy.send_event(UserEvent::Command(raw));
                    }
                }
                let _ = fs::remove_file(&path);
            }
            thread::sleep(COMMAND_POLL);
        }
    });
}

#[cfg(unix)]
fn process_alive(pid: u32) -> bool {
    // Signal 0 checks existence and permission without delivering anything.
    // EPERM means the process exists but belongs to someone else.
    let result = unsafe { libc::kill(pid as libc::pid_t, 0) };
    if result == 0 {
        return true;
    }
    std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

#[cfg(windows)]
fn process_alive(pid: u32) -> bool {
    // CREATE_NO_WINDOW matters more here than anywhere else: this runs every few
    // seconds for the whole session, so without it the user sees a console window
    // flicker on that cadence for as long as the mascot is up.
    quiet_command("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
        .unwrap_or(true)
}

/// Ties our lifetime to the IDE, so no orphaned mascot is left on screen.
fn spawn_parent_watchdog(pid: u32, proxy: EventLoopProxy<UserEvent>) {
    thread::spawn(move || loop {
        if !process_alive(pid) {
            let _ = proxy.send_event(UserEvent::ParentGone);
            return;
        }
        thread::sleep(PARENT_POLL);
    });
}

fn main() -> wry::Result<()> {
    let asset_dir = env_path("DORAEMON_ASSET_DIR").unwrap_or_else(|| {
        eprintln!("[companion] DORAEMON_ASSET_DIR is required");
        std::process::exit(2);
    });

    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();

    let monitor_size = event_loop
        .primary_monitor()
        .map(|m| m.size().to_logical::<f64>(m.scale_factor()))
        .unwrap_or(LogicalSize::new(1440.0, 900.0));

    let builder = WindowBuilder::new()
        .with_title("Doraemon")
        .with_transparent(true)
        .with_decorations(false)
        .with_always_on_top(true)
        .with_resizable(false)
        .with_inner_size(LogicalSize::new(WINDOW_W, WINDOW_H))
        .with_position(LogicalPosition::new(
            monitor_size.width / 2.0 - WINDOW_W / 2.0,
            monitor_size.height - WINDOW_H - 60.0,
        ));

    // A transparent window still casts a rectangular drop shadow on macOS,
    // which would outline the invisible box around the mascot.
    #[cfg(target_os = "macos")]
    let builder = {
        use tao::platform::macos::WindowBuilderExtMacOS;
        builder.with_has_shadow(false)
    };

    let window = builder
        .build(&event_loop)
        .expect("failed to create the mascot window");

    // The webview owns motion, so it needs to know the space it is moving in and
    // where its window currently sits.
    let boot = format!(
        "window.__DORA__ = {{ screenW: {w}, screenH: {h}, winW: {ww}, winH: {wh} }};",
        w = monitor_size.width,
        h = monitor_size.height,
        ww = WINDOW_W,
        wh = WINDOW_H,
    );

    let ipc_proxy = proxy.clone();
    let protocol_dir = asset_dir.clone();

    let webview_builder = WebViewBuilder::new()
        .with_transparent(true)
        .with_initialization_script(&boot)
        .with_custom_protocol("dora".into(), move |_id, request| {
            serve(&protocol_dir, request.uri().path())
        })
        .with_ipc_handler(move |request| {
            let Ok(value) = serde_json::from_str::<serde_json::Value>(request.body()) else {
                return;
            };

            match value.get("type").and_then(|t| t.as_str()) {
                Some("move") => {
                    let x = value.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let y = value.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let _ = ipc_proxy.send_event(UserEvent::Move { x, y });
                }
                Some("openIde") => {
                    let _ = ipc_proxy.send_event(UserEvent::RaiseIde);
                }
                // Delayed off the event loop deliberately: sleeping inside the
                // handler would stall the message pump and prevent the very
                // paint we are waiting to recomposite.
                #[cfg(target_os = "windows")]
                Some("ready") => {
                    let nudge = ipc_proxy.clone();
                    thread::spawn(move || {
                        thread::sleep(REPAINT_DELAY);
                        let _ = nudge.send_event(UserEvent::Repaint);
                    });
                }
                _ => {}
            }
        })
        .with_url(INDEX_URL);

    /*
     * `build` attaches the webview through the raw window handle, which wry
     * documents as X11 only. Modern Ubuntu, Fedora and GNOME default to Wayland,
     * where that path fails and the mascot never appears at all. Going through the
     * GTK container instead is the documented way to support both.
     */
    #[cfg(target_os = "linux")]
    let webview = {
        use tao::platform::unix::WindowExtUnix;
        use wry::WebViewBuilderExtUnix;

        /*
         * Hand wry the GtkBox rather than the window. tao fills the window's
         * single child slot with a vertical box by default, and wry dispatches on
         * container type: a GtkBox is packed, while anything else falls through to
         * `add`, which GTK refuses on an already-occupied GtkBin. wry's own
         * example passes the window, which only holds for windows built without
         * that default box.
         */
        match window.default_vbox() {
            Some(vbox) => webview_builder.build_gtk(vbox)?,
            None => webview_builder.build_gtk(window.gtk_window())?,
        }
    };
    #[cfg(not(target_os = "linux"))]
    let webview = webview_builder.build(&window)?;

    if let Some(dir) = env_path("DORAEMON_COMMAND_DIR") {
        let _ = fs::create_dir_all(&dir);
        spawn_command_watcher(dir, proxy.clone());
    }

    if let Some(pid) = std::env::var("DORAEMON_PARENT_PID").ok().and_then(|v| v.parse().ok()) {
        spawn_parent_watchdog(pid, proxy.clone());
    }

    println!("[companion] mascot window ready");

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        match event {
            Event::NewEvents(StartCause::Init) => {}

            Event::UserEvent(UserEvent::Move { x, y }) => {
                window.set_outer_position(LogicalPosition::new(x, y));
            }

            Event::UserEvent(UserEvent::Command(raw)) => {
                // Hand the raw payload to the renderer; it decides what to show.
                let escaped = serde_json::to_string(&raw).unwrap_or_else(|_| "\"\"".into());
                let _ = webview.evaluate_script(&format!("window.__doraCommand__({escaped})"));
            }

            Event::UserEvent(UserEvent::RaiseIde) => raise_ide(),

            #[cfg(target_os = "windows")]
            Event::UserEvent(UserEvent::Repaint) => {
                window.set_inner_size(LogicalSize::new(WINDOW_W + 1.0, WINDOW_H + 1.0));
                window.set_inner_size(LogicalSize::new(WINDOW_W, WINDOW_H));
            }

            Event::UserEvent(UserEvent::ParentGone) => {
                println!("[companion] parent exited, shutting down");
                *control_flow = ControlFlow::Exit;
            }

            _ => {}
        }
    });
}
