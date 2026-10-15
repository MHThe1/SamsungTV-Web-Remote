const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const tv = require('./samsung-tv');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Broadcast state to all connected web clients
function broadcastState() {
  const state = tv.getStatus();
  const payload = JSON.stringify({ type: 'tv_state', data: state });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// Subscribe TV state updates
tv.onStateChange(() => {
  broadcastState();
});

// WebSocket connection from web client
wss.on('connection', (ws) => {
  // Send initial state immediately
  ws.send(JSON.stringify({ type: 'tv_state', data: tv.getStatus() }));

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.action === 'send_key') {
        try {
          await tv.sendKey(msg.key);
          ws.send(JSON.stringify({ type: 'key_ack', key: msg.key, success: true }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: err.message }));
        }
      } else if (msg.action === 'launch_app') {
        try {
          await tv.launchApp(msg.app);
          ws.send(JSON.stringify({ type: 'app_ack', app: msg.app, success: true }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: err.message }));
        }
      } else if (msg.action === 'wake') {
        const sent = tv.wakeOnLan();
        ws.send(JSON.stringify({ type: 'wake_ack', success: sent }));
      } else if (msg.action === 'send_text') {
        try {
          await tv.sendText(msg.text);
          ws.send(JSON.stringify({ type: 'text_ack', success: true }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: err.message }));
        }
      }
    } catch (err) {
      console.error('WS message error:', err);
    }
  });
});

// REST Endpoints
app.get('/api/status', (req, res) => {
  res.json(tv.getStatus());
});

app.get('/api/discover', async (req, res) => {
  try {
    const list = await tv.discover();
    res.json({ success: true, count: list.length, devices: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/select-tv', (req, res) => {
  const { ip, name, mac } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP address required' });
  tv.setTV(ip, name, mac);
  res.json({ success: true, status: tv.getStatus() });
});

app.post('/api/send-key', async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'Key required' });
  try {
    await tv.sendKey(key);
    res.json({ success: true, key });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/power', async (req, res) => {
  try {
    const currentStatus = tv.getStatus();
    if (currentStatus.powerState === 'standby' || !currentStatus.connected) {
      // Trigger Wake-on-LAN and attempt KEY_POWER
      tv.wakeOnLan();
      try {
        await tv.sendKey('KEY_POWER');
      } catch (_) {}
      res.json({ success: true, action: 'wake_and_power' });
    } else {
      await tv.sendKey('KEY_POWER');
      res.json({ success: true, action: 'power_toggle' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/launch-app', async (req, res) => {
  const { app } = req.body;
  try {
    await tv.launchApp(app);
    res.json({ success: true, app });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/send-text', async (req, res) => {
  const { text } = req.body;
  try {
    await tv.sendText(text || '');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/wake', (req, res) => {
  const success = tv.wakeOnLan();
  res.json({ success });
});

// Helper to get local network IP for mobile display
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(interfaces)) {
    // Avoid virtual or VPN adapters if possible
    const lowerName = name.toLowerCase();
    const isVpnOrVirtual = lowerName.includes('tailscale') || lowerName.includes('vethernet') || lowerName.includes('loopback');
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push({ name, address: iface.address, isVpnOrVirtual });
      }
    }
  }

  // 1. Prefer physical non-VPN LAN addresses (192.168.x.x or 10.x.x.x)
  const physicalLan = candidates.find(c => !c.isVpnOrVirtual && (c.address.startsWith('192.168.') || c.address.startsWith('10.')));
  if (physicalLan) return physicalLan.address;

  // 2. Any non-VPN address that isn't link-local
  const physicalAny = candidates.find(c => !c.isVpnOrVirtual && !c.address.startsWith('169.254.'));
  if (physicalAny) return physicalAny.address;

  // 3. Any LAN address
  const anyLan = candidates.find(c => c.address.startsWith('192.168.') || c.address.startsWith('10.'));
  if (anyLan) return anyLan.address;

  return candidates[0]?.address || 'localhost';
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`\n======================================================`);
  console.log(`  Samsung Smart TV Web Remote running!`);
  console.log(`  Local URL:   http://localhost:${PORT}`);
  console.log(`  Mobile URL:  http://${localIP}:${PORT}`);
  console.log(`  (Open the Mobile URL in your phone's browser)`);
  console.log(`======================================================\n`);

  // Start background status polling
  tv.startBackgroundPolling();

  // If no configured IP yet, initiate auto-discovery
  if (!tv.config.tvIp) {
    console.log('No TV configured. Running initial discovery...');
    tv.discover().then(tvs => {
      if (tvs.length > 0) {
        console.log(`Auto-selected TV: ${tvs[0].data.name} at ${tvs[0].ip}`);
      }
    });
  } else {
    console.log(`Configured TV: ${tv.config.name} (${tv.config.tvIp})`);
    tv.connect();
  }
});
