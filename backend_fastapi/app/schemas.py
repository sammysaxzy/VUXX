from __future__ import annotations

from enum import Enum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator


class RoleEnum(str, Enum):
    super_admin = "super_admin"
    isp_admin = "isp_admin"
    field_engineer = "field_engineer"
    noc_viewer = "noc_viewer"


class AssetTypeEnum(str, Enum):
    mst = "mst"
    fat = "fat"
    fdb = "fdb"
    pole = "pole"
    manhole = "manhole"
    olt = "olt"
    splice_closure = "splice_closure"
    client_premise = "client_premise"


class SplitterTypeEnum(str, Enum):
    one_by_2 = "1/2"
    one_by_4 = "1/4"
    one_by_8 = "1/8"
    one_by_16 = "1/16"


class CableTypeEnum(str, Enum):
    aerial = "aerial"
    underground = "underground"
    drop = "drop"


class CoreStatusEnum(str, Enum):
    free = "free"
    used = "used"
    faulty = "faulty"
    reserved = "reserved"


class CoreOwnerTypeEnum(str, Enum):
    none = "none"
    mst = "mst"
    client = "client"


class PPPoEStatusEnum(str, Enum):
    online = "online"
    offline = "offline"
    unknown = "unknown"


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)


class UserCreateRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: RoleEnum


class AssetCreateRequest(BaseModel):
    asset_type: AssetTypeEnum
    name: str = Field(min_length=2, max_length=120)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    properties: dict[str, Any] = Field(default_factory=dict)
    mst_code: str | None = Field(default=None, max_length=80)
    splitter_type: SplitterTypeEnum | None = None
    olt_port_count: int | None = Field(default=None, ge=1, le=4096)

    @model_validator(mode="after")
    def validate_mst_fields(self):
        if self.asset_type == AssetTypeEnum.mst:
            if not self.splitter_type:
                raise ValueError("splitter_type is required for MST assets")
        if self.asset_type == AssetTypeEnum.olt and self.olt_port_count is None:
            raise ValueError("olt_port_count is required for OLT assets")
        return self


class AssetPositionUpdateRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class CableCreateRequest(BaseModel):
    label: str = Field(min_length=2, max_length=120)
    cable_type: CableTypeEnum
    core_count: Literal[1, 2, 4, 8, 12, 24, 48]
    start_asset_id: UUID
    end_asset_id: UUID
    path_coordinates: list[tuple[float, float]] | None = None

    @model_validator(mode="after")
    def validate_points(self):
        if self.start_asset_id == self.end_asset_id:
            raise ValueError("start_asset_id and end_asset_id cannot be the same")
        if self.path_coordinates is not None and len(self.path_coordinates) < 2:
            raise ValueError("path_coordinates must include at least 2 points")
        return self


class CoreStatusUpdateRequest(BaseModel):
    status: CoreStatusEnum
    owner_type: CoreOwnerTypeEnum = CoreOwnerTypeEnum.none
    owner_id: UUID | None = None


class SpliceCreateRequest(BaseModel):
    from_core_id: UUID
    to_core_id: UUID
    location_asset_id: UUID | None = None
    engineer_name: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_core_refs(self):
        if self.from_core_id == self.to_core_id:
            raise ValueError("from_core_id and to_core_id must be different")
        return self


class ClientCreateRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    address: str = Field(min_length=3, max_length=240)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    status: Literal["pending", "active", "suspended"] = "pending"
    mst_asset_id: UUID | None = None
    pppoe_username: str = Field(min_length=3, max_length=120)
    pppoe_password: str = Field(min_length=3, max_length=120)
    vlan_service_id: str | None = Field(default=None, max_length=80)
    plan_name: str = Field(min_length=2, max_length=120)
    plan_speed_mbps: int = Field(ge=1, le=100000)
    olt_name: str = Field(min_length=2, max_length=120)
    pon_port: str = Field(min_length=1, max_length=80)
    onu_serial: str = Field(min_length=3, max_length=120)
    rx_power_dbm: float | None = None
    tx_power_dbm: float | None = None
    notes: str | None = Field(default=None, max_length=500)


class ActivateClientRequest(BaseModel):
    mst_asset_id: UUID | None = None
    splitter_port_number: int | None = Field(default=None, ge=1)


class MonitoringUpdateRequest(BaseModel):
    pppoe_status: PPPoEStatusEnum
    rx_power_dbm: float | None = None
    tx_power_dbm: float | None = None
    uptime_seconds: int | None = Field(default=None, ge=0)


class FieldActionEnum(str, Enum):
    fibre_installed = "fibre_installed"
    core_spliced = "core_spliced"
    client_connected = "client_connected"
    client_suspended = "client_suspended"
    mst_modified = "mst_modified"
    mst_added = "mst_added"
    mst_removed = "mst_removed"
    splitter_replaced = "splitter_replaced"
    cable_rerouted = "cable_rerouted"
    fault_reported = "fault_reported"
    fault_resolved = "fault_resolved"
    fibre_cut_reported = "fibre_cut_reported"
    fibre_cut_resolved = "fibre_cut_resolved"
    maintenance_started = "maintenance_started"
    maintenance_completed = "maintenance_completed"
    network_upgraded = "network_upgraded"


class FieldEventCreateRequest(BaseModel):
    action_type: FieldActionEnum
    asset_id: UUID | None = None
    client_id: UUID | None = None
    cable_id: UUID | None = None
    notes: str = Field(min_length=3, max_length=500)
    photo_urls: list[str] = Field(default_factory=list)
    before_state: dict[str, Any] = Field(default_factory=dict)
    after_state: dict[str, Any] = Field(default_factory=dict)


class OltPortAssignRequest(BaseModel):
    core_id: UUID | None = None
    cable_id: UUID | None = None
    status: Literal["free", "used", "reserved", "faulty"] = "used"
    notes: str | None = Field(default=None, max_length=500)
