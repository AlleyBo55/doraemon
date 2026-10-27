//! X11 windows through the EWMH root properties. Xlib is loaded at runtime, so
//! the binary still starts where it is missing; Wayland-only sessions report the
//! probe as unsupported.

use std::{
    ffi::{c_int, c_long, c_uchar, c_ulong, CStr},
    ptr,
    sync::{
        atomic::{AtomicPtr, Ordering},
        OnceLock,
    },
};

use x11_dl::xlib::{self, Display, XErrorEvent, XWindowAttributes, Xlib};

use super::WindowRect;

pub const SPACE: &str = "physical";

/// `_NET_WM_DESKTOP` for a window shown on every desktop.
const ALL_DESKTOPS: u32 = 0xFFFF_FFFF;
/// Read limits for list properties, in 32-bit items.
const MAX_CLIENTS: c_long = 4096;
const MAX_ATOMS: c_long = 64;

type ErrorHandler = unsafe extern "C" fn(*mut Display, *mut XErrorEvent) -> c_int;

/// Xlib's error handler is process-wide. Errors on the probe's own connection
/// are expected, since a window can vanish between two queries, and are
/// swallowed. Errors on any other connection, such as GTK's in companion mode,
/// go to whichever handler was installed before.
static PROBE_DISPLAY: AtomicPtr<Display> = AtomicPtr::new(ptr::null_mut());
static PREVIOUS_HANDLER: OnceLock<ErrorHandler> = OnceLock::new();

unsafe extern "C" fn on_x_error(display: *mut Display, event: *mut XErrorEvent) -> c_int {
    if display == PROBE_DISPLAY.load(Ordering::Acquire) {
        return 0;
    }
    match PREVIOUS_HANDLER.get() {
        Some(previous) => previous(display, event),
        None => 0,
    }
}

struct Atoms {
    client_list_stacking: c_ulong,
    current_desktop: c_ulong,
    wm_desktop: c_ulong,
    wm_state: c_ulong,
    wm_state_hidden: c_ulong,
    wm_window_type: c_ulong,
    wm_window_type_normal: c_ulong,
    wm_window_type_dialog: c_ulong,
    wm_pid: c_ulong,
    frame_extents: c_ulong,
    gtk_frame_extents: c_ulong,
}

impl Atoms {
    unsafe fn intern(xlib: &Xlib, display: *mut Display) -> Self {
        let atom = |name: &CStr| (xlib.XInternAtom)(display, name.as_ptr(), xlib::False);
        Self {
            client_list_stacking: atom(c"_NET_CLIENT_LIST_STACKING"),
            current_desktop: atom(c"_NET_CURRENT_DESKTOP"),
            wm_desktop: atom(c"_NET_WM_DESKTOP"),
            wm_state: atom(c"_NET_WM_STATE"),
            wm_state_hidden: atom(c"_NET_WM_STATE_HIDDEN"),
            wm_window_type: atom(c"_NET_WM_WINDOW_TYPE"),
            wm_window_type_normal: atom(c"_NET_WM_WINDOW_TYPE_NORMAL"),
            wm_window_type_dialog: atom(c"_NET_WM_WINDOW_TYPE_DIALOG"),
            wm_pid: atom(c"_NET_WM_PID"),
            frame_extents: atom(c"_NET_FRAME_EXTENTS"),
            gtk_frame_extents: atom(c"_GTK_FRAME_EXTENTS"),
        }
    }
}

/// One display connection, opened on the polling thread and reused for its lifetime.
pub struct Probe {
    xlib: Xlib,
    display: *mut Display,
    root: c_ulong,
    atoms: Atoms,
}

impl Probe {
    pub fn open() -> Result<Self, String> {
        let xlib = Xlib::open().map_err(|err| format!("libX11 unavailable: {err}"))?;
        let display = unsafe { (xlib.XOpenDisplay)(ptr::null()) };
        if display.is_null() {
            return Err("no X11 display".into());
        }

        PROBE_DISPLAY.store(display, Ordering::Release);
        let previous = unsafe { (xlib.XSetErrorHandler)(Some(on_x_error)) };
        if let Some(previous) = previous {
            if !ptr::fn_addr_eq(previous, on_x_error as ErrorHandler) {
                let _ = PREVIOUS_HANDLER.set(previous);
            }
        }

        let root = unsafe { (xlib.XDefaultRootWindow)(display) };
        let atoms = unsafe { Atoms::intern(&xlib, display) };
        Ok(Self {
            xlib,
            display,
            root,
            atoms,
        })
    }

    /// Front-to-back. The stacking list runs bottom-to-top, so it is walked in reverse.
    pub fn windows(&mut self, exclude: &[u32]) -> Option<Vec<WindowRect>> {
        unsafe {
            let stacking = self
                .read_u32s(self.root, self.atoms.client_list_stacking, MAX_CLIENTS)
                .unwrap_or_default();
            let current_desktop = self.read_u32(self.root, self.atoms.current_desktop);
            let windows = stacking
                .iter()
                .rev()
                .filter_map(|&xid| self.describe(xid, current_desktop, exclude))
                .collect();
            Some(windows)
        }
    }

    unsafe fn describe(
        &self,
        xid: u32,
        current_desktop: Option<u32>,
        exclude: &[u32],
    ) -> Option<WindowRect> {
        let window = c_ulong::from(xid);
        if self.on_other_desktop(window, current_desktop)
            || self.is_hidden(window)
            || !self.is_app_window(window)
        {
            return None;
        }
        if self
            .read_u32(window, self.atoms.wm_pid)
            .is_some_and(|pid| exclude.contains(&pid))
        {
            return None;
        }

        let mut attributes: XWindowAttributes = std::mem::zeroed();
        if (self.xlib.XGetWindowAttributes)(self.display, window, &mut attributes) == 0
            || attributes.map_state != xlib::IsViewable
        {
            return None;
        }
        let (mut x, mut y, mut child) = (0, 0, 0);
        let translated = (self.xlib.XTranslateCoordinates)(
            self.display,
            window,
            self.root,
            0,
            0,
            &mut x,
            &mut y,
            &mut child,
        );
        if translated == 0 {
            return None;
        }

        let mut rect = WindowRect {
            id: u64::from(xid),
            x: f64::from(x),
            y: f64::from(y),
            w: f64::from(attributes.width),
            h: f64::from(attributes.height),
        };
        // The window manager's frame sits outside the client and holds the title bar.
        if let Some([left, right, top, bottom]) = self.read_extents(window, self.atoms.frame_extents) {
            rect.x -= left;
            rect.y -= top;
            rect.w += left + right;
            rect.h += top + bottom;
        }
        // Client-side decorated windows pad their own bounds with an invisible shadow.
        if let Some([left, right, top, bottom]) = self.read_extents(window, self.atoms.gtk_frame_extents)
        {
            rect.x += left;
            rect.y += top;
            rect.w -= left + right;
            rect.h -= top + bottom;
        }
        Some(rect)
    }

    unsafe fn on_other_desktop(&self, window: c_ulong, current_desktop: Option<u32>) -> bool {
        let Some(current) = current_desktop else {
            return false;
        };
        self.read_u32(window, self.atoms.wm_desktop)
            .is_some_and(|desktop| desktop != current && desktop != ALL_DESKTOPS)
    }

    unsafe fn is_hidden(&self, window: c_ulong) -> bool {
        let hidden = self.atoms.wm_state_hidden;
        self.read_u32s(window, self.atoms.wm_state, MAX_ATOMS)
            .is_some_and(|states| states.iter().any(|&state| c_ulong::from(state) == hidden))
    }

    /// Docks, panels, menus, tooltips, notifications and the desktop all declare
    /// a type other than normal or dialog. Windows that declare none are normal.
    unsafe fn is_app_window(&self, window: c_ulong) -> bool {
        let Some(types) = self.read_u32s(window, self.atoms.wm_window_type, MAX_ATOMS) else {
            return true;
        };
        let (normal, dialog) = (self.atoms.wm_window_type_normal, self.atoms.wm_window_type_dialog);
        types.is_empty()
            || types.iter().any(|&kind| {
                let kind = c_ulong::from(kind);
                kind == normal || kind == dialog
            })
    }

    /// `[left, right, top, bottom]`, the layout of both extents properties.
    unsafe fn read_extents(&self, window: c_ulong, property: c_ulong) -> Option<[f64; 4]> {
        match self.read_u32s(window, property, 4)?.as_slice() {
            &[left, right, top, bottom] => Some([left, right, top, bottom].map(f64::from)),
            _ => None,
        }
    }

    unsafe fn read_u32(&self, window: c_ulong, property: c_ulong) -> Option<u32> {
        self.read_u32s(window, property, 1)?.first().copied()
    }

    /// Reads a format-32 property. Xlib hands those items back as C longs, sign
    /// extended on 64-bit, so each is narrowed back to the 32 bits X sent.
    unsafe fn read_u32s(&self, window: c_ulong, property: c_ulong, max_items: c_long) -> Option<Vec<u32>> {
        let mut actual_type: c_ulong = 0;
        let mut actual_format: c_int = 0;
        let mut item_count: c_ulong = 0;
        let mut bytes_after: c_ulong = 0;
        let mut data: *mut c_uchar = ptr::null_mut();

        let status = (self.xlib.XGetWindowProperty)(
            self.display,
            window,
            property,
            0,
            max_items,
            xlib::False,
            xlib::AnyPropertyType as c_ulong,
            &mut actual_type,
            &mut actual_format,
            &mut item_count,
            &mut bytes_after,
            &mut data,
        );
        if data.is_null() {
            return None;
        }

        let values = (status == c_int::from(xlib::Success) && actual_format == 32).then(|| {
            let items = std::slice::from_raw_parts(data as *const c_ulong, item_count as usize);
            items.iter().map(|&item| item as u32).collect()
        });
        (self.xlib.XFree)(data.cast());
        values
    }
}

impl Drop for Probe {
    fn drop(&mut self) {
        unsafe { (self.xlib.XCloseDisplay)(self.display) };
        PROBE_DISPLAY.store(ptr::null_mut(), Ordering::Release);
    }
}
