import { NavLink } from "react-router-dom";

const infraItems = [
  "Distribution Hubs",
  "MST / Closures",
  "Poles & Towers",
  "Manholes / Handholes"
];

const draftingTools = ["BACKBONE", "DISTRIB", "DROP", "ANNOTATE"];

const activityLogs = [
  {
    time: "Today, 09:42 AM",
    title: "Technician M. Ross spliced Core 01-08 at MST-42",
    note: "\"Completed signal test: -18.2dBm\"",
    tone: "blue"
  },
  {
    time: "Today, 08:15 AM",
    title: "High Attenuation Alert",
    note: "Sector 4-B Distribution Line reporting 4.5dB loss.",
    tone: "orange"
  },
  {
    time: "Yesterday, 05:20 PM",
    title: "Network Schema Updated",
    note: "Version 4.2.1 committed by System Admin.",
    tone: "slate"
  },
  {
    time: "Yesterday, 02:00 PM",
    title: "Inventory Sync",
    note: "1,200m Corning Drop Cable added to stock.",
    tone: "slate"
  }
];

const tickets = [
  {
    type: "INSTALL",
    id: "#8821",
    title: "New Customer Drop - Block 12",
    owner: "Assigned: T. Rivera",
    initials: "TR",
    tone: "blue"
  },
  {
    type: "REPAIR",
    id: "#8819",
    title: "Faulty Splitter Replacement",
    owner: "Assigned: M. Khan",
    initials: "MK",
    tone: "red"
  }
];

const coreColors = [
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"
];

export default function NetworkMap() {
  return (
    <section className="ops-layout">
      <header className="ops-topbar">
        <div className="ops-brand">
          <div className="ops-brand-icon">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
          <h1>
            FiberGrid<span>Ops</span>
          </h1>
        </div>

        <label className="ops-search">
          <span>Q</span>
          <input type="text" placeholder="Search OLT, MST, or Splice Closure..." />
        </label>

        <nav className="ops-nav">
          <NavLink to="/dashboard">Network Design</NavLink>
          <NavLink to="/distribution-hubs">Distribution Hubs</NavLink>
          <NavLink to="/tickets">Field Force</NavLink>
        </nav>

        <NavLink to="/radius" className="ops-cta">
          Next: CRM & Radius
        </NavLink>
        <button type="button" className="ops-avatar">
          JD
        </button>
      </header>

      <div className="ops-timeline">
        <div className="ops-playback">
          <p>HISTORICAL PLAYBACK</p>
          <strong>Live View: Oct 2023 - Jan 2024</strong>
        </div>
        <div className="ops-timebar">
          <span>2021</span>
          <div className="ops-time-track">
            <i className="ops-time-fill"></i>
            <b className="ops-time-thumb"></b>
          </div>
          <span>NOW</span>
          <button type="button">▶</button>
        </div>
      </div>

      <div className="ops-main">
        <aside className="ops-left">
          <section>
            <h3>INFRASTRUCTURE LIBRARY</h3>
            <div className="ops-left-list">
              {infraItems.map((item, index) => (
                <button key={item} type="button" className={index === 0 ? "active" : ""}>
                  {item}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>DRAFTING TOOLS</h3>
            <div className="ops-tool-grid">
              {draftingTools.map((tool, index) => (
                <button key={tool} type="button" className={index === 1 ? "orange" : ""}>
                  {tool}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>ACTIVE LAYERS</h3>
            <label>
              <span>Underground Ducts</span>
              <input type="checkbox" defaultChecked />
            </label>
            <label>
              <span>Aerial Infrastructure</span>
              <input type="checkbox" defaultChecked />
            </label>
            <label className="muted">
              <span>Service Coverage (Heatmap)</span>
              <input type="checkbox" />
            </label>
          </section>
        </aside>

        <section className="ops-map">
          <div className="ops-map-controls">
            <button type="button">+</button>
            <button type="button">−</button>
            <button type="button">▲</button>
          </div>

          <div className="ops-selected-card">
            <header>
              <small>SELECTED ASSET</small>
              <span>ACTIVE</span>
            </header>
            <h4>MST-8B-42</h4>
            <p>8-Port Multi-Service Terminal</p>
            <div className="ops-occupancy">
              <span>Occupancy:</span>
              <strong>5 / 8 Ports</strong>
            </div>
            <div className="ops-occupancy-track">
              <i></i>
            </div>
            <button type="button">VIEW DETAILS</button>
          </div>

          <svg className="ops-network-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <line x1="12" y1="33" x2="45" y2="58" className="blue dashed" />
            <line x1="45" y1="58" x2="79" y2="50" className="blue dashed" />
            <line x1="45" y1="58" x2="57" y2="100" className="orange" />
            <circle cx="12" cy="33" r="0.85" className="blue-dot" />
            <circle cx="45" cy="58" r="1" className="blue-dot" />
            <rect x="78.2" y="48.8" width="2.2" height="3" rx="0.5" className="orange-dot" />
          </svg>
        </section>

        <aside className="ops-right">
          <section className="ops-log">
            <h3>FIELD ACTIVITY LOG</h3>
            <div className="ops-log-list">
              {activityLogs.map((entry) => (
                <article key={entry.time + entry.title} className={`tone-${entry.tone}`}>
                  <small>{entry.time}</small>
                  <strong>{entry.title}</strong>
                  <p>{entry.note}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="ops-ticket">
            <h3>ON-GOING TICKETS</h3>
            <div className="ops-ticket-list">
              {tickets.map((ticket) => (
                <article key={ticket.id}>
                  <header>
                    <span className={ticket.tone}>{ticket.type}</span>
                    <small>ID: {ticket.id}</small>
                  </header>
                  <h4>{ticket.title}</h4>
                  <p>
                    <b>{ticket.initials}</b> {ticket.owner}
                  </p>
                </article>
              ))}
            </div>
            <button type="button" className="ops-job-btn">
              CREATE NEW JOB
            </button>
          </section>
        </aside>
      </div>

      <section className="ops-splice">
        <div className="ops-splice-head">
          <h3>CORE & SPLICING MANAGER</h3>
          <p>
            Target: <strong>CLOSURE-SEC-4A</strong>
          </p>
          <div className="ops-legend">
            <span className="green">Available</span>
            <span className="red">Spliced</span>
          </div>
          <button type="button">Auto-Assign Splicing</button>
        </div>

        <div className="ops-splice-body">
          <div className="ops-core-row">
            {coreColors.map((item, index) => (
              <article key={item} className={`ops-core-chip c${index + 1}`}>
                <strong>{item}</strong>
              </article>
            ))}
          </div>

          <div className="ops-matrix">
            <h4>SPLICE MATRIX SUMMARY</h4>
            <div>
              <span>IN</span>
              <i className="in">C01:01</i>
            </div>
            <div>
              <span>OUT</span>
              <i className="out">C04:02</i>
            </div>
          </div>
        </div>
      </section>

      <footer className="ops-footer">
        <div>
          <span>SYSTEM STATUS: OPERATIONAL</span>
          <span>LAST SYNC: 2M AGO</span>
        </div>
        <div>
          <span>Lat: 40.7128° N, Lon: 74.0060° W</span>
          <span>v4.2.1-Stable</span>
        </div>
      </footer>
    </section>
  );
}
