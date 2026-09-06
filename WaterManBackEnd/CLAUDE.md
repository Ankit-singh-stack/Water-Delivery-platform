# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This file covers the backend only. For monorepo-wide context (frontend, shared architecture notes), see `../CLAUDE.md`.

## Commands

```bash
npm run dev            # nodemon, hot-reload
npm start              # node server.js
npm run start:fresh     # node db/migrate.js && node server.js
node db/migrate.js           # apply db/schema.sql (idempotent)
node db/migrate.js --check   # test DB connection only, no migration
```

There is no test suite (`npm test` is a stub) and no lint script — don't invent a test/lint command that doesn't exist.

`npm run setup`, `npm run seed`, `npm run migrate:up`, `npm run migrate:down`, and `npm run create:admin` in `package.json` point at `scripts/` and `migrations/` directories that do not exist anywhere in git history — they are dead entries, not working commands. The only real DB entrypoint is `db/migrate.js`. There is currently no way to seed an admin user from a script; one must be inserted manually (set `role_id` to the `super_admin`/`admin` row from the `roles` table) or created through `/auth/signup` and promoted via `PATCH /admin/users/:id/role`.

Swagger UI: `http://localhost:3000/swagger`, generated from JSDoc `@openapi` blocks in `server.js` and `routes/*.js`.

## Architecture

`server.js` wires together CORS, Swagger, static `/uploads`, five routers, a 404 handler, a generic error handler, and a Socket.io server on the same HTTP server instance. Route order matters only insofar as `/health` and `/api/db-test` are defined inline in `server.js` before the routers.

### Rate limiting

`express-rate-limit` is applied in `routes/auth.js` at the route level (not globally): `POST /auth/login` (10 req/15 min), `POST /auth/verify-otp` (5 req/10 min), `POST /auth/resend-otp` (3 req/10 min). Responses use `standardHeaders: true, legacyHeaders: false` and return `{ error: 'too_many_attempts' }`.

### Route files (`routes/`)

| File | Mount | Auth | Notes |
|---|---|---|---|
| `public.js` | `/public` | none | `states`, `cities` (optionally filtered by `stateId`), `tanker-types` — read-only master data for signup/order forms |
| `auth.js` | `/auth` | none/token | `signup`, `verify-otp`, `resend-otp`, `login`, `logout`, `forgot-password`, `reset-password`, `vendor-register` (separate self-service vendor signup flow, distinct from `signup`) |
| `user.js` | `/user` | `requireAuth` | Largest route file: profile, addresses, orders (create/list/summary/detail/rate/**cancel**), Razorpay payment (`initiate`/`verify`/`cod`), vendor-profile self-view, change-password, notifications, support tickets |
| `vendor.js` | `/vendor` | `requireAuth` + `requireVendor` | order lifecycle (`accept`/`reject`/`status`), `earnings`, `work-mode` (online/offline toggle backing `vendor_profiles.is_online`), `ratings/summary`, `tankers` fleet CRUD |
| `admin.js` | `/admin` | `requireAuth` + `requireAdmin` | cities CRUD, user list + role reassignment, tanker-types CRUD + image upload (multer, see below), role-history |

Every router (except `public.js`) applies its auth middleware once via `router.use(...)` at the top of the file rather than per-route.

### Auth & sessions

`middleware/auth.js` — `requireAuth` looks up the bearer token in `sessions` (must not be expired) and joins `users`/`roles` in a single query, attaching `req.user` (`user_id`, name, email, phone, `phone_verified`, `role_name`). `requireAdmin` checks `req.user.role_name`. `requireVendor` additionally queries `vendor_profiles` for an active profile matching `req.user.user_id` and attaches `req.vendorProfileId` / `req.vendorCityId` — routes needing vendor scoping must read from these, not re-derive them.

Two independent signup paths create users: `/auth/signup` (customer) and `/auth/vendor-register` (vendor, also creates the `vendor_profiles` row). Password reset uses its own single-use token table (`password_reset_tokens`), separate from the OTP table.

### OTP

`utils/otpConfig.js` gates the whole flow behind `OTP_ENABLED`. `utils/otp.js` generates a 6-digit code (`crypto.randomInt`) valid 10 minutes. `otp_codes.purpose` is constrained to `verify_phone | login | update_profile | change_password` — reuse this enum rather than inventing a new purpose string. In non-production (`NODE_ENV !== 'production'`), OTP endpoints echo `devOtp` in the JSON response so flows can be tested without an SMS provider — there is no SMS provider integrated at all currently.

### Vendor order matching

Vendors do not have an explicit assignment table for "available" orders. When a user creates an order, `deliveryCity` is validated against `cities` (case-insensitive) and the canonical DB name is stored. `vendor.js`'s `GET /orders` matches unclaimed orders using an exact `=` comparison between `orders.delivery_city` and the vendor's city name — **no** `ILIKE`. Available orders are only returned when `vendor_profiles.is_online = TRUE`; offline vendors get an empty list. An order becomes "vendor's own" once `orders.vendor_id` is set via `accept`. Order progress is tracked both by `status` and by parallel per-step timestamp columns (`accepted_at`, `preparing_at`, `in_transit_at`, `delivered_at`) — when adding a new status, add its timestamp column via a schema.sql `DO $$ IF NOT EXISTS $$` block, matching the existing migrations at the bottom of `db/schema.sql`.

### Real-time notifications

`utils/socketManager.js` maintains an in-memory `Map<userId, Set<socket>>` (multiple tabs/devices per user), authenticated on `connection` via the same session token passed as `handshake.auth.token` — a socket with no valid session is disconnected immediately. `notifyUser(userId, event, data)` is the only way routes push to connected clients (used for new-order pushes, order status changes, etc.). Because this map is in-process memory, it does not survive a restart and will not work correctly if the backend is ever scaled to multiple instances without a shared adapter. `utils/vendorNotifications.js` is a thin back-compat wrapper (`notifyVendorsNewOrder`) around `notifyUser` — new code should call `socketManager` directly instead of adding to this file.

### File uploads

Only one upload path exists: `POST /admin/tanker-types/upload-image` (multer `diskStorage`, defined inline in `admin.js`, not a shared module). Files land in `uploads/tankers/`, named `tanker_<timestamp>.<ext>`, capped at 5 MB, filtered to `image/jpeg|png|webp|gif` by mimetype. The `uploads/` directory is created on demand (`fs.mkdirSync(..., {recursive:true})`) and is gitignored — don't assume it exists in a fresh checkout.

### Database

`db/config.js` reads all PG-related env vars once and exports a config object. Both `db/pool.js` (runtime, pooled, max 10) and `db/migrate.js` (one-shot `Client`) import it — change connection defaults in `db/config.js` only.

`db/schema.sql` is append-only in practice: new columns/tables are added as new `CREATE TABLE IF NOT EXISTS` / `DO $$ ... IF NOT EXISTS ... $$` blocks at the end of the file rather than editing earlier `CREATE TABLE` statements, so the same file safely re-applies to both fresh and existing databases. Follow this pattern for any new column — don't add it to the original `CREATE TABLE` block.

Notable non-obvious constraints:
- `tanker_types.name` and `roles.name` are `UNIQUE`; seed rows use `ON CONFLICT (name) DO NOTHING`.
- `orders.status` CHECK constraint has been widened twice via `DROP CONSTRAINT` / `ADD CONSTRAINT` migrations — current allowed set is `draft, confirmed, accepted, preparing, in_transit, delivered, failed, rejected, cancelled`.
- `otp_codes.purpose` CHECK constraint was similarly widened; see `db/schema.sql` migration block near line 265.
- `orders.vendor_id`, `orders.tanker_type_id`/`quantity`/`unit_price`/`total_price`, and payment columns (`payment_status`, `payment_method`, `payment_reference`, `razorpay_order_id`) were all added by later `DO $$` blocks, not the original table definition.
