//! CoreGraphics window list. Bounds, layer, alpha and owner PID are readable
//! without Screen Recording permission. Window titles are not, so they are
//! never read.

use std::ffi::c_void;

use core_foundation_sys::{
    array::{CFArrayGetCount, CFArrayGetValueAtIndex, CFArrayRef},
    base::{CFGetTypeID, CFRelease, CFTypeID, CFTypeRef},
    dictionary::{CFDictionaryGetTypeID, CFDictionaryGetValue, CFDictionaryRef},
    number::{
        kCFNumberFloat64Type, kCFNumberSInt64Type, CFNumberGetTypeID, CFNumberGetValue,
        CFNumberRef,
    },
    string::CFStringRef,
};
use core_graphics::{
    geometry::{CGPoint, CGRect, CGSize},
    window::{
        kCGNullWindowID, kCGWindowAlpha, kCGWindowBounds, kCGWindowLayer,
        kCGWindowListExcludeDesktopElements, kCGWindowListOptionOnScreenOnly, kCGWindowNumber,
        kCGWindowOwnerPID, CGWindowListCopyWindowInfo,
    },
};

use super::WindowRect;

pub const SPACE: &str = "points";

/// Ordinary app windows. The menu bar, Dock, status items, notifications and
/// tooltips all sit on higher layers.
const NORMAL_LAYER: i64 = 0;

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGRectMakeWithDictionaryRepresentation(dict: CFDictionaryRef, rect: *mut CGRect) -> bool;
}

pub struct Probe;

impl Probe {
    pub fn open() -> Result<Self, String> {
        Ok(Self)
    }

    /// Front-to-back, the order the window server returns them in.
    pub fn windows(&mut self, exclude: &[u32]) -> Option<Vec<WindowRect>> {
        let list = WindowList::copy()?;
        let count = unsafe { CFArrayGetCount(list.0) };
        let windows = (0..count)
            .filter_map(|index| unsafe {
                describe(CFArrayGetValueAtIndex(list.0, index).cast(), exclude)
            })
            .collect();
        Some(windows)
    }
}

/// Owns the array CGWindowListCopyWindowInfo returns. Everything read out of it
/// is borrowed under the get rule, so this one release frees the whole snapshot.
struct WindowList(CFArrayRef);

impl WindowList {
    fn copy() -> Option<Self> {
        let options = kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements;
        let array = unsafe { CGWindowListCopyWindowInfo(options, kCGNullWindowID) };
        if array.is_null() {
            None
        } else {
            Some(Self(array))
        }
    }
}

impl Drop for WindowList {
    fn drop(&mut self) {
        unsafe { CFRelease(self.0.cast()) };
    }
}

unsafe fn describe(info: CFDictionaryRef, exclude: &[u32]) -> Option<WindowRect> {
    if !is_type(info.cast(), CFDictionaryGetTypeID()) {
        return None;
    }
    if integer(info, kCGWindowLayer)? != NORMAL_LAYER || float(info, kCGWindowAlpha)? <= 0.0 {
        return None;
    }
    let pid = integer(info, kCGWindowOwnerPID)?;
    if exclude.iter().any(|&excluded| i64::from(excluded) == pid) {
        return None;
    }
    let id = u64::try_from(integer(info, kCGWindowNumber)?).ok()?;

    let bounds = CFDictionaryGetValue(info, kCGWindowBounds.cast());
    if !is_type(bounds, CFDictionaryGetTypeID()) {
        return None;
    }
    let mut rect = CGRect::new(&CGPoint::new(0.0, 0.0), &CGSize::new(0.0, 0.0));
    if !CGRectMakeWithDictionaryRepresentation(bounds.cast(), &mut rect) {
        return None;
    }

    Some(WindowRect {
        id,
        x: rect.origin.x,
        y: rect.origin.y,
        w: rect.size.width,
        h: rect.size.height,
    })
}

unsafe fn is_type(object: CFTypeRef, type_id: CFTypeID) -> bool {
    !object.is_null() && CFGetTypeID(object) == type_id
}

unsafe fn number(info: CFDictionaryRef, key: CFStringRef) -> Option<CFNumberRef> {
    let value = CFDictionaryGetValue(info, key.cast());
    is_type(value, CFNumberGetTypeID()).then_some(value.cast())
}

unsafe fn integer(info: CFDictionaryRef, key: CFStringRef) -> Option<i64> {
    let number = number(info, key)?;
    let mut value: i64 = 0;
    let exact = CFNumberGetValue(number, kCFNumberSInt64Type, (&mut value as *mut i64).cast::<c_void>());
    exact.then_some(value)
}

unsafe fn float(info: CFDictionaryRef, key: CFStringRef) -> Option<f64> {
    let number = number(info, key)?;
    let mut value: f64 = 0.0;
    let exact = CFNumberGetValue(number, kCFNumberFloat64Type, (&mut value as *mut f64).cast::<c_void>());
    exact.then_some(value)
}
