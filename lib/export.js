const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getCurrentSession } = require('./session');

function runExport(sessionNotes) {
  const session = getCurrentSession();
  if (!session) throw new Error('No active session');

  const { sessionDir, projectDir, dataDir, logFile } = session;
  const results = [];

  // Export git log with timestamps
  try {
    const gitLog = execSync('git log --format="%H|%aI|%s"', { cwd: projectDir, encoding: 'utf-8' });
    fs.writeFileSync(path.join(dataDir, 'logs', 'git-commits.log'), gitLog);
    results.push('Exported git commit log');
  } catch {
    results.push('No git commits to export');
  }

  // Export full diffs
  try {
    const fullDiffs = execSync('git log -p', { cwd: projectDir, encoding: 'utf-8' });
    fs.writeFileSync(path.join(dataDir, 'logs', 'git-full-diffs.patch'), fullDiffs);
    results.push('Exported full git diffs');
  } catch {
    results.push('No git diffs to export');
  }

  // Export git stats
  try {
    const stats = execSync('git log --stat', { cwd: projectDir, encoding: 'utf-8' });
    fs.writeFileSync(path.join(dataDir, 'logs', 'git-stats.log'), stats);
    results.push('Exported git stats');
  } catch {
    results.push('No git stats to export');
  }

  // Copy CLAUDE.md and settings.json for reproducibility
  const exportsDir = path.join(dataDir, 'exports');
  const claudeMdPath = path.join(projectDir, '.claude', 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    fs.copyFileSync(claudeMdPath, path.join(exportsDir, 'CLAUDE.md'));
    results.push('Copied CLAUDE.md');
  }

  const settingsPath = path.join(projectDir, '.claude', 'settings.json');
  if (fs.existsSync(settingsPath)) {
    fs.copyFileSync(settingsPath, path.join(exportsDir, 'settings.json'));
    results.push('Copied settings.json');
  }

  // Copy Claude Code session files
  const claudeProjectsDir = path.join(process.env.HOME, '.claude', 'projects');
  if (fs.existsSync(claudeProjectsDir)) {
    const sessionsExportDir = path.join(dataDir, 'claude-sessions');
    fs.mkdirSync(sessionsExportDir, { recursive: true });

    try {
      // Find JSONL files modified in the last 4 hours
      const output = execSync(
        `find "${claudeProjectsDir}" -name "*.jsonl" -mmin -240 2>/dev/null`,
        { encoding: 'utf-8' }
      ).trim();

      if (output) {
        const files = output.split('\n').filter(Boolean);
        for (const file of files) {
          const dest = path.join(sessionsExportDir, path.basename(file));
          fs.copyFileSync(file, dest);
        }
        results.push(`Copied ${files.length} Claude Code session file(s)`);
      }
    } catch {
      results.push('No Claude Code session files found');
    }
  }

  // Copy global history
  const historyPath = path.join(process.env.HOME, '.claude', 'history.jsonl');
  if (fs.existsSync(historyPath)) {
    const sessionsExportDir = path.join(dataDir, 'claude-sessions');
    fs.mkdirSync(sessionsExportDir, { recursive: true });
    fs.copyFileSync(historyPath, path.join(sessionsExportDir, 'history-full.jsonl'));
    results.push('Copied Claude Code global history');
  }

  // Archive final project state
  try {
    execSync(
      `tar -czf "${path.join(dataDir, 'project-final-state.tar.gz')}" -C "${sessionDir}" project/`,
      { stdio: 'ignore' }
    );
    results.push('Archived final project state');
  } catch {
    results.push('Could not archive project state');
  }

  // Save admin session notes
  if (sessionNotes && sessionNotes.trim()) {
    fs.writeFileSync(path.join(dataDir, 'admin-session-notes.txt'), sessionNotes.trim());
    results.push('Saved admin session notes');
  }

  // Generate session summary
  const summary = generateSummary(session);
  fs.writeFileSync(path.join(dataDir, 'session-summary.txt'), summary.text);
  results.push('Generated session summary');

  // Update metadata with export time
  const metadataPath = path.join(sessionDir, 'session-metadata.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  metadata.export_time_utc = new Date().toISOString();
  if (sessionNotes) metadata.notes = sessionNotes.trim();
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  return { results, summary: summary.data };
}

function generateSummary(session) {
  const { logFile, projectDir, sessionDir } = session;
  const data = {
    participant: session.participantId,
    direction: session.direction,
    mode: session.mode,
    startTime: session.startTimeLocal,
    exportTime: new Date().toLocaleString('en-GB', {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timeZoneName: 'short'
    }),
    totalEvents: 0,
    promptCount: 0,
    toolUseCount: 0,
    fileChangeCount: 0,
    gitCommits: 0
  };

  // Parse research log
  if (fs.existsSync(logFile)) {
    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
    data.totalEvents = lines.length;

    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.event === 'user_prompt') data.promptCount++;
        if (event.event === 'tool_use_post') data.toolUseCount++;
        if (event.event === 'file_change') data.fileChangeCount++;
      } catch { /* skip malformed lines */ }
    }
  }

  // Git commits
  try {
    const count = execSync('git rev-list --count HEAD', {
      cwd: projectDir,
      encoding: 'utf-8'
    }).trim();
    data.gitCommits = parseInt(count, 10) || 0;
  } catch {
    data.gitCommits = 0;
  }

  const text = `SESSION SUMMARY
===============

Participant:    ${data.participant}
Direction:      ${data.direction}
Mode:           ${data.mode}
Start time:     ${data.startTime}
Export time:     ${data.exportTime}

Research Log:
  Total events:   ${data.totalEvents}
  User prompts:   ${data.promptCount}
  Tool uses:      ${data.toolUseCount}
  File changes:   ${data.fileChangeCount}
  Git commits:    ${data.gitCommits}
`;

  return { text, data };
}

module.exports = { runExport };
