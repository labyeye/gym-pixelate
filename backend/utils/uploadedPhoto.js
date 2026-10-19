// Photos are uploaded through POST /api/upload and stored on this server; a hand-typed link
// to somewhere else is rejected. Empty (= no photo) is fine.
const uploadedPhoto = (v) => !v || /\/uploads\/[\w.-]+$/.test(String(v));
module.exports = { uploadedPhoto };
