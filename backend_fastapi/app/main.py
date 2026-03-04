from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from asyncpg import Connection
from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .database import close_pool, get_conn, get_pool, init_pool
from .schemas import (
    ActivateClientRequest,
    AssetCreateRequest,
    AssetPositionUpdateRequest,
    AssetTypeEnum,
    CableCreateRequest,
    ClientCreateRequest,
    CoreOwnerTypeEnum,
    CoreStatusUpdateRequest,
    FieldEventCreateRequest,
    LoginRequest,
    MonitoringUpdateRequest,
    OltPortAssignRequest,
    PPPoEStatusEnum,
    RoleEnum,
    SpliceCreateRequest,
    UserCreateRequest,
)
from .security import create_access_token, decode_access_token, hash_password, verify_password

FIBRE_COLORS = [
    "Blue",
    "Orange",
    "Green",
    "Brown",
    "Slate",
    "White",
    "Red",
    "Black",
    "Yellow",
    "Violet",
    "Rose",
    "Aqua",
]

SPLITTER_PORTS = {
    "1/2": 2,
    "1/4": 4,
    "1/8": 8,
    "1/16": 16,
}

CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")]

app = FastAPI(
    title="ISP Unified Operations API",
    version="0.1.0",
    description="Map + CRM + Network-state API for ISP operations MVP.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

auth_scheme = HTTPBearer(auto_error=False)


class WebSocketHub:
    def __init__(self):
        self._clients: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.discard(websocket)

    async def broadcast(self, event_name: str, payload: dict[str, Any]) -> None:
        if not self._clients:
            return
        message = json.dumps(
            {
                "event": event_name,
                "payload": payload,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            default=str,
        )
        stale: list[WebSocket] = []
        for client in self._clients:
            try:
                await client.send_text(message)
            except Exception:
                stale.append(client)
        for client in stale:
            self.disconnect(client)


hub = WebSocketHub()


def core_color_name(core_number: int) -> str:
    base_color = FIBRE_COLORS[(core_number - 1) % 12]
    batch = ((core_number - 1) // 12) + 1
    return base_color if batch == 1 else f"{base_color} ({batch})"


def parse_geojson(value: str | None) -> dict[str, Any] | None:
    if not value:
        return None
    return json.loads(value)


def to_dict(record) -> dict[str, Any]:
    return dict(record) if record else {}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
    conn: Connection = Depends(get_conn),
) -> dict[str, Any]:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    try:
        token_payload = decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    subject = token_payload.get("sub")
    if not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")
    try:
        user_id = UUID(subject)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject") from exc

    user = await conn.fetchrow(
        """
        SELECT id, full_name, email, role, created_at
        FROM users
        WHERE id = $1
        """,
        user_id,
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return to_dict(user)


def require_roles(*allowed: RoleEnum):
    allowed_values = {role.value for role in allowed}

    async def dependency(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        if user["role"] not in allowed_values:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permission")
        return user

    return dependency


async def write_audit(
    conn: Connection,
    *,
    actor_user_id: UUID | str | None,
    action_type: str,
    entity_type: str,
    entity_id: UUID | str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    before_state: dict[str, Any] | None = None,
    after_state: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    await conn.execute(
        """
        INSERT INTO audit_logs (
            actor_user_id, action_type, entity_type, entity_id, latitude, longitude, before_state, after_state, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
        """,
        actor_user_id,
        action_type,
        entity_type,
        entity_id,
        latitude,
        longitude,
        json.dumps(before_state or {}),
        json.dumps(after_state or {}),
        json.dumps(metadata or {}),
    )


async def create_alert_if_missing(
    conn: Connection,
    *,
    client_id: UUID,
    alert_type: str,
    severity: str,
    message: str,
) -> None:
    exists = await conn.fetchval(
        """
        SELECT 1
        FROM network_alerts
        WHERE client_id = $1 AND alert_type = $2 AND is_open = TRUE
        LIMIT 1
        """,
        client_id,
        alert_type,
    )
    if exists:
        return
    await conn.execute(
        """
        INSERT INTO network_alerts (client_id, alert_type, severity, message)
        VALUES ($1, $2, $3, $4)
        """,
        client_id,
        alert_type,
        severity,
        message,
    )


async def close_alert(conn: Connection, *, client_id: UUID, alert_type: str) -> None:
    await conn.execute(
        """
        UPDATE network_alerts
        SET is_open = FALSE
        WHERE client_id = $1 AND alert_type = $2 AND is_open = TRUE
        """,
        client_id,
        alert_type,
    )


async def fetch_assets(conn: Connection) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT
          a.id,
          a.asset_type,
          a.name,
          a.latitude,
          a.longitude,
          a.properties,
          a.created_at,
          m.mst_code,
          m.splitter_type,
          m.total_ports,
          COALESCE(ps.used_ports, 0) AS used_ports,
          COALESCE(ps.free_ports, 0) AS free_ports,
          COALESCE(ps.reserved_ports, 0) AS reserved_ports,
          COALESCE(op.total_ports, 0) AS olt_total_ports,
          COALESCE(op.used_ports, 0) AS olt_used_ports,
          COALESCE(op.free_ports, 0) AS olt_free_ports,
          COALESCE(op.reserved_ports, 0) AS olt_reserved_ports
        FROM infrastructure_assets a
        LEFT JOIN mst_boxes m ON m.asset_id = a.id
        LEFT JOIN (
          SELECT
            mst_asset_id,
            COUNT(*) FILTER (WHERE status = 'used')::INT AS used_ports,
            COUNT(*) FILTER (WHERE status = 'free')::INT AS free_ports,
            COUNT(*) FILTER (WHERE status = 'reserved')::INT AS reserved_ports
          FROM splitter_ports
          GROUP BY mst_asset_id
        ) ps ON ps.mst_asset_id = a.id
        LEFT JOIN (
          SELECT
            olt_asset_id,
            COUNT(*)::INT AS total_ports,
            COUNT(*) FILTER (WHERE status = 'used')::INT AS used_ports,
            COUNT(*) FILTER (WHERE status = 'free')::INT AS free_ports,
            COUNT(*) FILTER (WHERE status = 'reserved')::INT AS reserved_ports
          FROM olt_ports
          GROUP BY olt_asset_id
        ) op ON op.olt_asset_id = a.id
        ORDER BY a.created_at DESC
        """
    )
    return [to_dict(row) for row in rows]


async def fetch_asset_by_id(conn: Connection, asset_id: UUID) -> dict[str, Any] | None:
    row = await conn.fetchrow(
        """
        SELECT
          a.id,
          a.asset_type,
          a.name,
          a.latitude,
          a.longitude,
          a.properties,
          a.created_at,
          m.mst_code,
          m.splitter_type,
          m.total_ports,
          COALESCE(ps.used_ports, 0) AS used_ports,
          COALESCE(ps.free_ports, 0) AS free_ports,
          COALESCE(ps.reserved_ports, 0) AS reserved_ports,
          COALESCE(op.total_ports, 0) AS olt_total_ports,
          COALESCE(op.used_ports, 0) AS olt_used_ports,
          COALESCE(op.free_ports, 0) AS olt_free_ports,
          COALESCE(op.reserved_ports, 0) AS olt_reserved_ports
        FROM infrastructure_assets a
        LEFT JOIN mst_boxes m ON m.asset_id = a.id
        LEFT JOIN (
          SELECT
            mst_asset_id,
            COUNT(*) FILTER (WHERE status = 'used')::INT AS used_ports,
            COUNT(*) FILTER (WHERE status = 'free')::INT AS free_ports,
            COUNT(*) FILTER (WHERE status = 'reserved')::INT AS reserved_ports
          FROM splitter_ports
          GROUP BY mst_asset_id
        ) ps ON ps.mst_asset_id = a.id
        LEFT JOIN (
          SELECT
            olt_asset_id,
            COUNT(*)::INT AS total_ports,
            COUNT(*) FILTER (WHERE status = 'used')::INT AS used_ports,
            COUNT(*) FILTER (WHERE status = 'free')::INT AS free_ports,
            COUNT(*) FILTER (WHERE status = 'reserved')::INT AS reserved_ports
          FROM olt_ports
          GROUP BY olt_asset_id
        ) op ON op.olt_asset_id = a.id
        WHERE a.id = $1
        """,
        asset_id,
    )
    return to_dict(row) if row else None


async def fetch_cables(conn: Connection) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT
          c.id,
          c.label,
          c.cable_type,
          c.core_count,
          c.start_asset_id,
          c.end_asset_id,
          c.distance_m,
          c.created_at,
          ST_AsGeoJSON(c.geom) AS geometry,
          COUNT(fc.id) FILTER (WHERE fc.status = 'used')::INT AS used_cores,
          COUNT(fc.id) FILTER (WHERE fc.status = 'free')::INT AS free_cores,
          COUNT(fc.id) FILTER (WHERE fc.status = 'reserved')::INT AS reserved_cores,
          COUNT(fc.id) FILTER (WHERE fc.status = 'faulty')::INT AS faulty_cores
        FROM fibre_cables c
        LEFT JOIN fibre_cores fc ON fc.cable_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at DESC
        """
    )
    payload: list[dict[str, Any]] = []
    for row in rows:
        item = to_dict(row)
        item["geometry"] = parse_geojson(row["geometry"])
        payload.append(item)
    return payload


async def fetch_cable_by_id(conn: Connection, cable_id: UUID) -> dict[str, Any] | None:
    row = await conn.fetchrow(
        """
        SELECT
          c.id,
          c.label,
          c.cable_type,
          c.core_count,
          c.start_asset_id,
          c.end_asset_id,
          c.distance_m,
          c.created_at,
          ST_AsGeoJSON(c.geom) AS geometry,
          COUNT(fc.id) FILTER (WHERE fc.status = 'used')::INT AS used_cores,
          COUNT(fc.id) FILTER (WHERE fc.status = 'free')::INT AS free_cores,
          COUNT(fc.id) FILTER (WHERE fc.status = 'reserved')::INT AS reserved_cores,
          COUNT(fc.id) FILTER (WHERE fc.status = 'faulty')::INT AS faulty_cores
        FROM fibre_cables c
        LEFT JOIN fibre_cores fc ON fc.cable_id = c.id
        WHERE c.id = $1
        GROUP BY c.id
        """,
        cable_id,
    )
    if not row:
        return None
    item = to_dict(row)
    item["geometry"] = parse_geojson(row["geometry"])
    return item


async def fetch_client_by_id(conn: Connection, client_id: UUID) -> dict[str, Any] | None:
    row = await conn.fetchrow(
        """
        SELECT
          c.*,
          premise.name AS premise_name,
          mst_asset.name AS mst_name,
          mst_asset.latitude AS mst_latitude,
          mst_asset.longitude AS mst_longitude,
          port.port_number,
          drop_core.color_name AS core_color
        FROM crm_clients c
        JOIN infrastructure_assets premise ON premise.id = c.premise_asset_id
        LEFT JOIN infrastructure_assets mst_asset ON mst_asset.id = c.mst_asset_id
        LEFT JOIN splitter_ports port ON port.id = c.splitter_port_id
        LEFT JOIN fibre_cores drop_core ON drop_core.id = c.drop_core_id
        WHERE c.id = $1
        """,
        client_id,
    )
    return to_dict(row) if row else None


async def fetch_clients(conn: Connection) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT
          c.*,
          premise.name AS premise_name,
          mst_asset.name AS mst_name,
          mst_asset.latitude AS mst_latitude,
          mst_asset.longitude AS mst_longitude,
          port.port_number,
          drop_core.color_name AS core_color
        FROM crm_clients c
        JOIN infrastructure_assets premise ON premise.id = c.premise_asset_id
        LEFT JOIN infrastructure_assets mst_asset ON mst_asset.id = c.mst_asset_id
        LEFT JOIN splitter_ports port ON port.id = c.splitter_port_id
        LEFT JOIN fibre_cores drop_core ON drop_core.id = c.drop_core_id
        ORDER BY c.created_at DESC
        """
    )
    return [to_dict(row) for row in rows]


async def fetch_alerts(conn: Connection, *, open_only: bool = True) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT
          a.id,
          a.client_id,
          c.full_name AS client_name,
          a.alert_type,
          a.severity,
          a.message,
          a.is_open,
          a.created_at
        FROM network_alerts a
        JOIN crm_clients c ON c.id = a.client_id
        WHERE ($1::boolean = FALSE OR a.is_open = TRUE)
        ORDER BY a.created_at DESC
        LIMIT 300
        """,
        open_only,
    )
    return [to_dict(row) for row in rows]


async def fetch_splices(conn: Connection, *, limit: int = 100) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT
          s.id,
          s.location_asset_id,
          loc.name AS location_name,
          s.from_core_id,
          fc1.color_name AS from_core_color,
          s.to_core_id,
          fc2.color_name AS to_core_color,
          s.engineer_name,
          s.notes,
          s.created_at
        FROM splice_records s
        LEFT JOIN infrastructure_assets loc ON loc.id = s.location_asset_id
        JOIN fibre_cores fc1 ON fc1.id = s.from_core_id
        JOIN fibre_cores fc2 ON fc2.id = s.to_core_id
        ORDER BY s.created_at DESC
        LIMIT $1
        """,
        limit,
    )
    return [to_dict(row) for row in rows]


async def fetch_logs(conn: Connection, *, limit: int = 200) -> list[dict[str, Any]]:
    rows = await conn.fetch(
        """
        SELECT
          l.id,
          l.action_type,
          l.entity_type,
          l.entity_id,
          l.latitude,
          l.longitude,
          l.before_state,
          l.after_state,
          l.metadata,
          l.created_at,
          u.full_name AS actor_name,
          u.role AS actor_role
        FROM audit_logs l
        LEFT JOIN users u ON u.id = l.actor_user_id
        ORDER BY l.created_at DESC
        LIMIT $1
        """,
        limit,
    )
    return [to_dict(row) for row in rows]


async def ensure_default_admin() -> None:
    pool = await get_pool()
    email = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@isp.local").strip().lower()
    full_name = os.getenv("DEFAULT_ADMIN_NAME", "System Super Admin").strip()
    raw_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "Admin123!")
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM users WHERE LOWER(email) = $1", email)
        if existing:
            return
        await conn.execute(
            """
            INSERT INTO users (full_name, email, password_hash, role)
            VALUES ($1, $2, $3, $4)
            """,
            full_name,
            email,
            hash_password(raw_password),
            RoleEnum.super_admin.value,
        )


@app.on_event("startup")
async def startup_event() -> None:
    await init_pool()
    await ensure_default_admin()


@app.on_event("shutdown")
async def shutdown_event() -> None:
    await close_pool()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "isp-unified-ops-fastapi"}


@app.post("/api/auth/login")
async def login(payload: LoginRequest, conn: Connection = Depends(get_conn)):
    row = await conn.fetchrow(
        """
        SELECT id, full_name, email, password_hash, role
        FROM users
        WHERE LOWER(email) = $1
        """,
        payload.email.lower(),
    )
    if not row or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(str(row["id"]), row["role"])
    response = {
        "token": token,
        "user": {
            "id": row["id"],
            "full_name": row["full_name"],
            "email": row["email"],
            "role": row["role"],
        },
    }
    return JSONResponse(content=jsonable_encoder(response))


@app.get("/api/auth/me")
async def me(current_user: dict[str, Any] = Depends(get_current_user)):
    return JSONResponse(content=jsonable_encoder(current_user))


@app.get("/api/bootstrap")
async def bootstrap(
    conn: Connection = Depends(get_conn),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    payload = {
        "user": current_user,
        "assets": await fetch_assets(conn),
        "cables": await fetch_cables(conn),
        "clients": await fetch_clients(conn),
        "alerts": await fetch_alerts(conn, open_only=True),
        "splices": await fetch_splices(conn, limit=80),
        "logs": await fetch_logs(conn, limit=150),
    }
    return JSONResponse(content=jsonable_encoder(payload))


@app.get("/api/map/assets")
async def list_assets(
    conn: Connection = Depends(get_conn),
    _current_user: dict[str, Any] = Depends(get_current_user),
):
    return JSONResponse(content=jsonable_encoder(await fetch_assets(conn)))


@app.post("/api/map/assets")
async def create_asset(
    payload: AssetCreateRequest,
    conn: Connection = Depends(get_conn),
    current_user: dict[str, Any] = Depends(
        require_roles(RoleEnum.super_admin, RoleEnum.isp_admin, RoleEnum.field_engineer)
    ),
):
    splitter = payload.splitter_type.value if payload.splitter_type else None
    asset_id: UUID | None = None

    async with conn.transaction():
        inserted = await conn.fetchrow(
            """
            INSERT INTO infrastructure_assets (asset_type, name, latitude, longitude, geom, properties)
            VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, $5::jsonb)
            RETURNING id
            """,
            payload.asset_type.value,
            payload.name,
            payload.latitude,
            payload.longitude,
            json.dumps(payload.properties),
        )
        asset_id = inserted["id"]

        if payload.asset_type == AssetTypeEnum.mst:
            total_ports = SPLITTER_PORTS[splitter]
            mst_code = payload.mst_code or f"MST-{str(asset_id).split('-')[0].upper()}"
            await conn.execute(
                """
                INSERT INTO mst_boxes (asset_id, mst_code, splitter_type, total_ports)
                VALUES ($1, $2, $3, $4)
                """,
                asset_id,
                mst_code,
                splitter,
                total_ports,
            )
            await conn.execute(
                """
                INSERT INTO splitter_ports (mst_asset_id, port_number, status)
                SELECT $1, gs, 'free'
                FROM generate_series(1, $2) AS gs
                """,
                asset_id,
                total_ports,
            )
        elif payload.asset_type == AssetTypeEnum.olt:
            olt_port_count = int(payload.olt_port_count or 0)
            await conn.execute(
                """
                INSERT INTO olt_ports (olt_asset_id, port_number, status)
                SELECT $1, gs, 'free'
                FROM generate_series(1, $2) AS gs
                """,
                asset_id,
                olt_port_count,
            )

        await write_audit(
            conn,
            actor_user_id=current_user["id"],
            action_type="asset_created",
            entity_type="infrastructure_asset",
            entity_id=asset_id,
            latitude=payload.latitude,
            longitude=payload.longitude,
            after_state={
                "asset_type": payload.asset_type.value,
                "name": payload.name,
                "splitter_type": splitter,
                "olt_port_count": payload.olt_port_count,
                "properties": payload.properties,
            },
        )

    asset = await fetch_asset_by_id(conn, asset_id)
    await hub.broadcast(
        "map.asset.created",
        {"asset_id": str(asset_id), "asset_type": payload.asset_type.value, "name": payload.name},
    )
    return JSONResponse(status_code=status.HTTP_201_CREATED, content=jsonable_encoder(asset))


@app.patch("/api/map/assets/{asset_id}/position")
async def update_asset_position(
    asset_id: UUID,
    payload: AssetPositionUpdateRequest,
    conn: Connection = Depends(get_conn),
    current_user: dict[str, Any] = Depends(
        require_roles(RoleEnum.super_admin, RoleEnum.isp_admin, RoleEnum.field_engineer)
    ),
):
    async with conn.transaction():
        existing = await conn.fetchrow(
            """
            SELECT id, name, asset_type, latitude, longitude
            FROM infrastructure_assets
            WHERE id = $1
            """,
            asset_id,
        )
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

        moved = await conn.fetchrow(
            """
            UPDATE infrastructure_assets
            SET
              latitude = $2,
              longitude = $3,
              geom = ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography
            WHERE id = $1
            RETURNING id, name, asset_type, latitude, longitude
            """,
            asset_id,
            payload.latitude,
            payload.longitude,
        )

        await conn.execute(
            """
            WITH moved_cables AS (
              SELECT
                c.id,
                CASE
                  WHEN c.start_asset_id = $1 AND c.end_asset_id = $1 THEN
                    ST_SetPoint(
                      ST_SetPoint(c.geom::geometry, 0, ST_SetSRID(ST_MakePoint($3, $2), 4326)),
                      GREATEST(ST_NPoints(c.geom::geometry) - 1, 0),
                      ST_SetSRID(ST_MakePoint($3, $2), 4326)
                    )
                  WHEN c.start_asset_id = $1 THEN
                    ST_SetPoint(c.geom::geometry, 0, ST_SetSRID(ST_MakePoint($3, $2), 4326))
                  WHEN c.end_asset_id = $1 THEN
                    ST_SetPoint(
                      c.geom::geometry,
                      GREATEST(ST_NPoints(c.geom::geometry) - 1, 0),
                      ST_SetSRID(ST_MakePoint($3, $2), 4326)
                    )
                  ELSE c.geom::geometry
                END AS geom_updated
              FROM fibre_cables c
              WHERE c.start_asset_id = $1 OR c.end_asset_id = $1
            )
            UPDATE fibre_cables c
            SET
              geom = m.geom_updated,
              distance_m = ST_Length(m.geom_updated::geography)
            FROM moved_cables m
            WHERE c.id = m.id
            """,
            asset_id,
            payload.latitude,
            payload.longitude,
        )

        await write_audit(
            conn,
            actor_user_id=current_user["id"],
            action_type="asset_moved",
            entity_type="infrastructure_asset",
            entity_id=asset_id,
            latitude=payload.latitude,
            longitude=payload.longitude,
            before_state={
                "latitude": float(existing["latitude"]),
                "longitude": float(existing["longitude"]),
            },
            after_state={"latitude": payload.latitude, "longitude": payload.longitude},
        )

    await hub.broadcast(
        "map.asset.moved",
        {
            "asset_id": str(asset_id),
            "name": moved["name"],
            "latitude": payload.latitude,
            "longitude": payload.longitude,
        },
    )
    return JSONResponse(content=jsonable_encoder(to_dict(moved)))


@app.get("/api/map/cables")
async def list_cables(
    conn: Connection = Depends(get_conn),
    _current_user: dict[str, Any] = Depends(get_current_user),
):
    return JSONResponse(content=jsonable_encoder(await fetch_cables(conn)))


@app.post("/api/map/cables")
async def create_cable(
    payload: CableCreateRequest,
    conn: Connection = Depends(get_conn),
    current_user: dict[str, Any] = Depends(
        require_roles(RoleEnum.super_admin, RoleEnum.isp_admin, RoleEnum.field_engineer)
    ),
):
    cable_id: UUID | None = None
    async with conn.transaction():
        endpoints = await conn.fetchrow(
            """
            SELECT
              ST_X(s.geom::geometry) AS start_lng,
              ST_Y(s.geom::geometry) AS start_lat,
              ST_X(e.geom::geometry) AS end_lng,
              ST_Y(e.geom::geometry) AS end_lat
            FROM infrastructure_assets s
            JOIN infrastructure_assets e ON e.id = $2
            WHERE s.id = $1
            """,
            payload.start_asset_id,
            payload.end_asset_id,
        )
        if not endpoints:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid start or end asset")

        if payload.path_coordinates:
            start_point = [float(endpoints["start_lng"]), float(endpoints["start_lat"])]
            end_point = [float(endpoints["end_lng"]), float(endpoints["end_lat"])]
            path_points = [[float(lng), float(lat)] for lng, lat in payload.path_coordinates]

            def is_same_point(a: list[float], b: list[float]) -> bool:
                return abs(a[0] - b[0]) < 1e-6 and abs(a[1] - b[1]) < 1e-6

            if not is_same_point(path_points[0], start_point):
                path_points.insert(0, start_point)
            if not is_same_point(path_points[-1], end_point):
                path_points.append(end_point)

            path_geojson = json.dumps({"type": "LineString", "coordinates": path_points})
            cable_row = await conn.fetchrow(
                """
                INSERT INTO fibre_cables (
                  label, cable_type, core_count, start_asset_id, end_asset_id, geom, distance_m, created_by
                )
                VALUES (
                  $1, $2, $3, $4, $5,
                  ST_SetSRID(ST_GeomFromGeoJSON($6), 4326),
                  ST_Length(ST_SetSRID(ST_GeomFromGeoJSON($6), 4326)::geography),
                  $7
                )
                RETURNING id
                """,
                payload.label,
                payload.cable_type.value,
                payload.core_count,
                payload.start_asset_id,
                payload.end_asset_id,
                path_geojson,
                current_user["id"],
            )
        else:
            cable_row = await conn.fetchrow(
                """
                INSERT INTO fibre_cables (
                  label, cable_type, core_count, start_asset_id, end_asset_id, geom, distance_m, created_by
                )
                VALUES (
                  $1, $2, $3, $4, $5,
                  ST_MakeLine(
                    ST_SetSRID(ST_MakePoint($6, $7), 4326),
                    ST_SetSRID(ST_MakePoint($8, $9), 4326)
                  ),
                  ST_Length(
                    ST_MakeLine(
                      ST_SetSRID(ST_MakePoint($6, $7), 4326),
                      ST_SetSRID(ST_MakePoint($8, $9), 4326)
                    )::geography
                  ),
                  $10
                )
                RETURNING id
                """,
                payload.label,
                payload.cable_type.value,
                payload.core_count,
                payload.start_asset_id,
                payload.end_asset_id,
                float(endpoints["start_lng"]),
                float(endpoints["start_lat"]),
                float(endpoints["end_lng"]),
                float(endpoints["end_lat"]),
                current_user["id"],
            )
        if not cable_row:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid start or end asset")

        cable_id = cable_row["id"]
        rows = [
            (
                cable_id,
                core_number,
                core_color_name(core_number),
                "free",
                CoreOwnerTypeEnum.none.value,
                None,
            )
            for core_number in range(1, payload.core_count + 1)
        ]
        await conn.executemany(
            """
            INSERT INTO fibre_cores (cable_id, core_number, color_name, status, owner_type, owner_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            rows,
        )

        await write_audit(
            conn,
            actor_user_id=current_user["id"],
            action_type="fibre_installed",
            entity_type="fibre_cable",
            entity_id=cable_id,
            metadata={
                "label": payload.label,
                "core_count": payload.core_count,
                "cable_type": payload.cable_type.value,
                "start_asset_id": str(payload.start_asset_id),
                "end_asset_id": str(payload.end_asset_id),
                "path_mode": "manual" if payload.path_coordinates else "auto",
            },
        )

    cable = await fetch_cable_by_id(conn, cable_id)
    await hub.broadcast(
        "map.cable.created",
        {"cable_id": str(cable_id), "label": payload.label, "core_count": payload.core_count},
    )
    return JSONResponse(status_code=status.HTTP_201_CREATED, content=jsonable_encoder(cable))


@app.get("/api/map/cables/{cable_id}/cores")
async def list_cable_cores(
    cable_id: UUID,
    conn: Connection = Depends(get_conn),
    _current_user: dict[str, Any] = Depends(get_current_user),
):
    rows = await conn.fetch(
        """
        SELECT id, cable_id, core_number, color_name, status, owner_type, owner_id, created_at
        FROM fibre_cores
        WHERE cable_id = $1
        ORDER BY core_number ASC
        """,
        cable_id,
    )
    return JSONResponse(content=jsonable_encoder([to_dict(row) for row in rows]))


@app.get("/api/map/cables/{cable_id}/usage")
async def get_cable_usage(
    cable_id: UUID,
    conn: Connection = Depends(get_conn),
    _current_user: dict[str, Any] = Depends(get_current_user),
):
    cable = await conn.fetchrow(
        """
        SELECT id, label, cable_type, core_count, distance_m
        FROM fibre_cables
        WHERE id = $1
        """,
        cable_id,
    )
    if not cable:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cable not found")

    cores = await conn.fetch(
        """
        SELECT
          fc.id,
          fc.core_number,
          fc.color_name,
          fc.status,
          fc.owner_type,
          fc.owner_id,
          c.id AS client_id,
          c.full_name AS client_name,
          c.status AS client_status,
          c.pppoe_status
        FROM fibre_cores fc
        LEFT JOIN crm_clients c ON fc.owner_type = 'client' AND c.id = fc.owner_id
        WHERE fc.cable_id = $1
        ORDER BY fc.core_number
        """,
        cable_id,
    )
    used_by_clients = [to_dict(row) for row in cores if row["client_id"]]
    payload = {
        "cable": to_dict(cable),
        "cores": [to_dict(row) for row in cores],
        "clients_using_cable": used_by_clients,
    }
    return JSONResponse(content=jsonable_encoder(payload))


@app.patch("/api/map/cores/{core_id}")
async def update_core_status(
    core_id: UUID,
    payload: CoreStatusUpdateRequest,
    conn: Connection = Depends(get_conn),
    current_user: dict[str, Any] = Depends(
        require_roles(RoleEnum.super_admin, RoleEnum.isp_admin, RoleEnum.field_engineer)
    ),
):
    if payload.status.value == "free" and payload.owner_type.value != "none":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Free core must have owner_type=none")
    if payload.status.value == "free" and payload.owner_id is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Free core cannot have owner_id")
    if payload.status.value != "free" and payload.owner_type.value == "none":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Used/reserved/faulty core must belong to client or MST",
        )
    if payload.status.value != "free" and payload.owner_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="owner_id is required")

    owner_id = payload.owner_id if payload.status.value != "free" else None
    owner_type = payload.owner_type.value if payload.status.value != "free" else CoreOwnerTypeEnum.none.value

    async with conn.transaction():
        existing = await conn.fetchrow(
            """
            SELECT id, status, owner_type, owner_id
            FROM fibre_cores
            WHERE id = $1
            """,
            core_id,
        )
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Core not found")

        updated = await conn.fetchrow(
            """
            UPDATE fibre_cores
            SET status = $2, owner_type = $3, owner_id = $4
            WHERE id = $1
            RETURNING id, cable_id, core_number, color_name, status, owner_type, owner_id
            """,
            core_id,
            payload.status.value,
            owner_type,
            owner_id,
        )

        await write_audit(
            conn,
            actor_user_id=current_user["id"],
            action_type="core_status_updated",
            entity_type="fibre_core",
            entity_id=core_id,
            before_state=to_dict(existing),
            after_state=to_dict(updated),
        )

    await hub.broadcast(
        "map.core.updated",
        {
            "core_id": str(core_id),
            "status": payload.status.value,
            "owner_type": owner_type,
            "owner_id": str(owner_id) if owner_id else None,
        },
    )
    return JSONResponse(content=jsonable_encoder(to_dict(updated)))


@app.post("/api/map/splices")
async def create_splice(
    payload: SpliceCreateRequest,
    conn: Connection = Depends(get_conn),
    current_user: dict[str, Any] = Depends(
        require_roles(RoleEnum.super_admin, RoleEnum.isp_admin, RoleEnum.field_engineer)
    ),
):
    splice_id: UUID | None = None
    engineer_name = payload.engineer_name or current_user["full_name"]
    target_cores = [payload.from_core_id, payload.to_core_id]

    async with conn.transaction():
        rows = await conn.fetch(
            """
            SELECT id
            FROM fibre_cores
            WHERE id = ANY($1::uuid[])
            """,
            target_cores,
        )
        if len(rows) != 2:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more cores were not found")

        await conn.execute(
            """
            UPDATE fibre_cores
            SET status = 'used',
                owner_type = CASE WHEN owner_type = 'none' THEN 'mst' ELSE owner_type END
            WHERE id = ANY($1::uuid[])
            """,
            target_cores,
        )

        splice = await conn.fetchrow(
            """
            INSERT INTO splice_records (location_asset_id, from_core_id, to_core_id, engineer_name, notes)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, location_asset_id, from_core_id, to_core_id, engineer_name, notes, created_at
            """,
            payload.location_asset_id,
            payload.from_core_id,
            payload.to_core_id,
            engineer_name,
            payload.notes,
        )
        splice_id = splice["id"]

        await write_audit(
            conn,
            actor_user_id=current_user["id"],
            action_type="core_spliced",
            entity_type="splice_record",
            entity_id=splice_id,
            metadata={
                "from_core_id": str(payload.from_core_id),
                "to_core_id": str(payload.to_core_id),
                "location_asset_id": str(payload.location_asset_id) if payload.location_asset_id else None,
            },
            after_state=to_dict(splice),
        )

    await hub.broadcast(
        "map.splice.created",
        {
            "splice_id": str(splice_id),
            "from_core_id": str(payload.from_core_id),
            "to_core_id": str(payload.to_core_id),
            "engineer_name": engineer_name,
        },
    )
    return JSONResponse(status_code=status.HTTP_201_CREATED, content=jsonable_encoder(to_dict(splice)))


@app.get("/api/map/mst/{mst_asset_id}/capacity")
async def get_mst_capacity(
    mst_asset_id: UUID,
    conn: Connection = Depends(get_conn),
    _current_user: dict[str, Any] = Depends(get_current_user),
):
    mst = await conn.fetchrow(
        """
        SELECT
          m.asset_id,
          m.mst_code,
          m.splitter_type,
          m.total_ports,
          COUNT(sp.id) FILTER (WHERE sp.status = 'used')::INT AS used_ports,
          COUNT(sp.id) FILTER (WHERE sp.status = 'free')::INT AS free_ports,
          COUNT(sp.id) FILTER (WHERE sp.status = 'reserved')::INT AS reserved_ports,
          COUNT(sp.id) FILTER (WHERE sp.status = 'faulty')::INT AS faulty_ports
        FROM mst_boxes m
        LEFT JOIN splitter_ports sp ON sp.mst_asset_id = m.asset_id
        WHERE m.asset_id = $1
        GROUP BY m.asset_id
        """,
        mst_asset_id,
    )
    if not mst:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MST not found")

    clients = await conn.fetch(
        """
        SELECT
          c.id,
          c.full_name,
          c.status,
          c.splitter_port_id,
          c.pppoe_status,
          sp.port_number,
          fc.color_name AS core_color
        FROM crm_clients c
        LEFT JOIN splitter_ports sp ON sp.id = c.splitter_port_id
        LEFT JOIN fibre_cores fc ON fc.id = c.drop_core_id
        WHERE c.mst_asset_id = $1
        ORDER BY sp.port_number NULLS LAST, c.full_name
        """,
        mst_asset_id,
    )
    ports = await conn.fetch(
        """
        SELECT
          sp.id AS splitter_port_id,
          sp.port_number,
          sp.status,
          c.id AS client_id,
          c.full_name AS client_name,
          c.status AS client_status,
          c.pppoe_status,
          fc.color_name AS core_color
        FROM splitter_ports sp
        LEFT JOIN crm_clients c ON c.splitter_port_id = sp.id
        LEFT JOIN fibre_cores fc ON fc.id = sp.core_id
        WHERE sp.mst_asset_id = $1
        ORDER BY sp.port_number ASC
        """,
        mst_asset_id,
    )
    mst_payload = to_dict(mst)
    mst_payload["legs_remaining"] = mst_payload.get("free_ports", 0)
    mst_payload["legs_total"] = mst_payload.get("total_ports", 0)
    return JSONResponse(
        content=jsonable_encoder(
            {
                "mst": mst_payload,
                "clients": [to_dict(row) for row in clients],
                "ports": [to_dict(row) for row in ports],
            }
        )
    )


@app.get("/api/map/olt/{olt_asset_id}/ports")
async def get_olt_ports(
    olt_asset_id: UUID,
    conn: Connection = Depends(get_conn),
    _current_user: dict[str, Any] = Depends(get_current_user),
):
    olt_asset = await conn.fetchrow(
        """
        SELECT id, name, latitude, longitude
        FROM infrastructure_assets
        WHERE id = $1 AND asset_type = 'olt'
        """,
        olt_asset_id,
    )
    if not olt_asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OLT not found")

    summary = await conn.fetchrow(
        """
        SELECT
          COUNT(*)::INT AS total_ports,
          COUNT(*) FILTER (WHERE status = 'used')::INT AS used_ports,
          COUNT(*) FILTER (WHERE status = 'free')::INT AS free_ports,
          COUNT(*) FILTER (WHERE status = 'reserved')::INT AS reserved_ports,
          COUNT(*) FILTER (WHERE status = 'faulty')::INT AS faulty_ports
        FROM olt_ports
        WHERE olt_asset_id = $1
        """,
        olt_asset_id,
    )

    ports = await conn.fetch(
        """
        SELECT
          op.id,
          op.port_number,
          op.status,
          op.notes,
          op.cable_id,
          op.core_id,
          c.label AS cable_label,
          fc.color_name AS core_color
        FROM olt_ports op
        LEFT JOIN fibre_cables c ON c.id = op.cable_id
        LEFT JOIN fibre_cores fc ON fc.id = op.core_id
        WHERE op.olt_asset_id = $1
        ORDER BY op.port_number ASC
        """,
        olt_asset_id,
    )

    payload = {
        "olt": to_dict(olt_asset),
        "summary": to_dict(summary),
        "ports": [to_dict(row) for row in ports],
    }
    return JSONResponse(content=jsonable_encoder(payload))


@app.post("/api/map/olt/{olt_asset_id}/ports/{port_number}/assign")
async def assign_olt_port(
    olt_asset_id: UUID,
    port_number: int,
    payload: OltPortAssignRequest,
    conn: Connection = Depends(get_conn),
    current_user: dict[str, Any] = Depends(
        require_roles(RoleEnum.super_admin, RoleEnum.isp_admin, RoleEnum.field_engineer)
    ),
):
    if port_number < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid port number")
    if payload.status != "free" and not (payload.core_id or payload.cable_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigning port requires core_id and/or cable_id",
        )

    async with conn.transaction():
        existing = await conn.fetchrow(
            """
            SELECT id, olt_asset_id, port_number, status, cable_id, core_id, notes
            FROM olt_ports
            WHERE olt_asset_id = $1 AND port_number = $2
            FOR UPDATE
            """,
            olt_asset_id,
            port_number,
        )
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OLT port not found")

        if payload.core_id and payload.cable_id:
            core_cable_id = await conn.fetchval(
                """
                SELECT cable_id
                FROM fibre_cores
                WHERE id = $1
                """,
                payload.core_id,
            )
            if not core_cable_id:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Core not found")
            if core_cable_id != payload.cable_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="core_id does not belong to cable_id",
                )

        cable_id = payload.cable_id if payload.status != "free" else None
        core_id = payload.core_id if payload.status != "free" else None
        notes = payload.notes if payload.status != "free" else None

        updated = await conn.fetchrow(
            """
            UPDATE olt_ports
            SET status = $3, cable_id = $4, core_id = $5, notes = $6
            WHERE olt_asset_id = $1 AND port_number = $2
            RETURNING id, olt_asset_id, port_number, status, cable_id, core_id, notes
            """,
            olt_asset_id,
            port_number,
            payload.status,
            cable_id,
            core_id,
            notes,
        )

        await write_audit(
            conn,
            actor_user_id=current_user["id"],
            action_type="olt_port_assigned",
            entity_type="olt_port",
            entity_id=updated["id"],
            before_state=to_dict(existing),
            after_state=to_dict(updated),
            metadata={"olt_asset_id": str(olt_asset_id), "port_number": port_number},
        )

    await hub.broadcast(
        "map.olt_port.updated",
        {
            "olt_asset_id": str(olt_asset_id),
            "port_number": port_number,
            "status": payload.status,
            "cable_id": str(payload.cable_id) if payload.cable_id else None,
            "core_id": str(payload.core_id) if payload.core_id else None,
        },
    )
    return JSONResponse(content=jsonable_encoder(to_dict(updated)))


@app.get("/api/map/assets/{asset_id}/color-flow")
async def get_asset_color_flow(
    asset_id: UUID,
    conn: Connection = Depends(get_conn),
    _current_user: dict[str, Any] = Depends(get_current_user),
):
    asset = await conn.fetchrow(
        """
        SELECT id, asset_type, name, latitude, longitude
        FROM infrastructure_assets
        WHERE id = $1
        """,
        asset_id,
    )
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    cables = await conn.fetch(
        """
        SELECT id, label, cable_type, core_count, start_asset_id, end_asset_id, distance_m
        FROM fibre_cables
        WHERE start_asset_id = $1 OR end_asset_id = $1
        ORDER BY created_at DESC
        """,
        asset_id,
    )
    cable_ids = [row["id"] for row in cables]

    flow_rows = []
    if cable_ids:
        flow_rows = await conn.fetch(
            """
            SELECT
              fc.id AS core_id,
              fc.cable_id,
              fc.core_number,
              fc.color_name,
              fc.status,
              fc.owner_type,
              fc.owner_id,
              c.label AS cable_label,
              c.start_asset_id,
              c.end_asset_id
            FROM fibre_cores fc
            JOIN fibre_cables c ON c.id = fc.cable_id
            WHERE fc.cable_id = ANY($1::uuid[])
            ORDER BY c.created_at DESC, fc.core_number ASC
            """,
            cable_ids,
        )

    outgoing = []
    incoming = []
    for row in flow_rows:
        item = to_dict(row)
        if row["start_asset_id"] == asset_id:
            item["direction"] = "outgoing"
            outgoing.append(item)
        else:
            item["direction"] = "incoming"
            incoming.append(item)

    splices = await conn.fetch(
        """
        SELECT
          s.id,
          s.created_at,
          s.engineer_name,
          s.notes,
          fc1.color_name AS from_core_color,
          c1.label AS from_cable_label,
          fc2.color_name AS to_core_color,
          c2.label AS to_cable_label
        FROM splice_records s
        JOIN fibre_cores fc1 ON fc1.id = s.from_core_id
        JOIN fibre_cables c1 ON c1.id = fc1.cable_id
        JOIN fibre_cores fc2 ON fc2.id = s.to_core_id
        JOIN fibre_cables c2 ON c2.id = fc2.cable_id
        WHERE s.location_asset_id = $1
        ORDER BY s.created_at DESC
        LIMIT 200
        """,
        asset_id,
    )

    payload = {
        "asset": to_dict(asset),
        "connected_cables": [to_dict(row) for row in cables],
        "incoming_cores": incoming,
        "outgoing_cores": outgoing,
        "splices_at_asset": [to_dict(row) for row in splices],
    }
    return JSONResponse(content=jsonable_encoder(payload))


@app.get("/api/map/object/{asset_id}/link")
async def map_object_link(
    asset_id: UUID,
    conn: Connection = Depends(get_conn),
    _current_user: dict[str, Any] = Depends(get_current_user),
):
    asset = await conn.fetchrow(
        """
        SELECT id, asset_type, name, latitude, longitude
        FROM infrastructure_assets
        WHERE id = $1
        """,
        asset_id,
    )
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    asset_type = asset["asset_type"]
    if asset_type == AssetTypeEnum.client_premise.value:
        client = await conn.fetchrow(
            """
            SELECT
              c.id,
              c.full_name,
              c.status,
              c.pppoe_username,
              c.plan_name,
              c.pppoe_status,
              c.premise_asset_id,
              c.splitter_port_id,
              sp.port_number,
              fc.color_name AS core_color
            FROM crm_clients c
            LEFT JOIN splitter_ports sp ON sp.id = c.splitter_port_id
            LEFT JOIN fibre_cores fc ON fc.id = c.drop_core_id
            WHERE c.premise_asset_id = $1
            """,
            asset_id,
        )
        return JSONResponse(content=jsonable_encoder({"asset": to_dict(asset), "client": to_dict(client)}))

    if asset_type == AssetTypeEnum.olt.value:
        ports = await conn.fetch(
            """
            SELECT
              op.id,
              op.port_number,
              op.status,
              op.notes,
              op.cable_id,
              op.core_id,
              c.label AS cable_label,
              fc.color_name AS core_color
            FROM olt_ports op
            LEFT JOIN fibre_cables c ON c.id = op.cable_id
            LEFT JOIN fibre_cores fc ON fc.id = op.core_id
            WHERE op.olt_asset_id = $1
            ORDER BY op.port_number ASC
            """,
            asset_id,
        )
        clients = await conn.fetch(
            """
            SELECT
              c.id,
              c.full_name,
              c.status,
              c.pppoe_status,
              c.plan_name,
              c.splitter_port_id,
              sp.port_number,
              fc.color_name AS core_color,
              c.premise_asset_id,
              premise.latitude AS client_latitude,
              premise.longitude AS client_longitude
            FROM crm_clients c
            LEFT JOIN splitter_ports sp ON sp.id = c.splitter_port_id
            LEFT JOIN fibre_cores fc ON fc.id = c.drop_core_id
            LEFT JOIN infrastructure_assets premise ON premise.id = c.premise_asset_id
            WHERE LOWER(c.olt_name) = LOWER($1)
            ORDER BY c.full_name
            """,
            asset["name"],
        )
        return JSONResponse(
            content=jsonable_encoder(
                {
                    "asset": to_dict(asset),
                    "ports": [to_dict(row) for row in ports],
                    "clients": [to_dict(row) for row in clients],
                }
            )
        )

    mst_like = {AssetTypeEnum.mst.value, AssetTypeEnum.fat.value, AssetTypeEnum.fdb.value}
    if asset_type in mst_like:
        clients = await conn.fetch(
            """
            SELECT
              c.id,
              c.full_name,
              c.status,
              c.pppoe_status,
              c.plan_name,
              c.splitter_port_id,
              sp.port_number,
              fc.color_name AS core_color,
              c.premise_asset_id,
              premise.latitude AS client_latitude,
              premise.longitude AS client_longitude
            FROM crm_clients c
            LEFT JOIN splitter_ports sp ON sp.id = c.splitter_port_id
            LEFT JOIN fibre_cores fc ON fc.id = c.drop_core_id
            LEFT JOIN infrastructure_assets premise ON premise.id = c.premise_asset_id
            WHERE c.mst_asset_id = $1
            ORDER BY sp.port_number NULLS LAST, c.full_name
            """,
            asset_id,
        )
        return JSONResponse(content=jsonable_encoder({"asset": to_dict(asset), "clients": [to_dict(c) for c in clients]}))

    cables = await conn.fetch(
        """
        SELECT id, label, cable_type, core_count, distance_m
        FROM fibre_cables
        WHERE start_asset_id = $1 OR end_asset_id = $1
        ORDER BY created_at DESC
        """,
        asset_id,
    )
    connected_clients = await conn.fetch(
        """
        SELECT DISTINCT
          c.id,
          c.full_name,
          c.status,
          c.pppoe_status,
          c.plan_name,
          c.premise_asset_id,
          premise.latitude AS client_latitude,
          premise.longitude AS client_longitude
        FROM crm_clients c
        JOIN fibre_cores fc ON fc.owner_type = 'client' AND fc.owner_id = c.id
        JOIN fibre_cables f ON f.id = fc.cable_id
        LEFT JOIN infrastructure_assets premise ON premise.id = c.premise_asset_id
        WHERE f.start_asset_id = $1 OR f.end_asset_id = $1
        ORDER BY c.full_name
        """,
        asset_id,
    )
    return JSONResponse(
        content=jsonable_encoder(
            {
                "asset": to_dict(asset),
                "cables": [to_dict(c) for c in cables],
                "clients": [to_dict(row) for row in connected_clients],
            }
        )
    )


@app.get("/api/crm/clients")
async def list_clients(
    conn: Connection = Depends(get_conn),
    _current_user: dict[str, Any] = Depends(get_current_user),
):
    return JSONResponse(content=jsonable_encoder(await fetch_clients(conn)))


@app.post("/api/crm/clients")
async def create_client(
    payload: ClientCreateRequest,
    conn: Connection = Depends(get_conn),
    current_user: dict[str, Any] = Depends(
        require_roles(RoleEnum.super_admin, RoleEnum.isp_admin, RoleEnum.field_engineer)
    ),
):
    client_id: UUID | None = None
    premise_asset_id: UUID | None = None
    initial_status = "pending" if payload.status == "active" else payload.status

    async with conn.transaction():
        premise = await conn.fetchrow(
            """
            INSERT INTO infrastructure_assets (asset_type, name, latitude, longitude, geom, properties)
            VALUES (
              'client_premise',
              $1,
              $2,
              $3,
              ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography,
              $4::jsonb
            )
            RETURNING id
            """,
            payload.full_name,
            payload.latitude,
            payload.longitude,
            json.dumps({"address": payload.address}),
        )
        premise_asset_id = premise["id"]

        client = await conn.fetchrow(
            """
            INSERT INTO crm_clients (
              full_name, phone, address, latitude, longitude, status, premise_asset_id, mst_asset_id,
              pppoe_username, pppoe_password, vlan_service_id, plan_name, plan_speed_mbps, olt_name, pon_port,
              onu_serial, rx_power_dbm, tx_power_dbm, notes
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8,
              $9, $10, $11, $12, $13, $14, $15,
              $16, $17, $18, $19
            )
            RETURNING id
            """,
            payload.full_name,
            payload.phone,
            payload.address,
            payload.latitude,
            payload.longitude,
            initial_status,
            premise_asset_id,
            payload.mst_asset_id,
            payload.pppoe_username,
            payload.pppoe_password,
            payload.vlan_service_id,
            payload.plan_name,
            payload.plan_speed_mbps,
            payload.olt_name,
            payload.pon_port,
            payload.onu_serial,
            payload.rx_power_dbm,
            payload.tx_power_dbm,
            payload.notes,
        )
        client_id = client["id"]

        await write_audit(
            conn,
            actor_user_id=current_user["id"],
            action_type="client_created",
            entity_type="crm_client",
            entity_id=client_id,
            latitude=payload.latitude,
            longitude=payload.longitude,
            after_state={
                "full_name": payload.full_name,
                "status": initial_status,
                "mst_asset_id": str(payload.mst_asset_id) if payload.mst_asset_id else None,
                "pppoe_username": payload.pppoe_username,
            },
        )

    client_payload = await fetch_client_by_id(conn, client_id)
    await hub.broadcast(
        "crm.client.created",
        {"client_id": str(client_id), "full_name": payload.full_name, "status": initial_status},
    )
    return JSONResponse(status_code=status.HTTP_201_CREATED, content=jsonable_encoder(client_payload))


@app.post("/api/crm/clients/{client_id}/activate")
async def activate_client(
    client_id: UUID,
    payload: ActivateClientRequest,
    conn: Connection = Depends(get_conn),
    current_user: dict[str, Any] = Depends(
        require_roles(RoleEnum.super_admin, RoleEnum.isp_admin, RoleEnum.field_engineer)
    ),
):
    async with conn.transaction():
        client = await conn.fetchrow(
            """
            SELECT *
            FROM crm_clients
            WHERE id = $1
            FOR UPDATE
            """,
            client_id,
        )
        if not client:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

        mst_asset_id = payload.mst_asset_id or client["mst_asset_id"]
        if not mst_asset_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Client activation blocked: MST must be selected first",
            )

        mst_exists = await conn.fetchval(
            """
            SELECT 1
            FROM mst_boxes
            WHERE asset_id = $1
            """,
            mst_asset_id,
        )
        if not mst_exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Selected MST does not exist")

        if client["status"] == "active":
            current_client = await fetch_client_by_id(conn, client_id)
            return JSONResponse(content=jsonable_encoder(current_client))

        port = None
        if payload.splitter_port_number is not None:
            preferred_port = await conn.fetchrow(
                """
                SELECT id, port_number, status
                FROM splitter_ports
                WHERE mst_asset_id = $1 AND port_number = $2
                FOR UPDATE
                """,
                mst_asset_id,
                payload.splitter_port_number,
            )
            if not preferred_port:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Splitter leg {payload.splitter_port_number} does not exist on selected MST",
                )
            if preferred_port["status"] != "free":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Splitter leg {payload.splitter_port_number} is not free",
                )
            port = preferred_port
        else:
            port = await conn.fetchrow(
                """
                SELECT id, port_number
                FROM splitter_ports
                WHERE mst_asset_id = $1 AND status = 'free'
                ORDER BY port_number ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
                """,
                mst_asset_id,
            )
        if not port:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No free splitter ports available on the selected MST",
            )

        drop_label = f"DROP-{client['pppoe_username']}"
        drop_cable = await conn.fetchrow(
            """
            WITH endpoints AS (
              SELECT
                mst.geom::geometry AS mst_geom,
                premise.geom::geometry AS premise_geom
              FROM infrastructure_assets mst
              JOIN infrastructure_assets premise ON premise.id = $2
              WHERE mst.id = $1
            )
            INSERT INTO fibre_cables (
              label, cable_type, core_count, start_asset_id, end_asset_id, geom, distance_m, created_by
            )
            SELECT
              $3, 'drop', 1, $1, $2,
              ST_MakeLine(mst_geom, premise_geom),
              ST_Length(ST_MakeLine(mst_geom, premise_geom)::geography),
              $4
            FROM endpoints
            RETURNING id, distance_m
            """,
            mst_asset_id,
            client["premise_asset_id"],
            drop_label,
            current_user["id"],
        )

        drop_core = await conn.fetchrow(
            """
            INSERT INTO fibre_cores (cable_id, core_number, color_name, status, owner_type, owner_id)
            VALUES ($1, 1, $2, 'used', 'client', $3)
            RETURNING id, color_name
            """,
            drop_cable["id"],
            core_color_name(1),
            client_id,
        )

        await conn.execute(
            """
            UPDATE splitter_ports
            SET status = 'used', core_id = $2, client_id = $3
            WHERE id = $1
            """,
            port["id"],
            drop_core["id"],
            client_id,
        )

        before_state = to_dict(client)
        await conn.execute(
            """
            UPDATE crm_clients
            SET
              status = 'active',
              mst_asset_id = $2,
              splitter_port_id = $3,
              drop_cable_id = $4,
              drop_core_id = $5,
              pppoe_status = 'offline',
              updated_at = NOW()
            WHERE id = $1
            """,
            client_id,
            mst_asset_id,
            port["id"],
            drop_cable["id"],
            drop_core["id"],
        )

        after_state = await fetch_client_by_id(conn, client_id)
        await write_audit(
            conn,
            actor_user_id=current_user["id"],
            action_type="client_activated",
            entity_type="crm_client",
            entity_id=client_id,
            before_state=before_state,
            after_state=after_state,
            metadata={
                "mst_asset_id": str(mst_asset_id),
                "splitter_port_id": str(port["id"]),
                "splitter_port_number": port["port_number"],
                "drop_cable_id": str(drop_cable["id"]),
                "drop_core_color": drop_core["color_name"],
                "drop_length_m": drop_cable["distance_m"],
            },
        )

    client_payload = await fetch_client_by_id(conn, client_id)
    await hub.broadcast(
        "crm.client.activated",
        {
            "client_id": str(client_id),
            "mst_asset_id": str(client_payload.get("mst_asset_id")),
            "splitter_port_id": str(client_payload.get("splitter_port_id")),
            "core_color": client_payload.get("core_color"),
        },
    )
    return JSONResponse(content=jsonable_encoder(client_payload))


@app.post("/api/crm/clients/{client_id}/suspend")
async def suspend_client(
    client_id: UUID,
    conn: Connection = Depends(get_conn),
    current_user: dict[str, Any] = Depends(require_roles(RoleEnum.super_admin, RoleEnum.isp_admin)),
):
    async with conn.transaction():
        existing = await conn.fetchrow("SELECT * FROM crm_clients WHERE id = $1 FOR UPDATE", client_id)
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

        await conn.execute(
            """
            UPDATE crm_clients
            SET status = 'suspended', pppoe_status = 'offline', updated_at = NOW()
            WHERE id = $1
            """,
            client_id,
        )

        await write_audit(
            conn,
            actor_user_id=current_user["id"],
            action_type="client_suspended",
            entity_type="crm_client",
            entity_id=client_id,
            before_state=to_dict(existing),
            after_state={"status": "suspended", "pppoe_status": "offline"},
        )

    client_payload = await fetch_client_by_id(conn, client_id)
    await hub.broadcast(
        "crm.client.suspended",
        {"client_id": str(client_id), "status": "suspended"},
    )
    return JSONResponse(content=jsonable_encoder(client_payload))


@app.delete("/api/crm/clients/{client_id}")
async def delete_client(
    client_id: UUID,
    conn: Connection = Depends(get_conn),
    current_user: dict[str, Any] = Depends(require_roles(RoleEnum.super_admin, RoleEnum.isp_admin)),
):
    premise_asset_id: UUID | None = None
    async with conn.transaction():
        existing = await conn.fetchrow(
            """
            SELECT *
            FROM crm_clients
            WHERE id = $1
            FOR UPDATE
            """,
            client_id,
        )
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

        premise_asset_id = existing["premise_asset_id"]
        splitter_port_id = existing["splitter_port_id"]
        drop_cable_id = existing["drop_cable_id"]

        if splitter_port_id:
            await conn.execute(
                """
                UPDATE splitter_ports
                SET status = 'free', core_id = NULL, client_id = NULL
                WHERE id = $1
                """,
                splitter_port_id,
            )

        if drop_cable_id:
            await conn.execute("DELETE FROM fibre_cables WHERE id = $1", drop_cable_id)

        await conn.execute("DELETE FROM crm_clients WHERE id = $1", client_id)
        if premise_asset_id:
            await conn.execute(
                """
                DELETE FROM infrastructure_assets
                WHERE id = $1 AND asset_type = 'client_premise'
                """,
                premise_asset_id,
            )

        await write_audit(
            conn,
            actor_user_id=current_user["id"],
            action_type="client_deleted",
            entity_type="crm_client",
            entity_id=client_id,
            before_state=to_dict(existing),
            metadata={
                "premise_asset_id": str(premise_asset_id) if premise_asset_id else None,
                "splitter_port_id": str(splitter_port_id) if splitter_port_id else None,
                "drop_cable_id": str(drop_cable_id) if drop_cable_id else None,
            },
        )

    await hub.broadcast(
        "crm.client.deleted",
        {
            "client_id": str(client_id),
            "premise_asset_id": str(premise_asset_id) if premise_asset_id else None,
        },
    )
    return JSONResponse(content={"ok": True, "client_id": str(client_id)})


@app.get("/api/crm/clients/{client_id}/map-path")
async def client_map_path(
    client_id: UUID,
    conn: Connection = Depends(get_conn),
    _current_user: dict[str, Any] = Depends(get_current_user),
):
    client = await fetch_client_by_id(conn, client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    drop_cable = None
    if client.get("drop_cable_id"):
        drop_row = await conn.fetchrow(
            """
            SELECT id, label, cable_type, distance_m, ST_AsGeoJSON(geom) AS geometry
            FROM fibre_cables
            WHERE id = $1
            """,
            client["drop_cable_id"],
        )
        if drop_row:
            drop_cable = to_dict(drop_row)
            drop_cable["geometry"] = parse_geojson(drop_row["geometry"])

    upstream: list[dict[str, Any]] = []
    if client.get("mst_asset_id"):
        upstream_rows = await conn.fetch(
            """
            SELECT id, label, cable_type, core_count, distance_m, ST_AsGeoJSON(geom) AS geometry
            FROM fibre_cables
            WHERE cable_type <> 'drop' AND (start_asset_id = $1 OR end_asset_id = $1)
            ORDER BY created_at DESC
            """,
            client["mst_asset_id"],
        )
        for row in upstream_rows:
            item = to_dict(row)
            item["geometry"] = parse_geojson(row["geometry"])
            upstream.append(item)

    payload = {
        "client": client,
        "mst": {
            "id": client.get("mst_asset_id"),
            "name": client.get("mst_name"),
            "latitude": client.get("mst_latitude"),
            "longitude": client.get("mst_longitude"),
        },
        "drop_cable": drop_cable,
        "upstream_cables": upstream,
        "core_color": client.get("core_color"),
        "splitter_port": client.get("port_number"),
    }
    return JSONResponse(content=jsonable_encoder(payload))


@app.post("/api/monitoring/clients/{client_id}")
async def update_monitoring_snapshot(
    client_id: UUID,
    payload: MonitoringUpdateRequest,
    conn: Connection = Depends(get_conn),
    current_user: dict[str, Any] = Depends(
        require_roles(RoleEnum.super_admin, RoleEnum.isp_admin, RoleEnum.noc_viewer)
    ),
):
    async with conn.transaction():
        existing = await conn.fetchrow(
            """
            SELECT *
            FROM crm_clients
            WHERE id = $1
            FOR UPDATE
            """,
            client_id,
        )
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

        await conn.execute(
            """
            UPDATE crm_clients
            SET
              pppoe_status = $2,
              rx_power_dbm = $3,
              tx_power_dbm = $4,
              uptime_seconds = COALESCE($5, uptime_seconds),
              last_seen = NOW(),
              updated_at = NOW()
            WHERE id = $1
            """,
            client_id,
            payload.pppoe_status.value,
            payload.rx_power_dbm,
            payload.tx_power_dbm,
            payload.uptime_seconds,
        )

        if payload.pppoe_status == PPPoEStatusEnum.offline:
            await create_alert_if_missing(
                conn,
                client_id=client_id,
                alert_type="offline_onu",
                severity="high",
                message="ONU is offline",
            )
        else:
            await close_alert(conn, client_id=client_id, alert_type="offline_onu")

        if payload.rx_power_dbm is not None and payload.rx_power_dbm < -25:
            await create_alert_if_missing(
                conn,
                client_id=client_id,
                alert_type="low_optical_power",
                severity="medium",
                message=f"Low optical power detected ({payload.rx_power_dbm} dBm)",
            )
        elif payload.rx_power_dbm is not None:
            await close_alert(conn, client_id=client_id, alert_type="low_optical_power")

        if payload.pppoe_status == PPPoEStatusEnum.offline and (payload.uptime_seconds or 0) < 300:
            await create_alert_if_missing(
                conn,
                client_id=client_id,
                alert_type="frequent_disconnect",
                severity="medium",
                message="Frequent disconnections detected in short interval",
            )

        current_state = await fetch_client_by_id(conn, client_id)
        await write_audit(
            conn,
            actor_user_id=current_user["id"],
            action_type="monitoring_updated",
            entity_type="crm_client",
            entity_id=client_id,
            before_state=to_dict(existing),
            after_state=current_state,
        )

    await hub.broadcast(
        "monitoring.client.updated",
        {
            "client_id": str(client_id),
            "pppoe_status": payload.pppoe_status.value,
            "rx_power_dbm": payload.rx_power_dbm,
            "tx_power_dbm": payload.tx_power_dbm,
        },
    )
    return JSONResponse(content=jsonable_encoder(current_state))


@app.get("/api/monitoring/alerts")
async def list_alerts(
    open_only: bool = Query(True),
    conn: Connection = Depends(get_conn),
    _current_user: dict[str, Any] = Depends(get_current_user),
):
    alerts = await fetch_alerts(conn, open_only=open_only)
    return JSONResponse(content=jsonable_encoder(alerts))


@app.get("/api/activity/logs")
async def list_activity_logs(
    limit: int = Query(150, ge=1, le=500),
    conn: Connection = Depends(get_conn),
    _current_user: dict[str, Any] = Depends(get_current_user),
):
    logs = await fetch_logs(conn, limit=limit)
    return JSONResponse(content=jsonable_encoder(logs))


@app.get("/api/activity/splices")
async def list_splices(
    limit: int = Query(100, ge=1, le=300),
    conn: Connection = Depends(get_conn),
    _current_user: dict[str, Any] = Depends(get_current_user),
):
    splices = await fetch_splices(conn, limit=limit)
    return JSONResponse(content=jsonable_encoder(splices))


@app.post("/api/activity/field-events")
async def create_field_event(
    payload: FieldEventCreateRequest,
    conn: Connection = Depends(get_conn),
    current_user: dict[str, Any] = Depends(
        require_roles(RoleEnum.super_admin, RoleEnum.isp_admin, RoleEnum.field_engineer)
    ),
):
    latitude = None
    longitude = None

    if payload.asset_id:
        asset_row = await conn.fetchrow(
            """
            SELECT latitude, longitude
            FROM infrastructure_assets
            WHERE id = $1
            """,
            payload.asset_id,
        )
        if asset_row:
            latitude = asset_row["latitude"]
            longitude = asset_row["longitude"]

    entity_id = payload.asset_id or payload.client_id or payload.cable_id
    entity_type = "field_event"
    if payload.asset_id:
        entity_type = "infrastructure_asset"
    elif payload.client_id:
        entity_type = "crm_client"
    elif payload.cable_id:
        entity_type = "fibre_cable"

    async with conn.transaction():
        await write_audit(
            conn,
            actor_user_id=current_user["id"],
            action_type=payload.action_type.value,
            entity_type=entity_type,
            entity_id=entity_id,
            latitude=latitude,
            longitude=longitude,
            before_state=payload.before_state,
            after_state=payload.after_state,
            metadata={
                "notes": payload.notes,
                "photo_urls": payload.photo_urls,
                "asset_id": str(payload.asset_id) if payload.asset_id else None,
                "client_id": str(payload.client_id) if payload.client_id else None,
                "cable_id": str(payload.cable_id) if payload.cable_id else None,
                "recorded_by": current_user["full_name"],
            },
        )

    await hub.broadcast(
        "activity.field_event.created",
        {
            "action_type": payload.action_type.value,
            "recorded_by": current_user["full_name"],
            "asset_id": str(payload.asset_id) if payload.asset_id else None,
            "client_id": str(payload.client_id) if payload.client_id else None,
            "cable_id": str(payload.cable_id) if payload.cable_id else None,
        },
    )
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=jsonable_encoder({"ok": True, "message": "Field activity recorded"}),
    )


@app.post("/api/admin/users")
async def create_user(
    payload: UserCreateRequest,
    conn: Connection = Depends(get_conn),
    current_user: dict[str, Any] = Depends(require_roles(RoleEnum.super_admin)),
):
    async with conn.transaction():
        existing = await conn.fetchval("SELECT 1 FROM users WHERE LOWER(email) = $1", payload.email.lower())
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")

        user = await conn.fetchrow(
            """
            INSERT INTO users (full_name, email, password_hash, role)
            VALUES ($1, $2, $3, $4)
            RETURNING id, full_name, email, role, created_at
            """,
            payload.full_name,
            payload.email.lower(),
            hash_password(payload.password),
            payload.role.value,
        )

        await write_audit(
            conn,
            actor_user_id=current_user["id"],
            action_type="user_created",
            entity_type="user",
            entity_id=user["id"],
            after_state={"email": payload.email.lower(), "role": payload.role.value},
        )

    await hub.broadcast(
        "admin.user.created",
        {"user_id": str(user["id"]), "email": user["email"], "role": user["role"]},
    )
    return JSONResponse(status_code=status.HTTP_201_CREATED, content=jsonable_encoder(to_dict(user)))


@app.websocket("/ws/updates")
async def websocket_updates(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008, reason="Missing token")
        return

    try:
        payload = decode_access_token(token)
    except ValueError:
        await websocket.close(code=1008, reason="Invalid token")
        return

    user_id = payload.get("sub")
    if not user_id:
        await websocket.close(code=1008, reason="Invalid token subject")
        return

    await hub.connect(websocket)
    await websocket.send_json(
        {
            "event": "ws.connected",
            "payload": {
                "user_id": user_id,
                "server_time": datetime.now(timezone.utc).isoformat(),
            },
        }
    )

    try:
        while True:
            message = await websocket.receive_text()
            if message == "ping":
                await websocket.send_json({"event": "ws.pong", "payload": {"ts": datetime.now(timezone.utc).isoformat()}})
    except WebSocketDisconnect:
        hub.disconnect(websocket)
