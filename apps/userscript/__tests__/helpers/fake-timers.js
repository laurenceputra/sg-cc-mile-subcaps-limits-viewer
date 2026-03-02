function normalizeDelay(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function setOrDeleteProperty(target, key, value) {
  if (!target) {
    return;
  }
  if (typeof value === 'undefined') {
    delete target[key];
    return;
  }
  target[key] = value;
}

export function createFakeTimers({ startTime = Date.now() } = {}) {
  let now = startTime;
  let nextId = 1;
  let queued = [];
  let boundWindow = null;
  let originalWindowSetTimeout;
  let originalWindowClearTimeout;
  let originalDateNow;

  const sortQueue = () => {
    queued.sort((left, right) => {
      if (left.runAt === right.runAt) {
        return left.id - right.id;
      }
      return left.runAt - right.runAt;
    });
  };

  const setTimeoutFake = (callback, delay = 0, ...args) => {
    if (typeof callback !== 'function') {
      throw new TypeError('Expected callback to be a function');
    }
    const timerId = nextId;
    nextId += 1;
    queued.push({
      id: timerId,
      runAt: now + normalizeDelay(delay),
      callback,
      args
    });
    sortQueue();
    return timerId;
  };

  const clearTimeoutFake = (timerId) => {
    queued = queued.filter((item) => item.id !== timerId);
  };

  const advanceBy = (ms) => {
    const targetTime = now + normalizeDelay(ms);
    while (queued.length > 0) {
      const next = queued[0];
      if (next.runAt > targetTime) {
        break;
      }
      queued.shift();
      now = next.runAt;
      next.callback(...next.args);
    }
    now = targetTime;
  };

  const runAll = (maxExecutions = 1000) => {
    let executions = 0;
    while (queued.length > 0) {
      executions += 1;
      if (executions > maxExecutions) {
        throw new Error(`runAll exceeded ${maxExecutions} timer executions`);
      }
      const next = queued[0];
      advanceBy(Math.max(0, next.runAt - now));
    }
  };

  const runAllAsync = async (maxPasses = 100) => {
    for (let pass = 0; pass < maxPasses; pass += 1) {
      await Promise.resolve();
      if (queued.length === 0) {
        await Promise.resolve();
        if (queued.length === 0) {
          return;
        }
      }
      runAll();
    }
    throw new Error(`runAllAsync exceeded ${maxPasses} passes`);
  };

  const bindToWindow = (windowTarget = globalThis.window, { patchDateNow = true } = {}) => {
    boundWindow = windowTarget || {};
    if (boundWindow !== globalThis.window) {
      globalThis.window = boundWindow;
    }

    originalWindowSetTimeout = boundWindow.setTimeout;
    originalWindowClearTimeout = boundWindow.clearTimeout;
    boundWindow.setTimeout = setTimeoutFake;
    boundWindow.clearTimeout = clearTimeoutFake;

    if (patchDateNow) {
      originalDateNow = Date.now;
      Date.now = () => now;
    }

    return boundWindow;
  };

  const unbindFromWindow = () => {
    if (boundWindow) {
      setOrDeleteProperty(boundWindow, 'setTimeout', originalWindowSetTimeout);
      setOrDeleteProperty(boundWindow, 'clearTimeout', originalWindowClearTimeout);
    }
    boundWindow = null;
    originalWindowSetTimeout = undefined;
    originalWindowClearTimeout = undefined;

    if (originalDateNow) {
      Date.now = originalDateNow;
      originalDateNow = undefined;
    }
  };

  return {
    setTimeout: setTimeoutFake,
    clearTimeout: clearTimeoutFake,
    advanceBy,
    runAll,
    runAllAsync,
    bindToWindow,
    unbindFromWindow,
    pendingCount: () => queued.length,
    now: () => now
  };
}
