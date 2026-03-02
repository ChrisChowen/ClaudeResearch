const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { generateHooksConfig } = require('./hooks-config');
const { getClaudeMdContent } = require('./claude-md');

const STUDY_ROOT = path.resolve(__dirname, '..');
const SESSIONS_DIR = path.join(STUDY_ROOT, 'sessions');

// In-memory state for the current session
let currentSession = null;

function getCurrentSession() {
  return currentSession;
}

function checkDependencies() {
  const deps = [];

  const check = (cmd, name, installHint) => {
    try {
      execSync(`command -v ${cmd}`, { stdio: 'ignore' });
      deps.push({ name, status: 'ok', hint: null });
    } catch {
      deps.push({ name, status: 'missing', hint: installHint });
    }
  };

  check('git', 'git', 'xcode-select --install');
  check('jq', 'jq', 'brew install jq');
  check('claude', 'Claude Code', 'npm install -g @anthropic-ai/claude-code');

  // OBS is optional
  const obsPath = '/Applications/OBS.app';
  if (fs.existsSync(obsPath)) {
    deps.push({ name: 'OBS Studio', status: 'ok', hint: null });
  } else {
    deps.push({ name: 'OBS Studio', status: 'optional', hint: 'Download from obsproject.com' });
  }

  return deps;
}

function validateParticipantId(id) {
  return /^P\d{2,3}$/.test(id);
}

function sessionExists(participantId) {
  return fs.existsSync(path.join(SESSIONS_DIR, participantId));
}

function createSession({ participantId, direction, description, mode }) {
  if (!validateParticipantId(participantId)) {
    throw new Error(`Invalid participant ID: ${participantId}. Use format P01, P02, etc.`);
  }

  const sessionDir = path.join(SESSIONS_DIR, participantId);
  const projectDir = path.join(sessionDir, 'project');
  const dataDir = path.join(sessionDir, 'data');
  const recordingsDir = path.join(sessionDir, 'recordings');
  const logFile = path.join(dataDir, 'logs', 'research-log.jsonl');
  const diffDir = path.join(projectDir, '.claude', 'diffs');

  const steps = [];

  // Create directory tree
  const dirs = [
    projectDir,
    path.join(projectDir, '.claude', 'diffs'),
    path.join(dataDir, 'logs'),
    path.join(dataDir, 'transcripts'),
    path.join(dataDir, 'exports'),
    recordingsDir
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
  steps.push('Created directory structure');

  // Write session metadata
  const now = new Date();
  const metadata = {
    study: 'Study1',
    participant_id: participantId,
    session_number: 'S01',
    creative_direction: direction || 'not-yet-chosen',
    project_description: description || 'not yet described',
    session_mode: mode || 'vanilla',
    session_start_utc: now.toISOString(),
    session_start_local: now.toLocaleString('en-GB', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, timeZoneName: 'short' }),
    researcher: 'Chris Chowen',
    setup_complete: false,
    notes: ''
  };

  fs.writeFileSync(
    path.join(sessionDir, 'session-metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
  steps.push('Written session metadata');

  // Write Claude Code hooks config
  const hooksConfig = generateHooksConfig(participantId, logFile, projectDir, diffDir);
  fs.writeFileSync(
    path.join(projectDir, '.claude', 'settings.json'),
    JSON.stringify(hooksConfig, null, 4)
  );
  steps.push('Configured Claude Code hooks');

  // Write CLAUDE.md if enhanced mode
  if (mode === 'enhanced') {
    fs.writeFileSync(
      path.join(projectDir, '.claude', 'CLAUDE.md'),
      getClaudeMdContent()
    );
    steps.push('Written CLAUDE.md system prompt (enhanced mode)');
  } else {
    steps.push('Skipped CLAUDE.md (vanilla mode)');
  }

  // Initialise git
  try {
    execSync('git init -q', { cwd: projectDir, stdio: 'ignore' });
    execSync('git add -A', { cwd: projectDir, stdio: 'ignore' });
    execSync(
      `git commit -q -m "Session init: ${participantId} ${now.toISOString()}" --allow-empty`,
      { cwd: projectDir, stdio: 'ignore' }
    );
    steps.push('Initialised git repository');
  } catch (err) {
    steps.push(`Git init warning: ${err.message}`);
  }

  // Write researcher checklist
  const checklist = generateChecklist(participantId, metadata.session_start_local);
  fs.writeFileSync(path.join(sessionDir, 'RESEARCHER-CHECKLIST.md'), checklist);
  steps.push('Created researcher checklist');

  // Store current session state
  currentSession = {
    participantId,
    direction: metadata.creative_direction,
    description: metadata.project_description,
    mode: metadata.session_mode,
    sessionDir,
    projectDir,
    dataDir,
    recordingsDir,
    logFile,
    diffDir,
    startTime: now.toISOString(),
    startTimeLocal: metadata.session_start_local,
    metadata,
    syncMarker: null,
    ethicsConfirmed: false,
    recordingStarted: false,
    launched: false
  };

  return { session: currentSession, steps };
}

function deleteSession(participantId) {
  const sessionDir = path.join(SESSIONS_DIR, participantId);
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
    if (currentSession && currentSession.participantId === participantId) {
      currentSession = null;
    }
    return true;
  }
  return false;
}

function writeSyncMarker() {
  if (!currentSession) throw new Error('No active session');

  const now = new Date();
  const marker = `SYNC_SESSION_START_${currentSession.participantId}_${now.toISOString()}`;

  const event = {
    event: 'sync_marker',
    marker,
    participant: currentSession.participantId,
    ts: now.toISOString()
  };

  fs.appendFileSync(currentSession.logFile, JSON.stringify(event) + '\n');
  currentSession.syncMarker = marker;

  return { marker, timestamp: now.toISOString() };
}

function confirmRecording() {
  if (!currentSession) throw new Error('No active session');

  const now = new Date();
  const event = {
    event: 'recording_started',
    participant: currentSession.participantId,
    ts: now.toISOString()
  };

  fs.appendFileSync(currentSession.logFile, JSON.stringify(event) + '\n');
  currentSession.recordingStarted = true;

  // Also write sync marker
  return writeSyncMarker();
}

function confirmEthics() {
  if (!currentSession) throw new Error('No active session');

  const now = new Date();
  const event = {
    event: 'ethics_gate_confirmed',
    participant: currentSession.participantId,
    ts: now.toISOString(),
    confirmed_by: 'admin'
  };

  fs.appendFileSync(currentSession.logFile, JSON.stringify(event) + '\n');
  currentSession.ethicsConfirmed = true;

  return { timestamp: now.toISOString() };
}

function launchClaudeCode() {
  if (!currentSession) throw new Error('No active session');

  const { spawn } = require('child_process');
  const projectDir = currentSession.projectDir;
  const participantId = currentSession.participantId;

  // Resolve the full path to claude so it works in non-login shells
  let claudePath = 'claude';
  try {
    claudePath = execSync('which claude', { encoding: 'utf-8' }).trim();
  } catch { /* fall back to bare 'claude' */ }

  // Build the shell command to run inside Terminal
  // Source shell profile to ensure PATH is set, then run claude
  const terminalScript = [
    'source ~/.zshrc 2>/dev/null || source ~/.bash_profile 2>/dev/null || true',
    `cd "${projectDir}"`,
    'export DISABLE_TELEMETRY=1',
    'export DISABLE_ERROR_REPORTING=1',
    'export DISABLE_BUG_COMMAND=1',
    'export CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY=1',
    'export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1',
    `echo "Session ready. Participant: ${participantId}"`,
    'echo "Sync marker captured. Hand over to participant."',
    'echo ""',
    `"${claudePath}"`
  ].join(' && ');

  // Pipe AppleScript via stdin to avoid shell quoting issues
  const appleScript = `tell application "Terminal"
  activate
  do script "${terminalScript.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
end tell`;

  const child = spawn('osascript', ['-'], { stdio: ['pipe', 'ignore', 'pipe'] });
  child.stdin.write(appleScript);
  child.stdin.end();
  child.stderr.on('data', (data) => {
    console.error('Failed to launch Claude Code:', data.toString());
  });

  currentSession.launched = true;

  // Mark setup complete in metadata
  const metadataPath = path.join(currentSession.sessionDir, 'session-metadata.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  metadata.setup_complete = true;
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  return { launched: true, projectDir };
}

function addResearcherNote(note) {
  if (!currentSession) throw new Error('No active session');

  const now = new Date();
  const event = {
    event: 'researcher_note',
    participant: currentSession.participantId,
    ts: now.toISOString(),
    note
  };

  fs.appendFileSync(currentSession.logFile, JSON.stringify(event) + '\n');
  return { timestamp: now.toISOString() };
}

function addSyncMarker(markerName) {
  if (!currentSession) throw new Error('No active session');

  const now = new Date();
  const marker = `SYNC_${markerName}_${currentSession.participantId}_${now.toISOString()}`;

  const event = {
    event: 'sync_marker',
    marker,
    participant: currentSession.participantId,
    ts: now.toISOString()
  };

  fs.appendFileSync(currentSession.logFile, JSON.stringify(event) + '\n');
  return { marker, timestamp: now.toISOString() };
}

function generateChecklist(participantId, startTimeLocal) {
  return `# Session Checklist: ${participantId}
Date: ${startTimeLocal}

## Pre-Session
- [ ] Consent form signed
- [ ] Background questionnaire completed
- [ ] Participant information sheet provided and discussed
- [ ] Creative brief provided
- [ ] OBS configured (screen + webcam + mic)
- [ ] Session setup completed via web dashboard

## Session Start
- [ ] OBS recording started (confirmed in dashboard)
- [ ] Sync marker auto-captured
- [ ] Ethics gate confirmed (on camera)
- [ ] Claude Code launched
- [ ] Think-aloud instructions given
- [ ] Participant begins creative task

## During Session (Researcher Observations)
- [ ] Observation notes being taken (use dashboard "Add Note")
- [ ] Think-aloud prompts given if participant falls silent
- [ ] Note timestamps of key moments (breakthroughs, breakdowns, frustration, delight)

## Creative Task Complete --> Interview
- [ ] Mark "Interview Start" in researcher dashboard
- [ ] Semi-structured interview (30-40 min)
- [ ] All interview guide topics covered

## Post-Session
- [ ] Mark "Session End" in researcher dashboard
- [ ] Run /export in Claude Code, save to data/exports/
- [ ] Stop OBS recording, confirm file saved to recordings/
- [ ] Run "Export Data" from researcher dashboard
- [ ] Post-session questionnaire completed
- [ ] Thank participant, explain next steps
- [ ] Upload all data to university secure storage
`;
}

module.exports = {
  getCurrentSession,
  checkDependencies,
  validateParticipantId,
  sessionExists,
  createSession,
  deleteSession,
  writeSyncMarker,
  confirmRecording,
  confirmEthics,
  launchClaudeCode,
  addResearcherNote,
  addSyncMarker,
  SESSIONS_DIR
};
