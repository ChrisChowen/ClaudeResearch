# Claude Research Session Setup

Session setup and real-time monitoring tool for **Study 1: First Encounters with Vibe-Coding** — a qualitative research study exploring how non-technical creative practitioners interact with AI-assisted coding tools.

## What This Does

A Node.js web application that replaces manual bash scripting for research session management. It provides:

- **Admin Dashboard** — A 7-step wizard that guides the researcher through session setup (dependency checks, participant config, OBS recording, sync markers, ethics confirmation, Claude Code launch, and device handover)
- **Participant Page** — A friendly, non-technical interface shown on the participant's screen with optional onboarding, a session timer, and quick-reference tips
- **Researcher Monitor** — A live dashboard (accessed from a separate device via local network) showing real-time event feeds, session stats, and quick actions

### Physical Setup

The tool is designed for a single-laptop research setup:

1. Researcher runs the admin wizard on the study laptop
2. Claude Code launches in a new Terminal window on that laptop
3. The admin page provides a network URL + QR code for the researcher monitor
4. Researcher opens the monitor on their phone/tablet/second laptop
5. The admin page transitions to the participant page on the study laptop
6. The laptop is handed to the participant

## Prerequisites

- **Node.js** >= 18
- **git** (for project version tracking)
- **jq** (for Claude Code hooks)
- **Claude Code** (`npm install -g @anthropic-ai/claude-code`)
- **OBS Studio** (optional, for screen/webcam recording — WebSocket control requires OBS 28+)

## Quick Start

```bash
npm install
npm start
```

Or double-click **`Start Session Setup.command`** to launch without using the terminal.

The admin dashboard opens automatically at `http://localhost:3000/admin`.

## OBS Integration

Step 4 of the admin wizard supports two modes:

- **Auto (WebSocket)** — Connects to OBS via its built-in WebSocket server (OBS 28+, port 4455). Automatically sets the recording path, starts/stops recording, and shows a live recording indicator on both the admin dashboard and researcher monitor.
- **Manual** — Fallback mode with checkboxes for researchers who prefer to configure OBS themselves.

To use auto mode, enable the WebSocket server in OBS: **Tools → WebSocket Server Settings → Enable WebSocket server**.

## Session Modes

- **Vanilla** (default) — Out-of-the-box Claude Code with no system prompt or onboarding. The participant interacts with Claude Code exactly as any new user would.
- **Enhanced** — Includes a `CLAUDE.md` system prompt that adapts Claude's behaviour for non-technical participants (plain language, encouraging tone, step-by-step guidance) and shows an onboarding screen before the session begins.

## Project Structure

```
├── server.js                  # Express server, API routes, SSE
├── Start Session Setup.command # Double-click launcher for researchers
├── lib/
│   ├── session.js             # Session lifecycle (create, launch, export)
│   ├── hooks-config.js        # Claude Code hooks configuration
│   ├── claude-md.js           # CLAUDE.md content (enhanced mode)
│   ├── export.js              # Post-session data export
│   └── obs.js                 # OBS WebSocket integration
├── public/
│   ├── admin.html             # 7-step setup wizard
│   ├── participant.html       # Participant-facing page
│   ├── researcher.html        # Live monitoring dashboard
│   ├── css/styles.css         # Shared styles
│   └── js/
│       ├── admin.js           # Setup wizard logic
│       ├── participant.js     # Timer + state management
│       └── researcher.js      # SSE event feed + stats
├── sessions/                  # Created at runtime (gitignored)
├── session-setup.sh           # Legacy bash script (reference)
└── SESSION-SETUP-SCRIPT-PLAN.md
```

## Data Collection

Each session creates a structured directory under `sessions/{PID}/`:

- `project/` — The participant's Claude Code project (git-tracked)
- `project/.claude/settings.json` — Hooks that log every tool use, prompt, and file change
- `data/logs/research-log.jsonl` — Timestamped event log (sync markers, ethics confirmation, researcher notes)
- `data/exports/` — Post-session exports (git diffs, transcripts, summaries)
- `recordings/` — OBS recording output directory

## Real-Time Monitoring

The researcher monitor connects via Server-Sent Events (SSE) to receive live updates from the research log. Events are colour-coded by type (prompts, tool uses, file changes, sync markers, notes) and include running session stats.

## Licence

This tool was built for academic research at Royal Holloway, University of London.
