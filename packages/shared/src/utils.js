export function parseAmount(amountText) {
  if (!amountText || typeof amountText !== 'string') {
    return null;
  }
  const cleaned = amountText.trim().replace(/,/g, '');
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    const innerText = cleaned.slice(1, -1).trim();
    const value = parseFloat(innerText);
    return isNaN(value) ? null : -value;
  }
  const value = parseFloat(cleaned);
  return isNaN(value) ? null : value;
}

export function parseDate(dateText) {
  if (!dateText || typeof dateText !== 'string') {
    return null;
  }
  const dateObj = new Date(dateText.trim());
  if (isNaN(dateObj.getTime())) {
    return null;
  }
  return dateObj.toISOString().split('T')[0];
}

export function getYearMonth(isoDate) {
  return isoDate.substring(0, 7);
}

export function generateTransactionId(date, merchant, amount) {
  return `${date}-${merchant.toLowerCase().replace(/\s+/g, '-')}-${amount.toFixed(2)}`;
}

export function normalizeMerchant(merchant) {
  return merchant.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[^\w\s-]/g, '');
}

export function generateDeviceId() {
  return `device-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Convert ArrayBuffer to Base64
 * @param {ArrayBuffer} buffer - Buffer to convert
 * @returns {string} - Base64 string
 */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 to ArrayBuffer
 * @param {string} base64 - Base64 string
 * @returns {ArrayBuffer} - Array buffer
 */
export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
