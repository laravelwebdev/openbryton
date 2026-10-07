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

  let body = '';
  if (typeof req.body === 'object') {
    body = req.body;
  } else {
    body = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
      req.on('error', reject);
    });
  }

  const { email, password } = body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  // SHA-256 hash password sesuai standar Meteor
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

  // Login via DDP — gunakan https request ke SockJS info endpoint dulu,
  // lalu handshake WebSocket manual via http upgrade.
  // Karena Vercel serverless tidak support WebSocket outbound dengan mudah,
  // kita gunakan http.get ke SockJS polling endpoint sebagai fallback
  
  try {
    const result = await loginViaSockJsXhr(email, passwordHash);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Bryton login error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Login via SockJS XHR-streaming transport (tanpa WebSocket)
 * SockJS endpoint: https://active.brytonsport.com/sockjs/{server}/{session}/xhr
 */
async function loginViaSockJsXhr(email, passwordHash) {
  const serverId = String(Math.floor(Math.random() * 999)).padStart(3, '0');
  const sessionId = Array.from({ length: 8 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
  const baseUrl = `active.brytonsport.com`;

  // Step 1: SockJS info request
  await httpsGet(`https://${baseUrl}/sockjs/info`);

  // Step 2: XHR open session
  await httpsPost(`https://${baseUrl}/sockjs/${serverId}/${sessionId}/xhr`, '');

  // Step 3: Send DDP connect
  const connectMsg = JSON.stringify([JSON.stringify({ msg: 'connect', version: '1', support: ['1'] })]);
  await httpsPost(`https://${baseUrl}/sockjs/${serverId}/${sessionId}/xhr_send`, connectMsg);

  // Step 4: Receive connected
  let session = null;
  for (let i = 0; i < 3; i++) {
    let poll = await httpsPost(`https://${baseUrl}/sockjs/${serverId}/${sessionId}/xhr`, '');
    session = extractDDPSession(poll);
    if (session) break;
    // If it's an 'o' frame (open), just continue polling
    if (poll.trim() === 'o') continue;
  }
  if (!session) throw new Error('DDP connect failed, no session found in response');

  // Step 5: Send login method
  const loginMsg = JSON.stringify([JSON.stringify({
    msg: 'method',
    method: 'login',
    id: '1',
    params: [{
      user: { email },
      password: { digest: passwordHash, algorithm: 'sha-256' }
    }]
  })]);
  await httpsPost(`https://${baseUrl}/sockjs/${serverId}/${sessionId}/xhr_send`, loginMsg);

  // Step 6: Poll untuk result (beberapa kali karena mungkin ada pesan added/updated dulu)
  for (let i = 0; i < 5; i++) {
    let pollData = await httpsPost(`https://${baseUrl}/sockjs/${serverId}/${sessionId}/xhr`, '');
    const loginResult = extractDDPResult(pollData, '1');
    if (loginResult !== null) return loginResult;
    await sleep(300);
  }

  throw new Error('Login timeout — no result received from Bryton server');
}

function extractDDPSession(raw) {
  try {
    const frames = parseSockJsFrames(raw);
    for (const f of frames) {
      const msg = JSON.parse(f);
      if (msg.msg === 'connected') return msg.session;
    }
  } catch(e) {}
  return null;
}

function extractDDPResult(raw, id) {
  try {
    const frames = parseSockJsFrames(raw);
    for (const f of frames) {
      const msg = JSON.parse(f);
      if (msg.msg === 'result' && msg.id === id) {
        if (msg.error) throw new Error(msg.error.reason || msg.error.message || 'Login failed');
        return msg.result;
      }
    }
  } catch(e) {
    if (e.message && (e.message.includes('Login') || e.message.includes('Match') || e.message.includes('password'))) throw e;
  }
  return null;
}

function parseSockJsFrames(raw) {
  const frames = [];
  if (!raw) return frames;
  // SockJS format: a["msg1","msg2"] or h or o or c[...]
  if (raw.startsWith('a[')) {
    try {
      const arr = JSON.parse(raw.substring(1));
      frames.push(...arr);
    } catch(e) {}
  }
  return frames;
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://active.brytonsport.com' }, timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const bodyBuf = Buffer.from(body, 'utf8');
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': bodyBuf.length,
        'User-Agent': 'Mozilla/5.0',
        'Origin': 'https://active.brytonsport.com',
        'Referer': 'https://active.brytonsport.com/'
      },
      timeout: 15000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(bodyBuf);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
