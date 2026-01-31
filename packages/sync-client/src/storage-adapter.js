export class StorageAdapter {
  constructor() {
    this.useGM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
  }

  get(key, fallback = null) {
    try {
      if (this.useGM) {
        return GM_getValue(key, fallback);
      }
    } catch (error) {
      console.error('[Storage] GM_getValue error:', error);
    }
    const stored = window.localStorage.getItem(key);
    return stored !== null ? stored : fallback;
  }

  set(key, value) {
    try {
      if (this.useGM) {
        GM_setValue(key, value);
        return;
      }
    } catch (error) {
      console.error('[Storage] GM_setValue error:', error);
    }
    window.localStorage.setItem(key, value);
  }

  remove(key) {
    try {
      if (this.useGM && typeof GM_deleteValue === 'function') {
        GM_deleteValue(key);
        return;
      }
    } catch (error) {
      console.error('[Storage] GM_deleteValue error:', error);
    }
    window.localStorage.removeItem(key);
  }
}
