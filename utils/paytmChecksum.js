const crypto = require('crypto');

class PaytmChecksum {
  static generateSignature(params, key) {
    let data = PaytmChecksum.getStringByParams(params);
    data = data + '&' + PaytmChecksum.generateSignatureByString(data, key);
    return data;
  }

  static verifySignature(params, key, checksum) {
    let data = PaytmChecksum.getStringByParams(params);
    return PaytmChecksum.verifySignatureByString(data, key, checksum);
  }

  static generateSignatureByString(data, key) {
    const salt = PaytmChecksum.generateRandomString(4);
    data = data + '&' + salt;
    const hash = crypto.createHmac('sha256', key).update(data).digest('hex');
    return hash + salt;
  }

  static verifySignatureByString(data, key, checksum) {
    const paytmHash = checksum.substr(0, 64);
    const salt = checksum.substr(64);
    const dataToVerify = data + '&' + salt;
    const generatedHash = crypto.createHmac('sha256', key).update(dataToVerify).digest('hex');
    return generatedHash === paytmHash;
  }

  static getStringByParams(params) {
    const data = {};
    Object.keys(params).sort().forEach(key => {
      data[key] = params[key] !== null && params[key].toLowerCase() !== 'null' ? params[key] : '';
    });
    return Object.keys(data).map(key => `${key}=${data[key]}`).join('&');
  }

  static generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

module.exports = PaytmChecksum;