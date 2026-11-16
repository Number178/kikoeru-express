const { createHash, timingSafeEqual } = require('crypto');

function validWritebackKey(key) {
  return typeof key === 'string' && key.length === 16 && /^[A-Za-z0-9]{16}$/.test(key);
}

function hashWritebackKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

function getWritebackConfig(config) {
  let enabled;
  let keyHash;
  if (config.kikoetaWritebackEnabled !== null) {
    enabled = config.kikoetaWritebackEnabled === true;
    const savedHash = config.kikoetaWritebackKeyHash;
    keyHash = typeof savedHash === 'string' && savedHash.length === 64 && /^[a-f0-9]{64}$/.test(savedHash) ? savedHash : '';
  } else {
    // An explicit dashboard save takes precedence over the legacy environment settings.
    const key = process.env.KIKOERU_KIKOETA_WRITEBACK_KEY;
    enabled = process.env.KIKOERU_KIKOETA_WRITEBACK === '1';
    keyHash = validWritebackKey(key) ? hashWritebackKey(key) : '';
  }
  // Preserve the extra check for existing installations with a key.
  const savedMode = config.kikoetaWritebackAuth;
  const hasLegacyKey = config.kikoetaWritebackEnabled === null
    ? Boolean(process.env.KIKOERU_KIKOETA_WRITEBACK_KEY) : Boolean(config.kikoetaWritebackKeyHash);
  const authMode = savedMode == null ? (hasLegacyKey ? 'account_and_key' : 'account')
    : savedMode === 'account' ? 'account' : 'account_and_key';
  return {
    enabled, keyHash, authMode,
  };
}

function matchesWritebackKey(key, keyHash) {
  return validWritebackKey(key)
    && timingSafeEqual(Buffer.from(keyHash, 'hex'), Buffer.from(hashWritebackKey(key), 'hex'));
}

module.exports = { getWritebackConfig, hashWritebackKey, matchesWritebackKey, validWritebackKey };
