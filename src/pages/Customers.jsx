const summaryCards = [
  {
    title: "Total Asset Value",
    value: "$428,500.00",
    note: "+2.4% vs last month",
    tone: "positive",
    icon: "C"
  },
  {
    title: "Low Stock Alerts",
    value: "12 Items",
    note: "4 critical items (0 stock)",
    tone: "warning",
    icon: "!"
  },
  {
    title: "Pending Orders",
    value: "45",
    note: "Expected within 48 hours",
    tone: "info",
    icon: "T"
  }
];

const tabs = ["All Items", "MST Boxes", "Fiber Cables", "Splitters", "Closures"];

const stockRows = [
  {
    sku: "MST-08-W1",
    itemName: "MST Box (8-port)",
    itemMeta: "Hardened Connector Enclosure",
    category: "MST BOXES",
    categoryTone: "blue",
    level: "24 units",
    limit: "100 limit",
    percent: 24,
    status: "LOW STOCK",
    statusTone: "orange",
    location: "Warehouse A"
  },
  {
    sku: "FC-96C-R04",
    itemName: "Fiber Cable (96-core)",
    itemMeta: "Remaining: 1,450 m",
    category: "CABLES",
    categoryTone: "green",
    level: "1.45km",
    limit: "5km spool",
    percent: 29,
    status: "IN STOCK",
    statusTone: "green",
    location: "Field Van 04"
  },
  {
    sku: "SPL-132-PLC",
    itemName: "PLC Splitter (1:32)",
    itemMeta: "Rack Mount Chassis",
    category: "SPLITTERS",
    categoryTone: "purple",
    level: "2 units",
    limit: "50 limit",
    percent: 4,
    status: "OUT OF STOCK",
    statusTone: "red",
    location: "Warehouse A"
  },
  {
    sku: "CL-DOME-LRG",
    itemName: "Dome Closure (Large)",
    itemMeta: "Heat-Shrink Sealing",
    category: "CLOSURES",
    categoryTone: "amber",
    level: "85 units",
    limit: "100 limit",
    percent: 85,
    status: "IN STOCK",
    statusTone: "green",
    location: "Main Hub Warehouse"
  }
];

const deployedAssets = [
  {
    title: "MST-08-W1 deployed to Sector 4B",
    note: "INSTALLATION BY TECH #402 · 14 MINS AGO",
    status: "ONLINE",
    tone: "green"
  },
  {
    title: "Drop Cable (150m) assigned to Van 02",
    note: "INVENTORY CHECKOUT · 1 HOUR AGO",
    status: "IN TRANSIT",
    tone: "blue"
  },
  {
    title: "Splitter 1:16 installed at Node-XY01",
    note: "MAP UPDATED BY ENGINEERING · 3 HOURS AGO",
    status: "ONLINE",
    tone: "green"
  }
];

export default function Customers() {
  return (
    <section className="inv-page">
      <div className="inv-summary-grid">
        {summaryCards.map((card) => (
          <article key={card.title} className="inv-summary-card">
            <div className="inv-summary-head">
              <p>{card.title}</p>
              <span>{card.icon}</span>
            </div>
            <h2>{card.value}</h2>
            <small className={`tone-${card.tone}`}>{card.note}</small>
          </article>
        ))}
      </div>

      <div className="inv-actions-row">
        <div className="inv-actions-left">
          <button type="button" className="inv-btn ghost">
            Filter
          </button>
          <button type="button" className="inv-btn ghost">
            Export CSV
          </button>
        </div>
        <button type="button" className="inv-btn primary">
          + Add New Stock
        </button>
      </div>

      <article className="inv-table-card">
        <div className="inv-tabs">
          {tabs.map((tab) => (
            <button key={tab} type="button" className={tab === "All Items" ? "active" : ""}>
              {tab}
            </button>
          ))}
        </div>

        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th>SKU/ID</th>
                <th>ITEM NAME</th>
                <th>CATEGORY</th>
                <th>STOCK LEVEL</th>
                <th>STATUS</th>
                <th>LOCATION</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stockRows.map((row) => (
                <tr key={row.sku}>
                  <td>{row.sku}</td>
                  <td>
                    <strong>{row.itemName}</strong>
                    <small>{row.itemMeta}</small>
                  </td>
                  <td>
                    <span className={`inv-pill ${row.categoryTone}`}>{row.category}</span>
                  </td>
                  <td>
                    <div className="inv-stock-col">
                      <div className="inv-stock-head">
                        <small>{row.level}</small>
                        <small>{row.limit}</small>
                      </div>
                      <div className="inv-stock-track">
                        <span style={{ width: `${row.percent}%` }}></span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`inv-status ${row.statusTone}`}>{row.status}</span>
                  </td>
                  <td>{row.location}</td>
                  <td className="inv-menu-cell">⋮</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <div className="inv-bottom-grid">
        <article className="inv-feed-card">
          <header>
            <h3>Recently Deployed Assets</h3>
            <button type="button">View Map Feed</button>
          </header>
          <div className="inv-feed-list">
            {deployedAssets.map((item) => (
              <div key={item.title} className="inv-feed-item">
                <div className="inv-feed-icon"></div>
                <div className="inv-feed-copy">
                  <p>{item.title}</p>
                  <small>{item.note}</small>
                </div>
                <span className={`inv-feed-tag ${item.tone}`}>{item.status}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="inv-map-card">
          <header>
            <h3>Inventory Map</h3>
            <span>Live View</span>
          </header>
          <div className="inv-mini-map">
            <span className="dot blue"></span>
            <span className="dot green"></span>
            <span className="dot orange"></span>
          </div>
          <button type="button" className="inv-expand-btn">
            Expand Map View
          </button>
        </article>
      </div>

      <div className="inv-footer-strip">
        <span>© 2024 FiberGrid GIS Engineering Dashboard. All Rights Reserved.</span>
        <div>
          <span>System Status</span>
          <span>Documentation</span>
          <span>Support Desk</span>
        </div>
      </div>
    </section>
  );
}
