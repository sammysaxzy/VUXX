import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useNocState } from "../context/NocContext.jsx";

const navLinks = [
  { label: "Map", to: "/dashboard" },
  { label: "Customers", to: "/customers" },
  { label: "Tickets", to: "/tickets" },
  { label: "RADIUS", to: "/radius" },
  { label: "Reports", to: "/reports" }
];

export default function Header() {
  const { metrics } = useNocState();
  const { user, logout } = useAuth();
  const overdue = metrics?.overdue ?? 0;
  const offline = metrics?.offline ?? 0;
  const open = metrics?.open ?? 0;
  const roleLabel = user?.role ? user.role.toUpperCase() : "STAFF";

  return (
    <header className="noc-header">
      <div className="logo">FIBRE NOC</div>
      <nav className="noc-nav">
        {navLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => (isActive ? "noc-nav-link active" : "noc-nav-link")}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="header-controls">
        <input className="search-input" placeholder="Search network assets..." />
        <button type="button" className="icon-button" aria-label="Notifications">
          🔔
        </button>
        <div className="status-chips">
          <span className="pill danger">{overdue} overdue</span>
          <span className="pill warn">{offline} offline</span>
          <span className="pill info">{open} open</span>
        </div>
        {user && (
          <div className="header-identity">
            <span className="user-chip">{roleLabel}</span>
            <button type="button" className="ghost-btn" onClick={logout}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
