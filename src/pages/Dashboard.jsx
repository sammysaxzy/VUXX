import Sidebar from "../components/Sidebar.jsx";
import StatsCards from "../components/StatsCards.jsx";
import MapPanel from "../components/MapPanel.jsx";
import LiveLogs from "../components/LiveLogs.jsx";
import RadiusPanel from "../components/RadiusPanel.jsx";
import { useNocState } from "../context/NocContext.jsx";

export default function Dashboard() {
  const { metrics, nodes, fiberRoutes, logs, radiusSessions, refreshRadiusSessions } = useNocState();

  return (
    <section className="dashboard-grid">
      <Sidebar />
      <div className="dashboard-main">
        <StatsCards metrics={metrics} />
        <MapPanel nodes={nodes} fiberRoutes={fiberRoutes} />
        <RadiusPanel sessions={radiusSessions} onRefresh={refreshRadiusSessions} />
        <LiveLogs logs={logs} />
      </div>
    </section>
  );
}
