from __future__ import annotations

import os
from pathlib import Path

import asyncpg
from asyncpg.pool import Pool

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/isp_ops")

_pool: Pool | None = None


async def init_pool() -> None:
    global _pool
    if _pool is not None:
        return
    _pool = await asyncpg.create_pool(
        dsn=DATABASE_URL,
        min_size=1,
        max_size=10,
        command_timeout=30,
    )
    await apply_schema()


async def close_pool() -> None:
    global _pool
    if _pool is None:
        return
    await _pool.close()
    _pool = None


async def get_pool() -> Pool:
    if _pool is None:
        raise RuntimeError("Database pool is not initialized")
    return _pool


async def get_conn():
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn


async def apply_schema() -> None:
    pool = await get_pool()
    schema_path = Path(__file__).resolve().parents[1] / "sql" / "schema.sql"
    schema_sql = schema_path.read_text(encoding="utf-8")
    async with pool.acquire() as conn:
        await conn.execute(schema_sql)
