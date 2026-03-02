#!/bin/bash
# ============================================================================
# Study 1: First Encounters with Vibe-Coding
# Participant Session Setup Script
#
# Chris Chowen - PhD Research, Royal Holloway
#
# This script prepares a complete research environment for a single
# participant session. It creates the project directory, configures
# Claude Code hooks for data capture, initialises git for diff tracking,
# and optionally launches OBS and Claude Code.
#
# Usage:
#   Double-click this file, or run from terminal:
#   ./session-setup.sh
#
# Requirements:
#   - macOS with Homebrew
#   - Claude Code installed (npm install -g @anthropic-ai/claude-code)
#   - OBS Studio installed (optional but recommended)
#   - git installed
#   - jq installed (brew install jq)
# ============================================================================

set -euo pipefail

# --- Configuration -----------------------------------------------------------
# Edit these paths to match your machine

STUDY_ROOT="$HOME/PhD/Studies/Study1"
SESSIONS_DIR="$STUDY_ROOT/sessions"
OBS_APP="/Applications/OBS.app"
CLAUDE_CODE_CMD="claude"

# --- Colours and formatting --------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No colour

divider() {
    echo ""
    echo -e "${CYAN}$(printf '%.0s-' {1..60})${NC}"
    echo ""
}

# --- Welcome -----------------------------------------------------------------

clear
echo ""
echo -e "${BOLD}${BLUE}"
echo "  ================================================================"
echo "  Study 1: First Encounters with Vibe-Coding"
echo "  Participant Session Setup"
echo "  ================================================================"
echo -e "${NC}"
echo ""

# --- Dependency checks -------------------------------------------------------

echo -e "${BOLD}Checking dependencies...${NC}"
echo ""

MISSING_DEPS=0

check_dep() {
    if command -v "$1" &> /dev/null; then
        echo -e "  ${GREEN}OK${NC}  $2"
    else
        echo -e "  ${RED}MISSING${NC}  $2 ($3)"
        MISSING_DEPS=1
    fi
}

check_dep "git" "git" "Install from Xcode command line tools: xcode-select --install"
check_dep "jq" "jq" "brew install jq"
check_dep "$CLAUDE_CODE_CMD" "Claude Code" "npm install -g @anthropic-ai/claude-code"

if [ -d "$OBS_APP" ]; then
    echo -e "  ${GREEN}OK${NC}  OBS Studio"
else
    echo -e "  ${YELLOW}OPTIONAL${NC}  OBS Studio not found at $OBS_APP (screen recording won't auto-launch)"
fi

echo ""

if [ "$MISSING_DEPS" -eq 1 ]; then
    echo -e "${RED}Some required dependencies are missing. Please install them and re-run.${NC}"
    echo ""
    read -n 1 -s -r -p "Press any key to exit..."
    exit 1
fi

# --- Gather session info -----------------------------------------------------

divider
echo -e "${BOLD}Session Information${NC}"
echo ""

# Participant ID
while true; do
    read -r -p "Participant ID (e.g. P01, P02): " PARTICIPANT_ID
    PARTICIPANT_ID=$(echo "$PARTICIPANT_ID" | tr '[:lower:]' '[:upper:]' | xargs)
    if [[ "$PARTICIPANT_ID" =~ ^P[0-9]{2,3}$ ]]; then
        break
    else
        echo -e "${YELLOW}  Please use format P01, P02, ... P16${NC}"
    fi
done

# Check if this participant already has a session
if [ -d "$SESSIONS_DIR/$PARTICIPANT_ID" ]; then
    echo ""
    echo -e "${YELLOW}  Warning: A session directory already exists for $PARTICIPANT_ID${NC}"
    read -r -p "  Overwrite? This will delete existing data. (y/N): " OVERWRITE
    if [[ ! "$OVERWRITE" =~ ^[Yy]$ ]]; then
        echo "  Exiting. No changes made."
        exit 0
    fi
    rm -rf "$SESSIONS_DIR/$PARTICIPANT_ID"
fi

# Session number (usually 1 for Study 1, but allows re-runs)
SESSION_NUM="S01"

# Which creative direction they chose (for metadata)
echo ""
echo "  Creative direction chosen by participant:"
echo "    1) Interactive element for creative practice"
echo "    2) Portfolio or showcase component"
echo "    3) Small creative experiment"
echo ""
read -r -p "  Direction (1/2/3, or press Enter to set later): " DIRECTION_CHOICE

case "$DIRECTION_CHOICE" in
    1) DIRECTION="interactive-tool" ;;
    2) DIRECTION="portfolio-component" ;;
    3) DIRECTION="creative-experiment" ;;
    *) DIRECTION="not-yet-chosen" ;;
esac

# Brief project description
echo ""
read -r -p "  Brief project description (or press Enter to set later): " PROJECT_DESC
PROJECT_DESC="${PROJECT_DESC:-not yet described}"

# --- Create directory structure ----------------------------------------------

divider
echo -e "${BOLD}Creating session environment...${NC}"
echo ""

SESSION_DIR="$SESSIONS_DIR/$PARTICIPANT_ID"
PROJECT_DIR="$SESSION_DIR/project"
DATA_DIR="$SESSION_DIR/data"
RECORDINGS_DIR="$SESSION_DIR/recordings"

mkdir -p "$PROJECT_DIR"
mkdir -p "$PROJECT_DIR/.claude/diffs"
mkdir -p "$DATA_DIR/logs"
mkdir -p "$DATA_DIR/transcripts"
mkdir -p "$DATA_DIR/exports"
mkdir -p "$RECORDINGS_DIR"

echo -e "  ${GREEN}Created${NC}  $SESSION_DIR"
echo -e "  ${GREEN}Created${NC}  $PROJECT_DIR (participant works here)"
echo -e "  ${GREEN}Created${NC}  $DATA_DIR (research data)"
echo -e "  ${GREEN}Created${NC}  $RECORDINGS_DIR (OBS output)"

# --- Write session metadata --------------------------------------------------

TIMESTAMP_START=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TIMESTAMP_LOCAL=$(date +"%Y-%m-%d %H:%M:%S %Z")

cat > "$SESSION_DIR/session-metadata.json" << METADATA
{
    "study": "Study1",
    "participant_id": "$PARTICIPANT_ID",
    "session_number": "$SESSION_NUM",
    "creative_direction": "$DIRECTION",
    "project_description": "$PROJECT_DESC",
    "session_start_utc": "$TIMESTAMP_START",
    "session_start_local": "$TIMESTAMP_LOCAL",
    "researcher": "Chris Chowen",
    "setup_complete": true,
    "notes": ""
}
METADATA

echo -e "  ${GREEN}Created${NC}  session-metadata.json"

# --- Configure Claude Code hooks --------------------------------------------

divider
echo -e "${BOLD}Configuring Claude Code research hooks...${NC}"
echo ""

LOG_FILE="$DATA_DIR/logs/research-log.jsonl"
DIFF_DIR="$PROJECT_DIR/.claude/diffs"

cat > "$PROJECT_DIR/.claude/settings.json" << HOOKS
{
    "hooks": {
        "SessionStart": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": "echo '{\"event\":\"session_start\",\"participant\":\"$PARTICIPANT_ID\",\"ts\":\"'\$(date -u +%Y-%m-%dT%H:%M:%SZ)'\"}' >> '$LOG_FILE'"
                    }
                ]
            }
        ],
        "UserPromptSubmit": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": "jq -c '{event:\"user_prompt\",participant:\"$PARTICIPANT_ID\",ts:(now|todate),prompt_length:(.prompt|length)}' >> '$LOG_FILE'"
                    }
                ]
            }
        ],
        "PreToolUse": [
            {
                "matcher": "",
                "hooks": [
                    {
                        "type": "command",
                        "command": "jq -c '{event:\"tool_use_pre\",participant:\"$PARTICIPANT_ID\",tool:.tool_name,ts:(now|todate)}' >> '$LOG_FILE'"
                    }
                ]
            }
        ],
        "PostToolUse": [
            {
                "matcher": "",
                "hooks": [
                    {
                        "type": "command",
                        "command": "jq -c '{event:\"tool_use_post\",participant:\"$PARTICIPANT_ID\",tool:.tool_name,ts:(now|todate)}' >> '$LOG_FILE'"
                    }
                ]
            }
        ],
        "PostToolUse": [
            {
                "matcher": "Edit|Write",
                "hooks": [
                    {
                        "type": "command",
                        "command": "cd '$PROJECT_DIR' && git add -A 2>/dev/null && DIFF_FILE='$DIFF_DIR/'\$(date +%s)'.diff' && git diff --cached > \"\$DIFF_FILE\" 2>/dev/null && git commit -m 'auto: '\$(date -u +%Y-%m-%dT%H:%M:%SZ) --allow-empty 2>/dev/null; jq -c '{event:\"file_change\",participant:\"$PARTICIPANT_ID\",file:.tool_input.file_path,ts:(now|todate)}' >> '$LOG_FILE'"
                    }
                ]
            }
        ],
        "SessionEnd": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": "echo '{\"event\":\"session_end\",\"participant\":\"$PARTICIPANT_ID\",\"ts\":\"'\$(date -u +%Y-%m-%dT%H:%M:%SZ)'\"}' >> '$LOG_FILE'"
                    }
                ]
            }
        ]
    }
}
HOOKS

echo -e "  ${GREEN}Created${NC}  Claude Code hooks config"
echo "  Logging to: $LOG_FILE"
echo "  Diffs saved to: $DIFF_DIR"

# --- Initialise git ----------------------------------------------------------

echo ""
echo -e "${BOLD}Initialising git repository...${NC}"
echo ""

cd "$PROJECT_DIR"
git init -q
git add -A
git commit -q -m "Session init: $PARTICIPANT_ID $(date -u +%Y-%m-%dT%H:%M:%SZ)" --allow-empty

echo -e "  ${GREEN}Done${NC}  Git repo initialised with baseline commit"

# --- Create post-session export script ---------------------------------------

cat > "$SESSION_DIR/export-session-data.sh" << 'EXPORT_SCRIPT'
#!/bin/bash
# Run this after the session ends to collect all data into one place

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"
PROJECT_DIR="$SCRIPT_DIR/project"

echo ""
echo "Exporting session data..."
echo ""

# Export git log with timestamps
cd "$PROJECT_DIR"
git log --format="%H|%aI|%s" > "$DATA_DIR/logs/git-commits.log" 2>/dev/null || true
echo "  Exported git commit log"

# Export full diffs
git log -p > "$DATA_DIR/logs/git-full-diffs.patch" 2>/dev/null || true
echo "  Exported full git diffs"

# Export git stats
git log --stat > "$DATA_DIR/logs/git-stats.log" 2>/dev/null || true
echo "  Exported git stats"

# Copy the research log
if [ -f "$DATA_DIR/logs/research-log.jsonl" ]; then
    LINES=$(wc -l < "$DATA_DIR/logs/research-log.jsonl" | xargs)
    echo "  Research log: $LINES events captured"
fi

# Snapshot final project state
tar -czf "$DATA_DIR/project-final-state.tar.gz" -C "$SCRIPT_DIR" project/ 2>/dev/null || true
echo "  Archived final project state"

# Copy Claude Code session files if accessible
CLAUDE_PROJECTS_DIR="$HOME/.claude/projects"
if [ -d "$CLAUDE_PROJECTS_DIR" ]; then
    # Find session files modified in the last 4 hours (session window)
    mkdir -p "$DATA_DIR/claude-sessions"
    find "$CLAUDE_PROJECTS_DIR" -name "*.jsonl" -mmin -240 -exec cp {} "$DATA_DIR/claude-sessions/" \; 2>/dev/null || true
    COPIED=$(ls "$DATA_DIR/claude-sessions/" 2>/dev/null | wc -l | xargs)
    echo "  Copied $COPIED Claude Code session file(s)"
fi

# Copy Claude Code history entries from last 4 hours
if [ -f "$HOME/.claude/history.jsonl" ]; then
    CUTOFF=$(date -v-4H -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '4 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")
    if [ -n "$CUTOFF" ]; then
        cp "$HOME/.claude/history.jsonl" "$DATA_DIR/claude-sessions/history-full.jsonl" 2>/dev/null || true
        echo "  Copied Claude Code global history"
    fi
fi

echo ""
echo "All data exported to: $DATA_DIR"
echo ""
echo "Data checklist:"
echo "  [ ] OBS recording saved to recordings/"
echo "  [ ] Claude Code /export run and saved to data/exports/"
echo "  [ ] Post-session questionnaire completed"
echo "  [ ] Observation notes saved"
echo "  [ ] Session metadata updated with end time and notes"
echo ""
read -n 1 -s -r -p "Press any key to close..."
EXPORT_SCRIPT

chmod +x "$SESSION_DIR/export-session-data.sh"
echo -e "  ${GREEN}Created${NC}  post-session export script"

# --- Create researcher checklist ---------------------------------------------

cat > "$SESSION_DIR/RESEARCHER-CHECKLIST.md" << CHECKLIST
# Session Checklist: $PARTICIPANT_ID
Date: $TIMESTAMP_LOCAL

## Pre-Session
- [ ] Consent form signed
- [ ] Background questionnaire completed
- [ ] Participant information sheet provided and discussed
- [ ] Creative brief provided
- [ ] OBS configured (screen + webcam + mic)
- [ ] This setup script run successfully

## Session Start
- [ ] OBS recording started
- [ ] Claude Code launched in project directory
- [ ] Sync marker typed: SYNC_MARKER_START
- [ ] Think-aloud instructions given
- [ ] Participant begins creative task

## During Session (Researcher Observations)
- [ ] Observation notes being taken
- [ ] Think-aloud prompts given if participant falls silent
- [ ] Note timestamps of key moments (breakthroughs, breakdowns, frustration, delight)

## Creative Task Complete --> Interview
- [ ] Type SYNC_MARKER_INTERVIEW_START in Claude Code
- [ ] Semi-structured interview (30-40 min)
- [ ] All interview guide topics covered

## Post-Session
- [ ] Type SYNC_MARKER_END in Claude Code
- [ ] Run /export in Claude Code, save to data/exports/
- [ ] Stop OBS recording, confirm file saved to recordings/
- [ ] Run export-session-data.sh
- [ ] Post-session questionnaire completed
- [ ] Update session-metadata.json with end time and notes
- [ ] Thank participant, explain next steps
- [ ] Upload all data to university secure storage
CHECKLIST

echo -e "  ${GREEN}Created${NC}  researcher checklist"

# --- Summary and launch options ----------------------------------------------

divider
echo -e "${BOLD}${GREEN}Setup complete!${NC}"
echo ""
echo "  Participant:     $PARTICIPANT_ID"
echo "  Direction:       $DIRECTION"
echo "  Project dir:     $PROJECT_DIR"
echo "  Data dir:        $DATA_DIR"
echo "  Recordings dir:  $RECORDINGS_DIR"
echo "  Research log:    $LOG_FILE"
echo ""

divider
echo -e "${BOLD}Ready to launch?${NC}"
echo ""
echo "  1) Launch OBS + Claude Code (recommended)"
echo "  2) Launch Claude Code only"
echo "  3) Don't launch anything (manual start)"
echo ""
read -r -p "  Choice (1/2/3): " LAUNCH_CHOICE

case "$LAUNCH_CHOICE" in
    1)
        echo ""
        echo "  Launching OBS..."
        if [ -d "$OBS_APP" ]; then
            open "$OBS_APP"
            sleep 2
        else
            echo -e "  ${YELLOW}OBS not found, skipping${NC}"
        fi

        echo "  Launching Claude Code in project directory..."
        echo ""
        echo -e "${CYAN}$(printf '%.0s-' {1..60})${NC}"
        echo ""
        echo -e "  ${BOLD}REMEMBER:${NC}"
        echo -e "  1. Start OBS recording first"
        echo -e "  2. Type ${BOLD}SYNC_MARKER_START${NC} as your first message in Claude Code"
        echo -e "  3. Hand over to participant"
        echo ""
        echo -e "${CYAN}$(printf '%.0s-' {1..60})${NC}"
        echo ""
        echo "  Opening new terminal with Claude Code..."
        echo ""

        # Launch Claude Code in a new Terminal window
        osascript -e "
            tell application \"Terminal\"
                activate
                do script \"cd '$PROJECT_DIR' && export DISABLE_TELEMETRY=1 && export DISABLE_ERROR_REPORTING=1 && export DISABLE_BUG_COMMAND=1 && export CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY=1 && export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 && echo 'Telemetry disabled for research session.' && echo 'Participant: $PARTICIPANT_ID' && echo '' && echo 'Type SYNC_MARKER_START as first message after OBS is recording.' && echo '' && $CLAUDE_CODE_CMD\"
            end tell
        "
        ;;
    2)
        echo ""
        echo "  Launching Claude Code..."
        echo ""

        osascript -e "
            tell application \"Terminal\"
                activate
                do script \"cd '$PROJECT_DIR' && export DISABLE_TELEMETRY=1 && export DISABLE_ERROR_REPORTING=1 && export DISABLE_BUG_COMMAND=1 && export CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY=1 && export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 && echo 'Telemetry disabled for research session.' && echo 'Participant: $PARTICIPANT_ID' && echo '' && $CLAUDE_CODE_CMD\"
            end call
        "
        ;;
    3)
        echo ""
        echo "  No auto-launch. To start manually:"
        echo ""
        echo "    cd $PROJECT_DIR"
        echo "    DISABLE_TELEMETRY=1 DISABLE_ERROR_REPORTING=1 claude"
        echo ""
        ;;
esac

echo ""
echo -e "${GREEN}${BOLD}Good luck with the session!${NC}"
echo ""
