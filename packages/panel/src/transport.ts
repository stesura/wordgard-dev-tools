import {
  PROTOCOL,
  ensureRegistry,
  mismatch,
  type Push,
  type Request,
  type RequestType,
  type Results,
} from "@stesura/wordgard-dev-tools";

/** How the panel reaches the page agent, wherever the panel runs. */
export type Transport = {
  /** Rejects with an `AgentError` on an error reply. */
  send: <K extends RequestType>(request: Request<K>) => Promise<Results[K]>;
  onPush: (listener: (push: Push) => void) => () => void;
};

export class AgentError extends Error {
  override name = "AgentError";
}

/** Calls the page's agent directly, for a panel mounted in the same window. */
export const inPageTransport = (): Transport => {
  const agent = () => {
    // Created here when no editor has connected yet, so pushes reach the panel from the start.
    const found = ensureRegistry()?.agent;
    if (!found)
      throw new AgentError(
        "The page's Wordgard DevTools registry is a version this panel can't read"
      );
    if (found.protocol != PROTOCOL) throw new AgentError(mismatch(found.protocol, PROTOCOL));
    return found;
  };
  return {
    send: async (request) => {
      const reply = await agent().request(request);
      if (!reply.ok) throw new AgentError(reply.error);
      return reply.value;
    },
    onPush: (listener) => agent().onPush(listener),
  };
};
