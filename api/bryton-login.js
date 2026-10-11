/**
 * api/bryton-login.js
 * Vercel Serverless Function — Proxy login ke Bryton Active via DDP over SockJS WebSocket
 * Mengembalikan Meteor userId dari email + password
 */

const https = require('https');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  let body = {};
  if (req.body && typeof req.body === 'object') {
    body = req.body;
  } else if (typeof req.body === 'string') {
    try { body = JSON.parse(req.body); } catch (_) {}
  } else {
    try {
      body = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
        req.on('error', reject);
      });
    } catch (_) {}
  }

  const { email, password } = body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  // SHA-256 hash password sesuai standar Meteor
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

  try {
    const result = await loginViaWebSocket(email, passwordHash);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Bryton login error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Login via WebSocket (Lebih cepat dan tidak kena timeout XHR di Vercel)
 * Membutuhkan package 'ws' (sudah diinstall di package.json)
 */
const WebSocket = require('ws');

function loginViaWebSocket(email, passwordHash) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout = null;

    const done = (err, result) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      try { ws.close(); } catch (_) {}
      if (err) reject(err);
      else resolve(result);
    };

    const serverId = String(Math.floor(Math.random() * 999)).padStart(3, '0');
    const sessionId = Array.from({ length: 8 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
    const wsUrl = `wss://active.brytonsport.com/sockjs/${serverId}/${sessionId}/websocket`;

    const ws = new WebSocket(wsUrl);
    let isConnected = false;

    // Timeout proteksi (10 detik)
    timeout = setTimeout(() => {
      done(new Error('WebSocket login timeout'));
    }, 10000);

    ws.on('open', () => {
      // Step 1: Send DDP connect
      const connectMsg = JSON.stringify([JSON.stringify({ msg: 'connect', version: '1', support: ['1'] })]);
      ws.send(connectMsg);
    });

    ws.on('message', (data) => {
      const raw = data.toString();
      
      // Abaikan frame 'o' (open) atau 'h' (heartbeat)
      if (raw === 'o' || raw === 'h') return;

      if (raw.startsWith('a[')) {
        try {
          const frames = JSON.parse(raw.substring(1));
          for (const frameStr of frames) {
            const msg = JSON.parse(frameStr);

            // Step 2: Terima connected, lalu kirim login
            if (msg.msg === 'connected') {
              isConnected = true;
              const loginMsg = JSON.stringify([JSON.stringify({
                msg: 'method',
                method: 'login',
                id: '1',
                params: [{
                  user: { email },
                  password: { digest: passwordHash, algorithm: 'sha-256' }
                }]
              })]);
              ws.send(loginMsg);
            } else if (msg.msg === 'failed') {
              done(new Error('DDP version negotiation failed'));
            }

            // Step 3: Terima result dari login
            if (msg.msg === 'result' && msg.id === '1') {
              if (msg.error) {
                done(new Error(msg.error.reason || msg.error.message || 'Login failed'));
              } else {
                done(null, msg.result); // Mengembalikan { id: userId, token: ... }
              }
            }
          }
        } catch (e) {
          console.error('WebSocket parse error:', e);
        }
      }
    });

    ws.on('error', (err) => {
      done(err);
    });

    ws.on('close', () => {
      if (!isConnected) {
        done(new Error('WebSocket closed before connection established'));
      }
    });
  });
}
