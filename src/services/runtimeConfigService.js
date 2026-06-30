const RuntimeConfig = require('../models/RuntimeConfig');

async function getNumberConfig(key, fallback) {
  try {
    const row = await RuntimeConfig.findOne({ key }).select('numberValue').lean();
    const value = row?.numberValue;
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.floor(value);
  } catch {
    return fallback;
  }
}

async function setNumberConfig(key, value) {
  const numberValue = Math.floor(Number(value));
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error('Config value must be a positive number');
  }
  await RuntimeConfig.updateOne(
    { key },
    { $set: { numberValue } },
    { upsert: true },
  );
  return numberValue;
}

module.exports = {
  getNumberConfig,
  setNumberConfig,
};
