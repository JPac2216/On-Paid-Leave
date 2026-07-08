use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use arboard::Clipboard;
use chrono::Utc;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::patterns::{self, PatternMatch};

const POLL_INTERVAL_MS: u64 = 300;
const CLIPBOARD_CHANGED_EVENT: &str = "clipboard-changed";
const SENSITIVE_DETECTED_EVENT: &str = "sensitive-content-detected";

static SCAN_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Serialize)]
pub struct ClipboardChanged {
    pub text: String,
}

#[derive(Clone, Serialize)]
pub struct Detection {
    pub id: String,
    pub name: String,
    pub category: String,
    pub severity: String,
    pub matched_text: String,
}

impl From<&PatternMatch> for Detection {
    fn from(m: &PatternMatch) -> Self {
        Detection {
            id: m.id.clone(),
            name: m.name.clone(),
            category: m.category.clone(),
            severity: m.severity.clone(),
            matched_text: m.matched_text.clone(),
        }
    }
}

#[derive(Clone, Serialize)]
pub struct ScanResult {
    pub scan_id: String,
    pub full_text: String,
    pub max_severity: String,
    pub detections: Vec<Detection>,
    pub timestamp: String,
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

                        let matches = patterns::scan_text(&text);
                        if matches.is_empty() {
                            println!("[scanner] no sensitive patterns matched");
                        } else {
                            let severity = highest_severity(&matches);
                            println!("[scanner] SENSITIVE DATA DETECTED - severity: {severity}");
                            for m in &matches {
                                println!(
                                    "[scanner]   - {} ({}) [{}]: {:?}",
                                    m.name, m.id, m.severity, m.matched_text
                                );
                            }

                            let scan_result = ScanResult {
                                scan_id: generate_scan_id(),
                                full_text: text.clone(),
                                max_severity: severity,
                                detections: matches.iter().map(Detection::from).collect(),
                                timestamp: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
                            };

                            let _ = app_handle.emit(SENSITIVE_DETECTED_EVENT, scan_result);
                        }

                        let _ = app_handle.emit(CLIPBOARD_CHANGED_EVENT, ClipboardChanged { text });
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

fn highest_severity(matches: &[PatternMatch]) -> String {
    matches
        .iter()
        .max_by_key(|m| severity_rank(&m.severity))
        .map(|m| m.severity.clone())
        .unwrap_or_else(|| "NONE".to_string())
}

fn severity_rank(severity: &str) -> u8 {
    match severity {
        "CRITICAL" => 3,
        "HIGH" => 2,
        "MEDIUM" => 1,
        _ => 0,
    }
}

fn generate_scan_id() -> String {
    let n = SCAN_COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);

    let mut hasher = DefaultHasher::new();
    (n, nanos).hash(&mut hasher);
    format!("{:016x}", hasher.finish())[..6].to_string()
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
