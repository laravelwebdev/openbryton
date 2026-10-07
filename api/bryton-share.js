/**
 * api/bryton-share.js
 * Proxy POST FIT file ke Bryton Active route upload endpoint
 * Menghindari CORS karena dikirim dari server Vercel
 */

const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const userId = req.query.userId;
  const routeName = req.query.name || 'BrytonRoute';

  if (!userId) return res.status(400).json({ error: 'userId is required' });

  // Baca raw body (FIT binary)
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const fitBuffer = Buffer.concat(chunks);

  if (!fitBuffer || fitBuffer.length === 0) {
    return res.status(400).json({ error: 'Empty FIT file body' });
  }

  // Boundary untuk multipart/form-data
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const CRLF = '\r\n';
  const filename = routeName.replace(/[^a-zA-Z0-9_\- ]/g, '_') + '.fit';

  // Build multipart body
  let header = '';
  header += `--${boundary}${CRLF}`;
  header += `Content-Disposition: form-data; name="name"${CRLF}${CRLF}`;
  header += `${routeName}${CRLF}`;
  header += `--${boundary}${CRLF}`;
  header += `Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}`;
  header += `Content-Type: application/octet-stream${CRLF}${CRLF}`;
  const footer = `${CRLF}--${boundary}--${CRLF}`;

  const bodyBuffer = Buffer.concat([
    Buffer.from(header, 'utf8'),
    fitBuffer,
    Buffer.from(footer, 'utf8')
  ]);

  const options = {
    hostname: 'active.brytonsport.com',
    path: `/route/upload/${userId}`,
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': bodyBuffer.length,
      'Origin': 'https://active.brytonsport.com',
      'Referer': 'https://active.brytonsport.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 30000
  };

  try {
    const result = await new Promise((resolve, reject) => {
      const proxyReq = https.request(options, (proxyRes) => {
        let data = '';
        proxyRes.on('data', c => data += c);
        proxyRes.on('end', () => resolve({ status: proxyRes.statusCode, body: data, headers: proxyRes.headers }));
      });
      proxyReq.on('error', reject);
      proxyReq.on('timeout', () => { proxyReq.destroy(); reject(new Error('Request timeout')); });
      proxyReq.write(bodyBuffer);
      proxyReq.end();
    });

    console.log('Bryton upload response:', result.status, result.body?.substring(0, 200));

    if (result.status >= 200 && result.status < 300) {
      let parsed;
      try { parsed = JSON.parse(result.body); } catch(e) { parsed = { raw: result.body }; }
      return res.status(200).json({ success: true, status: result.status, data: parsed });
    } else {
      return res.status(result.status).json({
        success: false,
        status: result.status,
        body: result.body?.substring(0, 500)
      });
    }
  } catch (err) {
    console.error('Bryton share error:', err);
    return res.status(500).json({ error: err.message });
  }
};

module.exports.config = {
  api: { bodyParser: false }
};
