# SafePaste

**Real-time clipboard data-loss-prevention (DLP) for the desktop.**

SafePaste is a lightweight background desktop app that scans your clipboard for sensitive data — API keys, credentials, and PII — *before* you paste it into an LLM, chat app, or any third-party service. When it finds something, it alerts you and lets you redact the sensitive values inline before the safe version is written back to the clipboard.

Built at the **Prudential hackathon** (5-person team, 3rd place).

---

## Why

Employees routinely copy secrets — a database URL, an AWS key, a customer SSN — and paste them into ChatGPT, Slack, or email to get help or move fast. Once that data leaves the machine, it may be ingested into third-party LLM pipelines or logs, and there is no easy way to pull it back.

SafePaste sits between the clipboard and the paste target:

- **System-wide** — monitors the OS clipboard, so it works across every app (VS Code, terminal, browser, Slack, ChatGPT), not just the browser.
- **Lightweight** — Rust backend on Tauri (~50MB footprint vs. 150MB+ for Electron alternatives).
- **Explainable** — deterministic regex + checksum matching, no opaque ML, no network calls. Everything runs locally.
- **Non-intrusive** — warns and lets the user decide; it does not silently block.

---

## How it works

```
User copies text
      ↓  (background thread polls clipboard every 300ms, dedups by content hash)
Clipboard change detected
      ↓
Scanned against 30 sensitive patterns (regex + Luhn/ABA checksum validation)
      ↓
Matches found? → severity assigned (CRITICAL / HIGH / MEDIUM)
      ↓
Native desktop notification fires + app UI highlights each match
      ↓
User redacts sensitive values → safe text written back to clipboard
```

- A dedicated **Rust background thread** owns the single clipboard handle for the app's lifetime and polls every **300ms**, hashing content to skip re-scanning unchanged text.
- The **pattern engine** compiles every regex once at startup and scans matched text, attaching a severity and byte range to each hit.
- High-noise numeric patterns get a second validation pass: **credit/debit cards** are checked against the **Luhn** algorithm and **ABA routing numbers** against their **checksum formula**, so coincidental digit strings are discarded.
- Detections are emitted to the React frontend over Tauri's event bridge as a structured `ScanResult` payload (scan ID, full text, max severity, per-match detections, timestamp).
- The **React UI** highlights each match, supports per-item or bulk redaction, and writes the cleaned text back to the OS clipboard via a Tauri command.

---

## Detection coverage

30 patterns across five categories. Severity for PII patterns is mapped from Prudential's internal data-classification sheet (Risk Category + Sensitivity Level).

| Category | Examples |
| --- | --- |
| **Cloud credentials** | AWS access key ID / secret key, GCP service-account key, Azure storage key |
| **API keys & tokens** | OpenAI, Anthropic, Stripe, GitHub, Slack, Google, NPM, generic labeled secrets |
| **Credential material** | PEM private-key blocks, DB connection strings with inline credentials, password assignments |
| **Auth tokens** | JWTs, `Authorization: Bearer` headers |
| **PII** | US SSN, credit/debit cards (Luhn), bank account & ABA routing (checksum), US passport, EIN, ITIN, alien registration #, email, US phone |
| **Network info** | Private RFC 1918 IPs, MAC addresses, internal URLs |

Patterns are defined in [`config/patterns.json`](config/patterns.json) — each entry has an `id`, `name`, `category`, `regex`, `severity`, and `notes`. Add or tune patterns there; no code change required for pure regex rules.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Desktop framework | **Tauri 2** |
| Frontend | **React 19** + Vite |
| Backend | **Rust** (edition 2021) |
| Clipboard | `arboard` |
| Pattern matching | `regex` + `once_cell` (compile-once) |
| Notifications | `tauri-plugin-notification` |
| Serialization | `serde` / `serde_json` |

---

## Project layout

```
.
├─ config/
│  └─ patterns.json          # 30 detection patterns (data-driven, editable)
├─ src/                      # React frontend
│  ├─ App.jsx                # Clipboard view, highlighting, redaction, notifications
│  ├─ main.jsx
│  └─ pages/Settings.jsx
├─ src-tauri/                # Rust backend
│  ├─ src/
│  │  ├─ main.rs             # Entry point
│  │  ├─ lib.rs              # Tauri builder, command registration, listener setup
│  │  ├─ clipboard.rs        # Background poller, event emission, clipboard writes
│  │  └─ patterns.rs         # Pattern loading, compiling, scanning, Luhn/ABA checks
│  ├─ examples/demo_scan.rs  # CLI demo of the scanner (no GUI)
│  ├─ Cargo.toml
│  └─ tauri.conf.json
├─ project_plan.md           # Original architecture & hackathon plan
└─ package.json
```

---

## Getting started

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) 1.70+
- [Node.js](https://nodejs.org/) 18+
- Tauri 2 system dependencies for your OS — see the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/)

### Install

```bash
npm install
```

### Run in development

```bash
npm run tauri dev
```

Launches the app with a live-reloading React frontend and the Rust clipboard listener running in the background. Copy any secret (e.g. `AKIAIOSFODNN7EXAMPLE`) and a desktop notification should fire.

### Build a release bundle

```bash
npm run tauri build
```

Outputs platform installers (`.msi`/`.exe` on Windows, `.dmg`/`.app` on macOS, `.deb`/`.rpm` on Linux) under `src-tauri/target/release/bundle/`.

---

## Testing

Unit tests cover pattern loading/compilation, individual detectors, and the Luhn / ABA checksum validation (including a no-false-positive check on clean code):

```bash
cd src-tauri
cargo test
```

Try the scanner without launching the GUI:

```bash
cd src-tauri
cargo run --example demo_scan
```

---

## Usage

1. **Copy** text anywhere on your system.
2. If sensitive data is detected, a **desktop notification** appears with the match count and highest severity.
3. **Open SafePaste** — the clipboard content is shown with each detection highlighted (red = detected, hover for name + severity).
4. Click a highlight to **redact that item**, or use **Redact all highlighted text** to redact everything.
5. Click **Confirm and copy** to write the cleaned text back to the clipboard. Now paste safely.
6. **Reverse all changes** restores the original text; the **Disable desktop notifications** toggle silences alerts for the session.

The app minimizes rather than quits on window close, keeping the background listener alive.

---

## Roadmap

Planned enterprise-facing work (see [`project_plan.md`](project_plan.md) for full detail):

- Centralized backend for pushing rules to all machines and aggregating audit logs
- MDM deployment (Intune, Apple Business Manager)
- App-specific policies (stricter rules for ChatGPT/Claude, looser for internal tools)
- Compliance reporting (SOC 2, HIPAA) and SIEM integration
- Entropy-based detection for unknown/custom secret formats

---

## Notes

This began as a 24-hour hackathon build: config and patterns load from JSON, and session activity is held in memory. It is not yet a production-hardened DLP product — the roadmap above tracks that path.
