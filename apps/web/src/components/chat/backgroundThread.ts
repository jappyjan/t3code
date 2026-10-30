import { createContext } from "react";

/**
 * True for a thread that is not the page's own: one kept mounted under Settings or Usage, or a
 * chat embedded in another thread's panel. Its global shortcuts stand down.
 */
export const BackgroundThreadContext = createContext(false);
