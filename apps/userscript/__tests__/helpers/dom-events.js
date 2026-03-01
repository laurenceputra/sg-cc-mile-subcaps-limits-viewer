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

export function captureEventListeners(target) {
  if (!target || typeof target !== 'object') {
    throw new TypeError('Expected capture target to be an object');
  }

  const listeners = new Map();
  const originalAddEventListener = target.addEventListener;
  const originalRemoveEventListener = target.removeEventListener;

  target.addEventListener = (eventType, handler) => {
    if (typeof handler !== 'function') {
      return;
    }
    const registered = listeners.get(eventType) || [];
    registered.push(handler);
    listeners.set(eventType, registered);
  };

  target.removeEventListener = (eventType, handler) => {
    if (typeof handler !== 'function') {
      return;
    }
    const registered = listeners.get(eventType) || [];
    listeners.set(
      eventType,
      registered.filter((entry) => entry !== handler)
    );
  };

  const getListeners = (eventType) => {
    return [...(listeners.get(eventType) || [])];
  };

  const dispatch = (eventType, eventInit = {}) => {
    const handlers = getListeners(eventType);
    const event = {
      type: eventType,
      target,
      currentTarget: target,
      ...eventInit
    };
    for (const handler of handlers) {
      handler.call(target, event);
    }
    return handlers.length;
  };

  const restore = () => {
    setOrDeleteProperty(target, 'addEventListener', originalAddEventListener);
    setOrDeleteProperty(target, 'removeEventListener', originalRemoveEventListener);
  };

  return {
    getListeners,
    dispatch,
    restore
  };
}
