const { put } = require('@vercel/blob');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const filename = request.query.filename || 'route.fit';
    
    // We upload the raw request body to Vercel Blob
    const blob = await put(`temp_fits/${filename}`, request, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    
    return response.status(200).json(blob);
  } catch (error) {
    console.error('Blob Upload Error:', error);
    return response.status(500).json({ error: error.message });
  }
};
