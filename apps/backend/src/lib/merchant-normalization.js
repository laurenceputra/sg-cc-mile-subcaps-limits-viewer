export function normalizeMerchant(merchant) {
  return merchant.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[^\w\s-]/g, '');
}
