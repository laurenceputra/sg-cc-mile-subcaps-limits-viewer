// ==UserScript==
// @name         Bank CC Limits Subcap Calculator
// @namespace    local
// @version      0.3.0
// @description  Extract credit card transactions and manage subcap categories
// @match        https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

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
    jsonContent: 'cc-subcap-json',
    manageContent: 'cc-subcap-manage',
    summaryContent: 'cc-subcap-summary',
    tabJson: 'cc-subcap-tab-json',
    tabManage: 'cc-subcap-tab-manage',
    close: 'cc-subcap-close'
  };

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
    const raw = normalizeText(value).replace(/,/g, '').replace(/-/g, ' ');
    if (!raw) {
      return null;
    }

    const numericMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (numericMatch) {
      const day = Number(numericMatch[1]);
      const month = Number(numericMatch[2]);
      const year = Number(numericMatch[3]);
      const date = new Date(year, month - 1, day);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const textMatch = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s*(\d{4})?$/);
    if (textMatch) {
      const day = Number(textMatch[1]);
      const monthName = textMatch[2].toLowerCase();
      const monthMap = {
        jan: 0,
        january: 0,
        feb: 1,
        february: 1,
        mar: 2,
        march: 2,
        apr: 3,
        april: 3,
        may: 4,
        jun: 5,
        june: 5,
        jul: 6,
        july: 6,
        aug: 7,
        august: 7,
        sep: 8,
        sept: 8,
        september: 8,
        oct: 9,
        october: 9,
        nov: 10,
        november: 10,
        dec: 11,
        december: 11
      };
      if (!Object.prototype.hasOwnProperty.call(monthMap, monthName)) {
        return null;
      }
      let year = textMatch[3] ? Number(textMatch[3]) : new Date().getFullYear();
      let date = new Date(year, monthMap[monthName], day);
      if (!textMatch[3]) {
        const today = new Date();
        if (date > today) {
          year -= 1;
          date = new Date(year, monthMap[monthName], day);
        }
      }
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function getCutoffDate(months) {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setMonth(cutoff.getMonth() - months);
    return cutoff;
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
    return raw.replace(/^ref\\s*no\\s*:\\s*/i, '');
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

  function resolveCategory(merchantName, cardSettings) {
    if (!merchantName) {
      return cardSettings.defaultCategory || 'Others';
    }
    if (cardSettings.merchantMap && cardSettings.merchantMap[merchantName]) {
      return cardSettings.merchantMap[merchantName];
    }
    return cardSettings.defaultCategory || 'Others';
  }

  function buildTransactions(tbody, cardSettings) {
    const rows = Array.from(tbody.querySelectorAll('tr'));
    return rows
      .map((row, index) => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 4) {
          return null;
        }

        const postingDate = normalizeText(cells[0].textContent);
        const transactionDate = normalizeText(cells[1].textContent);
        const { merchantName, refNo } = extractMerchantInfo(cells[2]);

        if (
          !postingDate &&
          !transactionDate &&
          merchantName.toLowerCase() === 'previous balance'
        ) {
          return null;
        }

        const { dollarsText, centsText, amountText } = extractDollarsAndCents(cells[3]);
        const amountValue = parseAmount(amountText);
        const postingDateParsed = parsePostingDate(postingDate);
        const postingDateIso = postingDateParsed ? toISODate(postingDateParsed) : '';
        const category = resolveCategory(merchantName, cardSettings);

        return {
          row_index: index + 1,
          posting_date: postingDate,
          posting_date_iso: postingDateIso,
          transaction_date: transactionDate,
          merchant_detail: merchantName,
          ref_no: normalizeKey(normalizeRefNo(refNo)),
          amount_dollars: dollarsText,
          amount_cents: centsText,
          amount_text: amountText,
          amount_value: amountValue,
          category
        };
      })
      .filter(Boolean);
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
    const transactions = buildTransactions(tableBody, cardSettings);
    const summary = calculateSummary(transactions, cardSettings);

    return {
      card_name: cardName,
      source_url: window.location.href,
      extracted_at: new Date().toISOString(),
      selected_categories: getSelectedCategories(cardSettings).filter(Boolean),
      default_category: cardSettings.defaultCategory,
      summary,
      transactions
    };
  }

  function updateStoredTransactions(settings, cardName, cardConfig, transactions) {
    const cardSettings = ensureCardSettings(settings, cardName, cardConfig);
    const cutoff = getCutoffDate(3);
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
    button.style.border = '1px solid #2b2b2b';
    button.style.background = '#111';
    button.style.color = '#fff';
    button.style.fontSize = '14px';
    button.style.cursor = 'pointer';
    button.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.25)';
    button.addEventListener('click', onClick);

    document.body.appendChild(button);
  }

  function renderSummary(container, data, cardSettings) {
    container.innerHTML = '';

    const title = document.createElement('div');
    title.textContent = 'Totals (by category)';
    title.style.fontWeight = '600';
    title.style.marginBottom = '8px';

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
    totalRowValue.textContent = data.summary.total_amount.toFixed(2);

    list.appendChild(totalRowLabel);
    list.appendChild(totalRowValue);

    container.appendChild(title);
    container.appendChild(list);
  }

  function renderCategorySelectors(container, cardSettings, cardConfig, onChange) {
    const title = document.createElement('div');
    title.textContent = 'Select bonus categories (2)';
    title.style.fontWeight = '600';

    const wrapper = document.createElement('div');
    wrapper.style.display = 'grid';
    wrapper.style.gridTemplateColumns = '1fr 1fr';
    wrapper.style.gap = '12px';

    const selected = getSelectedCategories(cardSettings);

    for (let i = 0; i < cardConfig.subcapSlots; i += 1) {
      const select = document.createElement('select');
      select.style.padding = '6px 8px';
      select.style.borderRadius = '6px';
      select.style.border = '1px solid #2b2b2b';
      select.style.background = '#111';
      select.style.color = '#fff';

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

    const select = document.createElement('select');
    select.style.padding = '6px 8px';
    select.style.borderRadius = '6px';
    select.style.border = '1px solid #2b2b2b';
    select.style.background = '#111';
    select.style.color = '#fff';

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

  function renderMerchantMapping(container, data, cardSettings, onChange) {
    const title = document.createElement('div');
    title.textContent = 'Manage transactions';
    title.style.fontWeight = '600';

    const table = document.createElement('div');
    table.style.display = 'grid';
    table.style.gridTemplateColumns = '2fr 1fr';
    table.style.gap = '8px 12px';

    const uniqueMerchants = Array.from(
      new Set(data.transactions.map((transaction) => transaction.merchant_detail))
    ).sort((a, b) => a.localeCompare(b));

    uniqueMerchants.forEach((merchant) => {
      const label = document.createElement('div');
      label.textContent = merchant;
      label.style.wordBreak = 'break-word';

      const select = document.createElement('select');
      select.style.padding = '6px 8px';
      select.style.borderRadius = '6px';
      select.style.border = '1px solid #2b2b2b';
      select.style.background = '#111';
      select.style.color = '#fff';

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

  function renderManageView(container, data, cardSettings, cardConfig, onChange) {
    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '16px';

    const selectorsSection = document.createElement('div');
    selectorsSection.style.display = 'flex';
    selectorsSection.style.flexDirection = 'column';
    selectorsSection.style.gap = '12px';

    renderCategorySelectors(selectorsSection, cardSettings, cardConfig, onChange);
    renderDefaultCategory(selectorsSection, cardSettings, onChange);

    const summarySection = document.createElement('div');
    summarySection.id = UI_IDS.summaryContent;
    summarySection.style.background = '#111';
    summarySection.style.border = '1px solid #2b2b2b';
    summarySection.style.borderRadius = '10px';
    summarySection.style.padding = '12px';

    renderSummary(summarySection, data, cardSettings);

    const mappingSection = document.createElement('div');
    mappingSection.style.display = 'flex';
    mappingSection.style.flexDirection = 'column';
    mappingSection.style.gap = '12px';

    renderMerchantMapping(mappingSection, data, cardSettings, onChange);

    container.appendChild(selectorsSection);
    container.appendChild(summarySection);
    container.appendChild(mappingSection);
  }

  function switchTab(tab) {
    const jsonContent = document.getElementById(UI_IDS.jsonContent);
    const manageContent = document.getElementById(UI_IDS.manageContent);
    const tabJson = document.getElementById(UI_IDS.tabJson);
    const tabManage = document.getElementById(UI_IDS.tabManage);

    if (!jsonContent || !manageContent || !tabJson || !tabManage) {
      return;
    }

    const isJson = tab === 'json';
    jsonContent.style.display = isJson ? 'block' : 'none';
    manageContent.style.display = isJson ? 'none' : 'block';

    tabJson.style.background = isJson ? '#1f1f1f' : 'transparent';
    tabManage.style.background = !isJson ? '#1f1f1f' : 'transparent';
  }

  function createOverlay(data, cardSettings, cardConfig, onChange) {
    let overlay = document.getElementById(UI_IDS.overlay);
    let jsonContent;
    let manageContent;

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = UI_IDS.overlay;
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.zIndex = '99998';
      overlay.style.background = 'rgba(0, 0, 0, 0.6)';
      overlay.style.display = 'flex';
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
      panel.style.background = '#0b0b0b';
      panel.style.color = '#e6e6e6';
      panel.style.border = '1px solid #2b2b2b';
      panel.style.borderRadius = '12px';
      panel.style.padding = '16px';
      panel.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.4)';
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

      const closeButton = document.createElement('button');
      closeButton.id = UI_IDS.close;
      closeButton.type = 'button';
      closeButton.textContent = 'Close';
      closeButton.style.background = '#1f1f1f';
      closeButton.style.color = '#fff';
      closeButton.style.border = '1px solid #2b2b2b';
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

      const tabJson = document.createElement('button');
      tabJson.id = UI_IDS.tabJson;
      tabJson.type = 'button';
      tabJson.textContent = 'JSON';
      tabJson.style.border = '1px solid #2b2b2b';
      tabJson.style.borderRadius = '999px';
      tabJson.style.padding = '6px 12px';
      tabJson.style.background = '#1f1f1f';
      tabJson.style.color = '#fff';
      tabJson.style.cursor = 'pointer';
      tabJson.addEventListener('click', () => switchTab('json'));

      const tabManage = document.createElement('button');
      tabManage.id = UI_IDS.tabManage;
      tabManage.type = 'button';
      tabManage.textContent = 'Manage Transactions';
      tabManage.style.border = '1px solid #2b2b2b';
      tabManage.style.borderRadius = '999px';
      tabManage.style.padding = '6px 12px';
      tabManage.style.background = 'transparent';
      tabManage.style.color = '#fff';
      tabManage.style.cursor = 'pointer';
      tabManage.addEventListener('click', () => switchTab('manage'));

      tabs.appendChild(tabJson);
      tabs.appendChild(tabManage);

      jsonContent = document.createElement('pre');
      jsonContent.id = UI_IDS.jsonContent;
      jsonContent.style.margin = '0';
      jsonContent.style.padding = '12px';
      jsonContent.style.background = '#141414';
      jsonContent.style.borderRadius = '8px';
      jsonContent.style.overflow = 'auto';
      jsonContent.style.fontSize = '12px';
      jsonContent.style.lineHeight = '1.4';

      manageContent = document.createElement('div');
      manageContent.id = UI_IDS.manageContent;
      manageContent.style.display = 'none';
      manageContent.style.overflow = 'auto';

      panel.appendChild(header);
      panel.appendChild(tabs);
      panel.appendChild(jsonContent);
      panel.appendChild(manageContent);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
    } else {
      jsonContent = document.getElementById(UI_IDS.jsonContent);
      manageContent = document.getElementById(UI_IDS.manageContent);
    }

    if (jsonContent) {
      jsonContent.textContent = JSON.stringify(data, null, 2);
    }
    if (manageContent) {
      renderManageView(manageContent, data, cardSettings, cardConfig, onChange);
    }

    overlay.style.display = 'flex';
    switchTab('manage');
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

    const tableBody = await waitForXPath(
      '/html/body/section/section/section/section/section/section/section/section/div[1]/div/form[1]/div[9]/div[2]/table/tbody'
    );
    if (!tableBody) {
      removeUI();
      return;
    }

    const initialSettings = loadSettings();
    const initialCardSettings = ensureCardSettings(initialSettings, cardName, cardConfig);
    const initialData = buildData(tableBody, cardName, initialCardSettings);
    updateStoredTransactions(initialSettings, cardName, cardConfig, initialData.transactions);
    saveSettings(initialSettings);

    const refreshOverlay = () => {
      const settings = loadSettings();
      const cardSettings = ensureCardSettings(settings, cardName, cardConfig);
      const data = buildData(tableBody, cardName, cardSettings);
      updateStoredTransactions(settings, cardName, cardConfig, data.transactions);
      saveSettings(settings);
      createOverlay(data, cardSettings, cardConfig, (updateFn) => {
        const nextSettings = loadSettings();
        const nextCardSettings = ensureCardSettings(nextSettings, cardName, cardConfig);
        updateFn(nextCardSettings);
        saveSettings(nextSettings);
        refreshOverlay();
      });
    };

    createButton(refreshOverlay);
  }

  main();
})();
