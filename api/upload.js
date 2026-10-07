/**
 * api/upload.js — DEPRECATED
 * File ini tidak lagi digunakan. Share ke Bryton Active sekarang menggunakan
 * api/bryton-share.js yang langsung POST ke endpoint Bryton Active.
 *
 * File ini dipertahankan untuk menghindari error 404 jika ada referensi lama.
 */
module.exports = async function handler(req, res) {
  return res.status(410).json({
    error: 'This endpoint is deprecated. Use /api/bryton-share instead.',
    deprecated: true
  });
};
