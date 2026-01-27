// ==UserScript==
// @name         Bank CC Limits Subcap Calculator
// @namespace    local
// @version      0.1.0
// @description  Extract credit card transactions and display JSON overlay
// @match        https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.__uobTransactionsJsonInjected) {
    return;
  }
  window.__uobTransactionsJsonInjected = true;

  const URL_PREFIX = 'https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do';
  const TARGET_CARD_NAME = "LADY'S SOLITAIRE CARD";

  const CARD_NAME_XPATH =
    '/html/body/section/section/section/section/section/section/section/section/div[1]/div/form[1]/div[1]/div/div[1]/div/div[2]/h3';
  const TABLE_BODY_XPATH =
    '/html/body/section/section/section/section/section/section/section/section/div[1]/div/form[1]/div[9]/div[2]/table/tbody';

  const UI_IDS = {
    button: 'uob-tx-json-btn',
    overlay: 'uob-tx-json-overlay',
    content: 'uob-tx-json-content',
    close: 'uob-tx-json-close'
  };

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

  function buildTransactions(tbody) {
    const rows = Array.from(tbody.querySelectorAll('tr'));
    return rows
      .map((row, index) => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 4) {
          return null;
        }

        const postingDate = normalizeText(cells[0].textContent);
        const transactionDate = normalizeText(cells[1].textContent);
        const merchantDetail = normalizeText(cells[2].textContent);

        if (
          !postingDate &&
          !transactionDate &&
          merchantDetail.toLowerCase() === 'previous balance'
        ) {
          return null;
        }

        const { dollarsText, centsText, amountText } = extractDollarsAndCents(cells[3]);
        const amountValue = parseAmount(amountText);

        return {
          row_index: index + 1,
          posting_date: postingDate,
          transaction_date: transactionDate,
          merchant_detail: merchantDetail,
          amount_dollars: dollarsText,
          amount_cents: centsText,
          amount_text: amountText,
          amount_value: amountValue
        };
      })
      .filter(Boolean);
  }

  function createButton(onClick) {
    if (document.getElementById(UI_IDS.button)) {
      return;
    }

    const button = document.createElement('button');
    button.id = UI_IDS.button;
    button.type = 'button';
    button.textContent = 'Show Transactions JSON';
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

  function createOverlay(jsonText) {
    const existing = document.getElementById(UI_IDS.overlay);
    if (existing) {
      const content = existing.querySelector(`#${UI_IDS.content}`);
      if (content) {
        content.textContent = jsonText;
      }
      existing.style.display = 'block';
      return;
    }

    const overlay = document.createElement('div');
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
    panel.style.width = 'min(900px, 90vw)';
    panel.style.maxHeight = '80vh';
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
    title.textContent = 'Transactions JSON';
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

    const pre = document.createElement('pre');
    pre.id = UI_IDS.content;
    pre.textContent = jsonText;
    pre.style.margin = '0';
    pre.style.padding = '12px';
    pre.style.background = '#141414';
    pre.style.borderRadius = '8px';
    pre.style.overflow = 'auto';
    pre.style.fontSize = '12px';
    pre.style.lineHeight = '1.4';

    panel.appendChild(header);
    panel.appendChild(pre);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  async function main() {
    if (!window.location.href.startsWith(URL_PREFIX)) {
      removeUI();
      return;
    }

    const cardNameNode = await waitForXPath(CARD_NAME_XPATH);
    if (!cardNameNode) {
      removeUI();
      return;
    }

    const cardName = normalizeText(cardNameNode.textContent);
    if (cardName !== TARGET_CARD_NAME) {
      removeUI();
      return;
    }

    const tableBody = await waitForXPath(TABLE_BODY_XPATH);
    if (!tableBody) {
      return;
    }

    const data = {
      card_name: cardName,
      source_url: window.location.href,
      extracted_at: new Date().toISOString(),
      transactions: buildTransactions(tableBody)
    };

    const jsonText = JSON.stringify(data, null, 2);
    createButton(() => createOverlay(jsonText));
  }

  main();
})();
