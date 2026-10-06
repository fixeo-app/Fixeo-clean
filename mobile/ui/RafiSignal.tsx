import { createContext } from 'react';
import type { RafiSignal } from './rafiPresence';
/** Screen-owned presentation only; never submits or alters a business action. */
export const RafiSignalContext = createContext<RafiSignal | null>(null);
