const axios = require("axios");
const FormData = require("form-data");

const FACE_SERVICE_URL =
  process.env.FACE_SERVICE_URL || "http://localhost:8000";

const client = axios.create({
  baseURL: FACE_SERVICE_URL,
  timeout: 15000,
});

const registerFace = async (memberId, gymId, fileBuffer, filename) => {
  const form = new FormData();
  form.append("member_id", memberId);
  form.append("file", fileBuffer, filename);

  const response = await client.post("/face/register", form, {
    headers: form.getHeaders(),
  });

  return response.data;
};

const verifyFace = async (gymId, fileBuffer, filename) => {
  const form = new FormData();
  form.append("gym_id", gymId);
  form.append("file", fileBuffer, filename);

  const response = await client.post("/face/verify", form, {
    headers: form.getHeaders(),
  });

  return response.data;
};

const healthCheck = async () => {
  const response = await client.get("/health");
  return response.data;
};

module.exports = { registerFace, verifyFace, healthCheck };
