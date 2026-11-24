// Numeric references are synthetic; retain 23 digits to test string precision.
export function uobRow({ transactionDate = '05 Aug 2026', postingDate = '08 Aug 2026', merchant = 'NTUC FairPrice App Pay   SINGAPORE    SG', ref = '90000000000000000000001', status = '', amount = '-17.33 SGD' } = {}) {
  const dates = [transactionDate, postingDate].filter(Boolean).map((textContent) => ({ textContent }));
  const cells = [
    { textContent: dates.map((node) => node.textContent).join(' '), querySelectorAll: () => dates },
    { textContent: `${merchant}${ref ? ` Ref No: ${ref}` : ''}` },
    { textContent: status },
    { textContent: amount },
    { textContent: 'View details' }
  ];
  return { querySelectorAll: () => cells };
}
