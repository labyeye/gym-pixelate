const crypto = require("crypto");
const asyncHandler = require("express-async-handler");
const Tenant = require("../models/Tenant");

// Fields that are always collected — not configurable
const FIXED_FIELDS = ["name", "phone"];

// All fields the owner can add to the form
const ALLOWED_FIELD_KEYS = [
  "company",
  "email",
  "requirement",
  "budget",
  "location",
  "product",
];

const hashKey = (rawKey) =>
  crypto.createHash("sha256").update(rawKey).digest("hex");

// POST /api/api-keys
const generateApiKey = asyncHandler(async (req, res) => {
  const { name, fields } = req.body;

  if (!name || !name.trim()) {
    res.status(400);
    throw new Error("Key name is required");
  }

  // Validate field config
  const fieldConfig = Array.isArray(fields) ? fields : [];
  for (const f of fieldConfig) {
    if (!ALLOWED_FIELD_KEYS.includes(f.key)) {
      res.status(400);
      throw new Error(`Invalid field key: ${f.key}`);
    }
    if (!f.label || !f.label.trim()) {
      res.status(400);
      throw new Error(`Label is required for field: ${f.key}`);
    }
  }

  const tenant = await Tenant.findById(req.user.tenantId);
  if (!tenant) {
    res.status(404);
    throw new Error("Tenant not found");
  }

  if (tenant.apiKeys && tenant.apiKeys.length >= 10) {
    res.status(400);
    throw new Error("Maximum of 10 API keys allowed");
  }

  const rawKey = "nlk_live_" + crypto.randomBytes(32).toString("hex");
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.substring(0, 16); // "nlk_live_" + 7 chars

  const sanitizedFields = fieldConfig.map((f) => ({
    key: f.key,
    label: f.label.trim(),
    type: f.type || "text",
    required: !!f.required,
  }));

  tenant.apiKeys.push({
    name: name.trim(),
    keyHash,
    keyPrefix,
    fields: sanitizedFields,
  });
  await tenant.save();

  const newKey = tenant.apiKeys[tenant.apiKeys.length - 1];

  res.status(201).json({
    success: true,
    data: {
      id: newKey._id,
      name: newKey.name,
      key: rawKey, // shown ONLY ONCE — never stored in plain text
      keyPrefix,
      fields: newKey.fields,
      createdAt: newKey.createdAt,
    },
  });
});

// GET /api/api-keys
const listApiKeys = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.user.tenantId).select("apiKeys");
  if (!tenant) {
    res.status(404);
    throw new Error("Tenant not found");
  }

  const keys = (tenant.apiKeys || []).map((k) => ({
    id: k._id,
    name: k.name,
    keyPrefix: k.keyPrefix,
    active: k.active,
    fields: k.fields || [],
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt,
  }));

  res.json({ success: true, data: keys });
});

// DELETE /api/api-keys/:id  — revoke (soft delete)
const revokeApiKey = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.user.tenantId);
  if (!tenant) {
    res.status(404);
    throw new Error("Tenant not found");
  }

  const key = tenant.apiKeys.id(req.params.id);
  if (!key) {
    res.status(404);
    throw new Error("API key not found");
  }

  key.active = false;
  await tenant.save();

  res.json({ success: true, message: "API key revoked" });
});

module.exports = { generateApiKey, listApiKeys, revokeApiKey, FIXED_FIELDS };
