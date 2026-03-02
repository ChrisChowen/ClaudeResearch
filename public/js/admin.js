let currentStep = 1;
let sessionMode = 'vanilla';
let sessionData = null;

// OBS auto mode state
let obsMode = 'auto';
let obsConnected = false;
let obsRecordingActive = false;
let obsRecTimerInterval = null;
let obsRecStartTime = null;
let obsPollingInterval = null;
let obsInstalled = false;

// --- Step navigation ---

function goToStep(step) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(`step${step}`).classList.add('active');
  document.getElementById(`step${step}`).classList.add('fade-in');

  document.querySelectorAll('.step-indicator__item').forEach((item, i) => {
    item.classList.remove('active', 'completed');
    if (i + 1 < step) item.classList.add('completed');
    if (i + 1 === step) item.classList.add('active');
  });

  // Manage OBS polling
  if (step === 4 && obsMode === 'auto') {
    startOBSPolling();
  } else {
    stopOBSPolling();
  }

  currentStep = step;
}

// --- Step 1: Dependencies ---

async function checkDependencies() {
  try {
    const res = await fetch('/api/dependencies');
    const data = await res.json();

    const list = document.getElementById('depList');
    list.innerHTML = '';

    let allOk = true;
    for (const dep of data.dependencies) {
      const li = document.createElement('li');
      li.className = 'dep-list__item';

      const statusClass = dep.status === 'ok' ? 'ok' : dep.status === 'optional' ? 'optional' : 'missing';
      const statusText = dep.status === 'ok' ? 'OK' : dep.status === 'optional' ? 'Optional' : 'Missing';

      li.innerHTML = `
        <span>${dep.name}</span>
        <span class="status status--${statusClass}">
          <span class="status-dot status-dot--${statusClass}"></span>
          ${statusText}
        </span>
      `;
      list.appendChild(li);

      if (dep.status === 'missing') allOk = false;
    }

    document.getElementById('depLoading').style.display = 'none';
    list.style.display = 'block';

    // Track OBS install status for auto/manual mode default
    const obsDep = data.dependencies.find(d => d.name === 'OBS Studio');
    obsInstalled = obsDep && obsDep.status === 'ok';

    if (allOk) {
      document.getElementById('depNextBtn').disabled = false;
    } else {
      document.getElementById('depError').textContent =
        'Required dependencies are missing. Please install them and refresh.';
      document.getElementById('depError').classList.remove('hidden');
    }
  } catch (err) {
    document.getElementById('depLoading').innerHTML =
      '<span style="color:var(--danger)">Failed to check dependencies. Is the server running?</span>';
  }
}

// --- Step 2: Session mode ---

function selectMode(mode) {
  sessionMode = mode;
  document.querySelectorAll('#modeToggle .toggle-group__option').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.value === mode);
  });

  const hint = document.getElementById('modeHint');
  if (mode === 'vanilla') {
    hint.textContent = 'Out-of-the-box Claude Code. No system prompt or onboarding.';
  } else {
    hint.textContent = 'Includes CLAUDE.md with participant onboarding and adapted behaviour.';
  }
}

// --- Step 2: Create session ---

async function createSession() {
  const pid = document.getElementById('participantId').value.trim().toUpperCase();
  const pidError = document.getElementById('pidError');

  if (!/^P\d{2,3}$/.test(pid)) {
    pidError.textContent = 'Please use format P01, P02, etc.';
    pidError.classList.remove('hidden');
    return;
  }
  pidError.classList.add('hidden');

  // Check if session exists
  const existsRes = await fetch('/api/session/check-exists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantId: pid })
  });
  const existsData = await existsRes.json();

  if (existsData.exists) {
    if (!confirm(`A session for ${pid} already exists. Delete it and create a new one?`)) {
      return;
    }
    await fetch('/api/session/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId: pid })
    });
  }

  const createBtn = document.getElementById('createBtn');
  createBtn.disabled = true;
  createBtn.innerHTML = '<span class="spinner"></span> Creating...';

  try {
    const res = await fetch('/api/session/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantId: pid,
        direction: document.getElementById('direction').value,
        description: document.getElementById('description').value,
        mode: sessionMode
      })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Failed to create session');
      createBtn.disabled = false;
      createBtn.textContent = 'Create Session';
      return;
    }

    sessionData = data.session;

    // Show step 3
    goToStep(3);

    // Populate create steps
    const stepsEl = document.getElementById('createSteps');
    stepsEl.innerHTML = '';
    for (const step of data.steps) {
      const li = document.createElement('li');
      li.className = 'progress-steps__item done';
      li.textContent = step;
      stepsEl.appendChild(li);
    }

    document.getElementById('createSuccess').textContent = `Session created for ${pid}`;
    document.getElementById('createSuccess').style.display = 'block';

    document.getElementById('recordingsPath').textContent = sessionData.recordingsDir;
    document.getElementById('sessionSummary').style.display = 'block';
    document.getElementById('step3NextBtn').style.display = 'inline-flex';

  } catch (err) {
    alert('Error creating session: ' + err.message);
    createBtn.disabled = false;
    createBtn.textContent = 'Create Session';
  }
}

function copyRecordingsPath() {
  if (sessionData) {
    navigator.clipboard.writeText(sessionData.recordingsDir).then(() => {
      const btn = document.querySelector('.copy-box__btn');
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 2000);
    });
  }
}

// --- Step 4: OBS Mode Toggle ---

function setOBSMode(mode) {
  obsMode = mode;
  document.getElementById('obsModeAuto').classList.toggle('selected', mode === 'auto');
  document.getElementById('obsModeManual').classList.toggle('selected', mode === 'manual');
  document.getElementById('obsAutoMode').classList.toggle('hidden', mode !== 'auto');
  document.getElementById('obsManualMode').classList.toggle('hidden', mode !== 'manual');

  if (mode === 'auto') {
    startOBSPolling();
  } else {
    stopOBSPolling();
  }
}

// --- Step 4: Manual mode checkboxes ---

function setupOBSCheckboxes() {
  const checkboxes = ['obsConfigured', 'obsPathSet', 'obsRecording'];
  for (const id of checkboxes) {
    document.getElementById(id).addEventListener('change', () => {
      const allChecked = checkboxes.every(cid => document.getElementById(cid).checked);
      document.getElementById('confirmRecordingBtn').disabled = !allChecked;
    });
  }
}

async function confirmRecording() {
  const btn = document.getElementById('confirmRecordingBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Confirming...';

  try {
    const res = await fetch('/api/session/confirm-recording', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'manual' })
    });
    const data = await res.json();

    document.getElementById('syncMarkerValue').textContent = data.marker;
    document.getElementById('syncMarkerTime').textContent = new Date(data.timestamp).toLocaleString();

    goToStep(5);
  } catch (err) {
    alert('Error: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Confirm Recording Started';
  }
}

// --- Step 4: OBS Auto Mode ---

function startOBSPolling() {
  pollOBSStatus();
  obsPollingInterval = setInterval(pollOBSStatus, 2000);
}

function stopOBSPolling() {
  if (obsPollingInterval) {
    clearInterval(obsPollingInterval);
    obsPollingInterval = null;
  }
}

async function pollOBSStatus() {
  try {
    const res = await fetch('/api/obs/status');
    const data = await res.json();
    updateOBSUI(data);
  } catch {
    updateOBSUI({ connected: false, recording: false });
  }
}

function updateOBSUI(status) {
  const dot = document.getElementById('obsStatusDotAuto');
  const text = document.getElementById('obsStatusText');

  obsConnected = status.connected;
  obsRecordingActive = status.recording;

  // Hide all phases first
  document.getElementById('obsPhase1').classList.add('hidden');
  document.getElementById('obsPhase2Connected').classList.add('hidden');
  document.getElementById('obsAutoConfirmGroup').style.display = 'none';
  document.getElementById('obsAutoBackGroup').style.display = 'flex';

  if (!obsInstalled) {
    dot.className = 'obs-status-dot obs-status-dot--disconnected';
    text.textContent = 'OBS not installed \u2014 use Manual mode';
    return;
  }

  if (!status.connected) {
    dot.className = 'obs-status-dot obs-status-dot--disconnected';
    text.textContent = 'Not connected to OBS';
    document.getElementById('obsPhase1').classList.remove('hidden');
  } else if (!status.recording) {
    dot.className = 'obs-status-dot obs-status-dot--connected';
    text.textContent = 'Connected to OBS';
    document.getElementById('obsPhase2Connected').classList.remove('hidden');
    document.getElementById('obsPreRecording').classList.remove('hidden');
    document.getElementById('obsRecordingActive').classList.add('hidden');

    if (sessionData) {
      document.getElementById('obsRecordPath').textContent = sessionData.recordingsDir;
    }
  } else {
    dot.className = 'obs-status-dot obs-status-dot--recording';
    text.textContent = 'Recording';
    document.getElementById('obsPhase2Connected').classList.remove('hidden');
    document.getElementById('obsPreRecording').classList.add('hidden');
    document.getElementById('obsRecordingActive').classList.remove('hidden');
    document.getElementById('obsAutoConfirmGroup').style.display = 'flex';
    document.getElementById('obsAutoBackGroup').style.display = 'none';

    // Start rec timer if not already running
    if (!obsRecTimerInterval && !obsRecStartTime) {
      obsRecStartTime = Date.now();
      startOBSRecTimer();
    }
  }
}

async function launchOBS() {
  const btn = document.getElementById('launchOBSBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Launching...';

  try {
    await fetch('/api/obs/launch', { method: 'POST' });
    btn.textContent = 'OBS launching... waiting to connect';
    // Wait for OBS to start, then try connecting
    setTimeout(async () => {
      try { await connectOBS(); } catch { /* polling will handle */ }
      btn.disabled = false;
      btn.textContent = 'Launch OBS';
    }, 4000);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Launch OBS';
    alert('Could not launch OBS: ' + err.message);
  }
}

async function connectOBS() {
  const btn = document.getElementById('obsConnectBtn');
  const errorEl = document.getElementById('obsConnectError');
  const password = document.getElementById('obsPassword').value;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Connecting...';
  errorEl.classList.add('hidden');

  try {
    const res = await fetch('/api/obs/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password || undefined })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Connection failed');

    // Auto-set recording path
    if (sessionData) {
      await fetch('/api/obs/set-recording-path', { method: 'POST' });
    }

    pollOBSStatus();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Connect to OBS';
  }
}

async function startOBSRecording() {
  const btn = document.getElementById('obsStartRecBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Starting...';

  try {
    const res = await fetch('/api/obs/start-recording', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start recording');

    obsRecStartTime = Date.now();
    startOBSRecTimer();
    pollOBSStatus();
  } catch (err) {
    alert('Failed to start recording: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Start Recording';
  }
}

function startOBSRecTimer() {
  if (obsRecTimerInterval) clearInterval(obsRecTimerInterval);
  obsRecTimerInterval = setInterval(() => {
    if (!obsRecStartTime) return;
    const elapsed = Math.floor((Date.now() - obsRecStartTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    const timerEl = document.getElementById('obsRecTimer');
    if (timerEl) {
      timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
  }, 1000);
}

async function confirmRecordingAuto() {
  const btn = document.getElementById('obsAutoConfirmBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Confirming...';

  try {
    const res = await fetch('/api/session/confirm-recording', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'auto' })
    });
    const data = await res.json();

    document.getElementById('syncMarkerValue').textContent = data.marker;
    document.getElementById('syncMarkerTime').textContent =
      new Date(data.timestamp).toLocaleString();

    stopOBSPolling();
    goToStep(5);
  } catch (err) {
    alert('Error: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Confirm & Continue';
  }
}

// --- Step 6: Ethics checkboxes ---

function setupEthicsCheckboxes() {
  const checkboxes = ['ethicsConsent', 'ethicsInfo', 'ethicsThinkAloud', 'ethicsReady'];
  for (const id of checkboxes) {
    document.getElementById(id).addEventListener('change', () => {
      const allChecked = checkboxes.every(cid => document.getElementById(cid).checked);
      document.getElementById('confirmEthicsBtn').disabled = !allChecked;
    });
  }
}

async function confirmEthics() {
  const btn = document.getElementById('confirmEthicsBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Confirming...';

  try {
    const res = await fetch('/api/session/confirm-ethics', { method: 'POST' });
    const data = await res.json();

    document.getElementById('ethicsTimestamp').textContent =
      `Ethics confirmed at ${new Date(data.timestamp).toLocaleString()}`;
    document.getElementById('ethicsTimestamp').style.display = 'block';

    goToStep(7);
  } catch (err) {
    alert('Error: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Confirm All Ethics Requirements';
  }
}

// --- Step 7: Launch & Hand Over ---

async function launchSession() {
  const btn = document.getElementById('launchBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Launching Claude Code...';

  try {
    const res = await fetch('/api/session/launch', { method: 'POST' });
    const data = await res.json();

    if (data.launched) {
      // Hide pre-launch, show post-launch
      document.getElementById('preLaunchCard').classList.add('hidden');
      document.getElementById('postLaunchCard').classList.remove('hidden');

      // Fetch and display researcher monitor URL
      const netRes = await fetch('/api/network');
      const netData = await netRes.json();
      document.getElementById('researcherUrl').textContent = netData.researcherUrl;

      // Generate QR code locally (works offline / on restricted university networks)
      const qrImg = document.getElementById('researcherQR');
      qrImg.src = `/api/qr?data=${encodeURIComponent(netData.researcherUrl)}`;
      qrImg.onerror = () => { qrImg.style.display = 'none'; };

      // Show alternative IPs for university networks with multiple interfaces
      if (netData.allIPs && netData.allIPs.length > 1) {
        const altList = document.getElementById('altIPList');
        altList.innerHTML = netData.allIPs.map(ip =>
          `<div>${ip.name}: <a href="http://${ip.address}:${netData.port}/researcher" target="_blank">http://${ip.address}:${netData.port}/researcher</a></div>`
        ).join('');
        document.getElementById('altIPs').classList.remove('hidden');
      }

      // Set up handover checkbox
      document.getElementById('researcherMonitorReady').addEventListener('change', (e) => {
        document.getElementById('handoverBtn').disabled = !e.target.checked;
      });
    }
  } catch (err) {
    alert('Error launching: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Launch Claude Code';
  }
}

function copyResearcherUrl() {
  const url = document.getElementById('researcherUrl').textContent;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.querySelector('#postLaunchCard .copy-box__btn');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  });
}

function handOverToParticipant() {
  // Redirect this browser tab to the participant page
  window.location.href = '/participant';
}

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
  checkDependencies();
  setupOBSCheckboxes();
  setupEthicsCheckboxes();
});
