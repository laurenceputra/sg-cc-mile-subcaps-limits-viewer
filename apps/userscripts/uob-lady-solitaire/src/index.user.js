// Phase 3: Sync integration (imports added)
import { SyncManager } from './sync-manager.js';
import { createSyncTab } from './sync-ui.js';

(() => {
  'use strict';

  if (window.__ccSubcapInjected) {
    return;
  }
  window.__ccSubcapInjected = true;

  const URL_PREFIX = 'https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do';
  const STORAGE_KEY = 'ccSubcapSettings';
  const TARGET_CARD_NAME = "LADY'S SOLITAIRE CARD";

  const CARD_CONFIGS = {
    "LADY'S SOLITAIRE CARD": {
      categories: [
        'Beauty & Wellness',
        'Dining',
        'Entertainment',
        'Family',
        'Fashion',
        'Transport',
        'Travel'
      ],
      subcapSlots: 2
    }
  };

  const UI_IDS = {
    button: 'cc-subcap-btn',
    overlay: 'cc-subcap-overlay',
    manageContent: 'cc-subcap-manage',
    spendContent: 'cc-subcap-spend',
    summaryContent: 'cc-subcap-summary',
    syncContent: 'cc-subcap-sync',
    tabManage: 'cc-subcap-tab-manage',
    tabSpend: 'cc-subcap-tab-spend',
    tabSync: 'cc-subcap-tab-sync',
    close: 'cc-subcap-close'
  };

  const THEME = {
    text: '#0f172a',
    muted: '#475569',
    panel: '#f8fafc',
    surface: '#ffffff',
    border: '#d0d5dd',
    accent: '#2563eb',
    accentText: '#1e3a8a',
    accentSoft: '#e0e7ff',
    accentShadow: '0 18px 32px rgba(37, 99, 235, 0.28)',
    warning: '#b45309',
    warningSoft: '#fef3c7',
    error: '#ef4444',
    errorSoft: '#fee2e2',
    errorText: '#991b1b',
    errorBorder: '#fca5a5',
    success: '#166534',
    successSoft: '#dcfce7',
    successBorder: '#86efac',
    overlay: 'rgba(15, 23, 42, 0.25)',
    shadow: '0 18px 40px rgba(15, 23, 42, 0.15)'
  };

  const TRANSACTION_LOADING_NOTICE = '💡 <strong>Totals looking wrong, or missing transactions?</strong><br>Load all transactions on the UOB site by clicking "View More" first, then refresh this panel.';

  const storage = {
    get(key, fallback) {
      try {
        if (typeof GM_getValue === 'function') {
          return GM_getValue(key, fallback);
        }
      } catch (error) {
        // ignore
      }
      const stored = window.localStorage.getItem(key);
      return stored ?? fallback;
    },
    set(key, value) {
      try {
        if (typeof GM_setValue === 'function') {
          GM_setValue(key, value);
          return;
        }
      } catch (error) {
        // ignore
      }
      window.localStorage.setItem(key, value);
    }
  };

  // Phase 3: Initialize sync manager
  const syncManager = new SyncManager(storage);

  function loadSettings() {
    const raw = storage.get(STORAGE_KEY, '{}');
    try {
      return JSON.parse(raw || '{}');
    } catch (error) {
      return {};
    }
  }

  function saveSettings(settings) {
    storage.set(STORAGE_KEY, JSON.stringify(settings));
  }

  function ensureCardSettings(settings, cardName, cardConfig) {
    if (!settings.cards) {
      settings.cards = {};
    }
    if (!settings.cards[cardName]) {
      settings.cards[cardName] = {
        selectedCategories: Array.from({ length: cardConfig.subcapSlots }, () => ''),
        defaultCategory: 'Others',
        merchantMap: {},
        transactions: {}
      };
    }

    const cardSettings = settings.cards[cardName];
    if (!Array.isArray(cardSettings.selectedCategories)) {
      cardSettings.selectedCategories = Array.from({ length: cardConfig.subcapSlots }, () => '');
    }

    if (cardSettings.selectedCategories.length !== cardConfig.subcapSlots) {
      cardSettings.selectedCategories = Array.from({ length: cardConfig.subcapSlots }, (_, index) => {
        return cardSettings.selectedCategories[index] || '';
      });
    }

    cardSettings.selectedCategories = cardSettings.selectedCategories.map((value) => {
      return cardConfig.categories.includes(value) ? value : '';
    });

    const allowedDefaults = new Set(getSelectedCategories(cardSettings).filter(Boolean));
    allowedDefaults.add('Others');
    if (!allowedDefaults.has(cardSettings.defaultCategory)) {
      cardSettings.defaultCategory = 'Others';
    }

    if (!cardSettings.merchantMap || typeof cardSettings.merchantMap !== 'object') {
      cardSettings.merchantMap = {};
    }
    if (!cardSettings.transactions || typeof cardSettings.transactions !== 'object') {
      cardSettings.transactions = {};
    }

    return cardSettings;
  }

  function removeUI() {
    const button = document.getElementById(UI_IDS.button);
    if (button) {
      button.remove();
    }
    const overlay = document.getElementById(UI_IDS.overlay);
    if (overlay) {
      overlay.remove();
    }
  }

  function evalXPath(xpath, contextNode = document) {
    try {
      return document.evaluate(
        xpath,
        contextNode,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;
    } catch (error) {
      return null;
    }
  }

  function waitForXPath(xpath, timeoutMs = 15000) {
    return new Promise((resolve) => {
      const existing = evalXPath(xpath);
      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver(() => {
        const node = evalXPath(xpath);
        if (node) {
          observer.disconnect();
          resolve(node);
        }
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });

      window.setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeoutMs);
    });
  }

  async function waitForTableBodyRows(xpath, timeoutMs = 15000, settleMs = 2000) {
    const tbody = await waitForXPath(xpath, timeoutMs);
    if (!tbody) {
      return null;
    }
    const startTime = Date.now();
    while (Date.now() - startTime < settleMs) {
      const rowCount = tbody.querySelectorAll('tr').length;
      if (rowCount > 0) {
        return tbody;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    }
    return tbody;
  }

  function observeTableBody(tableBodyXPath, onChange) {
    let currentTbody = null;
    let tableObserver = null;
    let refreshTimer = null;

    const scheduleRefresh = () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      refreshTimer = window.setTimeout(onChange, 400);
    };

    const attachObserver = (tbody) => {
      if (tableObserver) {
        tableObserver.disconnect();
      }
      tableObserver = new MutationObserver((mutations) => {
        const hasChange = mutations.some((mutation) => mutation.type === 'childList');
        if (hasChange) {
          scheduleRefresh();
        }
      });
      tableObserver.observe(tbody, { childList: true, subtree: true });
    };

    const ensureObserver = async () => {
      const tbody = await waitForXPath(tableBodyXPath);
      if (!tbody || tbody === currentTbody) {
        return;
      }
      currentTbody = tbody;
      attachObserver(tbody);
      scheduleRefresh();
    };

    ensureObserver();

    const rootObserver = new MutationObserver(() => {
      if (!currentTbody || !currentTbody.isConnected) {
        ensureObserver();
      }
    });

    rootObserver.observe(document.documentElement, { childList: true, subtree: true });

    return () => {
      if (tableObserver) {
        tableObserver.disconnect();
      }
      rootObserver.disconnect();
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
    };
  }

  function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function extractMerchantInfo(cell) {
    if (!cell) {
      return { merchantName: '', refNo: '' };
    }
    const raw = cell.innerText || cell.textContent || '';
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 0) {
      return {
        merchantName: lines[0],
        refNo: normalizeRefNo(lines.length > 1 ? lines[1] : '')
      };
    }
    return { merchantName: normalizeText(raw), refNo: '' };
  }

  function toISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function fromISODate(value) {
    if (!value) {
      return null;
    }
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!year || !month || !day) {
      return null;
    }
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function parsePostingDate(value) {
    const raw = normalizeText(value).replace(/,/g, '');
    if (!raw) {
      return null;
    }
    const textMatch = raw.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
    if (!textMatch) {
      return null;
    }
    const day = Number(textMatch[1]);
    const monthName = textMatch[2].toLowerCase();
    const year = Number(textMatch[3]);
    const monthMap = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11
    };
    if (!Object.prototype.hasOwnProperty.call(monthMap, monthName)) {
      return null;
    }
    const date = new Date(year, monthMap[monthName], day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getCalendarCutoffDate(months) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - months, 1);
  }

  function isWithinCutoff(date, cutoff) {
    return date && !Number.isNaN(date.getTime()) && date >= cutoff;
  }

  function normalizeKey(value) {
    return normalizeText(value);
  }

  function normalizeRefNo(value) {
    const raw = normalizeText(value);
    if (!raw) {
      return '';
    }
    return raw.replace(/^ref\s*no\s*:\s*/i, '');
  }

  function parseAmount(amountText) {
    if (!amountText) {
      return null;
    }
    const normalized = amountText.replace(/[^0-9.-]/g, '');
    if (!normalized) {
      return null;
    }
    const number = Number(normalized);
    return Number.isNaN(number) ? null : number;
  }

  function extractDollarsAndCents(amountCell) {
    if (!amountCell) {
      return { dollarsText: '', centsText: '', amountText: '' };
    }

    const amountSpan = amountCell.querySelector('span');
    if (!amountSpan) {
      const fallback = normalizeText(amountCell.textContent);
      return { dollarsText: fallback, centsText: '', amountText: fallback };
    }

    const centsSpan = amountSpan.querySelector('span');
    const centsText = normalizeText(centsSpan ? centsSpan.textContent : '');

    let dollarsText = '';
    const firstTextNode = Array.from(amountSpan.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE
    );

    if (firstTextNode) {
      dollarsText = normalizeText(firstTextNode.textContent);
    } else {
      dollarsText = normalizeText(amountSpan.textContent);
      if (centsText && dollarsText.endsWith(centsText)) {
        dollarsText = normalizeText(dollarsText.slice(0, -centsText.length));
      }
    }

    const amountText = `${dollarsText}${centsText}`.trim();
    return { dollarsText, centsText, amountText };
  }

  function getSelectedCategories(cardSettings) {
    return (cardSettings.selectedCategories || []).slice();
  }

  function getDefaultCategoryOptions(cardSettings) {
    const options = getSelectedCategories(cardSettings).filter(Boolean);
    options.push('Others');
    return Array.from(new Set(options));
  }

  function getMappingOptions(cardSettings, currentValue) {
    const options = getDefaultCategoryOptions(cardSettings);
    if (currentValue && !options.includes(currentValue)) {
      options.push(currentValue);
    }
    return options;
  }

  /**
   * Checks if a merchant name matches a pattern with wildcard support.
   * Supports '*' as a wildcard character that matches any sequence of characters.
   * @param {string} merchantName - The merchant name to match
   * @param {string} pattern - The pattern to match against (may contain wildcards)
   * @returns {boolean} True if the merchant name matches the pattern
   */
  function matchesWildcard(merchantName, pattern) {
    // Handle null/undefined and non-string inputs defensively
    if (typeof merchantName !== 'string' || typeof pattern !== 'string') {
      return false;
    }
    
    // If no wildcard, do case-insensitive exact match
    if (!pattern.includes('*')) {
      return merchantName.toUpperCase() === pattern.toUpperCase();
    }
    
    // Convert wildcard pattern to regex
    // Escape special regex characters except *
    const escapedPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    
    const regex = new RegExp('^' + escapedPattern + '$', 'i'); // case-insensitive
    return regex.test(merchantName);
  }

  function resolveCategory(merchantName, cardSettings) {
    if (!merchantName) {
      return cardSettings.defaultCategory || 'Others';
    }
    
    if (cardSettings.merchantMap) {
      // First try exact match for backward compatibility and performance
      if (cardSettings.merchantMap[merchantName]) {
        return cardSettings.merchantMap[merchantName];
      }
      
      // Then try case-insensitive exact matching for non-wildcard keys
      const normalizedName = merchantName.toUpperCase();
      for (const [pattern, category] of Object.entries(cardSettings.merchantMap)) {
        if (!pattern.includes('*') && pattern.toUpperCase() === normalizedName) {
          return category;
        }
      }
      
      // Then try wildcard matching (only check patterns with wildcards).
      // NOTE: Patterns are evaluated in the insertion order of cardSettings.merchantMap.
      // The first matching pattern in that order wins, so define merchantMap entries
      // in priority order when using overlapping wildcard patterns.
      for (const [pattern, category] of Object.entries(cardSettings.merchantMap)) {
        if (pattern.includes('*') && matchesWildcard(merchantName, pattern)) {
          return category; // Return immediately on first match in insertion order
        }
      }
    }
    
    return cardSettings.defaultCategory || 'Others';
  }

  function buildTransactions(tbody, cardSettings) {
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const diagnostics = {
      skipped_rows: 0,
      missing_ref_no: 0,
      invalid_posting_date: 0,
      invalid_amount: 0
    };

    const transactions = rows
      .map((row, index) => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 4) {
          diagnostics.skipped_rows += 1;
          return null;
        }

        const postingDate = normalizeText(cells[0].textContent);
        const transactionDate = normalizeText(cells[1].textContent);
        const { merchantName, refNo } = extractMerchantInfo(cells[2]);
        const normalizedRefNo = normalizeKey(normalizeRefNo(refNo));

        if (
          !postingDate &&
          !transactionDate &&
          merchantName.toLowerCase() === 'previous balance'
        ) {
          diagnostics.skipped_rows += 1;
          return null;
        }
        if (!normalizedRefNo) {
          diagnostics.missing_ref_no += 1;
          return null;
        }

        const { dollarsText, centsText, amountText } = extractDollarsAndCents(cells[3]);
        const amountValue = parseAmount(amountText);
        if (amountText && amountValue === null) {
          diagnostics.invalid_amount += 1;
        }

        const postingDateParsed = parsePostingDate(postingDate);
        if (postingDate && !postingDateParsed) {
          diagnostics.invalid_posting_date += 1;
        }

        const postingDateIso = postingDateParsed ? toISODate(postingDateParsed) : '';
        const category = resolveCategory(merchantName, cardSettings);

        return {
          row_index: index + 1,
          posting_date: postingDate,
          posting_date_iso: postingDateIso,
          transaction_date: transactionDate,
          merchant_detail: merchantName,
          ref_no: normalizedRefNo,
          amount_dollars: dollarsText,
          amount_cents: centsText,
          amount_text: amountText,
          amount_value: amountValue,
          category
        };
      })
      .filter(Boolean);

    return { transactions, diagnostics };
  }

  function calculateSummary(transactions, cardSettings) {
    const totals = {};
    let totalAmount = 0;

    transactions.forEach((transaction) => {
      if (typeof transaction.amount_value !== 'number') {
        return;
      }
      const category = transaction.category || cardSettings.defaultCategory || 'Others';
      totals[category] = (totals[category] || 0) + transaction.amount_value;
      totalAmount += transaction.amount_value;
    });

    return {
      totals,
      total_amount: totalAmount,
      transaction_count: transactions.length
    };
  }

  function buildData(tableBody, cardName, cardSettings) {
    const { transactions, diagnostics } = buildTransactions(tableBody, cardSettings);
    const summary = calculateSummary(transactions, cardSettings);

    return {
      card_name: cardName,
      source_url: window.location.href,
      extracted_at: new Date().toISOString(),
      selected_categories: getSelectedCategories(cardSettings).filter(Boolean),
      default_category: cardSettings.defaultCategory,
      summary,
      diagnostics,
      transactions
    };
  }

  function updateStoredTransactions(settings, cardName, cardConfig, transactions) {
    const cardSettings = ensureCardSettings(settings, cardName, cardConfig);
    const cutoff = getCalendarCutoffDate(3);
    const nextStored = {};

    Object.keys(cardSettings.transactions || {}).forEach((refNo) => {
      const entry = cardSettings.transactions[refNo];
      const parsedDate = fromISODate(entry?.posting_date_iso) || parsePostingDate(entry?.posting_date);
      if (parsedDate && isWithinCutoff(parsedDate, cutoff)) {
        nextStored[refNo] = entry;
      }
    });

    transactions.forEach((tx) => {
      if (!tx.ref_no) {
        return;
      }
      const parsedDate = fromISODate(tx.posting_date_iso) || parsePostingDate(tx.posting_date);
      if (!parsedDate || !isWithinCutoff(parsedDate, cutoff)) {
        return;
      }
      const key = normalizeKey(tx.ref_no);
      if (!key) {
        return;
      }
      nextStored[key] = {
        ref_no: key,
        posting_date: tx.posting_date,
        posting_date_iso: tx.posting_date_iso || toISODate(parsedDate),
        transaction_date: tx.transaction_date,
        merchant_detail: tx.merchant_detail,
        amount_text: tx.amount_text,
        amount_value: tx.amount_value,
        category: tx.category
      };
    });

    cardSettings.transactions = nextStored;
  }

  function getStoredTransactions(cardSettings) {
    const stored = cardSettings.transactions || {};
    const deduped = {};

    Object.keys(stored).forEach((key) => {
      const entry = stored[key] || {};
      const normalizedRefNo = normalizeKey(normalizeRefNo(entry.ref_no || key));
      if (!normalizedRefNo) {
        return;
      }

      const merchantDetail = normalizeText(entry.merchant_detail || '');
      const parsedDate =
        fromISODate(entry.posting_date_iso) || parsePostingDate(entry.posting_date);
      const postingDateIso = entry.posting_date_iso || (parsedDate ? toISODate(parsedDate) : '');
      const amountValue =
        typeof entry.amount_value === 'number'
          ? entry.amount_value
          : parseAmount(entry.amount_text || '');
      const category = resolveCategory(merchantDetail, cardSettings);

      const normalizedEntry = {
        ...entry,
        ref_no: normalizedRefNo,
        merchant_detail: merchantDetail,
        posting_date_iso: postingDateIso,
        posting_month: postingDateIso ? postingDateIso.slice(0, 7) : '',
        amount_value: amountValue,
        category
      };

      if (!deduped[normalizedRefNo]) {
        deduped[normalizedRefNo] = normalizedEntry;
        return;
      }

      const existing = deduped[normalizedRefNo];
      const existingDate = fromISODate(existing.posting_date_iso);
      const newDate = fromISODate(normalizedEntry.posting_date_iso);
      if (newDate && (!existingDate || newDate > existingDate)) {
        deduped[normalizedRefNo] = normalizedEntry;
      }
    });

    return Object.values(deduped);
  }

  function formatMonthLabel(monthKey) {
    const match = String(monthKey).match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return monthKey;
    }
    const year = match[1];
    const monthIndex = Number(match[2]) - 1;
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];
    if (!monthNames[monthIndex]) {
      return monthKey;
    }
    return `${monthNames[monthIndex]} ${year}`;
  }

  function calculateMonthlyTotals(transactions, cardSettings) {
    const totalsByMonth = {};

    transactions.forEach((transaction) => {
      if (!transaction.posting_month) {
        return;
      }
      if (typeof transaction.amount_value !== 'number') {
        return;
      }
      const monthKey = transaction.posting_month;
      if (!totalsByMonth[monthKey]) {
        totalsByMonth[monthKey] = { totals: {}, total_amount: 0 };
      }
      const category =
        transaction.category || cardSettings.defaultCategory || 'Others';
      totalsByMonth[monthKey].totals[category] =
        (totalsByMonth[monthKey].totals[category] || 0) + transaction.amount_value;
      totalsByMonth[monthKey].total_amount += transaction.amount_value;
    });

    return totalsByMonth;
  }

  function createButton(onClick) {
    if (document.getElementById(UI_IDS.button)) {
      return;
    }

    const button = document.createElement('button');
    button.id = UI_IDS.button;
    button.type = 'button';
    button.textContent = 'Subcap Tools';
    button.style.position = 'fixed';
    button.style.bottom = '24px';
    button.style.right = '24px';
    button.style.zIndex = '99999';
    button.style.padding = '12px 16px';
    button.style.borderRadius = '999px';
    button.style.border = `1px solid ${THEME.accent}`;
    button.style.background = THEME.accent;
    button.style.color = '#ffffff';
    button.style.fontSize = '14px';
    button.style.fontWeight = '600';
    button.style.cursor = 'pointer';
    button.style.boxShadow = THEME.accentShadow;
    button.addEventListener('click', onClick);

    document.body.appendChild(button);
  }

  function renderSummary(container, data, cardSettings) {
    container.innerHTML = '';

    const title = document.createElement('div');
    title.textContent = 'Totals in Statement Month (by category)';
    title.style.fontWeight = '600';
    title.style.marginBottom = '8px';
    title.style.color = THEME.accent;

    const list = document.createElement('div');
    list.style.display = 'grid';
    list.style.gridTemplateColumns = '1fr auto';
    list.style.rowGap = '6px';
    list.style.columnGap = '16px';

    const selected = getSelectedCategories(cardSettings).filter(Boolean);
    const order = [...selected, 'Others'];
    const totals = data.summary.totals || {};
    const extras = Object.keys(totals).filter((key) => !order.includes(key));
    order.push(...extras);

    order.forEach((category) => {
      if (!totals.hasOwnProperty(category)) {
        return;
      }
      const label = document.createElement('div');
      label.textContent = category;
      const value = document.createElement('div');
      value.textContent = totals[category].toFixed(2);
      list.appendChild(label);
      list.appendChild(value);
    });

    const totalRowLabel = document.createElement('div');
    totalRowLabel.style.marginTop = '8px';
    totalRowLabel.style.fontWeight = '600';
    totalRowLabel.textContent = 'Total';

    const totalRowValue = document.createElement('div');
    totalRowValue.style.marginTop = '8px';
    totalRowValue.style.fontWeight = '600';
    totalRowValue.style.color = THEME.accent;
    totalRowValue.textContent = data.summary.total_amount.toFixed(2);

    list.appendChild(totalRowLabel);
    list.appendChild(totalRowValue);

    container.appendChild(title);
    container.appendChild(list);

    const diagnostics = data.diagnostics || {};
    const issues = [
      {
        key: 'invalid_posting_date',
        label: 'Rows with unreadable posting dates'
      },
      {
        key: 'missing_ref_no',
        label: 'Rows skipped (missing ref no)'
      },
      {
        key: 'invalid_amount',
        label: 'Rows with unreadable amounts'
      },
      {
        key: 'skipped_rows',
        label: 'Rows skipped (missing cells or previous balance)'
      }
    ];

    const hasIssues = issues.some((issue) => diagnostics[issue.key] > 0);
    if (hasIssues) {
      const issueTitle = document.createElement('div');
      issueTitle.textContent = 'Data issues';
      issueTitle.style.marginTop = '12px';
      issueTitle.style.fontWeight = '600';
      issueTitle.style.color = THEME.warning;

      const issueList = document.createElement('div');
      issueList.style.display = 'grid';
      issueList.style.gridTemplateColumns = '1fr auto';
      issueList.style.rowGap = '6px';
      issueList.style.columnGap = '16px';
      issueList.style.background = THEME.warningSoft;
      issueList.style.border = `1px solid ${THEME.border}`;
      issueList.style.borderRadius = '8px';
      issueList.style.padding = '8px';

      issues.forEach((issue) => {
        const count = diagnostics[issue.key] || 0;
        if (!count) {
          return;
        }
        const label = document.createElement('div');
        label.textContent = issue.label;

        const value = document.createElement('div');
        value.textContent = String(count);

        issueList.appendChild(label);
        issueList.appendChild(value);
      });

      container.appendChild(issueTitle);
      container.appendChild(issueList);
    }
  }

  function renderCategorySelectors(container, cardSettings, cardConfig, onChange) {
    const title = document.createElement('div');
    title.textContent = 'Select bonus categories (2)';
    title.style.fontWeight = '600';
    title.style.color = THEME.accent;

    const wrapper = document.createElement('div');
    wrapper.style.display = 'grid';
    wrapper.style.gridTemplateColumns = '1fr 1fr';
    wrapper.style.gap = '12px';

    const selected = getSelectedCategories(cardSettings);

    for (let i = 0; i < cardConfig.subcapSlots; i += 1) {
      const select = document.createElement('select');
      select.style.padding = '6px 8px';
      select.style.borderRadius = '6px';
      select.style.border = `1px solid ${THEME.border}`;
      select.style.background = THEME.surface;
      select.style.color = THEME.text;

      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = 'Select category';
      select.appendChild(emptyOption);

      cardConfig.categories.forEach((category) => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        select.appendChild(option);
      });

      select.value = selected[i] || '';

      select.addEventListener('change', () => {
        const value = select.value;
        onChange((nextSettings) => {
          const updated = getSelectedCategories(nextSettings);
          updated[i] = value;
          for (let j = 0; j < updated.length; j += 1) {
            if (j !== i && value && updated[j] === value) {
              updated[j] = '';
            }
          }
          nextSettings.selectedCategories = updated;

          const allowedDefaults = new Set(getSelectedCategories(nextSettings).filter(Boolean));
          allowedDefaults.add('Others');
          if (!allowedDefaults.has(nextSettings.defaultCategory)) {
            nextSettings.defaultCategory = 'Others';
          }
        });
      });

      wrapper.appendChild(select);
    }

    container.appendChild(title);
    container.appendChild(wrapper);
  }

  function renderDefaultCategory(container, cardSettings, onChange) {
    const title = document.createElement('div');
    title.textContent = 'Default category';
    title.style.fontWeight = '600';
    title.style.color = THEME.accent;

    const select = document.createElement('select');
    select.style.padding = '6px 8px';
    select.style.borderRadius = '6px';
    select.style.border = `1px solid ${THEME.border}`;
    select.style.background = THEME.surface;
    select.style.color = THEME.text;

    const options = getDefaultCategoryOptions(cardSettings);
    options.forEach((category) => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      select.appendChild(option);
    });
    select.value = cardSettings.defaultCategory;

    select.addEventListener('change', () => {
      const value = select.value;
      onChange((nextSettings) => {
        nextSettings.defaultCategory = value;
      });
    });

    container.appendChild(title);
    container.appendChild(select);
  }

  function renderMerchantSection(container, titleText, merchants, cardSettings, onChange) {
    const title = document.createElement('div');
    title.textContent = titleText;
    title.style.fontWeight = '600';
    title.style.color = THEME.accent;

    const table = document.createElement('div');
    table.style.display = 'grid';
    table.style.gridTemplateColumns = '2fr 1fr';
    table.style.gap = '8px 12px';

    if (!merchants.length) {
      const empty = document.createElement('div');
      empty.textContent = 'None';
      empty.style.opacity = '0.7';
      container.appendChild(title);
      container.appendChild(empty);
      return;
    }

    merchants.forEach((merchant) => {
      const label = document.createElement('div');
      label.textContent = merchant;
      label.style.wordBreak = 'break-word';

      const select = document.createElement('select');
      select.style.padding = '6px 8px';
      select.style.borderRadius = '6px';
      select.style.border = `1px solid ${THEME.border}`;
      select.style.background = THEME.surface;
      select.style.color = THEME.text;

      const currentValue = cardSettings.merchantMap[merchant] || cardSettings.defaultCategory;
      const options = getMappingOptions(cardSettings, currentValue);

      options.forEach((category) => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        select.appendChild(option);
      });

      select.value = currentValue;

      select.addEventListener('change', () => {
        const value = select.value;
        onChange((nextSettings) => {
          nextSettings.merchantMap[merchant] = value;
        });
      });

      table.appendChild(label);
      table.appendChild(select);
    });

    container.appendChild(title);
    container.appendChild(table);
  }

  function renderMerchantMapping(container, transactions, cardSettings, onChange) {
    const merchantCounts = new Map();
    transactions.forEach((transaction) => {
      const merchant = transaction.merchant_detail;
      if (!merchant) {
        return;
      }
      merchantCounts.set(merchant, (merchantCounts.get(merchant) || 0) + 1);
    });
    const mappedMerchants = new Set(Object.keys(cardSettings.merchantMap || {}));

    const uncategorized = Array.from(merchantCounts.entries())
      .filter(([merchant]) => !mappedMerchants.has(merchant))
      .sort((a, b) => {
        if (a[1] !== b[1]) {
          return b[1] - a[1];
        }
        return a[0].localeCompare(b[0]);
      })
      .map(([merchant]) => merchant);
    const categorized = Array.from(mappedMerchants).sort((a, b) => a.localeCompare(b));

    // Add manual wildcard pattern section
    const wildcardSection = document.createElement('div');
    wildcardSection.style.marginBottom = '12px';
    
    const wildcardTitle = document.createElement('div');
    wildcardTitle.textContent = 'Add Wildcard Pattern';
    wildcardTitle.style.fontWeight = '600';
    wildcardTitle.style.color = THEME.accent;
    wildcardTitle.style.marginBottom = '8px';
    wildcardSection.appendChild(wildcardTitle);

    const wildcardHelp = document.createElement('div');
    wildcardHelp.textContent = 'Use * to match any characters. Example: STARBUCKS* matches all Starbucks merchants.';
    wildcardHelp.style.fontSize = '12px';
    wildcardHelp.style.color = THEME.muted;
    wildcardHelp.style.marginBottom = '8px';
    wildcardSection.appendChild(wildcardHelp);

    const wildcardForm = document.createElement('div');
    wildcardForm.style.display = 'grid';
    wildcardForm.style.gridTemplateColumns = '2fr 1fr auto';
    wildcardForm.style.gap = '8px';
    wildcardForm.style.alignItems = 'center';

    const patternInput = document.createElement('input');
    patternInput.type = 'text';
    patternInput.placeholder = 'e.g., STARBUCKS* or *GRAB*';
    patternInput.style.padding = '6px 8px';
    patternInput.style.borderRadius = '6px';
    patternInput.style.border = `1px solid ${THEME.border}`;
    patternInput.style.background = THEME.surface;
    patternInput.style.color = THEME.text;

    const categorySelect = document.createElement('select');
    categorySelect.style.padding = '6px 8px';
    categorySelect.style.borderRadius = '6px';
    categorySelect.style.border = `1px solid ${THEME.border}`;
    categorySelect.style.background = THEME.surface;
    categorySelect.style.color = THEME.text;

    const options = getMappingOptions(cardSettings, cardSettings.defaultCategory);
    options.forEach((category) => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    });

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.textContent = 'Add';
    addButton.style.padding = '6px 12px';
    addButton.style.borderRadius = '6px';
    addButton.style.border = `1px solid ${THEME.accent}`;
    addButton.style.background = THEME.accent;
    addButton.style.color = '#ffffff';
    addButton.style.fontSize = '13px';
    addButton.style.fontWeight = '600';
    addButton.style.cursor = 'pointer';

    // Status message element
    const statusMessage = document.createElement('div');
    statusMessage.style.gridColumn = '1 / -1';
    statusMessage.style.fontSize = '12px';
    statusMessage.style.padding = '6px 8px';
    statusMessage.style.borderRadius = '6px';
    statusMessage.style.display = 'none';
    statusMessage.style.marginTop = '4px';

    const showStatus = (message, isSuccess) => {
      statusMessage.textContent = message;
      statusMessage.style.display = 'block';
      statusMessage.style.background = isSuccess ? THEME.successSoft : THEME.errorSoft;
      statusMessage.style.color = isSuccess ? THEME.success : THEME.errorText;
      statusMessage.style.border = `1px solid ${isSuccess ? THEME.successBorder : THEME.errorBorder}`;
      setTimeout(() => {
        statusMessage.style.display = 'none';
      }, 3000);
    };

    addButton.addEventListener('click', () => {
      const pattern = patternInput.value.trim();
      const category = categorySelect.value;
      
      if (!pattern) {
        patternInput.style.borderColor = THEME.error;
        showStatus('Please enter a pattern', false);
        return;
      }
      
      // Reset border color
      patternInput.style.borderColor = THEME.border;
      
      // Initialize merchantMap if it doesn't exist
      if (!cardSettings.merchantMap) {
        cardSettings.merchantMap = {};
      }
      
      if (cardSettings.merchantMap[pattern]) {
        if (!confirm(`Pattern "${pattern}" already exists. Overwrite?`)) {
          return;
        }
      }
      
      onChange((nextSettings) => {
        if (!nextSettings.merchantMap) {
          nextSettings.merchantMap = {};
        }
        nextSettings.merchantMap[pattern] = category;
      });
      
      patternInput.value = '';
      showStatus(`✓ Added: ${pattern} → ${category}`, true);
    });

    wildcardForm.appendChild(patternInput);
    wildcardForm.appendChild(categorySelect);
    wildcardForm.appendChild(addButton);
    wildcardForm.appendChild(statusMessage);
    wildcardSection.appendChild(wildcardForm);
    container.appendChild(wildcardSection);

    const wildcardDivider = document.createElement('div');
    wildcardDivider.style.borderTop = `1px solid ${THEME.border}`;
    wildcardDivider.style.margin = '12px 0';
    container.appendChild(wildcardDivider);

    // Add title and mass categorization button
    const uncategorizedHeader = document.createElement('div');
    uncategorizedHeader.style.display = 'flex';
    uncategorizedHeader.style.justifyContent = 'space-between';
    uncategorizedHeader.style.alignItems = 'center';
    uncategorizedHeader.style.marginBottom = '8px';
    
    const uncategorizedTitle = document.createElement('div');
    uncategorizedTitle.textContent = 'Transactions to categorize';
    uncategorizedTitle.style.fontWeight = '600';
    uncategorizedTitle.style.color = THEME.accent;
    
    const massActionButton = document.createElement('button');
    massActionButton.type = 'button';
    massActionButton.textContent = `Categorize all as default (${uncategorized.length})`;
    massActionButton.style.padding = '6px 12px';
    massActionButton.style.borderRadius = '6px';
    massActionButton.style.border = `1px solid ${THEME.accent}`;
    massActionButton.style.background = THEME.accent;
    massActionButton.style.color = '#ffffff';
    massActionButton.style.fontSize = '12px';
    massActionButton.style.fontWeight = '600';
    massActionButton.style.cursor = 'pointer';
    massActionButton.style.opacity = uncategorized.length > 0 ? '1' : '0.5';
    massActionButton.disabled = uncategorized.length === 0;
    
    massActionButton.addEventListener('click', () => {
      if (uncategorized.length === 0) {
        return;
      }
      
      onChange((nextSettings) => {
        uncategorized.forEach((merchant) => {
          nextSettings.merchantMap[merchant] = nextSettings.defaultCategory;
        });
      });
    });
    
    uncategorizedHeader.appendChild(uncategorizedTitle);
    uncategorizedHeader.appendChild(massActionButton);
    container.appendChild(uncategorizedHeader);

    // Render uncategorized merchants (without title since we added it above)
    const uncategorizedSection = document.createElement('div');
    if (!uncategorized.length) {
      const empty = document.createElement('div');
      empty.textContent = 'None';
      empty.style.opacity = '0.7';
      uncategorizedSection.appendChild(empty);
    } else {
      const table = document.createElement('div');
      table.style.display = 'grid';
      table.style.gridTemplateColumns = '2fr 1fr';
      table.style.gap = '8px 12px';

      uncategorized.forEach((merchant) => {
        const label = document.createElement('div');
        label.textContent = merchant;
        label.style.wordBreak = 'break-word';

        const select = document.createElement('select');
        select.style.padding = '6px 8px';
        select.style.borderRadius = '6px';
        select.style.border = `1px solid ${THEME.border}`;
        select.style.background = THEME.surface;
        select.style.color = THEME.text;

        const currentValue = cardSettings.merchantMap[merchant] || cardSettings.defaultCategory;
        const options = getMappingOptions(cardSettings, currentValue);

        options.forEach((category) => {
          const option = document.createElement('option');
          option.value = category;
          option.textContent = category;
          select.appendChild(option);
        });

        select.value = currentValue;

        select.addEventListener('change', () => {
          const value = select.value;
          onChange((nextSettings) => {
            nextSettings.merchantMap[merchant] = value;
          });
        });

        table.appendChild(label);
        table.appendChild(select);
      });
      
      uncategorizedSection.appendChild(table);
    }
    container.appendChild(uncategorizedSection);

    const divider = document.createElement('div');
    divider.style.borderTop = `1px solid ${THEME.border}`;
    divider.style.margin = '12px 0';
    container.appendChild(divider);

    renderMerchantSection(
      container,
      'Categorized',
      categorized,
      cardSettings,
      onChange
    );
  }

  function renderManageView(container, data, storedTransactions, cardSettings, cardConfig, onChange) {
    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '12px';

    const notice = document.createElement('div');
    notice.style.background = THEME.warningSoft;
    notice.style.border = `1px solid ${THEME.warning}`;
    notice.style.borderRadius = '8px';
    notice.style.padding = '12px';
    notice.style.fontSize = '12px';
    notice.style.color = THEME.warning;
    notice.innerHTML = TRANSACTION_LOADING_NOTICE;

    const selectorsSection = document.createElement('div');
    selectorsSection.style.display = 'flex';
    selectorsSection.style.flexDirection = 'column';
    selectorsSection.style.gap = '12px';

    renderCategorySelectors(selectorsSection, cardSettings, cardConfig, onChange);
    renderDefaultCategory(selectorsSection, cardSettings, onChange);

    const summarySection = document.createElement('div');
    summarySection.id = UI_IDS.summaryContent;
    summarySection.style.background = THEME.surface;
    summarySection.style.border = `1px solid ${THEME.border}`;
    summarySection.style.borderRadius = '10px';
    summarySection.style.padding = '12px';

    renderSummary(summarySection, data, cardSettings);

    const mappingSection = document.createElement('div');
    mappingSection.style.display = 'flex';
    mappingSection.style.flexDirection = 'column';
    mappingSection.style.gap = '12px';
    mappingSection.style.background = THEME.surface;
    mappingSection.style.border = `1px solid ${THEME.border}`;
    mappingSection.style.borderRadius = '10px';
    mappingSection.style.padding = '12px';

    renderMerchantMapping(
      mappingSection,
      storedTransactions || [],
      cardSettings,
      onChange
    );

    container.appendChild(notice);
    container.appendChild(selectorsSection);
    container.appendChild(summarySection);
    container.appendChild(mappingSection);
  }

  function renderSpendingView(container, storedTransactions, cardSettings) {
    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '12px';

    const title = document.createElement('div');
    title.textContent = 'Spend Totals (Last 3 Calendar Months)';
    title.style.fontWeight = '600';

    const subtitle = document.createElement('div');
    subtitle.textContent = 'Grouped by posting month using stored transactions.';
    subtitle.style.opacity = '0.7';
    subtitle.style.fontSize = '12px';

    const notice = document.createElement('div');
    notice.style.background = THEME.warningSoft;
    notice.style.border = `1px solid ${THEME.warning}`;
    notice.style.borderRadius = '8px';
    notice.style.padding = '12px';
    notice.style.fontSize = '12px';
    notice.style.color = THEME.warning;
    notice.style.marginTop = '8px';
    notice.innerHTML = TRANSACTION_LOADING_NOTICE;

    container.appendChild(title);
    container.appendChild(subtitle);
    container.appendChild(notice);

    const monthlyTotals = calculateMonthlyTotals(storedTransactions, cardSettings);
    const months = Object.keys(monthlyTotals).sort((a, b) => b.localeCompare(a));

    const transactionsByMonth = {};
    storedTransactions.forEach((tx) => {
      if (!tx.posting_month) {
        return;
      }
      if (!transactionsByMonth[tx.posting_month]) {
        transactionsByMonth[tx.posting_month] = [];
      }
      transactionsByMonth[tx.posting_month].push(tx);
    });

    if (!months.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No stored transactions yet.';
      empty.style.opacity = '0.8';
      container.appendChild(empty);
      return;
    }

    months.forEach((monthKey) => {
      const monthData = monthlyTotals[monthKey];
      const monthTransactions = transactionsByMonth[monthKey] || [];
      const grouped = {};

      monthTransactions.forEach((tx) => {
        const category = tx.category || cardSettings.defaultCategory || 'Others';
        if (!grouped[category]) {
          grouped[category] = { total: 0, transactions: [] };
        }
        if (typeof tx.amount_value === 'number') {
          grouped[category].total += tx.amount_value;
        }
        grouped[category].transactions.push(tx);
      });

      const baseCategories = getSelectedCategories(cardSettings).filter(Boolean);
      baseCategories.push('Others');
      const extraCategories = Object.keys(grouped).filter(
        (category) => !baseCategories.includes(category)
      );
      const categoryOrder = baseCategories.concat(extraCategories);

      const card = document.createElement('div');
      card.style.border = `1px solid ${THEME.border}`;
      card.style.borderRadius = '12px';
      card.style.background = THEME.surface;
      card.style.boxShadow = '0 8px 20px rgba(15, 23, 42, 0.06)';
      card.style.padding = '12px';

      const header = document.createElement('button');
      header.type = 'button';
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.justifyContent = 'space-between';
      header.style.width = '100%';
      header.style.border = `1px solid ${THEME.border}`;
      header.style.borderRadius = '10px';
      header.style.background = THEME.panel;
      header.style.padding = '10px 12px';
      header.style.cursor = 'pointer';
      header.style.color = THEME.text;

      const headerLeft = document.createElement('div');
      headerLeft.style.display = 'flex';
      headerLeft.style.alignItems = 'center';
      headerLeft.style.gap = '8px';

      const chevron = document.createElement('span');
      chevron.textContent = '▸';
      chevron.style.fontSize = '12px';
      chevron.style.color = THEME.muted;

      const monthLabel = document.createElement('div');
      monthLabel.textContent = formatMonthLabel(monthKey);
      monthLabel.style.fontWeight = '600';

      headerLeft.appendChild(chevron);
      headerLeft.appendChild(monthLabel);

      const headerRight = document.createElement('div');
      headerRight.style.display = 'flex';
      headerRight.style.flexWrap = 'wrap';
      headerRight.style.gap = '6px';
      headerRight.style.justifyContent = 'flex-end';

      const totalPill = document.createElement('div');
      totalPill.textContent = `Total ${monthData.total_amount.toFixed(2)}`;
      totalPill.style.padding = '4px 8px';
      totalPill.style.borderRadius = '999px';
      totalPill.style.background = THEME.accentSoft;
      totalPill.style.border = `1px solid ${THEME.border}`;
      totalPill.style.fontWeight = '600';
      totalPill.style.fontSize = '12px';
      totalPill.style.color = THEME.accentText;

      headerRight.appendChild(totalPill);

      const warnings = [];
      
      categoryOrder.forEach((category) => {
        const value = monthData.totals?.[category] || 0;
        const pill = document.createElement('div');
        pill.textContent = `${category} ${value.toFixed(2)}`;
        pill.style.padding = '4px 8px';
        pill.style.borderRadius = '999px';
        pill.style.fontSize = '12px';
        
        // Apply warning styling based on thresholds
        if (value >= 750) {
          pill.style.background = '#fee2e2';
          pill.style.border = '1px solid #dc2626';
          pill.style.color = '#991b1b';
          pill.style.fontWeight = '700';
          warnings.push({ category, value, level: 'critical' });
        } else if (value >= 700) {
          pill.style.background = THEME.warningSoft;
          pill.style.border = `1px solid ${THEME.warning}`;
          pill.style.color = THEME.warning;
          pill.style.fontWeight = '600';
          warnings.push({ category, value, level: 'warning' });
        } else {
          pill.style.background = THEME.surface;
          pill.style.border = `1px solid ${THEME.border}`;
          pill.style.color = THEME.muted;
        }
        
        headerRight.appendChild(pill);
      });

      header.appendChild(headerLeft);
      header.appendChild(headerRight);

      const details = document.createElement('div');
      details.style.display = 'none';
      details.style.marginTop = '12px';
      details.style.padding = '12px';
      details.style.background = THEME.accentSoft;
      details.style.border = `1px solid ${THEME.border}`;
      details.style.borderRadius = '10px';

      categoryOrder.forEach((category) => {
        const group = grouped[category];
        if (!group) {
          return;
        }
        const sortedTransactions = group.transactions.slice().sort((a, b) => {
          const dateA = fromISODate(a.posting_date_iso) || parsePostingDate(a.posting_date);
          const dateB = fromISODate(b.posting_date_iso) || parsePostingDate(b.posting_date);
          const timeA = dateA ? dateA.getTime() : 0;
          const timeB = dateB ? dateB.getTime() : 0;
          if (timeA !== timeB) {
            return timeB - timeA;
          }
          return (a.merchant_detail || '').localeCompare(b.merchant_detail || '');
        });
        const categoryHeader = document.createElement('div');
        categoryHeader.style.display = 'flex';
        categoryHeader.style.justifyContent = 'space-between';
        categoryHeader.style.fontWeight = '600';
        categoryHeader.style.marginTop = '8px';

        const categoryLabel = document.createElement('div');
        categoryLabel.textContent = category;

        const categoryTotal = document.createElement('div');
        categoryTotal.textContent = group.total.toFixed(2);

        categoryHeader.appendChild(categoryLabel);
        categoryHeader.appendChild(categoryTotal);

        const list = document.createElement('div');
        list.style.display = 'grid';
        list.style.gridTemplateColumns = '1.6fr 0.6fr 0.6fr';
        list.style.gap = '6px 12px';
        list.style.marginTop = '6px';

        const headerMerchant = document.createElement('div');
        headerMerchant.textContent = 'Merchant';
        headerMerchant.style.fontWeight = '600';
        headerMerchant.style.color = THEME.muted;

        const headerDate = document.createElement('div');
        headerDate.textContent = 'Posting Date';
        headerDate.style.fontWeight = '600';
        headerDate.style.color = THEME.muted;

        const headerAmount = document.createElement('div');
        headerAmount.textContent = 'Amount';
        headerAmount.style.fontWeight = '600';
        headerAmount.style.color = THEME.muted;

        list.appendChild(headerMerchant);
        list.appendChild(headerDate);
        list.appendChild(headerAmount);

        sortedTransactions.forEach((tx) => {
          const merchantCell = document.createElement('div');
          merchantCell.textContent = tx.merchant_detail || '-';
          merchantCell.style.wordBreak = 'break-word';

          const dateCell = document.createElement('div');
          dateCell.textContent = tx.posting_date || '-';
          dateCell.style.color = THEME.muted;

          const amountCell = document.createElement('div');
          amountCell.textContent =
            typeof tx.amount_value === 'number' ? tx.amount_value.toFixed(2) : '-';

          list.appendChild(merchantCell);
          list.appendChild(dateCell);
          list.appendChild(amountCell);
        });

        details.appendChild(categoryHeader);
        details.appendChild(list);
      });

      header.addEventListener('click', () => {
        const isOpen = details.style.display === 'block';
        details.style.display = isOpen ? 'none' : 'block';
        chevron.textContent = isOpen ? '▸' : '▾';
      });

      card.appendChild(header);
      
      // Add warning banner if there are any warnings
      if (warnings.length > 0) {
        const warningBanner = document.createElement('div');
        warningBanner.style.marginTop = '8px';
        warningBanner.style.padding = '10px 12px';
        warningBanner.style.borderRadius = '8px';
        warningBanner.style.fontSize = '13px';
        
        const criticalWarnings = warnings.filter((w) => w.level === 'critical');
        const softWarnings = warnings.filter((w) => w.level === 'warning');
        
        if (criticalWarnings.length > 0) {
          warningBanner.style.background = '#fee2e2';
          warningBanner.style.border = '2px solid #dc2626';
          warningBanner.style.color = '#991b1b';
          warningBanner.style.fontWeight = '700';
          
          const title = document.createElement('div');
          title.textContent = '⚠️ Cap Exceeded Alert';
          title.style.marginBottom = '4px';
          title.style.fontSize = '14px';
          
          const message = document.createElement('div');
          const cats = criticalWarnings.map((w) => `${w.category} ($${w.value.toFixed(2)})`).join(', ');
          message.textContent = `The following categories have exceeded the $750 cap: ${cats}`;
          message.style.fontWeight = '400';
          
          warningBanner.appendChild(title);
          warningBanner.appendChild(message);
        } else if (softWarnings.length > 0) {
          warningBanner.style.background = THEME.warningSoft;
          warningBanner.style.border = `2px solid ${THEME.warning}`;
          warningBanner.style.color = THEME.warning;
          warningBanner.style.fontWeight = '600';
          
          const title = document.createElement('div');
          title.textContent = '⚡ Approaching Cap';
          title.style.marginBottom = '4px';
          title.style.fontSize = '14px';
          
          const message = document.createElement('div');
          const cats = softWarnings.map((w) => `${w.category} ($${w.value.toFixed(2)})`).join(', ');
          message.textContent = `Nearing $750 cap: ${cats}`;
          message.style.fontWeight = '400';
          
          warningBanner.appendChild(title);
          warningBanner.appendChild(message);
        }
        
        card.appendChild(warningBanner);
      }
      
      card.appendChild(details);
      container.appendChild(card);
    });
  }

  function switchTab(tab) {
    const manageContent = document.getElementById(UI_IDS.manageContent);
    const spendContent = document.getElementById(UI_IDS.spendContent);
    const syncContent = document.getElementById(UI_IDS.syncContent);
    const tabManage = document.getElementById(UI_IDS.tabManage);
    const tabSpend = document.getElementById(UI_IDS.tabSpend);
    const tabSync = document.getElementById(UI_IDS.tabSync);

    if (!manageContent || !spendContent || !syncContent || !tabManage || !tabSpend || !tabSync) {
      return;
    }

    const isManage = tab === 'manage';
    const isSpend = tab === 'spend';
    const isSync = tab === 'sync';
    manageContent.style.display = isManage ? 'block' : 'none';
    spendContent.style.display = isSpend ? 'block' : 'none';
    syncContent.style.display = isSync ? 'block' : 'none';

    const setTabState = (tabElement, isActive) => {
      tabElement.style.background = isActive ? THEME.accentSoft : 'transparent';
      tabElement.style.borderColor = isActive ? THEME.accent : THEME.border;
      tabElement.style.color = isActive ? THEME.accentText : THEME.text;
      tabElement.style.fontWeight = isActive ? '600' : '500';
    };

    setTabState(tabManage, isManage);
    setTabState(tabSpend, isSpend);
    setTabState(tabSync, isSync);
  }

  function createOverlay(data, storedTransactions, cardSettings, cardConfig, onChange, shouldShow = false) {
    let overlay = document.getElementById(UI_IDS.overlay);
    let manageContent;
    let spendContent;
    const wasVisible = overlay && overlay.style.display === 'flex';

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = UI_IDS.overlay;
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.zIndex = '99998';
      overlay.style.background = THEME.overlay;
      overlay.style.display = 'none';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          overlay.style.display = 'none';
        }
      });

      const panel = document.createElement('div');
      panel.style.width = 'min(960px, 92vw)';
      panel.style.maxHeight = '85vh';
      panel.style.background = THEME.panel;
      panel.style.color = THEME.text;
      panel.style.border = `1px solid ${THEME.border}`;
      panel.style.borderRadius = '12px';
      panel.style.padding = '16px';
      panel.style.boxShadow = THEME.shadow;
      panel.style.display = 'flex';
      panel.style.flexDirection = 'column';
      panel.style.gap = '12px';

      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';

      const title = document.createElement('div');
      title.textContent = 'Subcap Tools';
      title.style.fontWeight = '600';
      title.style.fontSize = '16px';
      title.style.color = THEME.accent;

      const closeButton = document.createElement('button');
      closeButton.id = UI_IDS.close;
      closeButton.type = 'button';
      closeButton.textContent = 'Close';
      closeButton.style.background = THEME.surface;
      closeButton.style.color = THEME.text;
      closeButton.style.border = `1px solid ${THEME.border}`;
      closeButton.style.borderRadius = '8px';
      closeButton.style.padding = '6px 10px';
      closeButton.style.cursor = 'pointer';
      closeButton.addEventListener('click', () => {
        overlay.style.display = 'none';
      });

      header.appendChild(title);
      header.appendChild(closeButton);

      const tabs = document.createElement('div');
      tabs.style.display = 'flex';
      tabs.style.gap = '8px';

      const tabManage = document.createElement('button');
      tabManage.id = UI_IDS.tabManage;
      tabManage.type = 'button';
      tabManage.textContent = 'Manage Transactions';
      tabManage.style.border = `1px solid ${THEME.border}`;
      tabManage.style.borderRadius = '999px';
      tabManage.style.padding = '6px 12px';
      tabManage.style.background = 'transparent';
      tabManage.style.color = THEME.text;
      tabManage.style.cursor = 'pointer';
      tabManage.addEventListener('click', () => switchTab('manage'));

      const tabSpend = document.createElement('button');
      tabSpend.id = UI_IDS.tabSpend;
      tabSpend.type = 'button';
      tabSpend.textContent = 'Spend Totals';
      tabSpend.style.border = `1px solid ${THEME.border}`;
      tabSpend.style.borderRadius = '999px';
      tabSpend.style.padding = '6px 12px';
      tabSpend.style.background = 'transparent';
      tabSpend.style.color = THEME.text;
      tabSpend.style.cursor = 'pointer';
      tabSpend.addEventListener('click', () => switchTab('spend'));

      const tabSync = document.createElement('button');
      tabSync.id = UI_IDS.tabSync;
      tabSync.type = 'button';
      tabSync.textContent = 'Sync';
      tabSync.style.border = `1px solid ${THEME.border}`;
      tabSync.style.borderRadius = '999px';
      tabSync.style.padding = '6px 12px';
      tabSync.style.background = 'transparent';
      tabSync.style.color = THEME.text;
      tabSync.style.cursor = 'pointer';
      tabSync.addEventListener('click', () => switchTab('sync'));

      tabs.appendChild(tabSpend);
      tabs.appendChild(tabManage);
      tabs.appendChild(tabSync);

      const privacyNotice = document.createElement('div');
      privacyNotice.textContent =
        'Privacy: data stays in your browser (Tampermonkey storage/localStorage). ' +
        'No remote logging. Stored transactions cover the last 3 calendar months.';
      privacyNotice.style.fontSize = '12px';
      privacyNotice.style.color = THEME.muted;
      privacyNotice.style.marginTop = '4px';

      manageContent = document.createElement('div');
      manageContent.id = UI_IDS.manageContent;
      manageContent.style.display = 'none';
      manageContent.style.overflow = 'auto';

      spendContent = document.createElement('div');
      spendContent.id = UI_IDS.spendContent;
      spendContent.style.display = 'none';
      spendContent.style.overflow = 'auto';

      const syncContent = createSyncTab(syncManager, cardSettings, THEME);
      syncContent.id = UI_IDS.syncContent;
      syncContent.style.display = 'none';
      syncContent.style.overflow = 'auto';

      panel.appendChild(header);
      panel.appendChild(tabs);
      panel.appendChild(privacyNotice);
      panel.appendChild(manageContent);
      panel.appendChild(spendContent);
      panel.appendChild(syncContent);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
    } else {
      manageContent = document.getElementById(UI_IDS.manageContent);
      spendContent = document.getElementById(UI_IDS.spendContent);
    }

    if (manageContent) {
      renderManageView(
        manageContent,
        data,
        storedTransactions,
        cardSettings,
        cardConfig,
        onChange
      );
    }
    if (spendContent) {
      renderSpendingView(spendContent, storedTransactions, cardSettings);
    }

    if (shouldShow || wasVisible) {
      overlay.style.display = 'flex';
    }
    switchTab('spend');
  }

  async function main() {
    if (!window.location.href.startsWith(URL_PREFIX)) {
      removeUI();
      return;
    }

    const cardNameNode = await waitForXPath(
      '/html/body/section/section/section/section/section/section/section/section/div[1]/div/form[1]/div[1]/div/div[1]/div/div[2]/h3'
    );
    if (!cardNameNode) {
      removeUI();
      return;
    }

    const cardName = normalizeText(cardNameNode.textContent);
    if (cardName !== TARGET_CARD_NAME) {
      removeUI();
      return;
    }

    const cardConfig = CARD_CONFIGS[cardName];
    if (!cardConfig) {
      removeUI();
      return;
    }

    const tableBodyXPath =
      '/html/body/section/section/section/section/section/section/section/section/div[1]/div/form[1]/div[9]/div[2]/table/tbody';
    const tableBody = await waitForTableBodyRows(tableBodyXPath);
    if (!tableBody) {
      removeUI();
      return;
    }

    const initialSettings = loadSettings();
    const initialCardSettings = ensureCardSettings(initialSettings, cardName, cardConfig);
    const initialData = buildData(tableBody, cardName, initialCardSettings);
    updateStoredTransactions(initialSettings, cardName, cardConfig, initialData.transactions);
    saveSettings(initialSettings);

    let refreshInProgress = false;
    let refreshPending = false;

    const refreshOverlay = async (shouldShow = false) => {
      if (refreshInProgress) {
        refreshPending = true;
        return;
      }
      refreshInProgress = true;
      const latestTableBody = await waitForTableBodyRows(tableBodyXPath);
      try {
        if (!latestTableBody) {
          return;
        }
        const settings = loadSettings();
        const cardSettings = ensureCardSettings(settings, cardName, cardConfig);
        const data = buildData(latestTableBody, cardName, cardSettings);
        updateStoredTransactions(settings, cardName, cardConfig, data.transactions);
        saveSettings(settings);
        const storedTransactions = getStoredTransactions(cardSettings);
        createOverlay(data, storedTransactions, cardSettings, cardConfig, (updateFn) => {
          const nextSettings = loadSettings();
          const nextCardSettings = ensureCardSettings(nextSettings, cardName, cardConfig);
          updateFn(nextCardSettings);
          saveSettings(nextSettings);
          refreshOverlay();
        }, shouldShow);
      } finally {
        refreshInProgress = false;
        if (refreshPending) {
          refreshPending = false;
          refreshOverlay();
        }
      }
    };

    createButton(() => refreshOverlay(true));
    observeTableBody(tableBodyXPath, refreshOverlay);
  }

  main();
})();
