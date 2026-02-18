CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  company_slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  theme_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'isp_admin', 'field_engineer', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS infra_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('mst', 'closure', 'distribution', 'client', 'splitter')),
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned', 'installed', 'active', 'faulty', 'maintenance')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_node_id UUID NOT NULL REFERENCES infra_nodes(id) ON DELETE RESTRICT,
  end_node_id UUID NOT NULL REFERENCES infra_nodes(id) ON DELETE RESTRICT,
  core_count INTEGER NOT NULL CHECK (core_count > 0),
  status TEXT NOT NULL CHECK (status IN ('planned', 'installed', 'active', 'faulty', 'maintenance')),
  path_geojson JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cable_cores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cable_id UUID NOT NULL REFERENCES cables(id) ON DELETE CASCADE,
  core_number INTEGER NOT NULL CHECK (core_number > 0),
  color TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('free', 'used', 'reserved', 'faulty')),
  UNIQUE (cable_id, core_number)
);

CREATE TABLE IF NOT EXISTS splitters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES infra_nodes(id) ON DELETE CASCADE,
  ratio_in INTEGER NOT NULL DEFAULT 1,
  ratio_out INTEGER NOT NULL CHECK (ratio_out IN (2, 4, 8, 16)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS splitter_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  splitter_id UUID NOT NULL REFERENCES splitters(id) ON DELETE CASCADE,
  leg_number INTEGER NOT NULL CHECK (leg_number > 0),
  assigned_core_id UUID REFERENCES cable_cores(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('free', 'used', 'reserved', 'faulty')) DEFAULT 'free',
  UNIQUE (splitter_id, leg_number)
);

CREATE TABLE IF NOT EXISTS core_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  core_id UUID NOT NULL REFERENCES cable_cores(id) ON DELETE CASCADE,
  from_node_id UUID REFERENCES infra_nodes(id) ON DELETE SET NULL,
  to_node_id UUID REFERENCES infra_nodes(id) ON DELETE SET NULL,
  purpose TEXT NOT NULL DEFAULT 'distribution',
  status TEXT NOT NULL CHECK (status IN ('active', 'reserved', 'released')) DEFAULT 'active',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_core_active_allocation
ON core_allocations(core_id)
WHERE status IN ('active', 'reserved');

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  mst_node_id UUID REFERENCES infra_nodes(id) ON DELETE SET NULL,
  splitter_leg_id UUID REFERENCES splitter_legs(id) ON DELETE SET NULL,
  core_id UUID REFERENCES cable_cores(id) ON DELETE SET NULL,
  install_status TEXT NOT NULL DEFAULT 'planned' CHECK (install_status IN ('planned', 'installed', 'active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fault_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('node', 'cable', 'core', 'splitter', 'customer')),
  target_id UUID NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved')) DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);
