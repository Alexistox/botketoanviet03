const Config = require('../models/Config');
const Group = require('../models/Group');

const A_RATIO_KEY = 'a_ratio';
const A_VARS_KEY = 'a_vars';
const RESERVED_A_VAR_NAMES = new Set(['k', 'm', 'tr']);

async function seedARatioFromGroupsIfNeeded() {
  const existing = await Config.findOne({ key: A_RATIO_KEY }).lean();
  if (existing && existing.value && existing.value.y) {
    return existing.value;
  }

  const group = await Group.collection.find({ aRatioY: { $ne: 0, $exists: true } }).sort({ updatedAt: -1 }).limit(1).next();
  if (!group || !group.aRatioY) {
    return null;
  }

  const value = { x: group.aRatioX || 0, y: group.aRatioY };
  await Config.findOneAndUpdate(
    { key: A_RATIO_KEY },
    {
      key: A_RATIO_KEY,
      value,
      description: 'Tỷ lệ /a1 toàn bot',
      updatedBy: 'system'
    },
    { upsert: true }
  );
  return value;
}

async function getARatio() {
  const config = await Config.findOne({ key: A_RATIO_KEY }).lean();
  if (config && config.value && config.value.y) {
    return config.value;
  }
  return seedARatioFromGroupsIfNeeded();
}

async function setARatio(x, y, updatedBy = 'system') {
  await Config.findOneAndUpdate(
    { key: A_RATIO_KEY },
    {
      key: A_RATIO_KEY,
      value: { x, y },
      description: 'Tỷ lệ /a1 toàn bot',
      updatedBy: String(updatedBy)
    },
    { upsert: true }
  );
}

async function getAVars() {
  const config = await Config.findOne({ key: A_VARS_KEY }).lean();
  if (!config || !config.value || typeof config.value !== 'object' || Array.isArray(config.value)) {
    return {};
  }
  return { ...config.value };
}

async function setAVars(vars, updatedBy = 'system') {
  await Config.findOneAndUpdate(
    { key: A_VARS_KEY },
    {
      key: A_VARS_KEY,
      value: vars,
      description: 'Biến /a2 toàn bot',
      updatedBy: String(updatedBy)
    },
    { upsert: true }
  );
}

module.exports = {
  A_RATIO_KEY,
  A_VARS_KEY,
  RESERVED_A_VAR_NAMES,
  getARatio,
  setARatio,
  getAVars,
  setAVars
};
