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
