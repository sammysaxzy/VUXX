import RadiusPanel from "../components/RadiusPanel.jsx";
import { useNocState } from "../context/NocContext.jsx";

export default function RadiusPage() {
  const { radiusSessions, refreshRadiusSessions } = useNocState();

  return (
    <section className="module radius-page">
      <header className="module-header">
        <div>
          <h2>RADIUS Monitoring</h2>
          <p className="muted">Session health independent from CRM.</p>
        </div>
      </header>
      <RadiusPanel sessions={radiusSessions} onRefresh={refreshRadiusSessions} />
    </section>
  );
}
