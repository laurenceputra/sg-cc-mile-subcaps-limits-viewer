import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadExports } from './helpers/load-userscript-exports.js';
import { createFakeTimers } from './helpers/fake-timers.js';
import { snapshotGlobals, restoreGlobals } from './helpers/reset-globals.js';

const exports = await loadExports();
const globalsSnapshot = snapshotGlobals();

afterEach(() => {
  restoreGlobals(globalsSnapshot);
});

function makeClassList() {
  const set = new Set();
  return {
    add: (...names) => names.forEach((name) => set.add(name)),
    remove: (...names) => names.forEach((name) => set.delete(name)),
    contains: (name) => set.has(name),
    toggle: (name, force) => {
      if (typeof force === 'boolean') {
        if (force) set.add(name);
        else set.delete(name);
        return force;
      }
      if (set.has(name)) {
        set.delete(name);
        return false;
      }
      set.add(name);
      return true;
    }
  };
}

function makeElement(tag, doc) {
  const element = {
    tagName: String(tag || 'div').toUpperCase(),
    id: '',
    children: [],
    classList: makeClassList(),
    style: {},
    textContent: '',
    innerHTML: '',
    _events: {},
    _queryMap: new Map(),
    appendChild(child) {
      this.children.push(child);
      if (doc) doc._register(child);
      return child;
    },
    insertBefore(child, beforeChild) {
      const index = this.children.indexOf(beforeChild);
      if (index === -1) {
        this.children.push(child);
      } else {
        this.children.splice(index, 0, child);
      }
      if (doc) doc._register(child);
      return child;
    },
    setAttribute(name, value) {
      this[name] = value;
      if (name === 'id') {
        this.id = value;
        if (doc) doc._register(this);
      }
    },
    getAttribute(name) {
      return this[name];
    },
    removeAttribute(name) {
      delete this[name];
    },
    addEventListener(event, handler) {
      this._events[event] = handler;
    },
    remove() {
      this._removed = true;
    },
    replaceWith(node) {
      this._replaced = true;
      if (doc) doc._register(node);
    },
    querySelector(selector) {
      if (!this._queryMap.has(selector)) {
        this._queryMap.set(selector, createQueryElement(selector, doc));
      }
      return this._queryMap.get(selector);
    },
    querySelectorAll() {
      return [];
    },
    focus() {}
  };
  return element;
}

function makeInput(doc) {
  const element = makeElement('input', doc);
  element.value = '';
  element.checked = false;
  return element;
}

function makeButton(doc) {
  const element = makeElement('button', doc);
  element.type = 'button';
  element.click = async () => {
    if (element._events.click) {
      return element._events.click();
    }
    return undefined;
  };
  return element;
}

function createQueryElement(selector, doc) {
  const inputSelectors = new Set([
    '#sync-unlock-passphrase',
    '#sync-server-url',
    '#sync-email',
    '#sync-passphrase'
  ]);
  const checkboxSelectors = new Set([
    '#sync-remember-unlock',
    '#sync-remember-unlock-setup'
  ]);
  const buttonSelectors = new Set([
    '#setup-sync-btn',
    '#unlock-sync-btn',
    '#forget-sync-unlock-btn',
    '#sync-now-btn',
    '#disable-sync-btn',
    '#sync-setup-save',
    '#sync-setup-cancel',
    '#sync-conflict-keep-local',
    '#sync-conflict-keep-remote',
    '#sync-conflict-merge'
  ]);

  if (inputSelectors.has(selector)) {
    return makeInput(doc);
  }
  if (checkboxSelectors.has(selector)) {
    const input = makeInput(doc);
    input.type = 'checkbox';
    return input;
  }
  if (buttonSelectors.has(selector)) {
    return makeButton(doc);
  }
  return makeElement('div', doc);
}

function makeDocument() {
  const byId = new Map();
  const doc = {
    _register(node) {
      if (node && node.id) {
        byId.set(node.id, node);
      }
    },
    createElement: (tag) => makeElement(tag, doc),
    getElementById: (id) => byId.get(id) || null,
    documentElement: {},
    head: null,
    body: null,
    evaluate: () => ({ singleNodeValue: null })
  };
  doc.head = makeElement('head', doc);
  doc.body = makeElement('body', doc);
  return doc;
}

function makeTheme() {
  return {
    border: '#ccc',
    surface: '#fff',
    accent: '#000',
    accentSoft: '#eee',
    accentText: '#000',
    accentShadow: 'none',
    warning: '#f90',
    warningSoft: '#fff7e6',
    errorBorder: '#f00',
    errorSoft: '#fee',
    errorText: '#f00',
    successBorder: '#0f0',
    successSoft: '#efe',
    success: '#0f0',
    panel: '#f8f8f8',
    text: '#111',
    muted: '#666',
    overlay: 'rgba(0,0,0,0.1)',
    shadow: 'none'
  };
}

async function submitForm(form) {
  return form._events.submit({ preventDefault() {} });
}

describe('sync ui + overlay', () => {
  it('showSyncSetupDialog validates fields and completes setup', async () => {
    const doc = makeDocument();
    globalThis.document = doc;
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };
    const timers = createFakeTimers();
    timers.bindToWindow(globalThis.window);

    let setupCalls = 0;
    let syncStateChanged = false;
    const manager = {
      setupSync: async () => {
        setupCalls += 1;
        return { success: true };
      }
    };

    exports.showSyncSetupDialog(manager, makeTheme(), () => { syncStateChanged = true; });
    const overlay = doc.body.children[0];
    const status = overlay.querySelector('#sync-setup-status');
    const form = overlay.querySelector('#sync-setup-form');
    const saveButton = overlay.querySelector('#sync-setup-save');
    const serverInput = overlay.querySelector('#sync-server-url');
    const emailInput = overlay.querySelector('#sync-email');
    const passInput = overlay.querySelector('#sync-passphrase');

    assert.equal(saveButton._events.click, undefined, 'save button should rely on form submit only');

    await submitForm(form);
    assert.equal(status.textContent, 'All fields are required.');

    serverInput.value = 'ftp://example.com';
    emailInput.value = 'user@example.com';
    passInput.value = 'secret';
    await submitForm(form);
    assert.match(status.textContent, /HTTP or HTTPS/, 'should show protocol validation error');

    serverInput.value = 'https://example.com';
    await submitForm(form);
    assert.equal(setupCalls, 1);
    assert.equal(syncStateChanged, false, 'dialog close callback should be delayed');
    assert.equal(overlay._removed, undefined, 'dialog should remain open before timeout advances');

    timers.advanceBy(500);
    await Promise.resolve();
    assert.equal(syncStateChanged, true);
    assert.equal(overlay._removed, true);
    timers.unbindFromWindow();
  });

  it('getSyncSummaryState and buildSyncSummaryBanner cover key sync states', () => {
    const doc = makeDocument();
    globalThis.document = doc;

    const cases = [
      {
        name: 'sync off',
        manager: {
          isEnabled: () => false
        },
        cardName: 'XL Rewards Card',
        expected: {
          badge: 'Sync off',
          detail: 'Local-only mode. Raw transactions and category rules stay on this device.',
          tabLabel: 'Sync'
        }
      },
      {
        name: 'locked',
        manager: {
          config: {},
          isEnabled: () => true,
          hasPendingConflict: () => false,
          isUnlocked: () => false,
          hasRememberedUnlockCache: () => false
        },
        cardName: 'XL Rewards Card',
        expected: {
          badge: 'Sync locked',
          detail: 'Last sync: Never. Password is required to unlock sync before pushing changes.',
          tabLabel: 'Sync • Locked'
        }
      },
      {
        name: 'auto unlock available',
        manager: {
          config: {},
          isEnabled: () => true,
          hasPendingConflict: () => false,
          isUnlocked: () => false,
          hasRememberedUnlockCache: () => true
        },
        cardName: 'XL Rewards Card',
        expected: {
          badge: 'Sync locked (auto unlock available)',
          detail: 'Last sync: Never. Saved unlock is available; Sync Now will try it automatically.',
          tabLabel: 'Sync • Auto unlock'
        }
      },
      {
        name: 'unlocked',
        manager: {
          config: {},
          isEnabled: () => true,
          hasPendingConflict: () => false,
          isUnlocked: () => true,
          hasRememberedUnlockCache: () => false
        },
        cardName: 'XL Rewards Card',
        expected: {
          badge: 'Sync ready',
          detail: 'Active card only. Last sync: Never.',
          tabLabel: 'Sync • Ready'
        }
      },
      {
        name: 'pending conflict',
        manager: {
          config: {
            pendingConflict: {
              cardName: 'Visa Signature'
            }
          },
          isEnabled: () => true,
          hasPendingConflict: () => true,
          isUnlocked: () => false,
          hasRememberedUnlockCache: () => false
        },
        cardName: 'XL Rewards Card',
        expected: {
          badge: 'Sync needs attention',
          detail: 'Sync is paused until you resolve the conflict for Visa Signature.',
          tabLabel: 'Sync • Resolve'
        }
      }
    ];

    for (const { name, manager, cardName, expected } of cases) {
      const summary = exports.getSyncSummaryState(manager, cardName);
      assert.equal(summary.badge, expected.badge, `${name}: badge`);
      assert.equal(summary.detail, expected.detail, `${name}: detail`);
      assert.equal(summary.tabLabel, expected.tabLabel, `${name}: tab label`);

      const banner = exports.buildSyncSummaryBanner(manager, cardName, makeTheme());
      const [textWrap, pill] = banner.children;
      const [title, detail] = textWrap.children;

      assert.equal(banner.id, 'cc-subcap-sync-summary', `${name}: banner id`);
      assert.equal(title.innerHTML, `<strong>Sync status:</strong> ${expected.badge}`, `${name}: banner title`);
      assert.equal(detail.textContent, expected.detail, `${name}: banner detail`);
      assert.equal(pill.textContent, expected.badge, `${name}: banner badge pill`);
    }
  });

  it('createSyncTab handles unlock, sync, forget, and disable', async () => {
    const doc = makeDocument();
    globalThis.document = doc;
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };
    const timers = createFakeTimers();
    timers.bindToWindow(globalThis.window);
    globalThis.confirm = () => true;

    let disabled = false;
    let forgot = false;
    let syncCalls = 0;
    const manager = {
      config: { email: 'user@example.com', lastSync: 0, tier: 'free', rememberUnlock: false },
      isEnabled: () => true,
      isUnlocked: () => false,
      hasRememberedUnlockCache: () => true,
      unlockSync: async () => ({ success: true, warning: 'cached' }),
      tryUnlockFromRememberedCache: async () => false,
      sync: async () => { syncCalls += 1; return { success: true }; },
      forgetRememberedUnlock: async () => { forgot = true; return { success: true }; },
      disableSync: () => { disabled = true; }
    };

    const container = exports.createSyncTab(manager, 'XL Rewards Card', {}, [], makeTheme(), () => {});
    const status = container.querySelector('#sync-status');
    const unlockButton = container.querySelector('#unlock-sync-btn');
    const passphraseInput = container.querySelector('#sync-unlock-passphrase');
    const syncNowButton = container.querySelector('#sync-now-btn');
    const forgetButton = container.querySelector('#forget-sync-unlock-btn');
    const disableButton = container.querySelector('#disable-sync-btn');

    passphraseInput.value = '';
    await unlockButton.click();
    assert.match(status.textContent, /Password is required/, 'should show password required error');

    passphraseInput.value = 'secret';
    await unlockButton.click();
    assert.match(status.textContent, /Sync unlocked/, 'should confirm sync unlocked');

    await syncNowButton.click();
    assert.equal(syncCalls, 1);
    assert.equal(status.textContent, 'Synced successfully.', 'status should not clear before timeout');

    timers.advanceBy(2999);
    assert.equal(status.textContent, 'Synced successfully.');
    timers.advanceBy(1);
    assert.equal(status.textContent, '');

    await forgetButton.click();
    assert.equal(forgot, true);
    assert.equal(status.textContent, 'Saved unlock removed for this device.');

    await disableButton.click();
    assert.equal(disabled, true);
    timers.unbindFromWindow();
  });

  it('createSyncTab tries saved unlock before syncing from Sync Now', async () => {
    const doc = makeDocument();
    globalThis.document = doc;
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };
    const timers = createFakeTimers();
    timers.bindToWindow(globalThis.window);

    let cacheUnlockResolve;
    let syncResolve;
    let unlocked = false;
    let syncCalls = 0;
    let refreshCalls = 0;
    const manager = {
      config: { email: 'user@example.com', lastSync: 0, tier: 'free', rememberUnlock: true },
      isEnabled: () => true,
      isUnlocked: () => unlocked,
      hasRememberedUnlockCache: () => true,
      tryUnlockFromRememberedCache: async () => new Promise((resolve) => { cacheUnlockResolve = resolve; }),
      sync: async () => {
        syncCalls += 1;
        return new Promise((resolve) => { syncResolve = resolve; });
      },
      disableSync: () => {}
    };

    const container = exports.createSyncTab(manager, 'XL Rewards Card', {}, [], makeTheme(), () => { refreshCalls += 1; });
    const syncNowButton = container.querySelector('#sync-now-btn');
    const status = container.querySelector('#sync-status');

    const clickPromise = syncNowButton.click();
    await Promise.resolve();
    assert.equal(status.textContent, 'Trying saved unlock...');

    unlocked = true;
    cacheUnlockResolve(true);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(syncCalls, 1);
    assert.equal(status.textContent, 'Saved unlock restored. Syncing active card...');
    timers.advanceBy(0);
    assert.equal(refreshCalls, 0, 'saved unlock should not refresh/rerender before sync completes');

    syncResolve({ success: true });
    await clickPromise;
    assert.equal(status.textContent, 'Synced successfully.');
    timers.advanceBy(799);
    assert.equal(refreshCalls, 0, 'successful sync refresh should remain delayed');
    timers.advanceBy(1);
    assert.equal(refreshCalls, 1, 'successful sync should refresh after the success status is visible');
    timers.unbindFromWindow();
  });

  it('createSyncTab asks for password when saved unlock fails from Sync Now', async () => {
    const doc = makeDocument();
    globalThis.document = doc;
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };

    const manager = {
      config: { email: 'user@example.com', lastSync: 0, tier: 'free', rememberUnlock: true },
      isEnabled: () => true,
      isUnlocked: () => false,
      hasRememberedUnlockCache: () => true,
      tryUnlockFromRememberedCache: async () => false,
      sync: async () => ({ success: true }),
      disableSync: () => {}
    };

    const container = exports.createSyncTab(manager, 'XL Rewards Card', {}, [], makeTheme(), () => {});
    const syncNowButton = container.querySelector('#sync-now-btn');
    const status = container.querySelector('#sync-status');

    assert.match(container.innerHTML, /Saved unlock is available\. Sync Now will try it automatically/);
    await syncNowButton.click();

    assert.equal(status.textContent, "Saved unlock couldn't be used. Enter your password to unlock sync.");
  });

  it('createSyncTab says password is required when Sync Now is locked without saved unlock', async () => {
    const doc = makeDocument();
    globalThis.document = doc;
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };

    let cacheUnlockCalls = 0;
    const manager = {
      config: { email: 'user@example.com', lastSync: 0, tier: 'free', rememberUnlock: false },
      isEnabled: () => true,
      isUnlocked: () => false,
      hasRememberedUnlockCache: () => false,
      tryUnlockFromRememberedCache: async () => { cacheUnlockCalls += 1; return false; },
      sync: async () => ({ success: true }),
      disableSync: () => {}
    };

    const container = exports.createSyncTab(manager, 'XL Rewards Card', {}, [], makeTheme(), () => {});
    const syncNowButton = container.querySelector('#sync-now-btn');
    const status = container.querySelector('#sync-status');

    assert.match(container.innerHTML, /Password is required to unlock sync before syncing this card/);
    await syncNowButton.click();

    assert.equal(cacheUnlockCalls, 0);
    assert.equal(status.textContent, 'Sync is locked. Password is required to unlock sync.');
  });

  it('createSyncTab dismisses bootstrap status after successful sync', async () => {
    const doc = makeDocument();
    globalThis.document = doc;
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };

    let dismissCalls = 0;
    const manager = {
      config: {
        email: 'user@example.com',
        lastSync: 0,
        tier: 'free',
        rememberUnlock: false,
        bootstrapRestoreAt: Date.now()
      },
      isEnabled: () => true,
      isUnlocked: () => true,
      hasRememberedUnlockCache: () => false,
      shouldShowBootstrapRestoreStatus: () => true,
      getBootstrapRestoreStatusMessage: () => 'Active-card settings restored from server.',
      dismissBootstrapRestoreStatus: () => { dismissCalls += 1; return true; },
      sync: async () => ({ success: true }),
      disableSync: () => {}
    };

    const container = exports.createSyncTab(manager, 'XL Rewards Card', {}, [], makeTheme(), () => {});
    const syncNowButton = container.querySelector('#sync-now-btn');
    await syncNowButton.click();

    assert.equal(dismissCalls, 1);
  });

  it('createSyncTab escapes interpolated sync metadata', () => {
    const doc = makeDocument();
    globalThis.document = doc;
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };

    const manager = {
      config: {
        email: '<img src=x onerror=alert(1)>',
        lastSync: 0,
        tier: '<svg onload=alert(2)>',
        rememberUnlock: false,
        bootstrapRestoreAt: Date.now()
      },
      isEnabled: () => true,
      isUnlocked: () => true,
      hasRememberedUnlockCache: () => false,
      shouldShowBootstrapRestoreStatus: () => true,
      getBootstrapRestoreStatusMessage: () => '<b>restored</b>',
      sync: async () => ({ success: true }),
      disableSync: () => {}
    };

    const container = exports.createSyncTab(manager, 'XL Rewards Card', {}, [], makeTheme(), () => {});
    assert.match(container.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(container.innerHTML, /&lt;svg onload=alert\(2\)&gt;/);
    assert.match(container.innerHTML, /&lt;b&gt;restored&lt;\/b&gt;/);
    assert.doesNotMatch(container.innerHTML, /<img src=x onerror=alert\(1\)>/);
    assert.doesNotMatch(container.innerHTML, /<svg onload=alert\(2\)>/);
  });

  it('createSyncTab resolves pending conflict actions', async () => {
    const doc = makeDocument();
    globalThis.document = doc;
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };
    globalThis.confirm = () => true;

    let resolveCalls = 0;
    let refreshed = false;
    const manager = {
      config: {
        email: 'user@example.com',
        lastSync: 0,
        tier: 'free',
        pendingConflict: {
          cardName: 'XL Rewards Card',
          conflicts: []
        }
      },
      isEnabled: () => true,
      isUnlocked: () => true,
      hasRememberedUnlockCache: () => false,
      hasPendingConflict: () => true,
      getBootstrapRestoreStatusMessage: () => 'Bootstrap restore: active-card settings restored from server.',
      resolvePendingConflict: async () => {
        resolveCalls += 1;
        return {
          success: true,
          cardName: 'XL Rewards Card',
          resolvedCard: {
            selectedCategories: ['Dining'],
            defaultCategory: 'Dining',
            merchantMap: { GRAB: 'Dining' },
            monthlyTotals: {}
          }
        };
      },
      sync: async () => ({ success: true })
    };

    const container = exports.createSyncTab(
      manager,
      'XL Rewards Card',
      {},
      [],
      makeTheme(),
      () => { refreshed = true; },
      () => {}
    );

    const mergeButton = container.querySelector('#sync-conflict-merge');
    const status = container.querySelector('#sync-status');
    await mergeButton.click();

    assert.equal(resolveCalls, 1);
    assert.equal(refreshed, true);
    assert.match(status.textContent, /Conflict resolved and synced/i);
  });

  it('createSyncTab refreshes when conflict resolution returns conflict again', async () => {
    const doc = makeDocument();
    globalThis.document = doc;
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };
    globalThis.confirm = () => true;

    let refreshed = false;
    const manager = {
      config: {
        email: 'user@example.com',
        lastSync: 0,
        tier: 'free',
        pendingConflict: {
          cardName: 'XL Rewards Card',
          conflicts: []
        }
      },
      isEnabled: () => true,
      isUnlocked: () => true,
      hasRememberedUnlockCache: () => false,
      hasPendingConflict: () => true,
      resolvePendingConflict: async () => ({
        success: false,
        conflict: true,
        error: 'Remote data changed again.'
      }),
      sync: async () => ({ success: true })
    };

    const container = exports.createSyncTab(
      manager,
      'XL Rewards Card',
      {},
      [],
      makeTheme(),
      () => { refreshed = true; },
      () => {}
    );

    const mergeButton = container.querySelector('#sync-conflict-merge');
    const status = container.querySelector('#sync-status');
    await mergeButton.click();

    assert.equal(refreshed, true);
    assert.match(status.textContent, /Conflict resolution failed/i);
  });

  it('createSyncTab renders month-scoped conflict selection key', () => {
    const doc = makeDocument();
    globalThis.document = doc;
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };
    globalThis.confirm = () => true;

    const manager = {
      config: {
        email: 'user@example.com',
        lastSync: 0,
        tier: 'free',
        pendingConflict: {
          cardName: 'XL Rewards Card',
          conflicts: [
            {
              type: 'field',
              field: 'monthlyTotals',
              monthKey: '2026-01',
              localValue: { totals: { Dining: 25 }, total_amount: 25 },
              remoteValue: { totals: { Dining: 40 }, total_amount: 40 }
            }
          ]
        }
      },
      isEnabled: () => true,
      isUnlocked: () => true,
      hasRememberedUnlockCache: () => false,
      hasPendingConflict: () => true,
      resolvePendingConflict: async () => ({ success: true, cardName: 'XL Rewards Card', resolvedCard: {} }),
      sync: async () => ({ success: true })
    };

    const container = exports.createSyncTab(manager, 'XL Rewards Card', {}, [], makeTheme(), () => {}, () => {});
    assert.match(container.innerHTML, /data-conflict-key="field:monthlyTotals:2026-01"/);
  });

  it('createSyncTab refreshes when sync now returns a conflict', async () => {
    const doc = makeDocument();
    globalThis.document = doc;
    globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} };
    globalThis.confirm = () => true;

    let refreshed = false;
    const manager = {
      config: {
        email: 'user@example.com',
        lastSync: 0,
        tier: 'free',
        rememberUnlock: false
      },
      isEnabled: () => true,
      isUnlocked: () => true,
      hasRememberedUnlockCache: () => false,
      tryUnlockFromRememberedCache: async () => false,
      unlockSync: async () => ({ success: true }),
      sync: async () => ({ success: false, conflict: true, error: 'Version conflict detected.' }),
      disableSync: () => {}
    };

    const container = exports.createSyncTab(
      manager,
      'XL Rewards Card',
      {},
      [],
      makeTheme(),
      () => { refreshed = true; }
    );

    const syncNowButton = container.querySelector('#sync-now-btn');
    const status = container.querySelector('#sync-status');
    await syncNowButton.click();

    assert.equal(refreshed, true);
    assert.match(status.textContent, /Sync failed: Version conflict detected/i);
  });

  it('createOverlay builds UI and switchTab toggles content', () => {
    const doc = makeDocument();
    globalThis.document = doc;
    globalThis.window = {
      location: { href: 'https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do' },
      setTimeout: () => 0,
      clearTimeout: () => {},
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' })
    };
    const timers = createFakeTimers();
    timers.bindToWindow(globalThis.window);
    globalThis.GM_addStyle = () => {};

    const cardName = "LADY'S SOLITAIRE CARD";
    const cardConfig = exports.CARD_CONFIGS[cardName];
    const cardSettings = { selectedCategories: ['Dining', 'Travel'], defaultCategory: 'Others', merchantMap: {}, transactions: {} };
    const data = exports.buildFallbackData(cardName, cardSettings);

    exports.createOverlay(
      data,
      { cards: { [cardName]: cardSettings } },
      [],
      cardName,
      cardConfig,
      cardSettings,
      () => {},
      true,
      exports.EMBEDDED_CAP_POLICY
    );

    const overlay = doc.getElementById('cc-subcap-overlay');
    assert.notEqual(overlay, null, 'overlay should be created in DOM');

    exports.switchTab('sync');
    const syncContent = doc.getElementById('cc-subcap-sync');
    assert.equal(syncContent.classList.contains('cc-subcap-hidden'), false);
    timers.unbindFromWindow();
  });

});
