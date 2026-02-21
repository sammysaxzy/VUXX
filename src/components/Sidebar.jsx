const techStack = ["GPON", "XGS-PON", "Active Ethernet"];
const regions = ["Ogba", "Omole", "Ikeja", "Festac"];
const layers = ["Fiber", "Wireless", "Meters"];
const liveTech = ["Eng-05 • Bogor Rd", "Eng-11 • Victoria", "Eng-02 • Axis Tower"];

export default function Sidebar() {
  return (
    <aside className="noc-sidebar">
      <div className="sidebar-section">
        <h4>Infrastructure tools</h4>
        <div className="tool-row">
          <button type="button" className="primary-btn">
            Add MST
          </button>
          <button type="button" className="ghost-btn">
            Fiber
          </button>
        </div>
      </div>

      <div className="sidebar-section">
        <h4>Map layers</h4>
        <div className="toggle-grid">
          {layers.map((layer) => (
            <label key={layer} className="toggle">
              <input type="checkbox" defaultChecked />
              {layer}
            </label>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <h4>Technology</h4>
        <div className="toggle-grid">
          {techStack.map((tech) => (
            <label key={tech} className="toggle">
              <input type="radio" name="tech" defaultChecked={tech === techStack[0]} />
              {tech}
            </label>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <h4>Region</h4>
        <div className="toggle-grid">
          {regions.map((region) => (
            <label key={region} className="toggle">
              <input type="radio" name="region" defaultChecked={region === regions[0]} />
              {region}
            </label>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <h4>Live tech</h4>
        <ul className="live-tech">
          {liveTech.map((tech) => (
            <li key={tech}>{tech}</li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
