let OBSWebSocket;
const { exec } = require('child_process');

let obs = null;
let connected = false;
let recording = false;
let recordingStartTime = null;
let recordDirectory = null;
let onStateChange = null;

async function ensureImport() {
  if (!OBSWebSocket) {
    const mod = await import('obs-websocket-js');
    OBSWebSocket = mod.default || mod.OBSWebSocket;
  }
}

function setStateChangeCallback(cb) {
  onStateChange = cb;
}

function fireStateChange(eventData) {
  if (onStateChange) {
    try { onStateChange(eventData); } catch (e) {
      console.error('OBS state change callback error:', e);
    }
  }
}

async function connect(password) {
  await ensureImport();

  // Disconnect existing connection if any
  if (obs) {
    try { obs.disconnect(); } catch { /* ignore */ }
  }

  obs = new OBSWebSocket();

  // Listen for recording state changes
  obs.on('RecordStateChanged', (data) => {
    recording = data.outputActive;
    if (recording) {
      recordingStartTime = new Date().toISOString();
    }
    fireStateChange({
      event: 'obs_recording_state',
      outputActive: data.outputActive,
      outputState: data.outputState,
      ts: new Date().toISOString()
    });
  });

  // Listen for disconnection
  obs.on('ConnectionClosed', () => {
    connected = false;
    recording = false;
    recordingStartTime = null;
    fireStateChange({
      event: 'obs_disconnected',
      ts: new Date().toISOString()
    });
  });

  // Listen for OBS exit
  obs.on('ExitStarted', () => {
    connected = false;
    recording = false;
    recordingStartTime = null;
    fireStateChange({
      event: 'obs_disconnected',
      reason: 'OBS exited',
      ts: new Date().toISOString()
    });
  });

  try {
    const connectArgs = { };
    if (password) {
      connectArgs.password = password;
    }
    await obs.connect('ws://127.0.0.1:4455', password || undefined);
    connected = true;

    // Check current recording status
    try {
      const recordStatus = await obs.call('GetRecordStatus');
      recording = recordStatus.outputActive;
      if (recording) {
        recordingStartTime = new Date().toISOString();
      }
    } catch { /* recording status unavailable */ }

    // Get current record directory
    try {
      const outputSettings = await obs.call('GetProfileParameter', {
        parameterCategory: 'SimpleOutput',
        parameterName: 'FilePath'
      });
      recordDirectory = outputSettings.parameterValue || null;
    } catch { /* directory info unavailable */ }

    return { connected: true };
  } catch (err) {
    connected = false;
    obs = null;
    throw new Error(`OBS WebSocket connection failed: ${err.message}`);
  }
}

function disconnect() {
  if (obs) {
    try { obs.disconnect(); } catch { /* ignore */ }
    obs = null;
  }
  connected = false;
  recording = false;
  recordingStartTime = null;
}

function getStatus() {
  return {
    connected,
    recording,
    recordingStartTime,
    recordDirectory
  };
}

function isConnected() {
  return connected;
}

async function launchOBS() {
  return new Promise((resolve, reject) => {
    exec('open -a "OBS"', (err) => {
      if (err) {
        reject(new Error(`Could not launch OBS: ${err.message}`));
      } else {
        resolve({ launched: true });
      }
    });
  });
}

async function setRecordingPath(dir) {
  if (!connected || !obs) throw new Error('Not connected to OBS WebSocket');

  await obs.call('SetRecordDirectory', { recordDirectory: dir });
  recordDirectory = dir;
  return { recordDirectory: dir };
}

async function startRecording() {
  if (!connected || !obs) throw new Error('Not connected to OBS WebSocket');

  await obs.call('StartRecord');
  recording = true;
  recordingStartTime = new Date().toISOString();
  return { recording: true, startTime: recordingStartTime };
}

async function stopRecording() {
  if (!connected || !obs) throw new Error('Not connected to OBS WebSocket');

  const result = await obs.call('StopRecord');
  recording = false;
  recordingStartTime = null;
  return { recording: false, outputPath: result.outputPath || null };
}

module.exports = {
  setStateChangeCallback,
  connect,
  disconnect,
  getStatus,
  isConnected,
  launchOBS,
  setRecordingPath,
  startRecording,
  stopRecording
};
