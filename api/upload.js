const { put } = require('@vercel/blob');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const filename = request.query.filename || 'route.fit';
    
    // Upload request directly to Vercel Blob
    const blob = await put(`temp_fits/${filename}`, request, {
      access: 'public'
    });
    
    return response.status(200).json(blob);
  } catch (error) {
    console.error('Blob Upload Error:', error);
    return response.status(500).json({ error: error.message });
  }
};

// Disable Vercel's default body parser so we can stream the raw binary file
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
