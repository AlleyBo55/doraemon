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
    /// The IDE that spawned us is gone.
    ParentGone,
}

/// Brings the IDE window back to the front. An extension cannot un-minimise its
/// own window, but we are a separate process, so we can ask the OS.
fn raise_ide() {
    let app = std::env::var("DORAEMON_IDE_APP").unwrap_or_else(|_| "Kiro".to_string());

    #[cfg(target_os = "macos")]
    let spawned = std::process::Command::new("open").arg("-a").arg(&app).spawn();

    #[cfg(target_os = "windows")]
    let spawned = std::process::Command::new("powershell")
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
    use std::process::Command;
    Command::new("tasklist")
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

    let webview = WebViewBuilder::new()
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
                _ => {}
            }
        })
        .with_url("dora://localhost/companion.html")
        .build(&window)?;

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

            Event::UserEvent(UserEvent::ParentGone) => {
                println!("[companion] parent exited, shutting down");
                *control_flow = ControlFlow::Exit;
            }

            _ => {}
        }
    });
}
