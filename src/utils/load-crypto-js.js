let cachedCryptoJS;

function getCryptoJS() {
  if (cachedCryptoJS) {
    return cachedCryptoJS;
  }

  const loaded = module.require('./crypto-js');
  cachedCryptoJS = loaded && loaded.default ? loaded.default : loaded;
  if (!cachedCryptoJS) {
    throw new Error('Unable to initialize embedded CryptoJS');
  }
  return cachedCryptoJS;
}

module.exports = { getCryptoJS };
