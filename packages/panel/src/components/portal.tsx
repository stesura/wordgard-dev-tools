import { createContext, useContext } from "react";

// Popups render here, inside the panel's themed root (and its shadow root when in-page),
// rather than in the page's body, where the panel's styles don't reach.
export const PortalContainer = createContext<HTMLElement | null>(null);

export const usePortalContainer = () => useContext(PortalContainer);
