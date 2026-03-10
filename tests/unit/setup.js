/**
 * Vitest setup — mock Chrome Extension APIs.
 */

// In-memory storage for chrome.storage.local mock
let storageData = {};

globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn(async (keys) => {
        if (typeof keys === 'string') {
          return { [keys]: storageData[keys] };
        }
        if (Array.isArray(keys)) {
          const result = {};
          for (const k of keys) result[k] = storageData[k];
          return result;
        }
        if (keys === null || keys === undefined) {
          return { ...storageData };
        }
        // Object with defaults
        const result = {};
        for (const [k, def] of Object.entries(keys)) {
          result[k] = storageData[k] !== undefined ? storageData[k] : def;
        }
        return result;
      }),
      set: vi.fn(async (items) => {
        Object.assign(storageData, items);
      }),
      remove: vi.fn(async (keys) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete storageData[k];
      }),
      clear: vi.fn(async () => {
        storageData = {};
      }),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    onStartup: {
      addListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(async () => []),
    sendMessage: vi.fn(),
    onUpdated: {
      addListener: vi.fn(),
    },
    onActivated: {
      addListener: vi.fn(),
    },
  },
  scripting: {
    executeScript: vi.fn(),
  },
  permissions: {
    contains: vi.fn(async () => true),
    request: vi.fn(async () => true),
  },
  action: {
    onClicked: {
      addListener: vi.fn(),
    },
  },
  contextMenus: {
    create: vi.fn(),
    onClicked: {
      addListener: vi.fn(),
    },
  },
  notifications: {
    create: vi.fn(),
  },
};

// Reset storage between tests
beforeEach(() => {
  storageData = {};
  vi.clearAllMocks();
});

// Export for tests that need direct storage access
export function getStorageData() {
  return storageData;
}

export function setStorageData(data) {
  storageData = { ...data };
}
