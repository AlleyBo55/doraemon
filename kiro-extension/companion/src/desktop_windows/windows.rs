//! Win32 top-level windows. EnumWindows walks the z-order from the top, which is
//! already front-to-back.

use std::{ffi::c_void, mem::size_of};

use windows_sys::{
    core::BOOL,
    Win32::{
        Foundation::{HWND, LPARAM, RECT},
        Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS},
        System::LibraryLoader::{GetModuleHandleW, GetProcAddress},
        UI::{
            HiDpi::{DPI_AWARENESS_CONTEXT, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2},
            WindowsAndMessaging::{
                EnumWindows, GetClassNameW, GetWindowLongW, GetWindowRect,
                GetWindowThreadProcessId, IsIconic, IsWindowVisible, GWL_EXSTYLE,
                WS_EX_APPWINDOW, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
            },
        },
    },
};

use super::WindowRect;

pub const SPACE: &str = "physical";

/// The desktop, the wallpaper host and the taskbars are top-level windows too.
const SHELL_CLASSES: [&str; 4] = ["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"];

pub struct Probe;

impl Probe {
    pub fn open() -> Result<Self, String> {
        Ok(Self)
    }

    pub fn windows(&mut self, exclude: &[u32]) -> Option<Vec<WindowRect>> {
        let mut handles: Vec<HWND> = Vec::new();
        let listed = unsafe {
            EnumWindows(Some(collect_handle), &mut handles as *mut Vec<HWND> as LPARAM)
        };
        if listed == 0 {
            return None;
        }
        let windows = handles
            .into_iter()
            .filter_map(|hwnd| unsafe { describe(hwnd, exclude) })
            .collect();
        Some(windows)
    }
}

/// Without per-monitor awareness, Windows reports scaled-down bounds for windows
/// on high-DPI monitors. Looked up at runtime because the call only exists from
/// Windows 10 1703, and a direct import would stop older systems launching the
/// binary at all. Failure, including awareness already being set, is harmless.
pub fn use_physical_pixels() {
    type SetAwareness = unsafe extern "system" fn(DPI_AWARENESS_CONTEXT) -> BOOL;

    let user32: Vec<u16> = "user32.dll\0".encode_utf16().collect();
    unsafe {
        let module = GetModuleHandleW(user32.as_ptr());
        if module.is_null() {
            return;
        }
        if let Some(found) = GetProcAddress(module, c"SetProcessDpiAwarenessContext".as_ptr().cast()) {
            let set_awareness: SetAwareness = std::mem::transmute(found);
            set_awareness(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        }
    }
}

unsafe extern "system" fn collect_handle(hwnd: HWND, handles: LPARAM) -> BOOL {
    (*(handles as *mut Vec<HWND>)).push(hwnd);
    1
}

unsafe fn describe(hwnd: HWND, exclude: &[u32]) -> Option<WindowRect> {
    if IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 || is_cloaked(hwnd) {
        return None;
    }
    let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    let tool_window = ex_style & WS_EX_TOOLWINDOW != 0 && ex_style & WS_EX_APPWINDOW == 0;
    let click_through = ex_style & WS_EX_TRANSPARENT != 0;
    if tool_window || click_through || is_shell(hwnd) {
        return None;
    }

    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, &mut pid);
    if exclude.contains(&pid) {
        return None;
    }

    let frame = frame_bounds(hwnd)?;
    Some(WindowRect {
        // Only the low 32 bits of a window handle are significant, and keeping
        // to them keeps the id exact as a JavaScript number.
        id: u64::from(hwnd as usize as u32),
        x: f64::from(frame.left),
        y: f64::from(frame.top),
        w: f64::from(frame.right) - f64::from(frame.left),
        h: f64::from(frame.bottom) - f64::from(frame.top),
    })
}

/// Covers UWP apps that are suspended in the background and windows on other
/// virtual desktops: both stay "visible" but DWM never draws them.
unsafe fn is_cloaked(hwnd: HWND) -> bool {
    let mut cloaked: u32 = 0;
    let result = DwmGetWindowAttribute(
        hwnd,
        DWMWA_CLOAKED as u32,
        (&mut cloaked as *mut u32).cast::<c_void>(),
        size_of::<u32>() as u32,
    );
    result >= 0 && cloaked != 0
}

/// The visible frame in physical px. GetWindowRect would include the invisible
/// resize border, so it is only the fallback.
unsafe fn frame_bounds(hwnd: HWND) -> Option<RECT> {
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    let result = DwmGetWindowAttribute(
        hwnd,
        DWMWA_EXTENDED_FRAME_BOUNDS as u32,
        (&mut rect as *mut RECT).cast::<c_void>(),
        size_of::<RECT>() as u32,
    );
    if result >= 0 || GetWindowRect(hwnd, &mut rect) != 0 {
        Some(rect)
    } else {
        None
    }
}

unsafe fn is_shell(hwnd: HWND) -> bool {
    let mut buffer = [0u16; 64];
    let len = GetClassNameW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
    let Some(name) = usize::try_from(len).ok().and_then(|len| buffer.get(..len)) else {
        return false;
    };
    SHELL_CLASSES
        .iter()
        .any(|class| class.encode_utf16().eq(name.iter().copied()))
}
