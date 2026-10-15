// Samsung TV Web Remote - Client Engine

(function () {
  'use strict';

  // State
  let ws = null;
  let tvState = {
    connected: false,
    pairingStatus: 'idle',
    tvIp: '',
    name: 'Samsung Smart TV',
    powerState: 'unknown',
    hasToken: false
  };

  let soundEnabled = localStorage.getItem('tv_remote_sound') !== 'false';
  let audioCtx = null;

  // DOM Elements
  const statusDot = document.getElementById('status-dot');
  const deviceTitle = document.getElementById('device-title');
  const deviceSubtitle = document.getElementById('device-subtitle');
  const pairingBanner = document.getElementById('pairing-banner');
  const pairingBannerText = document.getElementById('pairing-banner-text');
  const btnPower = document.getElementById('btn-power');
  const toastEl = document.getElementById('toast-notice');

  // Navigation mode elements
  const toggleDpad = document.getElementById('toggle-dpad-mode');
  const toggleTouchpad = document.getElementById('toggle-touchpad-mode');
  const dpadWrapper = document.getElementById('dpad-wrapper');
  const touchpadSurface = document.getElementById('touchpad-surface');

  // Modals
  const modalDevice = document.getElementById('modal-device');
  const modalNumpad = document.getElementById('modal-numpad');
  const modalKeyboard = document.getElementById('modal-keyboard');
  const deviceListContainer = document.getElementById('device-list-container');
  const btnScanNetwork = document.getElementById('btn-scan-network');
  const scanSpinner = document.getElementById('scan-spinner');
  const scanBtnLabel = document.getElementById('scan-btn-label');
  const inputManualIp = document.getElementById('input-manual-ip');

  // --- Audio / Haptic Feedback ---
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playClickSound(freq = 600, duration = 0.04) {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + duration);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (_) {}
  }

  function triggerHaptic(style = 'default') {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        if (style === 'heavy') {
          // Strong double buzz for power button and wake
          navigator.vibrate([45, 30, 45]);
        } else if (style === 'sharp') {
          // Crisp sharp click for D-pad, arrows, rockers
          navigator.vibrate(30);
        } else if (style === 'double') {
          // Double tap for app launcher and mode toggle
          navigator.vibrate([25, 20, 25]);
        } else if (style === 'light') {
          navigator.vibrate(20);
        } else {
          // Standard tactile pulse (noticeable across all phones)
          navigator.vibrate(35);
        }
      } catch (_) {}
    }
  }

  function createRipple(element, clientX, clientY) {
    try {
      const rect = element.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'click-ripple';

      const x = (typeof clientX === 'number' && clientX > 0) ? (clientX - rect.left) : (rect.width / 2);
      const y = (typeof clientY === 'number' && clientY > 0) ? (clientY - rect.top) : (rect.height / 2);

      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;

      const size = Math.max(rect.width, rect.height) * 1.8;
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;

      element.appendChild(ripple);
      setTimeout(() => ripple.remove(), 420);
    } catch (_) {}
  }

  function addTactileEffects(btn, hapticStyle = 'default', soundFreq = 600) {
    if (!btn) return;

    btn.addEventListener('pointerdown', (e) => {
      btn.classList.add('is-pressed');
      triggerHaptic(hapticStyle);
      playClickSound(soundFreq);
      createRipple(btn, e.clientX, e.clientY);
    });

    const removePressed = () => {
      btn.classList.remove('is-pressed');
    };

    btn.addEventListener('pointerup', removePressed);
    btn.addEventListener('pointercancel', removePressed);
    btn.addEventListener('pointerleave', removePressed);
  }

  function feedback(freq = 600, hapticStyle = 'default') {
    playClickSound(freq);
    triggerHaptic(hapticStyle);
  }

  // --- Toast Notification ---
  let toastTimer = null;
  function showToast(msg, duration = 2400) {
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, duration);
  }

  // --- WebSocket Connection ---
  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('Web remote WebSocket connected to server');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'tv_state') {
            updateUI(msg.data);
          } else if (msg.type === 'error') {
            showToast(`Error: ${msg.message}`);
          } else if (msg.type === 'key_ack') {
            // Success indicator
          }
        } catch (e) {
          console.error('Error handling message:', e);
        }
      };

      ws.onclose = () => {
        console.log('Server WebSocket closed. Reconnecting in 2s...');
        setTimeout(initWebSocket, 2000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket client error:', err);
      };
    } catch (e) {
      setTimeout(initWebSocket, 2000);
    }
  }

  // Send remote key
  function sendKey(keyName) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'send_key', key: keyName }));
    } else {
      // HTTP Fallback
      fetch('/api/send-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: keyName })
      }).catch(err => {
        showToast('Failed to send key to TV');
      });
    }
  }

  // Toggle or Wake TV
  function handlePower() {
    showToast('Powering TV...');
    fetch('/api/power', { method: 'POST' })
      .then(r => r.json())
      .then(res => {
        if (res.action === 'wake_and_power') {
          showToast('Sent Wake-on-LAN and Power Signal');
        } else {
          showToast('Power command sent');
        }
      })
      .catch(() => showToast('Error sending power signal'));
  }

  // Launch App
  function launchApp(appName) {
    showToast(`Launching ${appName}...`);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'launch_app', app: appName }));
    } else {
      fetch('/api/launch-app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: appName })
      });
    }
  }

  // Update UI with TV State
  function updateUI(state) {
    tvState = state;

    // Title and Subtitle
    deviceTitle.textContent = state.name || 'Samsung Smart TV';

    statusDot.className = 'status-dot';
    btnPower.classList.remove('is-active');

    if (state.connected) {
      statusDot.classList.add('online');
      deviceSubtitle.textContent = `${state.tvIp} • Connected`;
      btnPower.classList.add('is-active');
      pairingBanner.classList.add('hidden');
    } else if (state.pairingStatus === 'waiting_prompt') {
      statusDot.classList.add('connecting');
      deviceSubtitle.textContent = 'Waiting for TV permission...';
      pairingBanner.classList.remove('hidden');
      pairingBannerText.innerHTML = `Please turn TV ON. A prompt <em>"Allow WebRemote to connect?"</em> will appear. Click <strong>Allow</strong> with your remote.`;
    } else if (state.pairingStatus === 'timeout') {
      statusDot.classList.add('standby');
      deviceSubtitle.textContent = `${state.tvIp || 'TV'} • Standby / Timeout`;
      pairingBanner.classList.remove('hidden');
      pairingBannerText.innerHTML = `TV is in standby or prompt timed out. Tap the <strong>Power</strong> button to wake the TV, then allow pairing.`;
    } else if (state.powerState === 'standby') {
      statusDot.classList.add('standby');
      deviceSubtitle.textContent = `${state.tvIp} • Standby (Screen Off)`;
      pairingBanner.classList.add('hidden');
    } else if (state.tvIp) {
      statusDot.classList.add('standby');
      deviceSubtitle.textContent = `${state.tvIp} • Standby`;
      pairingBanner.classList.add('hidden');
    } else {
      statusDot.classList.add('offline');
      deviceSubtitle.textContent = 'No TV paired (Tap to scan)';
      pairingBanner.classList.add('hidden');
    }
  }

  // --- Attach Button Listeners & Tactile Effects ---
  function initButtons() {
    // Buttons with data-key (D-Pad, volume, numbers, actions)
    document.querySelectorAll('[data-key]').forEach(btn => {
      const key = btn.dataset.key;
      let hapticStyle = 'default';
      let freq = 550;

      if (key === 'KEY_ENTER') {
        hapticStyle = 'default';
        freq = 750;
      } else if (key.startsWith('KEY_UP') || key.startsWith('KEY_DOWN') || key.startsWith('KEY_LEFT') || key.startsWith('KEY_RIGHT')) {
        hapticStyle = 'sharp';
        freq = 620;
      } else if (key.includes('VOL') || key.includes('CH')) {
        hapticStyle = 'sharp';
        freq = 640;
      } else if (key === 'KEY_MUTE') {
        hapticStyle = 'double';
        freq = 480;
      }

      addTactileEffects(btn, hapticStyle, freq);

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        sendKey(key);
      });
    });

    // Power Button (distinct heavy haptic feedback)
    addTactileEffects(btnPower, 'heavy', 340);
    btnPower.addEventListener('click', (e) => {
      e.preventDefault();
      handlePower();
    });

    // App Launchers (double vibration pulse)
    document.querySelectorAll('[data-app]').forEach(btn => {
      const app = btn.dataset.app;
      addTactileEffects(btn, 'double', 800);
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        launchApp(app);
      });
    });

    // Navigation View Toggle (D-Pad vs Touchpad)
    addTactileEffects(toggleDpad, 'light', 500);
    toggleDpad.addEventListener('click', () => {
      toggleDpad.classList.add('active');
      toggleTouchpad.classList.remove('active');
      dpadWrapper.style.display = 'flex';
      touchpadSurface.classList.remove('active');
    });

    addTactileEffects(toggleTouchpad, 'light', 500);
    toggleTouchpad.addEventListener('click', () => {
      toggleTouchpad.classList.add('active');
      toggleDpad.classList.remove('active');
      dpadWrapper.style.display = 'none';
      touchpadSurface.classList.add('active');
    });

    // Tool buttons (Numpad, Text, Haptics toggle)
    const btnOpenNumpad = document.getElementById('btn-open-numpad');
    const btnOpenKeyboard = document.getElementById('btn-open-keyboard');
    const btnDeviceModal = document.getElementById('btn-device-modal');

    addTactileEffects(btnOpenNumpad, 'light', 520);
    addTactileEffects(btnOpenKeyboard, 'light', 520);
    addTactileEffects(btnDeviceModal, 'light', 480);

    // Touchpad Gesture Tracking
    initTouchpad();

    // Haptics / Sound Toggle
    const btnToggleHaptics = document.getElementById('btn-toggle-haptics');
    const hapticStatusText = document.getElementById('haptic-status-text');
    hapticStatusText.textContent = soundEnabled ? 'Sound: On' : 'Sound: Off';
    addTactileEffects(btnToggleHaptics, 'double', 700);

    btnToggleHaptics.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      localStorage.setItem('tv_remote_sound', soundEnabled ? 'true' : 'false');
      hapticStatusText.textContent = soundEnabled ? 'Sound: On' : 'Sound: Off';
      showToast(soundEnabled ? 'Audio feedback enabled' : 'Audio feedback muted');
    });

    // Modals setup
    setupModals();
  }

  // --- Touchpad Swipe & Tap Engine ---
  function initTouchpad() {
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    const threshold = 35; // minimum swipe distance

    touchpadSurface.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
      startY = e.clientY;
      startTime = Date.now();
      touchpadSurface.setPointerCapture(e.pointerId);

      // Create visual ripple
      const rect = touchpadSurface.getBoundingClientRect();
      const ripple = document.createElement('div');
      ripple.className = 'touchpad-ripple';
      ripple.style.left = `${e.clientX - rect.left}px`;
      ripple.style.top = `${e.clientY - rect.top}px`;
      touchpadSurface.appendChild(ripple);
      setTimeout(() => ripple.remove(), 400);
    });

    touchpadSurface.addEventListener('pointerup', (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const dt = Date.now() - startTime;

      if (Math.abs(dx) < 15 && Math.abs(dy) < 15 && dt < 300) {
        // Tap -> Enter
        triggerHaptic('default');
        playClickSound(750);
        sendKey('KEY_ENTER');
        return;
      }

      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > threshold) {
          triggerHaptic('sharp');
          playClickSound(620);
          sendKey('KEY_RIGHT');
        } else if (dx < -threshold) {
          triggerHaptic('sharp');
          playClickSound(620);
          sendKey('KEY_LEFT');
        }
      } else {
        if (dy > threshold) {
          triggerHaptic('sharp');
          playClickSound(620);
          sendKey('KEY_DOWN');
        } else if (dy < -threshold) {
          triggerHaptic('sharp');
          playClickSound(620);
          sendKey('KEY_UP');
        }
      }
    });
  }

  // --- Modals Setup ---
  function setupModals() {
    const closeDeviceBtn = document.getElementById('close-device-modal');
    const closeNumpadBtn = document.getElementById('close-numpad-modal');
    const closeKeyboardBtn = document.getElementById('close-keyboard-modal');
    const btnManualConnect = document.getElementById('btn-manual-connect');

    addTactileEffects(closeDeviceBtn, 'light', 450);
    addTactileEffects(closeNumpadBtn, 'light', 450);
    addTactileEffects(closeKeyboardBtn, 'light', 450);
    addTactileEffects(btnScanNetwork, 'default', 600);
    addTactileEffects(btnManualConnect, 'default', 650);

    // Open Device Modal
    document.getElementById('btn-device-modal').addEventListener('click', () => {
      openModal(modalDevice);
      populateDeviceList();
    });
    closeDeviceBtn.addEventListener('click', () => closeModal(modalDevice));

    // Open Numpad Modal
    document.getElementById('btn-open-numpad').addEventListener('click', () => openModal(modalNumpad));
    closeNumpadBtn.addEventListener('click', () => closeModal(modalNumpad));

    // Open Keyboard Modal
    document.getElementById('btn-open-keyboard').addEventListener('click', () => {
      openModal(modalKeyboard);
      setTimeout(() => document.getElementById('input-tv-text').focus(), 150);
    });
    closeKeyboardBtn.addEventListener('click', () => closeModal(modalKeyboard));

    // Scan Network button
    btnScanNetwork.addEventListener('click', runDiscovery);

    // Manual IP connect
    btnManualConnect.addEventListener('click', () => {
      const ip = inputManualIp.value.trim();
      if (!ip) return;
      selectTV(ip, 'Samsung TV');
      closeModal(modalDevice);
    });

    // Text Input Form Submission
    document.getElementById('form-send-text').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('input-tv-text');
      const text = input.value.trim();
      if (!text) return;

      feedback(650);
      showToast(`Sending: "${text}"`);
      fetch('/api/send-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
        .then(() => {
          input.value = '';
          closeModal(modalKeyboard);
        })
        .catch(() => showToast('Failed to send text'));
    });

    // Close on backdrop tap
    [modalDevice, modalNumpad, modalKeyboard].forEach(m => {
      m.addEventListener('click', (e) => {
        if (e.target === m) closeModal(m);
      });
    });
  }

  function openModal(modal) {
    feedback(450);
    modal.classList.add('active');
  }

  function closeModal(modal) {
    modal.classList.remove('active');
  }

  // Populate Device List in Modal
  function populateDeviceList() {
    deviceListContainer.innerHTML = '';

    if (tvState.tvIp) {
      const card = document.createElement('div');
      card.className = 'device-item selected';
      card.innerHTML = `
        <div class="device-item-info">
          <strong>${tvState.name || 'Samsung Smart TV'}</strong>
          <span>IP: ${tvState.tvIp} • ${tvState.connected ? 'Connected' : 'Standby'}</span>
        </div>
        <span style="font-size:11px;color:var(--accent-cyan);font-weight:700;">ACTIVE</span>
      `;
      deviceListContainer.appendChild(card);
    }
  }

  // Run Network Discovery
  async function runDiscovery() {
    feedback(600);
    scanSpinner.classList.add('spinning');
    scanBtnLabel.textContent = 'Scanning local network...';
    btnScanNetwork.disabled = true;

    try {
      const res = await fetch('/api/discover');
      const data = await res.json();

      deviceListContainer.innerHTML = '';
      if (data.devices && data.devices.length > 0) {
        data.devices.forEach(item => {
          const card = document.createElement('div');
          const isCurrent = item.ip === tvState.tvIp;
          card.className = `device-item ${isCurrent ? 'selected' : ''}`;
          card.innerHTML = `
            <div class="device-item-info">
              <strong>${item.data.name || item.data.device?.name || 'Samsung TV'}</strong>
              <span>IP: ${item.ip} • Model: ${item.data.device?.modelName || '4K'}</span>
            </div>
            <span style="font-size:11px;color:${isCurrent ? 'var(--accent-cyan)' : 'var(--text-muted)'};font-weight:700;">
              ${isCurrent ? 'ACTIVE' : 'SELECT'}
            </span>
          `;
          card.addEventListener('click', () => {
            selectTV(item.ip, item.data.name, item.data.device?.wifiMac);
            closeModal(modalDevice);
          });
          deviceListContainer.appendChild(card);
        });
        showToast(`Found ${data.devices.length} Samsung TV(s)`);
      } else {
        deviceListContainer.innerHTML = `<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px;">No TVs found automatically. Enter IP manually below.</div>`;
        showToast('No new TVs found');
      }
    } catch (e) {
      showToast('Scan failed: ' + e.message);
    } finally {
      scanSpinner.classList.remove('spinning');
      scanBtnLabel.textContent = 'Scan Network for TVs';
      btnScanNetwork.disabled = false;
    }
  }

  // Select TV
  function selectTV(ip, name, mac) {
    feedback(700);
    showToast(`Connecting to ${name || ip}...`);
    fetch('/api/select-tv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, name, mac })
    });
  }

  // Desktop Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // Avoid triggering when user is typing in text fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); sendKey('KEY_UP'); break;
      case 'ArrowDown': e.preventDefault(); sendKey('KEY_DOWN'); break;
      case 'ArrowLeft': e.preventDefault(); sendKey('KEY_LEFT'); break;
      case 'ArrowRight': e.preventDefault(); sendKey('KEY_RIGHT'); break;
      case 'Enter': e.preventDefault(); sendKey('KEY_ENTER'); break;
      case 'Backspace':
      case 'Escape': e.preventDefault(); sendKey('KEY_RETURN'); break;
      case 'Home': e.preventDefault(); sendKey('KEY_HOME'); break;
      case '+':
      case '=': e.preventDefault(); sendKey('KEY_VOLUP'); break;
      case '-':
      case '_': e.preventDefault(); sendKey('KEY_VOLDOWN'); break;
      case 'm':
      case 'M': e.preventDefault(); sendKey('KEY_MUTE'); break;
      case ' ': e.preventDefault(); sendKey('KEY_PLAY'); break;
    }
  });

  // Initialize on load
  window.addEventListener('DOMContentLoaded', () => {
    initButtons();
    initWebSocket();
  });

})();
