import { create } from 'zustand';

/**
 * In-app destinations that may be replayed after sign-in or onboarding
 * (cold-start deep links, notification taps). Anything else is ignored.
 */
const REPLAYABLE = [
  /^\/lobby\/[0-9a-f-]{36}$/i,
  /^\/join\/[A-Z0-9]{4,10}$/i,
  /^\/match\/[0-9a-f-]{36}$/i,
  /^\/player\/[0-9a-f-]{36}$/i,
  /^\/messages\/[0-9a-f-]{36}$/i,
  /^\/groups\/[0-9a-f-]{36}$/i,
  /^\/games\/[a-z0-9_]{2,40}$/,
  /^\/leaderboard\/[a-z0-9_]{2,40}$/,
  /^\/(notifications|messages|groups|quests|rankings)$/,
];

/** Normalizes a URL or path to "/a/b" (no scheme, host, query or trailing slash), or null if not replayable. */
export function replayablePath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null;
  let path = urlOrPath.trim();
  const scheme = path.match(/^[a-z][a-z0-9+.-]*:\/\/(.*)$/i);
  if (scheme) {
    // partyverse://join/ABCD → host is the first segment; https://x/join/ABCD → drop the host.
    const rest = scheme[1] ?? '';
    path = /^https?:/i.test(path) ? rest.slice(rest.indexOf('/') === -1 ? rest.length : rest.indexOf('/')) : `/${rest}`;
  }
  path = path.split(/[?#]/)[0] ?? '';
  path = `/${path.replace(/^\/+/, '').replace(/\/+$/, '')}`;
  return REPLAYABLE.some((pattern) => pattern.test(path)) ? path : null;
}

interface PendingLinkState {
  path: string | null;
  remember(urlOrPath: string | null | undefined): void;
  take(): string | null;
}

export const usePendingLink = create<PendingLinkState>((set, get) => ({
  path: null,
  remember(urlOrPath) {
    const path = replayablePath(urlOrPath);
    if (path) set({ path });
  },
  take() {
    const { path } = get();
    if (path) set({ path: null });
    return path;
  },
}));
