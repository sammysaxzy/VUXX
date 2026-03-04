import { NavLink } from "react-router-dom";

const rackRows = [
  {
    label: "RU-01 BACKBONE FEED",
    duplex: "LC/APC Duplex",
    cells: Array.from({ length: 24 }, () => "backbone")
  },
  {
    label: "RU-02 SECTOR A-NORTH",
    duplex: "LC/UPC Duplex",
    cells: [...Array.from({ length: 18 }, () => "distribution"), ...Array.from({ length: 6 }, () => "unused")]
  },
  {
    label: "RU-03 SECTOR B-EAST",
    duplex: "LC/UPC Duplex",
    cells: [...Array.from({ length: 6 }, () => "distribution-dark"), ...Array.from({ length: 18 }, () => "unused")]
  }
];

const trayRows = [
  { name: "Tray 01 (Feeder)", status: "FULL", progress: 100, note: "48/48 SPLICED", tail: "100%" },
  { name: "Tray 02 (Dist)", status: "ACTIVE", progress: 75, note: "36/48 SPLICED", tail: "12 Free" },
  { name: "Tray 03 (Spare)", status: "READY", progress: 0, note: "0/48 SPLICED", tail: "48 Free" }
];

const logs = [
  {
    title: "Quarterly Inspection",
    note: "Cleaned port 24-36, replaced intake filter.",
    meta: "Oct 12, 2023 · Tech: Marcus R."
  },
  {
    title: "Splicing Extension",
    note: "Added 12 cores to Sector B distribution.",
    meta: "Aug 05, 2023 · Tech: Sarah L."
  },
  {
    title: "Cabinet Commissioned",
    note: "",
    meta: "Jan 10, 2023 · Tech: Admin"
  }
];

const portCards = [
  { name: "SECTOR NORTH", core: "48-Core", state: "linked" },
  { name: "SECTOR EAST", core: "24-Core", state: "linked" },
  { name: "SECTOR WEST", core: "24-Core", state: "linked" },
  { name: "SPARE PORT", core: "Available", state: "empty" }
];

export default function Dashboard() {
  return (
    <section className="hub-layout">
      <header className="hub-topbar">
        <div className="hub-brand">
          <div className="hub-brand-icon" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
          <h1>ISP Network Manager</h1>
        </div>

        <label className="hub-search">
          <span>Q</span>
          <input type="text" placeholder="Search hubs, customers, or ODCs..." />
        </label>

        <nav className="hub-nav">
          <NavLink to="/dashboard">Network Map</NavLink>
          <NavLink to="/distribution-hubs" className="active">
            Distribution Hubs
          </NavLink>
          <NavLink to="/tickets">Fault Management</NavLink>
          <NavLink to="/customers">Inventory</NavLink>
        </nav>

        <button type="button" className="hub-bell">
          B
        </button>
        <button type="button" className="hub-avatar">
          JD
        </button>
      </header>

      <main className="hub-main">
        <section className="hub-headline">
          <div>
            <h2>
              Distribution Hub: <span>HUB-NORTH-E1</span>
              <em>OPERATIONAL</em>
            </h2>
            <p>Station Street 42, North Sector · ID: 99283-FIBER-01</p>
          </div>

          <div className="hub-actions">
            <button type="button" className="ghost">
              Export Technical Sheet
            </button>
            <button type="button" className="primary">
              Dispatch Technician
            </button>
          </div>
        </section>

        <section className="hub-grid">
          <aside className="hub-left">
            <article className="hub-card">
              <h3>Cabinet Specs</h3>
              <div className="hub-kv">
                <span>Type</span>
                <strong>Double-Door ODC</strong>
              </div>
              <div className="hub-kv">
                <span>Capacity</span>
                <strong>576 Cores</strong>
              </div>
              <div className="hub-kv">
                <span>Last Service</span>
                <strong>Oct 2023</strong>
              </div>
              <div className="hub-kv">
                <span>Manufacturer</span>
                <strong>FibCom Systems</strong>
              </div>
            </article>

            <article className="hub-card">
              <h3>Environment</h3>
              <div className="hub-env-grid">
                <div>
                  <small>TEMPERATURE</small>
                  <strong>24°C</strong>
                </div>
                <div>
                  <small>HUMIDITY</small>
                  <strong>45%</strong>
                </div>
              </div>
              <div className="hub-door-status">LOCKED / SECURE</div>
            </article>

            <article className="hub-card hub-mini-map">
              <button type="button">GIS Map View</button>
            </article>
          </aside>

          <section className="hub-card hub-rack-card">
            <header>
              <h3>Rack Visualization</h3>
              <small>Vertical ODC Patch Panel Layout (576 Port Density)</small>
              <div className="hub-rack-legend">
                <span className="backbone">BACKBONE</span>
                <span className="distribution">DISTRIBUTION</span>
                <span className="unused">UNUSED</span>
              </div>
            </header>

            <div className="hub-rack-wrap">
              {rackRows.map((row) => (
                <article key={row.label} className="hub-rack-row">
                  <div className="hub-rack-row-head">
                    <span>{row.label}</span>
                    <small>{row.duplex}</small>
                  </div>
                  <div className="hub-rack-cells">
                    {row.cells.map((tone, index) => (
                      <i key={`${row.label}-${index}`} className={`hub-cell ${tone}`}></i>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="hub-right">
            <article className="hub-card">
              <h3>Splice Tray Inventory</h3>
              <div className="hub-tray-list">
                {trayRows.map((tray) => (
                  <div key={tray.name} className="hub-tray-item">
                    <div className="hub-tray-head">
                      <strong>{tray.name}</strong>
                      <span>{tray.status}</span>
                    </div>
                    <div className="hub-tray-track">
                      <i style={{ width: `${tray.progress}%` }}></i>
                    </div>
                    <div className="hub-tray-foot">
                      <small>{tray.note}</small>
                      <small>{tray.tail}</small>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="hub-card">
              <h3>Maintenance Log</h3>
              <div className="hub-log-list">
                {logs.map((log) => (
                  <article key={log.title}>
                    <strong>{log.title}</strong>
                    <small>{log.meta}</small>
                    {log.note && <p>{log.note}</p>}
                  </article>
                ))}
              </div>
              <button type="button" className="hub-link-btn">
                VIEW ALL LOGS
              </button>
            </article>
          </aside>
        </section>

        <section className="hub-card hub-matrix">
          <h3>Cable Entry/Exit Matrix</h3>
          <div className="hub-matrix-body">
            <div className="hub-source">
              <div className="hub-source-ring">
                <span>IN</span>
              </div>
              <strong>MAIN BACKBONE A</strong>
              <small>144-Core Single Mode</small>
            </div>

            <div className="hub-line">
              <i></i>
              <b>ODC HUB MATRIX</b>
              <i></i>
            </div>

            <div className="hub-ports">
              {portCards.map((port) => (
                <article key={port.name} className={port.state}>
                  <div className="icon">{port.state === "empty" ? "+" : ">"}</div>
                  <strong>{port.name}</strong>
                  <small>{port.core}</small>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="hub-footer">
        © 2024 ISP Infrastructure Management System. All Rights Reserved. Hub version 2.4.1-Build:North.
      </footer>
    </section>
  );
}
