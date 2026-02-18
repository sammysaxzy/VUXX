# ISP Map & CRM (Multi-Tenant, No RADIUS)

This is a full starter implementation of a web-based ISP fibre mapping and CRM platform with:

- Multi-tenant SaaS account registration
- Tenant branding support (company name + logo URL)
- Role-ready auth model
- Interactive map for adding field assets
- Cable drawing between nodes
- Fibre core inventory and anti-double-allocation logic
- Splitter support with dynamic legs (1/2, 1/4, 1/8, 1/16)
- Customer and fault records
- Realtime map refresh via Socket.IO

## Stack

- Backend: Node.js + Express + PostgreSQL
- Frontend: React + Vite + Leaflet/OpenStreetMap
- Realtime: Socket.IO

## 1. Start Database

```bash
docker compose up -d
```

## 2. Backend Setup

```bash
cd backend
cp .env.example .env
npm install
npm run migrate
npm run dev
```

Backend runs on `http://localhost:4000`.

## 3. Frontend Setup

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

## Main API endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/nodes`
- `POST /api/nodes`
- `PUT /api/nodes/:id`
- `DELETE /api/nodes/:id`
- `GET /api/cables`
- `POST /api/cables`
- `POST /api/cables/:id/allocate-core`
- `GET /api/allocations`
- `POST /api/splitters`
- `GET /api/splitters`
- `POST /api/customers`
- `GET /api/customers`
- `POST /api/faults`
- `GET /api/faults`

## Notes

- No OLT or RADIUS integration is required for this build.
- Core allocation is transaction-safe and blocks duplicate active/reserved assignment.
- Data isolation is enforced by tenant scoping on all domain tables and API filters.

## Next practical upgrades

1. Add true GIS geometry storage with PostGIS (`geometry(LineString, 4326)`).
2. Add node/cable edit modals and line reshaping tools on map.
3. Add object storage upload flow for tenant logos.
4. Add billing/subscription module for SaaS commercialization.
