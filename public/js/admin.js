let currentStep = 1;
let sessionMode = 'vanilla';
let sessionData = null;

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

// --- Step 4: OBS recording checkboxes ---

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
    const res = await fetch('/api/session/confirm-recording', { method: 'POST' });
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
