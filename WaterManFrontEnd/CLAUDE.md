# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> This repo (`WaterManFrontEnd`) is one half of the WaterMan monorepo. A parent `CLAUDE.md` at `../CLAUDE.md` covers the backend, roles, and DB schema — read that too if you need cross-stack context. This file goes deeper on frontend-only structure.

## Commands

```bash
npm run dev        # Vite dev server on port 5174 (auto-opens browser)
npm run build      # tsc --noEmit then vite build (build fails on type errors)
npm run typecheck  # tsc --noEmit only, no bundling
npm run preview    # Serve the production build locally
```

There is no test runner or lint script configured in `package.json` — type-checking via `tsc` is the only automated check. There is no dev-server proxy (`vite.config.ts` has none); the app talks to the API origin directly via `SITE_API_URL`.

Required env var: `SITE_API_URL` (defaults to `http://localhost:3000` if unset — see `src/utils/api.ts:38`).

## Architecture

### Routing without a router

`BrowserRouter` is mounted in `main.tsx` only so `window.history` works — there are no `<Route>` elements anywhere. All view switching goes through `src/context/NavigationContext.tsx`:

- `Page` state (`'home' | 'auth' | 'profile' | 'admin' | 'order' | 'tracking' | 'vendor'`) is the single source of truth for what renders.
- `PAGE_PATHS` maps each `Page` to a URL path; `pathToPage()` reverses that on load and on `popstate` (back/forward button).
- `navigate(to, mode?, searchParams?)` calls `window.history.pushState` directly, updates state, and scrolls to top. `mode` is only meaningful for `'auth'` (`'login' | 'signup'` etc.).
- Sub-navigation within a page uses the `searchParams` argument rather than new `Page` values — e.g. `navigate('profile', undefined, 'panel=orders')` opens a specific Profile panel. Panels read `location.search` themselves rather than receiving props.

`App.tsx` (`AppContent`) is a big if/else on `page` that decides which top-level page component to render, and additionally branches logged-in vendors to `VendorOrdersPage` and logged-in users to `DashboardPage` even when `page === 'home'`.

When adding a new top-level view: add the value to the `Page` type in `src/types/index.ts`, add its path to `PAGE_PATHS`, add a branch in `pathToPage()`, and add a render branch in `App.tsx`.

### Auth state

Auth is not in React Context — it's read imperatively via `getSession()` from `src/utils/api.ts` and cached in component state. Login/logout elsewhere in the app communicate via `window` custom events rather than a shared provider:

- `wm:login` (detail = `Session`) and `wm:logout` are dispatched by `api.ts` functions (`login`, `logout`, etc.) after mutating `localStorage`.
- `App.tsx` is the only place that listens and re-renders on these events.
- Session token lives in `localStorage['wm_token']`; the session object in `localStorage['wm_session']`. Don't read/write these keys directly elsewhere — go through `getSession()` / `persistSession()` in `api.ts`.

If a component needs to react to login/logout beyond a full re-render (e.g. a panel that must refresh its own data), it should add its own `wm:login`/`wm:logout` listener rather than expecting new props.

### API client (`src/utils/api.ts`, ~900 lines)

One file, one convention, repeated per entity:

1. A private `RawX` type (server's snake_case/raw shape) and a `mapX(r: RawX): X` function that converts it to the camelCase `X` type used by the rest of the app.
2. A thin wrapper (`get`/`post`/`put`/`httpPatch`, defined at the top of the file) that adds `Authorization: Bearer <token>` from `localStorage` automatically.
3. An exported `async function` per endpoint returning `ApiResult<T>` (`{ success: true, data } | { success: false, error }`) — callers should always check `.success` before touching `.data`, never assume the request worked.

Every HTTP helper calls `handleUnauthorized(status)` after parsing the response. On a 401 it clears `localStorage` and dispatches `wm:logout`, so the user is logged out automatically on session expiry — callers do not need to handle 401 themselves.

When adding a new endpoint, follow this same three-step shape and add the raw/mapped types to `src/types/index.ts` rather than inlining them.

**Paginated endpoints** (`getOrders`, `getNotifications`) accept `(page, limit)` and the backend returns `{ data: T[], total, page, pageSize }`. The api.ts wrappers unpack `data` so callers receive `T[]` directly — no caller needs to know the envelope shape unless it needs `total`.

**`OrderSummary`** has shape `{ active, delivered, failed, rejected, cancelled, total }`. The `active` bucket includes all in-flight statuses. Do not reference `.draft` — that field was removed.

### Pages vs. components

- `src/pages/` — one folder per top-level `Page` (Auth, Profile, Admin, Order, Tracking, Vendor, Dashboard). Multi-panel pages (`Admin`, `Profile`) have a `panels/` subfolder; the parent page renders a sidebar/tabs and switches between panel components based on local state or the URL `panel=` search param.
- `src/components/` — shared landing-page sections (Header, Hero, Features, HowItWorks, Footer) and reusable widgets (`OtpModal`) and auth forms (`components/auth/`) used by `AuthPage`.
- Each component/page folder colocates its own `.css` file (plain CSS, no CSS-in-JS, no Tailwind).

### Admin panel styling

`src/pages/Admin/AdminShared.css` applies a dark theme scoped to the `.admin-section` class. Every element rendered inside `AdminPage`/its panels must be nested under a container with that class, or it will pick up the global light-theme styles instead.

### State management

- TanStack Query (`@tanstack/react-query`) is used **only** in `RoleManagementPanel` and `RoleHistoryPanel` (`src/pages/Admin/panels/`). Every other page/panel fetches with plain `useState` + `useEffect` calling functions from `api.ts` directly — don't introduce React Query elsewhere without a reason, it'd be inconsistent with the rest of the codebase.
- `NavigationContext` (routing, above) and `FontSizeContext` (`src/context/FontSizeContext.tsx`, accessibility text-size toggle) are the only two React Contexts.

### i18n

`react-i18next` with three locale files under `src/i18n/locales/`: `en.json`, `ta.json` (Tamil), `te.json` (Telugu). `src/i18n/index.ts` wires up `i18next-browser-languagedetector`. **Any new user-visible string must be added to all three locale files**, not just `en.json` — the other two don't fall back silently to English keys in a way that's obviously correct.

### Real-time updates

`src/utils/socket.ts` wraps `socket.io-client`, authenticating with the same bearer token from `localStorage` (passed as `handshake.auth.token`) rather than cookies. Used for live order-status/notification pushes matching the backend's `notifyUser()` events.

### Types (`src/types/index.ts`, ~360 lines)

Single file holding every domain type: the `Page`/`AuthMode` navigation types, `Session`, all `RawX`/`X` entity pairs consumed by `api.ts`, and result-type aliases (`LoginResult`, `RegisterResult`, etc.). When extending an entity, add fields to both the `Raw` and mapped type and update the corresponding `mapX` function in `api.ts` — the two are not derived from each other automatically.
