const WebSocket = require('ws');
const dgram = require('dgram');
const os = require('os');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'config.json');

// Default popular app IDs for Samsung Tizen
const APP_IDS = {
  youtube: '111299001912',
  netflix: '11101200001',
  prime: '3201512006785',
  spotify: '3201606009684',
  disney: '3201907018807',
  apple: '3201807016597',
  browser: 'org.tizen.browser'
};

class SamsungTVManager {
  constructor() {
    this.config = this.loadConfig();
    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.pairingStatus = 'idle'; // idle, waiting_prompt, paired, error
    this.tvInfo = null;
    this.lastError = null;
    this.reconnectTimer = null;
    this.statusPollTimer = null;
    this.listeners = new Set();
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        return {
          tvIp: data.tvIp || '',
          mac: data.mac || '',
          token: data.token || '',
          name: data.name || 'Samsung Smart TV'
        };
      }
    } catch (e) {
      console.error('Error loading config:', e.message);
    }
    return { tvIp: '', mac: '', token: '', name: 'Samsung Smart TV' };
  }

  saveConfig() {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf8');
      console.log('Saved configuration to config.json');
    } catch (e) {
      console.error('Error saving config:', e.message);
    }
  }

  onStateChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitState() {
    const state = this.getStatus();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (err) {
        console.error('Listener error:', err);
      }
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      pairingStatus: this.pairingStatus,
      tvIp: this.config.tvIp,
      mac: this.config.mac,
      hasToken: Boolean(this.config.token),
      name: this.tvInfo?.name || this.config.name,
      modelName: this.tvInfo?.device?.modelName || '',
      powerState: this.tvInfo?.device?.PowerState || (this.isConnected ? 'on' : 'unknown'),
      lastError: this.lastError
    };
  }

  // Auto-scan local subnets to find Samsung TV
  async discover() {
    console.log('Starting TV discovery...');
    const interfaces = os.networkInterfaces();
    const candidateIPs = [];

    // Collect all local IPv4 subnets
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          const parts = iface.address.split('.');
          if (parts.length === 4) {
            const prefix = `${parts[0]}.${parts[1]}.${parts[2]}.`;
            for (let i = 1; i <= 254; i++) {
              candidateIPs.push(prefix + i);
            }
          }
        }
      }
    }

    console.log(`Probing ${candidateIPs.length} IP addresses...`);
    const batchSize = 40;
    const discovered = [];

    for (let i = 0; i < candidateIPs.length; i += batchSize) {
      const batch = candidateIPs.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(ip =>
          fetch(`http://${ip}:8001/api/v2/`, { signal: AbortSignal.timeout(1200) })
            .then(async res => {
              if (res.ok) {
                const data = await res.json();
                if (data?.device?.type === 'Samsung SmartTV' || data?.type === 'Samsung SmartTV' || data?.name?.includes('Samsung') || data?.device?.modelName) {
                  return { ip, data };
                }
              }
              return null;
            })
            .catch(() => null)
        )
      );

      for (const res of results) {
        if (res) {
          discovered.push(res);
        }
      }
      if (discovered.length > 0 && i > 254) {
        // Found on primary subnet, can stop early
        break;
      }
    }

    console.log(`Discovery complete. Found ${discovered.length} TVs:`, discovered.map(d => `${d.data.name} (${d.ip})`));
    
    // Auto-select first discovered if no IP configured or current IP offline
    if (discovered.length > 0) {
      const first = discovered[0];
      if (!this.config.tvIp || this.config.tvIp === first.ip) {
        this.config.tvIp = first.ip;
        this.config.name = first.data.name || first.data.device?.name || 'Samsung TV';
        this.config.mac = first.data.device?.wifiMac || this.config.mac;
        this.tvInfo = first.data;
        this.saveConfig();
        this.connect();
      }
    }

    return discovered;
  }

  // Update TV IP manually or selected from UI
  setTV(ip, name, mac) {
    if (this.config.tvIp !== ip) {
      // If changing IP, clear previous token unless user kept same TV
      if (this.config.tvIp && this.config.tvIp !== ip) {
        this.config.token = '';
      }
      this.config.tvIp = ip;
      if (name) this.config.name = name;
      if (mac) this.config.mac = mac;
      this.saveConfig();
      this.disconnect();
      this.connect();
    }
  }

  async checkInfo() {
    if (!this.config.tvIp) return null;
    try {
      const res = await fetch(`http://${this.config.tvIp}:8001/api/v2/`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        this.tvInfo = await res.json();
        if (this.tvInfo.device?.wifiMac && !this.config.mac) {
          this.config.mac = this.tvInfo.device.wifiMac;
          this.saveConfig();
        }
        return this.tvInfo;
      }
    } catch (e) {
      // TV might be completely powered off or unreachable
    }
    return null;
  }

  connect() {
    if (!this.config.tvIp) {
      console.log('No TV IP configured, skipping connect');
      return;
    }

    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    this.pairingStatus = this.config.token ? 'connecting' : 'waiting_prompt';
    this.emitState();

    const appName = Buffer.from('WebRemote').toString('base64');
    let url = `wss://${this.config.tvIp}:8002/api/v2/channels/samsung.remote.control?name=${appName}`;
    if (this.config.token) {
      url += `&token=${this.config.token}`;
    }

    console.log(`Connecting to TV WebSocket at ${url} (hasToken: ${Boolean(this.config.token)})...`);

    try {
      if (this.ws) {
        try { this.ws.terminate(); } catch (_) {}
      }

      this.ws = new WebSocket(url, {
        rejectUnauthorized: false,
        handshakeTimeout: 8000
      });

      this.ws.on('open', () => {
        console.log('Samsung TV WebSocket connection established');
        this.isConnected = true;
        this.isConnecting = false;
        this.lastError = null;
        this.pairingStatus = this.config.token ? 'paired' : 'waiting_prompt';
        this.emitState();
      });

      this.ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          console.log('Message from TV:', JSON.stringify(msg));

          if (msg.event === 'ms.channel.connect') {
            if (msg.data && msg.data.token) {
              console.log('New pairing token received from TV:', msg.data.token);
              this.config.token = msg.data.token;
              this.saveConfig();
              this.pairingStatus = 'paired';
              this.emitState();
            } else {
              this.pairingStatus = 'paired';
              this.emitState();
            }
          } else if (msg.event === 'ms.channel.timeOut') {
            console.log('TV handshake timed out (TV might be in standby or user did not click Allow)');
            this.pairingStatus = 'timeout';
            this.emitState();
          } else if (msg.event === 'ms.channel.unauthorized') {
            console.log('Token unauthorized or revoked by TV. Resetting token...');
            this.config.token = '';
            this.saveConfig();
            this.pairingStatus = 'unauthorized';
            this.emitState();
          }
        } catch (err) {
          console.error('Failed to parse TV message:', err);
        }
      });

      this.ws.on('close', (code, reason) => {
        console.log(`TV WebSocket closed (code: ${code}, reason: ${reason?.toString() || 'none'})`);
        this.isConnected = false;
        this.isConnecting = false;
        this.emitState();
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        console.error('TV WebSocket error:', err.message);
        this.lastError = err.message;
        this.isConnected = false;
        this.isConnecting = false;
        this.emitState();
      });
    } catch (err) {
      console.error('Failed to initialize WebSocket client:', err.message);
      this.isConnecting = false;
      this.lastError = err.message;
      this.emitState();
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(async () => {
      if (!this.isConnected && this.config.tvIp) {
        try {
          const info = await this.checkInfo();
          if (info) {
            const power = info.device?.PowerState;
            if (power === 'on') {
              this.connect();
            } else {
              // TV is in standby, screen off. Do not flood WebSocket.
              this.pairingStatus = 'standby';
              this.emitState();
              this.scheduleReconnect();
            }
          } else {
            this.scheduleReconnect();
          }
        } catch (_) {
          this.scheduleReconnect();
        }
      }
    }, 10000);
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
    this.emitState();
  }

  // Send Remote Key (e.g. KEY_VOLUP, KEY_HOME, KEY_ENTER, etc.)
  async sendKey(keyName) {
    if (!this.config.tvIp) {
      throw new Error('TV IP is not set');
    }

    // If power key is requested and TV is in standby, also trigger Wake-on-LAN
    if (keyName === 'KEY_POWER' && (!this.isConnected || this.tvInfo?.device?.PowerState === 'standby')) {
      this.wakeOnLan();
    }

    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Attempt quick reconnect
      this.connect();
      // Wait up to 1.5s for open
      await new Promise(resolve => setTimeout(resolve, 800));
      if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        throw new Error('Not connected to TV WebSocket. Please make sure TV is ON.');
      }
    }

    const payload = {
      method: 'ms.remote.control',
      params: {
        Cmd: 'Click',
        DataOfCmd: keyName,
        Option: 'false',
        TypeOfRemote: 'SendRemoteKey'
      }
    };

    console.log(`Sending key to TV: ${keyName}`);
    this.ws.send(JSON.stringify(payload));
    return { success: true, key: keyName };
  }

  // Send Wake-on-LAN packet to TV's MAC address
  wakeOnLan() {
    const mac = this.config.mac || this.tvInfo?.device?.wifiMac;
    if (!mac) {
      console.warn('Cannot send WoL: TV MAC address is unknown');
      return false;
    }

    const cleanMac = mac.replace(/[^0-9a-fA-F]/g, '');
    if (cleanMac.length !== 12) {
      console.error('Invalid MAC address:', mac);
      return false;
    }

    console.log(`Sending Wake-on-LAN magic packet to ${mac}...`);
    const magic = Buffer.alloc(102);
    magic.fill(0xff, 0, 6);
    const macBuf = Buffer.from(cleanMac, 'hex');
    for (let i = 0; i < 16; i++) {
      macBuf.copy(magic, 6 + i * 6);
    }

    const client = dgram.createSocket('udp4');
    client.bind(() => {
      client.setBroadcast(true);
      // Broadcast to subnet
      const subnetBroadcast = this.config.tvIp ? this.config.tvIp.replace(/\.\d+$/, '.255') : '255.255.255.255';
      client.send(magic, 9, subnetBroadcast, () => {
        client.send(magic, 9, '255.255.255.255', () => {
          client.close();
        });
      });
    });

    return true;
  }

  // Launch pre-configured application
  async launchApp(appKey) {
    if (!this.config.tvIp) throw new Error('No TV configured');
    const appId = APP_IDS[appKey.toLowerCase()] || appKey;

    console.log(`Launching app ${appKey} (${appId}) on TV...`);
    try {
      const res = await fetch(`http://${this.config.tvIp}:8001/api/v2/applications/${appId}`, {
        method: 'POST',
        signal: AbortSignal.timeout(3000)
      });
      return { success: res.ok };
    } catch (e) {
      // Fallback: try opening via WebSocket if available
      if (this.isConnected && this.ws) {
        const payload = {
          method: 'ms.channel.emit',
          params: {
            event: 'ed.apps.launch',
            to: 'host',
            data: { appId, action_type: 'DEEP_LINK' }
          }
        };
        this.ws.send(JSON.stringify(payload));
        return { success: true, method: 'websocket' };
      }
      throw e;
    }
  }

  // Send Text string (typing into TV search inputs)
  async sendText(text) {
    if (!this.isConnected || !this.ws) {
      throw new Error('Not connected to TV');
    }

    console.log(`Sending text to TV: "${text}"`);
    const encoded = Buffer.from(text).toString('base64');
    const payload = {
      method: 'ms.remote.control',
      params: {
        Cmd: encoded,
        DataOfCmd: 'base64',
        TypeOfRemote: 'SendInputString'
      }
    };
    this.ws.send(JSON.stringify(payload));
    return { success: true };
  }

  startBackgroundPolling() {
    this.checkInfo();
    if (this.statusPollTimer) clearInterval(this.statusPollTimer);
    this.statusPollTimer = setInterval(async () => {
      await this.checkInfo();
      this.emitState();
    }, 10000);
  }
}

module.exports = new SamsungTVManager();
