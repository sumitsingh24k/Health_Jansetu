# JanSetu Frontend

Next.js dashboard and role-based UI for JanSetu. This is the whole application — there is no separate backend process.

**API map and data model:** see [`../SYSTEM_ARCHITECTURE.md`](../SYSTEM_ARCHITECTURE.md).

## Environment

Set these values in `.env`:

- `MONGO_URI=<mongo uri>`
- `NEXTAUTH_URL=http://localhost:3000`
- `NEXTAUTH_SECRET=<secret>`
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` (static admin login, see `app/lib/auth/authOptions.js`)

## Local Run

```bash
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

## API routes

All routes are Next.js route handlers under `app/api/`, all session-guarded via `proxy.js`:

| Route | Purpose |
|-------|---------|
| `GET/POST /api/health-data` | Reports, dashboard summary, risk zones, trends — the single source of case data |
| `POST /api/predictions/outbreak` | Outbreak risk score for an area (reads Mongo directly) |
| `GET /api/public/area-insight` | Public, no-login area health guide by coordinates |
| `GET/POST /api/supply`, `/api/supply/recommend` | Medicine stock and supply recommendations |
| `/api/admin/*` | ASHA directory and administration (ADMIN only); ASHA and medical accounts self-register |
| `/api/auth/*` | NextAuth |
| `/api/location/*` | Area search, Janaushadhi lookup |

## UX and Theme

- Global color tokens are defined in `globals.css`.
- Shared UI buttons use shadcn-style `components/ui/button.tsx` (`@/components/ui/button`).
- Core pages (`/`, `/login`, `/workspace`, registration flows) use the unified color and button system.
