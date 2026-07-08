# Safe Paste - Project Plan & Architecture

**Last Updated:** July 2026  
**Status:** Planning Phase → Ready for Development  
**Target Release:** 4 weeks

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Solution Overview](#solution-overview)
4. [Architecture](#architecture)
5. [Tech Stack](#tech-stack)
6. [Detection Layer](#detection-layer)
7. [UI/UX Flows](#uiux-flows)
8. [Features](#features)
9. [Team & Workload](#team--workload)
10. [Timeline](#timeline)
11. [Setup & Development](#setup--development)
12. [Next Steps](#next-steps)

---

## Executive Summary

**Safe Paste** is a background desktop application that scans clipboard content for sensitive information (API keys, credentials, PII) before users paste it into LLMs, chatbots, or external services.

**Target:** Enterprise/workplace users who want to prevent accidental data leakage to AI systems and third-party services.

**Core Value:**

- Prevents API key leakage to ChatGPT/Claude
- Blocks database credentials from being pasted into Slack/email
- Protects company intellectual property before paste happens
- IT-deployable via MDM with optional centralized audit logging

**MVP:** System-wide clipboard monitoring with instant toast notifications + expandable modal showing highlighted sensitive text.

---

## Problem Statement

### The Risk

- Employees copy database credentials, API keys, or internal URLs
- They paste into ChatGPT to debug, search, or get help
- Sensitive data gets ingested into third-party LLM training pipelines
- No easy way to prevent this before it happens

### Current Solutions

- Browser extensions only (miss desktop apps, terminals, VS Code)
- Education/policy (unreliable at scale)
- Manual DLP tools (heavy, expensive, often circumvented)

### Why Safe Paste

- **System-wide:** Monitors all apps (VS Code, Slack, terminal, ChatGPT, everything)
- **Lightweight:** Rust backend, Tauri app (~50MB vs 150MB+ alternatives)
- **Enterprise-ready:** MDM deployable, audit logging, centralized rules
- **Non-intrusive:** Toast notification, clickable to expand, user can override
- **Simple patterns:** Regex-based, fast, explainable (no opaque ML)

---

## Solution Overview

### Core Flow

```
User copies text
    ↓ (every 200-500ms, background process checks)
Background process detects clipboard change
    ↓
Scans content against 20+ sensitive patterns (instant)
    ↓
Matches found? → Severity assigned (CRITICAL/HIGH/MEDIUM)
    ↓
Toast notification appears (bottom-right, 5 second auto-dismiss)
    ├─ User ignores → dismissed, clipboard intact
    ├─ User clicks → modal opens
    │   ├─ Shows full copied text
    │   ├─ Highlights sensitive portions in red
    │   ├─ Shows pattern type + severity
    │   └─ Options: [Allow & Paste] [Block] [Edit]
    └─ User chooses action
        ├─ Allow → clipboard unchanged, can paste
        ├─ Block → clipboard cleared, paste prevented
        └─ Edit → redact sensitive data, copy safe version
```

### User Experience

- **Non-blocking:** Notification appears but doesn't prevent paste immediately
- **User agency:** Users can override warnings (logged for audit)
- **Transparent:** Users see exactly what was detected and why

---

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────┐
│        System (Windows/Mac/Linux)       │
├─────────────────────────────────────────┤
│                                         │
│  ┌───────────────────────────────────┐  │
│  │    Tauri Desktop Application      │  │
│  ├───────────────────────────────────┤  │
│  │                                   │  │
│  │  Frontend (React)                 │  │
│  │  ├─ Toast notifications           │  │
│  │  ├─ Expandable modal              │  │
│  │  ├─ Settings panel                │  │
│  │  ├─ Audit log viewer              │  │
│  │  └─ System tray UI                │  │
│  │                                   │  │
│  ├───────────────────────────────────┤  │
│  │                                   │  │
│  │  Backend (Rust)                   │  │
│  │  ├─ Clipboard listener            │  │
│  │  ├─ Pattern matching engine       │  │
│  │  ├─ Decision logic                │  │
│  │  ├─ Audit logger (SQLite)         │  │
│  │  └─ IPC bridge to React           │  │
│  │                                   │  │
│  │  Storage (SQLite)                 │  │
│  │  ├─ Audit logs                    │  │
│  │  ├─ User config/allowlists        │  │
│  │  └─ Rule cache                    │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ↕ OS Clipboard (monitored)             │
│  ↕ All Applications (Windows, Office,   │
│    VS Code, Slack, ChatGPT, Terminal)   │
│                                         │
└─────────────────────────────────────────┘
         ↓ (Optional, Phase 2+)
    ┌──────────────────┐
    │  Backend Server  │
    │ (Node/Rust)      │
    │ ├─ Audit logs    │
    │ ├─ Rule mgmt     │
    │ ├─ Dashboard     │
    │ └─ Compliance    │
    └──────────────────┘
```

### Component Breakdown

**Backend (Rust):**

- Clipboard listener (arboard crate, platform-specific)
- Change detection (hashing to avoid re-scanning)
- Pattern matching engine (regex library)
- Audit logger (SQLite)
- IPC bridge (Tauri commands + events)
- System tray integration

**Frontend (React + TypeScript):**

- Toast notification system
- Expandable modal with highlighted text
- Settings & configuration panel
- Audit log viewer
- System tray icon

**Storage (SQLite):**

- Audit logs (what, when, where, severity)
- User preferences (enable/disable, sensitivity level)
- Allowlist/blocklist entries
- Config snapshots

---

## Tech Stack

### Why Tauri?

- **Lightweight:** ~50MB footprint (vs 150MB+ Electron)
- **Performant:** Rust backend, fast pattern matching
- **Security:** No embedded Node.js, smaller attack surface
- **Enterprise-friendly:** Easier to pass security audits
- **Always-on:** Low resource overhead for background process

### Technology Choices

| Layer                 | Technology            | Rationale                                                |
| --------------------- | --------------------- | -------------------------------------------------------- |
| **Desktop Framework** | Tauri                 | Lightweight, Rust-powered, perfect for always-on process |
| **Frontend**          | React 18 + TypeScript | Standard, large ecosystem, component-based UI            |
| **Styling**           | Tailwind CSS          | Rapid prototyping, enterprise look-and-feel              |
| **Backend**           | Rust                  | Performance, safety, pattern matching speed              |
| **Clipboard**         | arboard               | Cross-platform, well-maintained                          |
| **Async Runtime**     | Tokio                 | Non-blocking clipboard monitoring                        |
| **Pattern Matching**  | regex crate           | Fast, safe, standard Rust                                |
| **Database**          | SQLite                | Lightweight, file-based, zero-config                     |
| **IPC**               | Tauri commands/events | Built-in, type-safe                                      |
| **Build Tool**        | Vite                  | Fast bundling, HMR for React                             |
| **Testing**           | Rust tests + Jest     | Unit tests + integration tests                           |
| **CI/CD**             | GitHub Actions        | Free, built-in for GitHub repos                          |

### Dependencies Summary

**Rust (`src-tauri/Cargo.toml`):**

```toml
tauri = "1.x"
tokio = "1.x"
regex = "1.x"
arboard = "3.x"
serde = "1.x"
serde_json = "1.x"
sqlx = "0.7.x" (or rusqlite)
chrono = "0.4.x"
```

**Node (`package.json`):**

```json
{
  "dependencies": {
    "react": "^18.x",
    "typescript": "^5.x",
    "@tauri-apps/api": "^1.x",
    "tailwindcss": "^3.x",
    "shadcn-ui": "^0.x"
  },
  "devDependencies": {
    "vite": "^4.x",
    "@vitejs/plugin-react": "^4.x"
  }
}
```

---

## Detection Layer

### Strategy: Pattern-Based + Entropy Hybrid

```
Input (clipboard text)
    ↓
[Pattern Matching] (regex, fast, 85% coverage)
    ├─ Matches found → Severity assigned → Return result
    └─ No matches → [Entropy Check] (secondary layer)
        ├─ High entropy + long string → Flag as MEDIUM
        └─ Normal → Allow
```

### Why This Approach

- **Pattern matching**: Catches known formats (API keys, DB URIs, passwords)
- **Entropy check**: Catches unknown secrets (internal tokens, custom formats)
- **No ML**: Avoids complexity, false positives, opacity
- **Fast**: Rust regex is milliseconds, no model inference

### Pattern Categories (MVP v1.0)

#### CRITICAL Severity

- AWS Access Keys (`AKIA[0-9A-Z]{16}`)
- AWS Secret Keys (`aws_secret_access_key = ...`)
- Database Connection Strings (`postgresql://user:pass@host:port/db`)
- API Keys (Stripe: `sk_live_*`, OpenAI: `sk-*`)
- OAuth/Bearer Tokens (`Authorization: Bearer ...`)
- JWT Tokens (`eyJ[A-Za-z0-9_-]+\.eyJ...`)
- Private Keys (RSA, SSH: `-----BEGIN PRIVATE KEY-----`)
- Passwords in plain text (`password = "..."`)

#### HIGH Severity

- Credit Cards (Visa, Mastercard, Amex)
- Social Security Numbers (`XXX-XX-XXXX`)
- Email + password combos
- Cloud credentials (Google Cloud, Azure)
- Webhook secrets
- Internal URLs with `/admin`, `/internal`, `/api` paths

#### MEDIUM Severity

- Generic high-entropy strings (30+ chars, mixed case/numbers/symbols)
- Phone numbers
- Employee IDs in standard format

### Pattern Configuration (JSON)

Patterns are loaded from `config/patterns.json`:

```json
{
  "patterns": [
    {
      "id": "aws_access_key",
      "name": "AWS Access Key",
      "severity": "CRITICAL",
      "patterns": ["AKIA[0-9A-Z]{16}"],
      "enabled": true
    },
    {
      "id": "api_key_stripe",
      "name": "Stripe API Key",
      "severity": "CRITICAL",
      "patterns": ["sk_(live|test)_[a-zA-Z0-9]{20,}"],
      "enabled": true
    },
    {
      "id": "db_uri",
      "name": "Database Connection String",
      "severity": "CRITICAL",
      "patterns": [
        "(?:postgresql|mysql|mongodb|oracle)://[\\w]+:[\\w]+@[\\w.]+",
        "Server=.*?;.*?Password=.*?"
      ],
      "enabled": true
    }
  ],
  "allowlist": ["test_", "dummy_", "example_", "fake-"],
  "entropy_threshold": 3.5
}
```

### Implementation Details

**Rust Pattern Matcher Module** (`src-tauri/src/patterns.rs`):

```rust
pub struct PatternMatch {
    pub pattern_id: String,
    pub pattern_name: String,
    pub severity: String,
    pub matched_text: String,
    pub byte_range: (usize, usize),
}

pub fn scan_clipboard(text: &str, config: &PatternConfig)
    -> Vec<PatternMatch> {
    // Returns all matches with positions for highlighting
}
```

---

## UI/UX Flows

### Toast Notification (Bottom-Right)

**Appearance:**

```
┌─────────────────────────────────┐
│ ⚠️  Sensitive Data Detected     │
│ API Key found                   │
│ [Details]                       │
└─────────────────────────────────┘
```

**Behavior:**

- Appears instantly (~50-100ms after clipboard change)
- Shows for 5 seconds (user can dismiss earlier)
- Click anywhere → expands to modal
- Click [×] → dismisses
- Stacks if multiple pastes happen quickly

**Size:** ~300px × 80px  
**Position:** Bottom-right corner, 20px from edges  
**Animation:** Slide in from right (300ms), fade out on dismiss  
**Color:** Warning palette (yellow/orange border, light background)

---

### Expandable Modal

**Appearance:**

```
┌────────────────────────────────────────────────────┐
│ Sensitive Data Detected                    [×]     │
├────────────────────────────────────────────────────┤
│                                                    │
│ Severity: CRITICAL                                │
│ Pattern: Stripe Live API Key                      │
│                                                    │
│ ┌────────────────────────────────────────────┐    │
│ │ Copied text:                               │    │
│ │                                            │    │
│ │ export const apiKey =                      │    │
│ │ "sk_live_4eC39HqLyjWDarhtT657j41F"        │    │
│ │                                            │    │ (highlighted red)
│ │ export const endpoint =                    │    │
│ │ "https://api.stripe.com/v1"                │    │
│ │                                            │    │
│ └────────────────────────────────────────────┘    │
│                                                    │
│ [Allow & Paste] [Block] [Edit]                   │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Size:** ~600px × 500px (resizable)  
**Position:** Centered on screen  
**Font:** Monospace (Courier/Monaco) for code  
**Highlighting:** Red background on matched text

**Button Actions:**

- **[Allow & Paste]**: Clipboard remains intact, user can paste normally (action logged)
- **[Block]**: Clipboard is cleared, paste is prevented (action logged)
- **[Edit]**: Text becomes editable, user can redact (e.g., "sk*live*..." → "sk*live*\*\*\*\*"), copy redacted version

---

### Settings Panel

Accessible via system tray or app window:

```
Safe Paste Settings
├─ General
│  ├─ ☑ Enable monitoring (on/off)
│  ├─ Sensitivity level: [Strict] [Moderate] [Loose]
│  ├─ Action on critical: [Ask] [Block] [Allow]
│  └─ Auto-dismiss timeout: 5 seconds
│
├─ Notifications
│  ├─ ☑ Show toast notifications
│  ├─ ☑ Show system notifications
│  └─ ☑ Sound on detection
│
├─ Allowlist
│  ├─ Patterns to ignore:
│  │  ├─ [ ] test_*
│  │  ├─ [ ] dummy_*
│  │  ├─ [ ] example_*
│  │  └─ [+ Add custom]
│  └─ Domains to ignore:
│     ├─ [ ] internal.company.com
│     ├─ [ ] github.com/public
│     └─ [+ Add]
│
├─ App-Specific Rules
│  ├─ ChatGPT: Strict (always warn)
│  ├─ Claude: Strict (always warn)
│  ├─ Slack: Moderate (warn on CRITICAL only)
│  ├─ Internal Jira: Loose (minimal warnings)
│  └─ [+ Add app]
│
├─ Audit Log
│  └─ [View audit log] [Clear logs] [Export CSV]
│
└─ About & Updates
   ├─ Version: 1.0.0
   ├─ Last updated: [date]
   └─ [Check for updates]
```

---

### System Tray Icon

**Idle State:**

- Gray clipboard icon

**When Sensitive Data Detected:**

- Icon with red dot/badge
- Tooltip shows latest detection
- Click → shows notification history + settings

---

## Features

### MVP (v1.0) - Core Protection

- [x] System-wide clipboard monitoring (Windows, Mac, Linux)
- [x] 20+ sensitive pattern detection
- [x] Toast notifications (bottom-right)
- [x] Expandable modal with highlighted text
- [x] User actions: Allow, Block, Edit
- [x] Local audit logging (SQLite)
- [x] Settings panel (enable/disable, sensitivity)
- [x] System tray integration
- [x] Allowlist/blocklist basic support
- [x] Config file (patterns, rules)

### Phase 2 (v1.1) - IT Enablement

- [ ] Centralized backend dashboard
- [ ] Cloud config sync (IT pushes rules to all machines)
- [ ] Aggregated audit logs (view across org)
- [ ] Custom pattern management (IT admin UI)
- [ ] Deployment via MDM (Apple Business Manager, Intune)
- [ ] Compliance reporting (SOC 2, HIPAA templates)
- [ ] Forced policy enforcement (users can't override)
- [ ] Alert integration (Slack, email on critical events)

### Phase 3 (v1.2+) - Advanced

- [ ] Machine learning for false positive reduction
- [ ] SIEM integration (Splunk, ELK, Datadog)
- [ ] Analytics dashboard (trends, hot spots, departments)
- [ ] Browser extension (for browser-specific apps)
- [ ] Clipboard history viewer (searchable)
- [ ] Multi-device sync (work across machines)
- [ ] API for third-party integrations

---

## Team & Workload

### 5-Person Team Structure

**Person 1: Rust Backend Lead**

- Clipboard listener + change detection
- IPC bridge (Tauri commands/events)
- Audit logger (SQLite)
- System tray integration
- Performance optimization

**Person 2: Pattern Engine Lead**

- Regex pattern library (20+ patterns)
- Severity calculator
- Config loader (JSON patterns)
- Pattern highlighting logic
- Allowlist/blocklist engine

**Person 3: React/UI Lead**

- Toast notification component
- Modal/panel layout
- Text highlighting + rendering
- Action button handlers
- System tray icon UI

**Person 4: Settings & Config UI**

- Settings panel (enable/disable, sensitivity)
- Audit log viewer (table, search, export)
- Pattern management (view/edit/add)
- Allowlist/blocklist UI
- App-specific rules

**Person 5: Testing & DevOps**

- Unit tests (pattern matching edge cases)
- Integration tests (Rust ↔ React)
- E2E tests (copy → notification → action)
- Platform testing (Windows/Mac/Linux)
- Build pipeline (GitHub Actions)
- Signed installers + release automation

### Dependency Graph

```
Person 1 (Clipboard)
├─ Defines: IPC message format
├─ Blocks: Person 3 (until event structure set)
└─ Blocks: Person 4 (until SQLite schema set)

Person 2 (Patterns)
├─ Defines: Pattern config format
└─ Blocks: Person 4 (until pattern structure set)

Person 3 (UI)
├─ Depends on: Person 1 (IPC events)
└─ Can mock initially

Person 4 (Config/Settings)
├─ Depends on: Person 1 (SQLite schema)
└─ Depends on: Person 2 (pattern format)

Person 5 (Testing)
├─ Depends on: All components
└─ Runs in parallel once testable
```

### Work Allocation by Sprint

**Sprint 1 (Week 1): Setup + Core**

| Person | Task                               | Days |
| ------ | ---------------------------------- | ---- |
| 1      | Tauri clipboard listener (arboard) | 3    |
| 1      | Basic IPC to React                 | 2    |
| 2      | Pattern library v1 (20 patterns)   | 3    |
| 2      | Severity calculator                | 2    |
| 3      | Toast + Modal components (mock)    | 4    |
| 4      | Config schema planning (meetings)  | 1    |
| 5      | CI/CD setup (GitHub Actions)       | 3    |

**Sprint 2 (Week 2): Integration**

| Person | Task                      | Days |
| ------ | ------------------------- | ---- |
| 1      | Audit logger (SQLite)     | 3    |
| 1      | System tray icon          | 2    |
| 2      | Hot-reload pattern config | 3    |
| 3      | Connect UI to real events | 3    |
| 3      | Text highlighting logic   | 2    |
| 4      | Settings UI + config R/W  | 5    |
| 5      | Unit tests (patterns)     | 3    |
| 5      | E2E framework setup       | 2    |

**Sprint 3 (Week 3): Polish + Testing**

| Person | Task                           | Days |
| ------ | ------------------------------ | ---- |
| 1      | Performance optimization       | 2    |
| 2      | Edge cases + fine-tuning       | 2    |
| 3      | Animation polish               | 2    |
| 4      | Audit log viewer               | 2    |
| 5      | Cross-platform testing         | 3    |
| 5      | Build + sign installers        | 3    |
| All    | Integration testing + bugfixes | 3    |

**Sprint 4 (Week 4): Release**

| Person | Task                          | Days |
| ------ | ----------------------------- | ---- |
| All    | Final QA + bug fixes          | 3    |
| 5      | Release candidate build       | 1    |
| 5      | Documentation + release notes | 2    |
| All    | Launch + monitoring           | 1    |

---

## Timeline

### Critical Path

```
Week 1: Tauri setup + clipboard listener + core UI components
  └─ Blocker: None (parallel work possible)

Week 2: Integration of components + pattern matching
  └─ Blocker: Person 1 must define IPC format early

Week 3: Polish + cross-platform testing
  └─ Blocker: All components must be functional

Week 4: Release candidate + deployment
  └─ Blocker: Installer signing + testing
```

### Key Milestones

- **End of Week 1:** Tauri scaffolding complete, clipboard listener working, toast appears
- **End of Week 2:** Full integration, modal expandable, patterns matching, settings functional
- **End of Week 3:** All platforms tested, installers built, polished animations
- **End of Week 4:** MVP shipped (Windows, Mac, Linux installers signed + available)

### Assumptions

- Team available full-time
- Windows, Mac, Linux dev machines available
- Code signing certificates for installer distribution
- GitHub Actions free tier sufficient

---

## Setup & Development

### Prerequisites

- Rust 1.70+
- Node.js 18+
- npm or yarn
- Git

### Initial Setup

**1. Generate Tauri project scaffold:**

```bash
npm create tauri-app@latest -- \
  --project-name clipboard-guardian \
  --package-manager npm \
  --ui react \
  --typescript \
  --ci none
```

**2. Install dependencies:**

```bash
cd clipboard-guardian
npm install
```

**3. Add Rust dependencies:**

```bash
# Edit src-tauri/Cargo.toml and add:
tauri = "1.x"
tokio = { version = "1.x", features = ["full"] }
regex = "1.x"
arboard = "3.x"
serde = { version = "1.x", features = ["derive"] }
serde_json = "1.x"
sqlx = { version = "0.7.x", features = ["runtime-tokio-native-tls", "sqlite"] }
chrono = "0.4.x"
```

**4. Run dev environment:**

```bash
npm tauri dev
```

Opens dev window with hot reload for React code.

### Folder Structure (Post-Setup)

```
clipboard-guardian/
├─ docs/                          # Documentation
│  ├─ ARCHITECTURE.md
│  ├─ API.md
│  ├─ DEPLOYMENT.md
│  └─ CONTRIBUTING.md
│
├─ src/                           # React frontend
│  ├─ components/
│  │  ├─ Notification.tsx
│  │  ├─ Modal.tsx
│  │  ├─ HighlightedText.tsx
│  │  ├─ SystemTray.tsx
│  │  └─ ActionButtons.tsx
│  ├─ pages/
│  │  ├─ Settings.tsx
│  │  ├─ AuditLog.tsx
│  │  └─ Dashboard.tsx
│  ├─ hooks/
│  │  ├─ useClipboardEvent.ts
│  │  ├─ useConfig.ts
│  │  └─ useAuditLog.ts
│  ├─ types/
│  │  └─ index.ts
│  ├─ App.tsx
│  ├─ App.css
│  └─ main.tsx
│
├─ src-tauri/                     # Rust backend
│  ├─ src/
│  │  ├─ main.rs                 # Entry point
│  │  ├─ clipboard.rs            # Clipboard listener
│  │  ├─ patterns.rs             # Pattern matching
│  │  ├─ scanner.rs              # Scan orchestration
│  │  ├─ audit.rs                # Audit logging
│  │  ├─ ipc.rs                  # IPC definitions
│  │  ├─ config.rs               # Config loading
│  │  └─ lib.rs
│  ├─ Cargo.toml
│  └─ tauri.conf.json
│
├─ config/                        # Configuration files
│  ├─ patterns.json              # Pattern definitions
│  ├─ default-config.json        # Default settings
│  └─ allowlist.json             # Default allowlist
│
├─ tests/                         # Tests
│  ├─ patterns.rs                # Unit tests (Rust)
│  ├─ integration.rs             # Integration tests
│  └─ e2e/
│     └─ clipboard.test.ts       # E2E tests (Playwright)
│
├─ .github/
│  └─ workflows/
│     ├─ build.yml              # Build on push
│     ├─ release.yml            # Release workflow
│     └─ test.yml               # Test workflow
│
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ tailwind.config.js
├─ PROJECT_PLAN.md              # This file
├─ README.md
├─ CONTRIBUTING.md
└─ LICENSE
```

### Development Workflow

**Starting development:**

```bash
npm tauri dev
```

**Running tests:**

```bash
# Rust tests
cargo test

# React tests
npm test

# E2E tests (Playwright)
npx playwright test
```

**Building for release:**

```bash
npm tauri build
```

Outputs installers:

- Windows: `.msi` + `.exe`
- Mac: `.dmg` + `.app`
- Linux: `.deb` + `.rpm`

---

## Key Decisions & Rationale

### Decision 1: Tauri over Electron

**Why:** Desktop app (not extension), lightweight, Rust safety  
**Trade-off:** Smaller ecosystem vs massive size reduction + security

### Decision 2: Pattern-based + Entropy (no ML)

**Why:** Fast, deterministic, explainable, offline  
**Trade-off:** Doesn't learn custom patterns automatically vs low false positives

### Decision 3: Local-first with optional backend

**Why:** Works standalone, enterprise can add backend later  
**Trade-off:** Phase 2 effort vs no vendor lock-in

### Decision 4: Toast notification + expandable modal (not blocking)

**Why:** Non-intrusive, gives users control, less annoying  
**Trade-off:** Doesn't force prevention vs user autonomy

### Decision 5: SQLite audit logging

**Why:** Zero-config, file-based, can be exported to backend later  
**Trade-off:** Limited query power on-device vs simplicity for MVP

---

## Success Metrics

| Metric                          | Target                    | How to Measure                   |
| ------------------------------- | ------------------------- | -------------------------------- |
| **Sensitive pattern detection** | >95% accuracy on test set | Regex pattern test suite         |
| **False positive rate**         | <2% on normal code        | User testing with real codebases |
| **Detection latency**           | <100ms from copy          | Performance benchmark            |
| **UI responsiveness**           | <50ms for modal open      | Browser dev tools                |
| **App footprint**               | <100MB                    | File size post-install           |
| **Memory usage**                | <50MB idle                | System monitor                   |
| **CPU usage**                   | <1% background            | System monitor                   |
| **Cross-platform**              | Windows, Mac, Linux       | Installer testing                |
| **Pattern coverage**            | 20+ sensitive types       | Pattern library coverage         |

---

## Next Steps

### Immediate (This Week)

1. [ ] Create GitHub repo from Tauri scaffold
2. [ ] Team kickoff meeting (30 min)
   - Agree on data structures (IPC payload, SQLite schema, config format)
   - Assign code review pairs
   - Establish communication channels
3. [ ] Set up GitHub Actions CI/CD template
4. [ ] Person 1 starts clipboard listener POC
5. [ ] Person 2 starts pattern library

### Week 1 Deliverables

1. [ ] Working clipboard listener (Person 1)
2. [ ] IPC events flowing to React (Person 1)
3. [ ] Toast notification appears (Person 3)
4. [ ] Pattern library v1 (Person 2)
5. [ ] Basic settings panel (Person 4)
6. [ ] CI/CD pipeline working (Person 5)

### Week 2 Deliverables

1. [ ] Modal opens with full text (Person 3)
2. [ ] Text highlighting works (Person 3)
3. [ ] Audit logger functional (Person 1)
4. [ ] Severity levels working (Person 2)
5. [ ] Settings save to SQLite (Person 4)
6. [ ] Unit tests written (Person 5)

### Week 3 Deliverables

1. [ ] All platforms tested (Windows, Mac, Linux)
2. [ ] Animations polished
3. [ ] Performance optimized
4. [ ] Code signed for distribution
5. [ ] E2E tests passing
6. [ ] Release candidate built

### Week 4 Deliverables

1. [ ] Final QA complete
2. [ ] Release notes written
3. [ ] Installers distributed
4. [ ] Documentation published
5. [ ] Post-launch monitoring

---

## Questions to Resolve

1. **Should we block clipboard on CRITICAL severity?** (Decision: No, warn + let user decide)
2. **Can users suppress patterns permanently?** (Decision: Yes, via allowlist)
3. **Is centralized backend required for MVP?** (Decision: No, Phase 2)
4. **Should this run on startup automatically?** (Decision: Yes, installed + enabled by default)
5. **How to handle false positives from legitimate code?** (Decision: Allowlist + Edit button)

---

## References & Resources

- **Tauri Docs:** https://tauri.app/v1/guides/
- **Regex Crate:** https://docs.rs/regex/
- **Arboard (Clipboard):** https://docs.rs/arboard/
- **Tauri Plugin Guide:** https://tauri.app/v1/guides/features/
- **SQLx Documentation:** https://github.com/launchbadge/sqlx
- **Shadcn/UI Components:** https://ui.shadcn.com/

---

## Appendix

### A. Pattern Examples (Full List)

See `config/patterns.json` for complete list of 20+ patterns.

### B. IPC Message Format

**Event: clipboard-scanned**

```typescript
{
  severity: "CRITICAL" | "HIGH" | "MEDIUM",
  patterns: [
    {
      id: string,
      name: string,
      severity: string,
      matched_text: string,
      byte_range: [number, number]
    }
  ],
  full_text: string,
  timestamp: string
}
```

### C. SQLite Schema

**Table: audit_logs**

```sql
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY,
  timestamp DATETIME,
  severity TEXT,
  patterns TEXT, -- JSON array
  matched_count INTEGER,
  user_action TEXT, -- "allow", "block", "edit"
  app_name TEXT,
  full_text_hash TEXT
);
```

### D. Config File Format

See `config/patterns.json` and `config/default-config.json`

---

**Document Version:** 1.0  
**Last Updated:** July 2026  
**Author:** Team  
**Status:** Ready for Development
