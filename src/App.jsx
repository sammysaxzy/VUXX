import { useCallback, useEffect, useMemo, useState } from "react";
import ActivityTab from "./components/ActivityTab.jsx";
import CrmTab from "./components/CrmTab.jsx";
import DashboardTab from "./components/DashboardTab.jsx";
import LoginScreen from "./components/LoginScreen.jsx";
import MapTab from "./components/MapTab.jsx";
import MonitoringTab from "./components/MonitoringTab.jsx";
import {
  WS_BASE,
  activateClient,
  createFieldEvent,
  createAsset,
  createCable,
  createClient,
  deleteClient,
  createSplice,
  assignOltPort,
  fetchAssetColorFlow,
  fetchBootstrap,
  fetchCableCores,
  fetchCableUsage,
  fetchClientMapPath,
  fetchMstCapacity,
  fetchOltPorts,
  fetchMapObjectLink,
  login,
  setAuthToken,
  suspendClient,
  updateCoreStatus,
  updateAssetPosition,
  updateMonitoring
} from "./services/api.js";

const STORAGE_KEY = "isp_ops_session";

const tabs = [
  { id: "dashboard", label: "Dashboard" },
  { id: "map", label: "Network Map" },
  { id: "crm", label: "Client CRM" },
  { id: "monitoring", label: "Outages" },
  { id: "activity", label: "Field Dispatch" }
];

function loadStoredSession() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractClientAssetIds(details) {
  if (!details || typeof details !== "object") return [];
  const ids = new Set();
  const addId = (value) => {
    if (typeof value === "string" && value) ids.add(value);
  };

  if (Array.isArray(details.clients)) {
    details.clients.forEach((client) => {
      addId(client?.premise_asset_id);
    });
  }
  if (details.client) {
    addId(details.client.premise_asset_id);
  }

  return Array.from(ids);
}

export default function App() {
  const [session, setSession] = useState(loadStoredSession);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [authError, setAuthError] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loadingData, setLoadingData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");

  const [assets, setAssets] = useState([]);
  const [cables, setCables] = useState([]);
  const [clients, setClients] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [splices, setSplices] = useState([]);

  const [selectedAsset, setSelectedAsset] = useState(null);
  const [selectedCable, setSelectedCable] = useState(null);
  const [cableCores, setCableCores] = useState([]);
  const [cableUsage, setCableUsage] = useState(null);
  const [mapObjectDetails, setMapObjectDetails] = useState(null);
  const [selectedMstCapacity, setSelectedMstCapacity] = useState(null);
  const [selectedOltPorts, setSelectedOltPorts] = useState(null);
  const [selectedColorFlow, setSelectedColorFlow] = useState(null);
  const [selectedClientPath, setSelectedClientPath] = useState(null);
  const [selectedClientAssetIds, setSelectedClientAssetIds] = useState([]);
  const [mapFocusPoint, setMapFocusPoint] = useState(null);

  const mstAssets = useMemo(() => assets.filter((asset) => asset.asset_type === "mst"), [assets]);

  const loadAll = useCallback(async () => {
    setLoadingData(true);
    try {
      const data = await fetchBootstrap();
      setAssets(data.assets || []);
      setCables(data.cables || []);
      setClients(data.clients || []);
      setAlerts(data.alerts || []);
      setLogs(data.logs || []);
      setSplices(data.splices || []);
    } catch (error) {
      setFlash(error.message);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (!session?.token) return;
    setAuthToken(session.token);
    void loadAll();
  }, [session, loadAll]);

  useEffect(() => {
    if (!session?.token) return;
    const ws = new WebSocket(`${WS_BASE}/ws/updates?token=${encodeURIComponent(session.token)}`);
    const pingTimer = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send("ping");
    }, 25000);
    ws.onmessage = () => {
      void loadAll();
    };
    return () => {
      window.clearInterval(pingTimer);
      ws.close();
    };
  }, [session, loadAll]);

  async function handleLogin(payload) {
    setLoadingAuth(true);
    setAuthError("");
    try {
      const data = await login(payload);
      setSession(data);
      setAuthToken(data.token);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setLoadingAuth(false);
    }
  }

  function handleLogout() {
    setSession(null);
    setAuthToken(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }

  async function runAction(action, successText) {
    setBusy(true);
    setFlash("");
    let success = false;
    try {
      await action();
      success = true;
      setFlash(successText);
      try {
        await loadAll();
      } catch (refreshError) {
        setFlash(`${successText}. Refresh warning: ${refreshError.message}`);
      }
    } catch (error) {
      setFlash(error.message);
    } finally {
      setBusy(false);
    }
    return success;
  }

  async function handleCreateCable(payload) {
    setBusy(true);
    setFlash("");
    try {
      const cable = await createCable(payload);
      if (cable?.id) {
        setCables((prev) => [cable, ...prev.filter((item) => item.id !== cable.id)]);
      }
      setFlash("Fibre cable installed");
      try {
        await loadAll();
      } catch (refreshError) {
        setFlash(`Fibre cable installed. Refresh warning: ${refreshError.message}`);
      }
      return true;
    } catch (error) {
      setFlash(error.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectAsset(asset) {
    setSelectedAsset(asset);
    setMapFocusPoint({ lat: asset.latitude, lng: asset.longitude, zoom: 19 });
    try {
      const detailsPromise = fetchMapObjectLink(asset.id);
      const mstPromise = asset.asset_type === "mst" ? fetchMstCapacity(asset.id) : Promise.resolve(null);
      const oltPromise = asset.asset_type === "olt" ? fetchOltPorts(asset.id) : Promise.resolve(null);
      const colorFlowPromise = fetchAssetColorFlow(asset.id);
      const [details, mstCapacity, oltPorts, colorFlow] = await Promise.all([
        detailsPromise,
        mstPromise,
        oltPromise,
        colorFlowPromise
      ]);
      setMapObjectDetails(details);
      setSelectedMstCapacity(mstCapacity);
      setSelectedOltPorts(oltPorts);
      setSelectedColorFlow(colorFlow);
      setSelectedClientAssetIds(extractClientAssetIds(details));
    } catch (error) {
      setFlash(error.message);
    }
  }

  async function handleSelectCable(cable) {
    setSelectedCable(cable);
    try {
      const [cores, usage] = await Promise.all([fetchCableCores(cable.id), fetchCableUsage(cable.id)]);
      setCableCores(cores);
      setCableUsage(usage);
      return usage;
    } catch (error) {
      setFlash(error.message);
      return null;
    }
  }

  async function handleSelectClient(client) {
    setMapFocusPoint({ lat: client.latitude, lng: client.longitude, zoom: 19 });
    setSelectedClientAssetIds(client.premise_asset_id ? [client.premise_asset_id] : []);
    try {
      const path = await fetchClientMapPath(client.id);
      setSelectedClientPath(path);
      if (path?.mst?.id) {
        const mst = assets.find((asset) => asset.id === path.mst.id);
        if (mst) setSelectedAsset(mst);
      }
    } catch (error) {
      setFlash(error.message);
    }
  }

  function handleManualMapFocus(lat, lng, zoom = 18) {
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
    setMapFocusPoint({ lat: Number(lat), lng: Number(lng), zoom });
  }

  async function handleCreateClientFromMap(payload, mstAssetId, splitterPortNumber = null) {
    const isMstTarget = typeof mstAssetId === "string" && mstAssetId.length > 0;
    await runAction(
      async () => {
        const created = await createClient(payload);
        if (isMstTarget) {
          await activateClient(created.id, mstAssetId, splitterPortNumber);
        }
      },
      isMstTarget ? "Client added from map and activated on selected MST" : "Client added from map"
    );
    if (isMstTarget && selectedAsset?.id === mstAssetId) {
      await handleSelectAsset(selectedAsset);
    }
  }

  async function handleDeleteClientFromMap(clientId) {
    await runAction(() => deleteClient(clientId), "Client deleted from map and CRM");
    if (selectedAsset && selectedAsset.asset_type !== "client_premise") {
      await handleSelectAsset(selectedAsset);
    }
  }

  if (!session?.token) {
    return <LoginScreen onLogin={handleLogin} loading={loadingAuth} error={authError} />;
  }

  return (
    <div className="app-root">
      <header className="top-shell">
        <div className="brand-nav">
          <div className="brand-block">
            <span className="brand-mark">✶</span>
            <div>
              <p className="eyebrow">ISP Ops</p>
              <h1>Control Center</h1>
            </div>
          </div>
          <nav className="top-actions">
            {tabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? "active" : ""}>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="top-right-tools">
          <input
            className="global-search"
            placeholder="Search OLT, MST, Client..."
            value={globalSearch}
            onChange={(event) => setGlobalSearch(event.target.value)}
          />
          <button type="button" className="icon-btn">
            🔔
          </button>
          <button type="button" className="icon-btn">
            ⚙
          </button>
          <button type="button" onClick={() => void loadAll()}>
            Refresh
          </button>
          <button type="button" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </header>

      {flash && <p className="flash-text">{flash}</p>}
      {loadingData && <p className="flash-text">Loading latest data...</p>}

      {activeTab === "dashboard" && (
        <DashboardTab
          assets={assets}
          cables={cables}
          clients={clients}
          alerts={alerts}
          logs={logs}
          onOpenMap={() => setActiveTab("map")}
          onOpenCrm={() => setActiveTab("crm")}
        />
      )}

      {activeTab === "map" && (
        <MapTab
          assets={assets}
          cables={cables}
          clients={clients}
          alerts={alerts}
          logs={logs}
          cableCores={cableCores}
          selectedAsset={selectedAsset}
          selectedCable={selectedCable}
          mapObjectDetails={mapObjectDetails}
          cableUsage={cableUsage}
          selectedMstCapacity={selectedMstCapacity}
          selectedOltPorts={selectedOltPorts}
          selectedColorFlow={selectedColorFlow}
          selectedClientPath={selectedClientPath}
          selectedClientAssetIds={selectedClientAssetIds}
          mapFocusPoint={mapFocusPoint}
          busy={busy}
          onManualMapFocus={handleManualMapFocus}
          onSelectAsset={handleSelectAsset}
          onSelectCable={handleSelectCable}
          onCreateAsset={(payload) => runAction(() => createAsset(payload), "Asset added to map")}
          onCreateCable={handleCreateCable}
          onCreateSplice={(payload) => runAction(() => createSplice(payload), "Splice saved")}
          onCreateClientFromMap={handleCreateClientFromMap}
          onDeleteClientFromMap={handleDeleteClientFromMap}
          onUpdateCore={(coreId, payload) => runAction(() => updateCoreStatus(coreId, payload), "Core status updated")}
          onUpdateAssetPosition={(assetId, payload) =>
            runAction(() => updateAssetPosition(assetId, payload), "Asset position updated")
          }
          onAssignOltPort={(oltAssetId, portNumber, payload) =>
            runAction(() => assignOltPort(oltAssetId, portNumber, payload), "OLT port updated")
          }
        />
      )}

      {activeTab === "crm" && (
        <CrmTab
          clients={clients}
          mstAssets={mstAssets}
          assets={assets}
          cables={cables}
          selectedClientPath={selectedClientPath}
          mapFocusPoint={mapFocusPoint}
          selectedClientAssetIds={selectedClientAssetIds}
          busy={busy}
          onCreateClient={(payload) => runAction(() => createClient(payload), "Client created in CRM and map")}
          onActivateClient={(clientId, mstId) => runAction(() => activateClient(clientId, mstId), "Client activated")}
          onSuspendClient={(clientId) => runAction(() => suspendClient(clientId), "Client suspended")}
          onDeleteClient={(clientId) => handleDeleteClientFromMap(clientId)}
          onOpenMapPath={handleSelectClient}
        />
      )}

      {activeTab === "monitoring" && (
        <MonitoringTab
          clients={clients}
          alerts={alerts}
          busy={busy}
          onUpdateMonitoring={(clientId, payload) =>
            runAction(() => updateMonitoring(clientId, payload), "Monitoring data updated")
          }
          onOpenMapPath={handleSelectClient}
        />
      )}

      {activeTab === "activity" && (
        <ActivityTab
          logs={logs}
          splices={splices}
          assets={assets}
          clients={clients}
          cables={cables}
          busy={busy}
          onCreateFieldEvent={(payload) => runAction(() => createFieldEvent(payload), "Field activity recorded")}
        />
      )}
    </div>
  );
}
