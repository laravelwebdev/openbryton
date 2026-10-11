/**
 * api/bryton-climb.js
 * Proxy POST elevation points to Bryton Active ClimbPro API endpoint
 * Parameters: g1=150&g2=1.5&g3=150&c1=1.8&c2=2000&c3=300&d1=1000
 */

const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    let body = '';
    for await (const chunk of req) body += chunk;

    if (!body) {
      return res.status(400).json({ error: 'Empty request body' });
    }

    const brytonUrl = 'https://okaymlks2a.execute-api.us-west-2.amazonaws.com/prod/api/v1/?g1=150&g2=1.5&g3=150&c1=1.8&c2=2000&c3=300&d1=1000';

    const result = await new Promise((resolve, reject) => {
      let settled = false;
      const done = (err, resData) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve(resData);
      };

      const parsedUrl = new URL(brytonUrl);
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 15000
      };

      const proxyReq = https.request(options, (proxyRes) => {
        let respData = '';
        proxyRes.on('data', c => respData += c);
        proxyRes.on('end', () => done(null, { status: proxyRes.statusCode, data: respData }));
        proxyRes.on('error', err => done(err));
      });
      proxyReq.on('error', err => done(err));
      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        done(new Error('Request timeout'));
      });
      proxyReq.write(body);
      proxyReq.end();
    });

    if (result.status >= 200 && result.status < 300) {
      let parsed;
      try { parsed = JSON.parse(result.data); } catch (e) { parsed = { raw: result.data }; }
      return res.status(200).json(parsed);
    } else {
      return res.status(result.status).json({ error: `Bryton API error (${result.status}): ${result.data}` });
    }
  } catch (err) {
    console.error('Bryton climb proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
};

module.exports.config = {
  api: { bodyParser: false }
};
