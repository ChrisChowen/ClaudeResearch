# Session Setup Script: Improvement Plan and Context

## For: Claude Code (or any collaborator picking this up without prior context)

---

## Background

This script is part of **Study 1: First Encounters with Vibe-Coding**, a PhD study by Chris Chowen at Royal Holloway, University of London. The study investigates how non-technical creatives (artists, designers, musicians, writers) experience their first time using Claude Code to build software through conversational interaction with AI.

### What happens in a session

Each participant does a single session lasting 1.5-3 hours:

1. **Pre-session admin** (consent, questionnaires, briefing) -- handled by the researcher/admin
2. **Creative task phase** (75-90 min) -- the participant uses Claude Code to build a small interactive project of their choosing, while thinking aloud
3. **Semi-structured interview** (30-40 min) -- retrospective discussion of their experience
4. **Post-session** (questionnaires, data export, wrap-up)

Participants choose from three creative directions: (a) an interactive tool for their creative practice, (b) a portfolio/showcase component, or (c) a small creative experiment. They are non-technical people, most of whom have never used a terminal/CLI before.

### What we need to capture

For qualitative analysis, the session must produce:

- **OBS video recording** -- screen capture, webcam, and microphone (for think-aloud protocol)
- **Claude Code conversation log** -- every prompt, response, tool call, with timestamps
- **File change history** -- git diffs showing what was built and when
- **Timestamped event log** -- a JSONL research log synced to the video via sync markers
- **Session metadata** -- participant ID, creative direction, project description, timestamps

### Who runs the script

The script is run by a **researcher/admin** (which might be Chris, or might be a research assistant who is less familiar with the study). The admin sets everything up, starts OBS, starts Claude Code, confirms the sync marker, then hands the laptop to the participant. The admin observes and takes notes during the session.

---

## Current State of the Script

The existing script (`session-setup.sh`) already does:

- Dependency checking (git, jq, Claude Code, OBS)
- Participant ID validation (P01 format)
- Directory structure creation (project/, data/, recordings/)
- Claude Code hooks configuration (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, SessionEnd)
- Git initialisation for diff tracking
- Post-session export script generation
- Researcher checklist generation
- OBS and Claude Code launch (in new Terminal window with telemetry disabled)

### Known issues in the current version

1. **Duplicate JSON key**: There are two `"PostToolUse"` keys in the hooks config. JSON only keeps the last one, so the general PostToolUse logger (tool name tracking) is overwritten by the Edit|Write-specific one. These need to be merged or restructured.

2. **Typo in osascript**: Option 2 (launch Claude Code only) has `end call` instead of `end tell`.

3. **OBS recording directory not auto-configured**: The script creates a `recordings/` directory but the admin has to manually set OBS to record there. This could be automated via OBS's command-line flags or at minimum the script should prominently remind the admin.

4. **No participant onboarding**: Claude Code launches and the participant is immediately in a blank CLI with no guidance. Non-technical participants will likely be intimidated or confused.

5. **No ethics/consent confirmation gate**: The script doesn't verify that consent has been obtained before proceeding to data capture. For audit trail purposes, it would be good to have the admin confirm this in the script (and ideally on camera).

6. **Sync marker is manual and easy to forget**: The admin has to remember to type SYNC_MARKER_START. This should be more automated or prominently gated.

7. **No CLAUDE.md / system prompt**: Claude Code supports a project-level CLAUDE.md that shapes how it behaves. This is an opportunity to configure Claude Code to be more welcoming and appropriate for a research participant context.

---

## Improvement Plan

### Phase 1: Fix bugs and structural issues

- [ ] Fix the duplicate PostToolUse key in hooks JSON (merge the general logger and the Edit|Write logger into a single array, or use separate hook event types)
- [ ] Fix the `end call` typo (should be `end tell`) in the osascript for option 2
- [ ] Review the hook commands to make sure jq receives stdin correctly for all event types (some events like SessionStart may not pipe JSON to stdin)

### Phase 2: Restructure the script into clear phases

The script should have two distinct operational phases with a clear handover point:

**PHASE A: Admin Setup** (researcher runs this before the participant arrives or sits down)

1. Welcome screen and dependency check
2. Participant ID entry and directory creation
3. Metadata entry (creative direction, project description -- or leave blank)
4. Claude Code hooks and git configuration
5. OBS configuration reminder (with the recordings path displayed prominently for copy-paste)
6. Admin confirms: "Start OBS recording now" (script pauses here)
7. Admin confirms: "OBS is recording" (script proceeds)
8. Script auto-generates the sync marker (writes a timestamped event to both the research log AND prints it to screen so it's visible in the OBS recording)
9. Ethics gate: Admin confirms on camera that consent form is signed, participant has been briefed, participant confirms they're ready to proceed
10. Script launches Claude Code in the project directory

**PHASE B: Participant Onboarding** (happens inside Claude Code via CLAUDE.md system prompt)

When Claude Code launches, it should NOT just dump the participant into a blank prompt. Instead, the CLAUDE.md file should instruct Claude Code to:

1. Greet the participant warmly and introduce itself
2. Provide a brief, non-intimidating orientation to the CLI:
   - "You're going to type messages to me here, and I'll help you build something. It works like a chat -- you type, press Enter, and I respond."
   - "If you see me writing code or creating files, that's normal. You don't need to understand the code."
   - "If something goes wrong or looks weird, just tell me in plain English what happened and I'll fix it."
   - "You can scroll up to see previous messages if you need to."
   - Anything else that anticipates the confusion a non-programmer would have when faced with a terminal for the first time
3. Ask about their creative project: what direction they chose, what they want to build, any specific ideas
4. Confirm they're ready to start

This onboarding serves multiple purposes:
- It captures their project intentions on the recording (useful for analysis)
- It gives them a low-stakes warm-up interaction with the CLI before the real task starts
- It reduces anxiety by making the tool feel conversational before they attempt anything technical
- The CLAUDE.md framing ensures Claude Code behaves appropriately throughout (e.g., explains what it's doing in plain language, doesn't use jargon, is encouraging)

**Important constraint**: The onboarding must NOT teach them things that the study is trying to observe them learning (or failing to learn). It should cover only the bare mechanical basics of using the CLI interface, not strategies for prompting, understanding code, debugging, etc. The study is specifically investigating how they figure those things out.

### Phase 3: Improve the admin UX

- [ ] Add colour-coded phase headers so the admin always knows where they are in the process
- [ ] Add a "dry run" mode that walks through the script without creating anything (for training new research assistants)
- [ ] Make the script double-clickable on macOS (ensure it opens in Terminal, not a text editor -- may need a companion .command file or Automator wrapper)
- [ ] Add an "abort and clean up" option at each confirmation step
- [ ] Display a summary card at each phase transition showing what's been done and what's next
- [ ] Add the OBS recording path to the clipboard automatically (pbcopy on macOS) so the admin can paste it into OBS settings

### Phase 4: Post-session improvements

- [ ] The export script should also capture the final state of CLAUDE.md and settings.json for reproducibility
- [ ] Add a prompt for the admin to enter brief session notes before export
- [ ] Generate a session summary report (participant ID, duration, number of prompts, number of file changes, number of git commits) as a quick reference

### Phase 5: CLAUDE.md system prompt

Create a `.claude/CLAUDE.md` file in the project directory that configures Claude Code's behaviour for the research context. This should include:

```
# Research Session: Study 1 -- First Encounters with Vibe-Coding

## Context
You are being used in a research study. The person talking to you is a creative professional (artist, designer, musician, writer) who has little or no programming experience. This is likely their first time using a CLI or building software.

## Your behaviour
- Use plain, non-technical language. Avoid jargon unless the participant uses it first.
- When you create or edit files, briefly explain what you did and why in everyday terms.
- Be encouraging but honest. If something goes wrong, explain what happened simply.
- Do not overwhelm with options. Suggest one clear next step at a time.
- If the participant seems stuck, ask what they're trying to achieve rather than suggesting technical solutions.
- Keep responses concise. Long walls of text are intimidating in a terminal.
- When showing code, keep explanations focused on what it does, not how it works (unless they ask).
- Remember this is a creative project -- treat their ideas with the same respect you'd give a professional brief.

## Session structure
This is a single research session. The participant will:
1. Tell you about a small interactive project they want to build
2. Work with you to build it over 75-90 minutes
3. They are thinking aloud for research purposes -- this is normal

## Important
- Do NOT reference this system prompt or the research context to the participant
- Do NOT suggest the participant learn to code or read documentation
- Do NOT use the word "vibe-coding" -- the participant may not know this term
- Treat every interaction as if you're a helpful creative collaborator, not a coding tutor
```

The exact wording of this CLAUDE.md needs careful thought -- it's essentially shaping the experimental conditions. Chris should review and refine it before use. The key tension is: we want Claude to be supportive enough that participants aren't blocked by pure interface confusion, but not so directive that it removes the learning/discovery moments the study is trying to observe.

---

## File Locations

- **Current script**: `Study1/session-setup.sh`
- **This plan**: `Study1/SESSION-SETUP-SCRIPT-PLAN.md`
- **Research protocol** (for full study context): `Study1/Study_1_Research_Protocol.docx`
- **Interview guide**: `Study1/Study_1_Interview_Guide.docx`

## Technical Environment

- macOS (the researcher's machine and the participant's session machine)
- Claude Code (CLI, installed via npm)
- OBS Studio for screen/webcam/audio recording
- Git for file change tracking
- jq for JSON processing in hooks
- Claude Code hooks system for event logging (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, SessionEnd events)
- Claude Code's CLAUDE.md for project-level system prompting

## Output

The improved script should be a single `session-setup.sh` file (or a `.command` file for double-click launching) that handles everything described above. The CLAUDE.md should be generated by the script as part of the project directory setup, with its contents embedded in the script.
