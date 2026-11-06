// What the extension uses of `wxt/browser`, for unit tests: `vi.mock("wxt/browser")` loads it.

const event = <A extends unknown[]>() => {
  const listeners = new Set<(...args: A) => void>();
  return {
    addListener: (listener: (...args: A) => void) => {
      listeners.add(listener);
    },
    fire: (...args: A) => {
      for (const listener of listeners) listener(...args);
    },
    clear: () => listeners.clear(),
  };
};

export type Sender = { tab?: { id: number }; frameId?: number; url?: string };

export type FakePort = ReturnType<typeof fakePort>;

/** A port as the code under test sees it, with the other end's side for the test. */
export const fakePort = (name: string, sender?: Sender) => {
  const onMessage = event<[unknown]>();
  const onDisconnect = event<[]>();
  const posted: unknown[] = [];
  const port = {
    name,
    sender,
    /** What the code under test sent. */
    posted,
    /** Closed by either end. Closing it here doesn't fire its own onDisconnect, as in browsers. */
    disconnected: false,
    postMessage: (message: unknown) => {
      if (port.disconnected) throw new Error("Attempting to use a disconnected port object");
      posted.push(message);
    },
    disconnect: () => {
      port.disconnected = true;
    },
    onMessage: { addListener: onMessage.addListener },
    onDisconnect: { addListener: onDisconnect.addListener },
    /** The other end sends a message. */
    receive: (message: unknown) => onMessage.fire(message),
    /** The other end goes away. */
    drop: () => {
      port.disconnected = true;
      onDisconnect.fire();
    },
  };
  return port;
};

type Injection = {
  target: { tabId: number; frameIds?: number[]; allFrames?: boolean };
  files: string[];
};

type Fake = {
  /** Ports opened with `runtime.connect`. */
  connected: FakePort[];
  injections: Injection[];
  /** Makes `scripting.executeScript` reject with it. */
  injectError: Error | null;
};

const onConnect = event<[FakePort]>();
const onDOMContentLoaded = event<[{ tabId: number; frameId: number }]>();

export const fake: Fake = { connected: [], injections: [], injectError: null };

/** The browser opens a port to the extension. */
export const connect = onConnect.fire;
/** A frame of a tab loaded its document. */
export const domContentLoaded = onDOMContentLoaded.fire;

export const resetBrowser = () => {
  fake.connected = [];
  fake.injections = [];
  fake.injectError = null;
  onConnect.clear();
  onDOMContentLoaded.clear();
};

export const browser = {
  runtime: {
    onConnect: { addListener: onConnect.addListener },
    connect: ({ name }: { name: string }) => {
      const port = fakePort(name);
      fake.connected.push(port);
      return port;
    },
  },
  scripting: {
    executeScript: async (injection: Injection) => {
      fake.injections.push(injection);
      if (fake.injectError) throw fake.injectError;
      return [];
    },
  },
  webNavigation: {
    onDOMContentLoaded: { addListener: onDOMContentLoaded.addListener },
  },
};
