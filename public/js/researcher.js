let sessionStartTime = null;
let timerInterval = null;
let eventSource = null;
let stats = { prompts: 0, tools: 0, files: 0, total: 0 };
let firstEventReceived = false;

// --- Timer ---

function updateTimer() {
  if (!sessionStartTime) return;
  const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  document.getElementById('timer').textContent =
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// --- Event feed ---

function getEventType(event) {
  switch (event.event) {
    case 'user_prompt': return { label: 'PROMPT', className: 'prompt' };
    case 'tool_use_pre': return { label: 'TOOL', className: 'tool' };
    case 'tool_use_post': return { label: 'TOOL', className: 'tool' };
    case 'file_change': return { label: 'FILE', className: 'file' };
    case 'sync_marker': return { label: 'SYNC', className: 'sync' };
    case 'researcher_note': return { label: 'NOTE', className: 'note' };
    case 'session_start':
    case 'session_end':
    case 'recording_started':
    case 'ethics_gate_confirmed':
      return { label: 'SESSION', className: 'session' };
    case 'obs_recording_state': return { label: 'OBS', className: 'sync' };
    case 'obs_disconnected': return { label: 'OBS', className: 'session' };
    default: return { label: 'EVENT', className: 'session' };
  }
}

function getEventDetail(event) {
  switch (event.event) {
    case 'user_prompt': return `Length: ${event.prompt_length || '?'} chars`;
    case 'tool_use_pre': return `${event.tool || 'unknown'} (pre)`;
    case 'tool_use_post': return event.tool || 'unknown';
    case 'file_change': return event.file || 'unknown file';
    case 'sync_marker': return event.marker || '';
    case 'researcher_note': return event.note || '';
    case 'session_start': return 'Session started';
    case 'session_end': return `Session ended${event.reason ? ': ' + event.reason : ''}`;
    case 'recording_started': return 'OBS recording confirmed';
    case 'ethics_gate_confirmed': return 'Ethics requirements confirmed';
    case 'obs_recording_state':
      return event.outputActive ? 'Recording started' : 'Recording stopped';
    case 'obs_disconnected':
      return 'OBS WebSocket disconnected' + (event.reason ? ': ' + event.reason : '');
    default: return JSON.stringify(event);
  }
}

function formatTime(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '--:--:--';
  }
}

function addEventToFeed(event) {
  const feed = document.getElementById('eventFeed');

  // Remove "waiting" message on first event
  if (!firstEventReceived) {
    feed.innerHTML = '';
    firstEventReceived = true;
  }

  const type = getEventType(event);
  const detail = getEventDetail(event);
  const time = formatTime(event.ts);

  const li = document.createElement('li');
  li.className = 'event-feed__item fade-in';
  li.innerHTML = `
    <span class="event-feed__time">${time}</span>
    <span class="event-feed__type event-feed__type--${type.className}">${type.label}</span>
    <span class="event-feed__detail" title="${detail}">${detail}</span>
  `;

  feed.appendChild(li);
  feed.scrollTop = feed.scrollHeight;

  // Update stats
  stats.total++;
  if (event.event === 'user_prompt') stats.prompts++;
  if (event.event === 'tool_use_post') stats.tools++;
  if (event.event === 'file_change') stats.files++;

  document.getElementById('statPrompts').textContent = stats.prompts;
  document.getElementById('statTools').textContent = stats.tools;
  document.getElementById('statFiles').textContent = stats.files;
  document.getElementById('statEvents').textContent = stats.total;
}

// --- SSE connection ---

function connectSSE() {
  if (eventSource) eventSource.close();

  eventSource = new EventSource('/api/events');

  eventSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      addEventToFeed(event);
    } catch { /* skip */ }
  };

  eventSource.onerror = () => {
    // Will auto-reconnect
  };
}

// --- Session status polling ---

async function checkSessionStatus() {
  try {
    const res = await fetch('/api/session/status');
    const data = await res.json();

    if (data.active) {
      document.getElementById('waitingState').classList.add('hidden');
      document.getElementById('activeState').classList.remove('hidden');

      const s = data.session;
      document.getElementById('barParticipant').textContent = s.participantId;
      document.getElementById('barDirection').textContent = s.direction;
      document.getElementById('barMode').textContent = s.mode;
      document.getElementById('barStartTime').textContent =
        new Date(s.startTime).toLocaleTimeString();

      sessionStartTime = new Date(s.startTime).getTime();
      if (!timerInterval) {
        timerInterval = setInterval(updateTimer, 1000);
        updateTimer();
      }

      // Connect SSE if not already
      if (!eventSource) {
        connectSSE();
      }

      // Check OBS recording status
      checkOBSStatus();
    }
  } catch {
    // Server not available
  }
}

// --- Quick actions ---

async function addSyncMarker(name) {
  try {
    const res = await fetch('/api/session/sync-marker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (data.marker) {
      // Event will appear via SSE
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function addNote() {
  const input = document.getElementById('noteInput');
  const note = input.value.trim();
  if (!note) return;

  try {
    await fetch('/api/session/note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });
    input.value = '';
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// --- Export ---

function showExportDialog() {
  document.getElementById('exportDialog').classList.remove('hidden');
}

function hideExportDialog() {
  document.getElementById('exportDialog').classList.add('hidden');
}

async function runExport() {
  const btn = document.getElementById('exportBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Exporting...';

  try {
    const notes = document.getElementById('exportNotes').value;
    const res = await fetch('/api/session/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    });
    const data = await res.json();

    const stepsEl = document.getElementById('exportSteps');
    stepsEl.innerHTML = '';
    for (const step of data.results) {
      const li = document.createElement('li');
      li.className = 'progress-steps__item done';
      li.textContent = step;
      stepsEl.appendChild(li);
    }

    document.getElementById('exportResults').classList.remove('hidden');
    btn.textContent = 'Export Complete';
  } catch (err) {
    alert('Export error: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Export';
  }
}

// --- OBS recording status ---

async function checkOBSStatus() {
  try {
    const res = await fetch('/api/obs/status');
    const data = await res.json();

    const indicator = document.getElementById('obsRecIndicator');
    const stopBtn = document.getElementById('stopRecordingBtn');

    if (data.connected && data.recording) {
      indicator.style.display = 'flex';
      stopBtn.style.display = 'inline-flex';
    } else {
      indicator.style.display = 'none';
      stopBtn.style.display = 'none';
    }
  } catch {
    // OBS status unavailable
  }
}

async function stopOBSRecording() {
  if (!confirm('Stop OBS recording? This cannot be undone.')) return;

  const btn = document.getElementById('stopRecordingBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Stopping...';

  try {
    await fetch('/api/obs/stop-recording', { method: 'POST' });
    btn.style.display = 'none';
    document.getElementById('obsRecIndicator').style.display = 'none';
  } catch (err) {
    alert('Error stopping recording: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Stop Recording';
  }
}

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
  checkSessionStatus();
  // Keep checking in case session starts after page load
  setInterval(checkSessionStatus, 3000);
});
