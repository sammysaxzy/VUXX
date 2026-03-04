CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'isp_admin', 'field_engineer', 'noc_viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS infrastructure_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type TEXT NOT NULL CHECK (
    asset_type IN ('mst', 'fat', 'fdb', 'pole', 'manhole', 'olt', 'splice_closure', 'client_premise')
  ),
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  geom GEOGRAPHY(POINT, 4326) NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mst_boxes (
  asset_id UUID PRIMARY KEY REFERENCES infrastructure_assets(id) ON DELETE CASCADE,
  mst_code TEXT NOT NULL UNIQUE,
  splitter_type TEXT NOT NULL CHECK (splitter_type IN ('1/2', '1/4', '1/8', '1/16')),
  total_ports INTEGER NOT NULL CHECK (total_ports > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fibre_cables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  cable_type TEXT NOT NULL CHECK (cable_type IN ('aerial', 'underground', 'drop')),
  core_count INTEGER NOT NULL CHECK (core_count IN (1, 2, 4, 8, 12, 24, 48)),
  start_asset_id UUID NOT NULL REFERENCES infrastructure_assets(id) ON DELETE CASCADE,
  end_asset_id UUID NOT NULL REFERENCES infrastructure_assets(id) ON DELETE CASCADE,
  geom GEOMETRY(LINESTRING, 4326) NOT NULL,
  distance_m DOUBLE PRECISION NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fibre_cores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cable_id UUID NOT NULL REFERENCES fibre_cables(id) ON DELETE CASCADE,
  core_number INTEGER NOT NULL CHECK (core_number > 0),
  color_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('free', 'used', 'faulty', 'reserved')) DEFAULT 'free',
  owner_type TEXT NOT NULL CHECK (owner_type IN ('none', 'mst', 'client')) DEFAULT 'none',
  owner_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cable_id, core_number),
  CHECK (
    (status = 'free' AND owner_type = 'none' AND owner_id IS NULL)
    OR status IN ('used', 'faulty', 'reserved')
  )
);

CREATE TABLE IF NOT EXISTS splitter_ports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mst_asset_id UUID NOT NULL REFERENCES mst_boxes(asset_id) ON DELETE CASCADE,
  port_number INTEGER NOT NULL CHECK (port_number > 0),
  status TEXT NOT NULL CHECK (status IN ('free', 'used', 'reserved', 'faulty')) DEFAULT 'free',
  core_id UUID,
  client_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mst_asset_id, port_number)
);

CREATE TABLE IF NOT EXISTS olt_ports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  olt_asset_id UUID NOT NULL REFERENCES infrastructure_assets(id) ON DELETE CASCADE,
  port_number INTEGER NOT NULL CHECK (port_number > 0),
  status TEXT NOT NULL CHECK (status IN ('free', 'used', 'reserved', 'faulty')) DEFAULT 'free',
  cable_id UUID REFERENCES fibre_cables(id) ON DELETE SET NULL,
  core_id UUID REFERENCES fibre_cores(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (olt_asset_id, port_number)
);

CREATE TABLE IF NOT EXISTS crm_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'suspended')) DEFAULT 'pending',
  premise_asset_id UUID NOT NULL UNIQUE REFERENCES infrastructure_assets(id) ON DELETE CASCADE,
  mst_asset_id UUID REFERENCES mst_boxes(asset_id) ON DELETE SET NULL,
  splitter_port_id UUID REFERENCES splitter_ports(id) ON DELETE SET NULL,
  drop_cable_id UUID REFERENCES fibre_cables(id) ON DELETE SET NULL,
  drop_core_id UUID REFERENCES fibre_cores(id) ON DELETE SET NULL,
  pppoe_username TEXT NOT NULL UNIQUE,
  pppoe_password TEXT NOT NULL,
  vlan_service_id TEXT,
  plan_name TEXT NOT NULL,
  plan_speed_mbps INTEGER NOT NULL CHECK (plan_speed_mbps > 0),
  olt_name TEXT NOT NULL,
  pon_port TEXT NOT NULL,
  onu_serial TEXT NOT NULL,
  rx_power_dbm DOUBLE PRECISION,
  tx_power_dbm DOUBLE PRECISION,
  pppoe_status TEXT NOT NULL CHECK (pppoe_status IN ('online', 'offline', 'unknown')) DEFAULT 'unknown',
  last_seen TIMESTAMPTZ,
  uptime_seconds BIGINT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS splice_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_asset_id UUID REFERENCES infrastructure_assets(id) ON DELETE SET NULL,
  from_core_id UUID NOT NULL REFERENCES fibre_cores(id) ON DELETE CASCADE,
  to_core_id UUID NOT NULL REFERENCES fibre_cores(id) ON DELETE CASCADE,
  engineer_name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS network_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES crm_clients(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message TEXT NOT NULL,
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_geom ON infrastructure_assets USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_assets_type ON infrastructure_assets (asset_type);
CREATE INDEX IF NOT EXISTS idx_fibre_geom ON fibre_cables USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_fibre_start_end ON fibre_cables (start_asset_id, end_asset_id);
CREATE INDEX IF NOT EXISTS idx_ports_mst_status ON splitter_ports (mst_asset_id, status);
CREATE INDEX IF NOT EXISTS idx_ports_olt_status ON olt_ports (olt_asset_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_status ON crm_clients (status);
CREATE INDEX IF NOT EXISTS idx_clients_mst ON crm_clients (mst_asset_id);
CREATE INDEX IF NOT EXISTS idx_alerts_open ON network_alerts (is_open, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON audit_logs (created_at DESC);
