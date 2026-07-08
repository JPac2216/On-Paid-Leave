use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::thread;
use std::time::Duration;

use arboard::Clipboard;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::patterns::{scan_text, PatternMatch};

const POLL_INTERVAL_MS: u64 = 300;
const CLIPBOARD_CHANGED_EVENT: &str = "clipboard-changed";

#[derive(Clone, Serialize)]
pub struct ClipboardChanged {
    pub text: String,
    pub matches: Vec<PatternMatch>,
}

/// Starts a dedicated background thread that owns the only `Clipboard` handle
/// for the app's lifetime. Windows only allows one thread to hold the
/// clipboard open at a time, so all reads (polling) and writes (block/edit
/// actions) funnel through commands that each open-use-close in a single
/// call, never holding it open between polls.
pub fn spawn_listener(app_handle: AppHandle) {
    thread::spawn(move || {
        let mut clipboard = match Clipboard::new() {
            Ok(clipboard) => clipboard,
            Err(err) => {
                eprintln!("clipboard listener: failed to access clipboard: {err}");
                return;
            }
        };

        let mut last_hash: Option<u64> = None;

        loop {
            if let Ok(text) = clipboard.get_text() {
                if !text.is_empty() {
                    let hash = hash_text(&text);
                    if last_hash != Some(hash) {
                        last_hash = Some(hash);
                        println!("[clipboard] change detected ({} chars): {text}", text.len());
                        let matches = scan_text(&text);
                        if matches.is_empty() {
                            println!("[clipboard] no sensitive patterns detected");
                        } else {
                            println!("[clipboard] {} pattern match(es) detected", matches.len());
                            for matched in &matches {
                                println!(
                                    "[clipboard] detected {} [{}] -> {:?}",
                                    matched.name, matched.severity, matched.matched_text
                                );
                            }
                        }

                        let _ = app_handle.emit(
                            CLIPBOARD_CHANGED_EVENT,
                            ClipboardChanged { text, matches },
                        );
                    }
                }
            }

            thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
        }
    });
}

fn hash_text(text: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    text.hash(&mut hasher);
    hasher.finish()
}

#[tauri::command]
pub fn clear_clipboard() -> Result<(), String> {
    Clipboard::new()
        .and_then(|mut clipboard| clipboard.clear())
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn set_clipboard_text(text: String) -> Result<(), String> {
    Clipboard::new()
        .and_then(|mut clipboard| clipboard.set_text(text))
        .map_err(|err| err.to_string())
}
