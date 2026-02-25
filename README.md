# FIBRE NOC OSS/BSS Control Panel

FIBRE NOC is an internal telecom operations platform built with a React + Vite frontend and a Node + Express + PostgreSQL backend. The focus is on secure access, tenant-aware dashboards, and a production-grade login entry point that mirrors the provided design spec.

## 📌 Overview
- Split-screen **dark NOC** themed login experience with a branded left panel and a glowing login card on the right.
- Real authentication backed by bcrypt-hashed passwords, JWT, role-aware middleware, Helmet, CORS, and rate limiting.
- Protected dashboards and utilities (`/dashboard`, `/customers`, `/tickets`, `/radius`, `/reports`) that can only be reached once authenticated.
- Docker Compose orchestrates PostgreSQL, backend API, and a static frontend served via Nginx.
- Built-in seeding of an admin user (`admin@fibernoc.local` / `Admin123!`) for immediate access.

## 🧠 Backend Setup

### Prerequisites
- Node 20+
- PostgreSQL 16+ (or `docker compose` from this repo)
- Copy the env template inside `backend`:
  ```bash
  cd backend
  cp .env.example .env
  # then edit JWT_SECRET, DB_*, and CORS_ORIGINS as needed
  ```

### Environment variables
Required values in `backend/.env`:

```
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=postgres
DB_NAME=fibernoc
JWT_SECRET=your_long_jwt_secret
JWT_EXPIRES_IN=1h
CORS_ORIGINS=http://localhost:5173
```

### Commands

```bash
npm install
npm run migrate    # builds schema and seeds the admin user
npm run dev        # runs server with --watch (or npm start for production)
```

`npm run migrate` loads `backend/sql/schema.sql` (see section below) and automatically seeds the admin user via `backend/src/seedAdmin.js`. If you need to re-run the seed without reapplying migrations, `npm run seed` is available.

### Authentication contract
- **Endpoint**: `POST /api/auth/login`
- **Payload**:
  ```json
  { "email": "admin@fibernoc.local", "password": "Admin123!" }
  ```
- **Response**:
  ```json
  {
    "token": "<jwt-token>",
    "user": { "id": "...", "email": "...", "role": "admin" }
  }
  ```
- **Headers**: protected routes expect `Authorization: Bearer <token>`.
- **Middleware**: `authenticateToken` enforces the JWT, returns 403 on invalid tokens, and `requireRole(...)` gates routes by role.
- **Protected routes**: `/api/dashboard`, `/api/customers`, `/api/logs`, `/api/radius`, `/api/map`, `/api/tickets`.

### Security
- Password hashing uses `bcryptjs` with 12 rounds.
- JSON Web Tokens issued via `jsonwebtoken`, expiring in 1 hour (configurable via `JWT_EXPIRES_IN`).
- `Helmet`, `CORS`, and Express rate limiting (120 reqs/min with standard headers) are applied globally.

## 🎨 Frontend Setup

### Tech stack
- React + Vite + React Router + Axios + Context API.
- Global theme defined in `src/styles.css` with custom dark palette and component tokens.
- Auth flow managed through `src/context/AuthContext.jsx`, which stores JWTs only when the **Remember session** checkbox is checked.
- Routes are guarded using `src/components/PrivateRoute.jsx` and the protected layout wires `Header`, `NocContext`, and the existing dashboard pages.

### Environment
Copy the base env:

```bash
cp .env.example .env
```

Set `VITE_API_BASE_URL` to point at `http://localhost:5000` in development.

### Commands

```bash
npm install
npm run dev      # starts Vite on http://localhost:5173
npm run build    # produces a production-ready ./dist bundle
npm run preview  # preview the production build
```

### Login UX
- **Split screen**: left brand panel with `FIBRE NOC`, heading `Unified Fiber Operations Platform`, subtitle `SECURE ACCESS PORTAL`, descriptive copy, and footer badges (`NETWORK INTEGRITY: ACTIVE` / `TIER 1 SECURITY PROTOCOL`).
- **Right panel**: centered card with glowing border, shadow, `Secure Sign In` title, form fields with icons, focus glow, and inline error text.
- **Submit row**: `Remember session` checkbox + `Forgot password?` link, `SIGN IN TO PLATFORM` button that shows a spinner when loading and disables while submitting.
- **Page footer**: `Internal System Use Only · v1.0.0-PROD · Security Policy`.
- **Responsiveness**: desktop split layout stacks into a single column on viewports narrower than 960px.
- **Error handling**: 401 from backend surfaces a credential error message; other failures show a generic “unable to reach platform” banner.

## 🐳 Docker Compose

The repository ships with a full `docker-compose.yml` that builds:

- `db`: PostgreSQL 16 with a persistent volume.
- `backend`: builds from `backend/Dockerfile` and reads env variables (JWT secret, DB creds, CORS origins). It listens on port 5000.
- `frontend`: builds via `docker/frontend.Dockerfile`, passes `VITE_API_BASE_URL=http://backend:5000` at build time, and serves static assets through nginx on port 5173.

### Commands

```bash
docker compose up --build
docker compose run backend npm run migrate   # ensure schema and seed are applied
```

### Notes
- The backend container does **not** auto-run migrations — run them after `db` is healthy.
- Override `JWT_SECRET` and `CORS_ORIGINS` through Docker environment variables for production.
- The frontend build stage ingests `VITE_API_BASE_URL` via build args so that axios can target the internal backend service.

## 🧾 Database schema

- Location: `backend/sql/schema.sql`.
- Extension: `pgcrypto` for UUID generation.
- Tables:
  - `tenants` & `users` (multi-tenant users, roles: `admin | engineer | noc`).
  - `nodes`, `mst`, `fiber_routes`, `customers`, `radius_sessions`, `tickets`, `logs`.
- The seeded admin user uses tenant slug `fibernoc` and password hash stored via bcrypt.

## 🔐 Authentication flow

1. Login page POSTs credentials to `/api/auth/login`.
2. Backend verifies the hashed password, issues a JWT with `{ sub, role, tenantId }`, and returns the token plus user metadata.
3. `AuthContext` stores the token in memory and only persists it in `localStorage` when “Remember session” is checked.
4. All protected API calls use the Axios `Authorization` header set by `AuthContext`.
5. `PrivateRoute` checks `useAuth().user` for guarding React routes, while backend middleware enforces the JWT and role constraints.

## 🧪 Testing the flow

- Default credentials: `admin@fibernoc.local` / `Admin123!`.
- After login, you land on `/dashboard`; navigating to `/customers`, `/tickets`, `/radius`, or `/reports` is blocked until authenticated.
- Unauthenticated access is redirected to `/login`.
- 401 responses show credential errors in the login card; 500+ responses show a generic connection message.

## ✅ Next steps

1. Swap `JWT_SECRET`, `DB_*`, and `VITE_API_BASE_URL` with environment-specific values before production.
2. Run `npm run build` and serve the `dist` output via the provided Docker setup or your preferred static hosting.
3. Add additional role-based guards via `requireRole` to limit features per user role (admin, engineer, noc).
