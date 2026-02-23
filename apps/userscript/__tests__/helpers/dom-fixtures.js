/**
 * DOM fixture builders for UOB and Maybank transaction rows.
 * These produce plain objects that mirror what the parsers receive from the DOM,
 * so tests can exercise parsing logic without a real DOM environment.
 */

/**
 * Builds a minimal representation of a UOB transaction row's cell values.
 * @param {Object} opts
 * @param {string} opts.postingDate   e.g. "01 Jan 2024"
 * @param {string} opts.transDate     e.g. "30 Dec 2023"
 * @param {string} opts.merchantName  e.g. "Starbucks"
 * @param {string} opts.refNo         e.g. "REF12345"
 * @param {string} opts.amountDollars e.g. "12"
 * @param {string} opts.amountCents   e.g. "50"
 */
export function makeUobTransactionCellValues({
  postingDate = '01 Jan 2024',
  transDate = '30 Dec 2023',
  merchantName = 'Test Merchant',
  refNo = 'REF001',
  amountDollars = '10',
  amountCents = '00'
} = {}) {
  return {
    postingDate,
    transDate,
    merchantName,
    refNo,
    amountText: `${amountDollars}.${amountCents}`
  };
}

/**
 * Builds a minimal representation of a Maybank transaction row's cell values.
 * @param {Object} opts
 * @param {string} opts.postingDate  e.g. "01/01/2024"
 * @param {string} opts.description  e.g. "GRAB* TRANSPORT SGP"
 * @param {string} opts.amountText   e.g. "-SGD 15.00"
 */
export function makeMaybankTransactionCellValues({
  postingDate = '01/01/2024',
  description = 'GRAB* TRANSPORT SGP',
  amountText = '-SGD 15.00'
} = {}) {
  return { postingDate, description, amountText };
}

/**
 * Builds a synthetic transaction object already parsed from the DOM,
 * suitable for directly testing calculateSummary, calculateMonthlyTotals, etc.
 */
export function makeParsedTransaction({
  posting_date = '01 Jan 2024',
  posting_date_iso = '2024-01-01',
  posting_month = '2024-01',
  amount_value = 10.0,
  category = 'Dining',
  merchant_detail = 'Test Merchant',
  ref_no = 'REF001'
} = {}) {
  return {
    posting_date,
    posting_date_iso,
    posting_month,
    amount_value,
    category,
    merchant_detail,
    ref_no
  };
}
