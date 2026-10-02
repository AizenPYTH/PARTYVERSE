# PARTYVERSE — notes for contributors and coding agents

Expo SDK 57 / React Native 0.86 / Expo Router (`src/app`) / TypeScript strict, Supabase backend.
Expo changes between SDKs: check the installed package versions and their typings before using an API.

## Commands

```bash
npx expo install <pkg>     # SDK-compatible versions (use EXPO_OFFLINE=1 if api.expo.dev is unreachable)
npm run typecheck && npm run lint && npm test   # = npm run check
npm run test:db            # SQL integration tests (needs PostgreSQL 16 binaries)
npm run test:e2e           # full-stack web E2E (see docs/testing.md)
```

Run `check` and `test:db` before every commit that touches the corresponding layer.

## Rules that are not negotiable

- **Server authority**: moves, turns, clocks, results, XP, ratings and inventory are
  decided in SQL RPCs (or a future game server). The client sends intents only.
- Every client write goes through a `SECURITY DEFINER` RPC with `search_path = ''`,
  explicit `grant execute ... to authenticated`, and a `PV_*` error code added to
  `src/lib/errors.ts`. Every new table enables RLS (a test fails otherwise).
- Lock order is lobby → match (`app_private.lock_match`).
- Every RPC response is validated with Zod in the feature's `api.ts` (`callRpc`).
- Realtime events only invalidate queries; keep the polling fallback working.
- No fake data, no decorative buttons, no "coming soon" game that pretends to work.
- UI copy is French. Colors, type and spacing come from `src/design-system` only.
- Keep business logic out of `src/app` screens; pure logic gets a `*.test.ts`.
- New game: catalog row + engine (SQL or server) + `src/features/games/<id>` renderer
  + case in `src/app/match/[matchId].tsx` + shared test vectors.

## Map

See README.md and docs/architecture/overview.md.
