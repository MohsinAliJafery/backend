// utils/paytmChecksum.js
const crypto = require('crypto');

class PaytmChecksum {
  static generateSignature(params, key) {
    try {
      // Sort parameters alphabetically
      const sortedKeys = Object.keys(params).sort();
      
      // Build parameter string
      let data = '';
      sortedKeys.forEach((keyName, index) => {
        const value = params[keyName];
        
        // Skip CHECKSUMHASH parameter when generating checksum
        if (keyName === 'CHECKSUMHASH') return;
        
        // Convert to string and handle null/undefined
        let strValue = '';
        if (value !== null && value !== undefined) {
          strValue = String(value).trim();
        }
        
        // Add to data string if not empty
        if (strValue !== '') {
          data += `${keyName}=${strValue}`;
          
          // Add '&' if not the last parameter
          const remainingKeys = sortedKeys.slice(index + 1);
          const hasNextNonChecksumParam = remainingKeys.some(k => k !== 'CHECKSUMHASH');
          if (hasNextNonChecksumParam) {
            data += '&';
          }
        }
      });
      
      // Remove trailing '&' if present
      if (data.endsWith('&')) {
        data = data.slice(0, -1);
      }
      
      console.log('Checksum generation - Parameter string:', data);
      
      // Generate random salt (4 bytes)
      const salt = crypto.randomBytes(4).toString('hex');
      
      // Append salt
      const dataWithSalt = data + '&' + salt;
      
      // Generate SHA256 HMAC
      const hash = crypto.createHmac('sha256', key)
        .update(dataWithSalt)
        .digest('hex');
      
      // Return hash + salt
      const checksum = hash + salt;
      console.log('Checksum generation - Generated checksum:', checksum.substring(0, 20) + '...');
      
      return checksum;
      
    } catch (error) {
      console.error('Checksum generation error:', error);
      throw error;
    }
  }

  static verifySignature(params, key, checksum) {
    try {
      if (!checksum || typeof checksum !== 'string' || checksum.length < 64) {
        console.log('Invalid checksum format:', checksum);
        return false;
      }
      
      // Extract hash (first 64 chars) and salt (remaining chars)
      const hashReceived = checksum.substring(0, 64);
      const salt = checksum.substring(64);
      
      if (!salt || salt.length === 0) {
        console.log('No salt found in checksum');
        return false;
      }
      
      // Recreate parameter string (excluding CHECKSUMHASH)
      const sortedKeys = Object.keys(params).sort();
      let data = '';
      
      sortedKeys.forEach((keyName, index) => {
        // Skip CHECKSUMHASH parameter
        if (keyName === 'CHECKSUMHASH') return;
        
        const value = params[keyName];
        let strValue = '';
        
        if (value !== null && value !== undefined) {
          strValue = String(value).trim();
        }
        
        if (strValue !== '') {
          data += `${keyName}=${strValue}`;
          
          // Add '&' if not the last parameter
          const remainingKeys = sortedKeys.slice(index + 1);
          const hasNextNonChecksumParam = remainingKeys.some(k => k !== 'CHECKSUMHASH');
          if (hasNextNonChecksumParam) {
            data += '&';
          }
        }
      });
      
      // Remove trailing '&' if present
      if (data.endsWith('&')) {
        data = data.slice(0, -1);
      }
      
      console.log('Checksum verification - Parameter string:', data);
      console.log('Checksum verification - Salt:', salt);
      
      // Append salt
      const dataWithSalt = data + '&' + salt;
      
      // Generate hash for comparison
      const hashGenerated = crypto.createHmac('sha256', key)
        .update(dataWithSalt)
        .digest('hex');
      
      console.log('Checksum verification - Generated hash:', hashGenerated.substring(0, 20) + '...');
      console.log('Checksum verification - Received hash:', hashReceived.substring(0, 20) + '...');
      console.log('Checksum verification - Match:', hashGenerated === hashReceived);
      
      return hashGenerated === hashReceived;
      
    } catch (error) {
      console.error('Checksum verification error:', error);
      return false;
    }
  }
}

module.exports = PaytmChecksum;