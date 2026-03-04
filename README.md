# ISP Unified Operations Platform (MVP)

This repository now ships an MVP for a **unified ISP Operations system** where:

- Map infrastructure, fibre routes/cores, MST ports, and client CRM data are linked.
- Every CRM client has a physical map object (`client_premise`).
- Client activation creates a real drop-fibre path (`MST -> client`) with core + port allocation.
- All major actions create audit logs and are broadcast in real time over WebSockets.

## Stack

- Frontend: `React + Vite`
- Backend: `Python + FastAPI + WebSockets`
- Database: `PostgreSQL + PostGIS`
- Map engines (both in one dashboard):
  - `Leaflet + OpenStreetMap` (no API key required)
  - `MapLibre GL` (default style: `https://demotiles.maplibre.org/style.json`)

## Implemented MVP Scope

### Map / Fibre Ops

- Create assets: MST/FAT/FDB/pole/manhole/OLT/splice closure/client premise.
- OLT onboarding:
  - Add OLT with total port count.
  - Track free/used OLT ports.
  - Assign selected cable core color to specific OLT ports.
- Create fibre cables by selecting **start + end assets**.
  - Auto-generates line geometry.
  - Optional manual route drawing: click points on map and save custom path.
  - Auto-calculates distance.
  - Auto-creates fibre cores with standard colors.
- View and update core statuses (`free`, `reserved`, `used`, `faulty`).
- Record splice events with location, engineer, notes.
- View MST capacity (used/free/reserved/faulty ports).
- Click MST to inspect legs/ports (e.g., leg 3, leg 7), assigned client, and remaining legs.
- Click OLT / boxes to inspect incoming/outgoing core colors and splice color transitions.

### CRM + Network Link

- Create CRM clients with router-level fields (PPPoE, VLAN, OLT, PON, ONU, plan, etc.).
- Activation logic:
  - Blocked if no MST is selected.
  - Picks free MST splitter port.
  - Creates automatic 1-core drop cable.
  - Assigns drop core and links it to client.
- Suspend client action.
- Client map-path endpoint returns MST, upstream cables, drop cable, core color, splitter port.

### Monitoring + Activity

- Push monitoring snapshots (PPPoE state, RX/TX power, uptime).
- Creates alerts for offline ONU / low optical power / frequent disconnect pattern.
- Audit logs for infrastructure, CRM, monitoring, and admin actions.
- WebSocket updates for real-time UI refresh and collision reduction.

### Roles

- `super_admin`
- `isp_admin`
- `field_engineer`
- `noc_viewer`

## Project Layout

- `backend_fastapi/` -> FastAPI + PostGIS backend
  - `app/main.py`
  - `app/database.py`
  - `app/security.py`
  - `app/schemas.py`
  - `sql/schema.sql`
- `src/` -> React frontend MVP console
  - `src/App.jsx`
  - `src/components/GoogleMapCanvas.jsx`
  - `src/components/MapTab.jsx`
  - `src/components/CrmTab.jsx`
  - `src/components/MonitoringTab.jsx`
  - `src/components/ActivityTab.jsx`
  - `src/services/api.js`

## Environment

Frontend `.env`:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_MAPLIBRE_STYLE_URL=https://demotiles.maplibre.org/style.json
```

Backend env (used by Docker compose already):

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/isp_ops
JWT_SECRET=replace-with-long-random-secret
ACCESS_TOKEN_EXPIRE_MINUTES=720
CORS_ORIGINS=http://localhost:5173
DEFAULT_ADMIN_EMAIL=admin@isp.local
DEFAULT_ADMIN_PASSWORD=Admin123!
DEFAULT_ADMIN_NAME=System Super Admin
```

## Run with Docker (Recommended)

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- DB: `localhost:5432`

## Run Locally (Without Docker)

### Backend

```bash
cd backend_fastapi
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/isp_ops
set JWT_SECRET=replace-with-long-random-secret
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
npm install
npm run dev
```

## Default Login

- Email: `admin@isp.local`
- Password: `Admin123!`

## API Highlights

- `POST /api/auth/login`
- `GET /api/bootstrap`
- `POST /api/map/assets`
- `POST /api/map/cables`
- `GET /api/map/cables/{cable_id}/cores`
- `PATCH /api/map/cores/{core_id}`
- `POST /api/map/splices`
- `POST /api/crm/clients`
- `POST /api/crm/clients/{client_id}/activate`
- `POST /api/crm/clients/{client_id}/suspend`
- `GET /api/crm/clients/{client_id}/map-path`
- `POST /api/monitoring/clients/{client_id}`
- `GET /api/monitoring/alerts`
- `GET /api/activity/logs`
- `GET /api/activity/splices`
- `POST /api/admin/users`
- `WS /ws/updates?token=<jwt>`

## Notes

- Existing legacy Node backend files remain in the repo, but MVP runtime is now based on `backend_fastapi`.
- In the map toolbar you can switch between:
  - `Leaflet + OSM`
  - `MapLibre GL`
- You can paste any MapLibre style URL directly from the dashboard input.
- The frontend auto-refreshes data when WebSocket events arrive.
