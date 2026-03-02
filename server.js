const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const chokidar = require('chokidar');
const QRCode = require('qrcode');
const session = require('./lib/session');
const { runExport } = require('./lib/export');

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips;
}

function getLocalIP() {
  const ips = getLocalIPs();
  return ips.length > 0 ? ips[0].address : 'localhost';
}

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- SSE clients ---
const sseClients = new Set();
let logWatcher = null;
let lastLogSize = 0;

function broadcastEvent(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(message);
  }
}

function startWatchingLog(logFile) {
  if (logWatcher) {
    logWatcher.close();
  }

  lastLogSize = 0;
  if (fs.existsSync(logFile)) {
    lastLogSize = fs.statSync(logFile).size;
  }

  logWatcher = chokidar.watch(logFile, {
    persistent: true,
    usePolling: true,
    interval: 500
  });

  logWatcher.on('change', () => {
    try {
      const stat = fs.statSync(logFile);
      if (stat.size > lastLogSize) {
        const fd = fs.openSync(logFile, 'r');
        const buffer = Buffer.alloc(stat.size - lastLogSize);
        fs.readSync(fd, buffer, 0, buffer.length, lastLogSize);
        fs.closeSync(fd);

        const newContent = buffer.toString('utf-8');
        const lines = newContent.trim().split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            broadcastEvent(event);
          } catch { /* skip malformed lines */ }
        }

        lastLogSize = stat.size;
      }
    } catch { /* file may not exist yet */ }
  });
}

// --- HTML routes ---
app.get('/', (req, res) => res.redirect('/admin'));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/participant', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'participant.html'));
});

app.get('/researcher', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'researcher.html'));
});

// --- API routes ---

app.get('/api/network', (req, res) => {
  const ips = getLocalIPs();
  const primaryIP = ips.length > 0 ? ips[0].address : 'localhost';
  res.json({
    localIP: primaryIP,
    allIPs: ips,
    researcherUrl: `http://${primaryIP}:${PORT}/researcher`,
    participantUrl: `http://${primaryIP}:${PORT}/participant`,
    port: PORT
  });
});

// Local QR code generation endpoint (works offline / on restricted networks)
app.get('/api/qr', async (req, res) => {
  const data = req.query.data || '';
  try {
    const svg = await QRCode.toString(data, { type: 'svg', margin: 1, width: 200 });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch {
    res.status(500).send('QR generation failed');
  }
});

app.get('/api/dependencies', (req, res) => {
  const deps = session.checkDependencies();
  res.json({ dependencies: deps });
});

app.get('/api/session/status', (req, res) => {
  const current = session.getCurrentSession();
  if (!current) {
    return res.json({ active: false });
  }
  res.json({ active: true, session: current });
});

app.post('/api/session/check-exists', (req, res) => {
  const { participantId } = req.body;
  if (!participantId) return res.status(400).json({ error: 'participantId required' });
  res.json({ exists: session.sessionExists(participantId.toUpperCase()) });
});

app.post('/api/session/create', (req, res) => {
  try {
    const { participantId, direction, description, mode } = req.body;
    const result = session.createSession({
      participantId: participantId.toUpperCase(),
      direction: direction || 'not-yet-chosen',
      description: description || 'not yet described',
      mode: mode || 'vanilla'
    });

    // Start watching the research log for SSE
    startWatchingLog(result.session.logFile);

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/session/delete', (req, res) => {
  const { participantId } = req.body;
  if (!participantId) return res.status(400).json({ error: 'participantId required' });
  const deleted = session.deleteSession(participantId.toUpperCase());
  res.json({ deleted });
});

app.post('/api/session/confirm-recording', (req, res) => {
  try {
    const result = session.confirmRecording();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/session/confirm-ethics', (req, res) => {
  try {
    const result = session.confirmEthics();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/session/launch', (req, res) => {
  try {
    const result = session.launchClaudeCode();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/session/note', (req, res) => {
  try {
    const { note } = req.body;
    if (!note) return res.status(400).json({ error: 'note required' });
    const result = session.addResearcherNote(note);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/session/sync-marker', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'marker name required' });
    const result = session.addSyncMarker(name);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/session/export', (req, res) => {
  try {
    const { notes } = req.body;
    const result = runExport(notes || '');
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- SSE endpoint ---
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  // Send existing events if session is active
  const current = session.getCurrentSession();
  if (current && current.logFile && fs.existsSync(current.logFile)) {
    const content = fs.readFileSync(current.logFile, 'utf-8').trim();
    if (content) {
      const lines = content.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch { /* skip */ }
      }
    }
  }

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// --- Start server ---
app.listen(PORT, async () => {
  console.log('');
  console.log('  ===================================================');
  console.log('  Study 1: First Encounters with Vibe-Coding');
  console.log('  Session Setup Server');
  console.log('  ===================================================');
  console.log('');
  const ip = getLocalIP();
  console.log(`  Admin dashboard:     http://localhost:${PORT}/admin`);
  console.log(`  Researcher monitor:  http://${ip}:${PORT}/researcher`);
  console.log(`  Participant page:    http://localhost:${PORT}/participant`);
  console.log('');
  console.log(`  Researcher (from another device): http://${ip}:${PORT}/researcher`);
  console.log('');

  // Auto-open admin dashboard
  try {
    const open = (await import('open')).default;
    open(`http://localhost:${PORT}/admin`);
  } catch {
    console.log('  Could not auto-open browser. Please navigate to the URL above.');
  }
});
