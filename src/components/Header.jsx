import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const navLinks = [
  { label: "Engineering Map", to: "/dashboard" },
  { label: "Inventory", to: "/customers" },
  { label: "Reports", to: "/reports" },
  { label: "Team", to: "/tickets" }
];

export default function Header() {
  const { user, logout } = useAuth();
  const initials = user?.email?.slice(0, 1)?.toUpperCase() || "U";

  return (
    <header className="fg-topbar">
      <div className="fg-topbar-left">
        <div className="fg-brand-mark" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div className="fg-brand-text">FiberGrid GIS</div>
        <nav className="fg-nav">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? "fg-nav-link active" : "fg-nav-link")}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="fg-topbar-right">
        <label className="fg-search">
          <span className="fg-search-icon" aria-hidden="true">
            search
          </span>
          <input type="text" placeholder="Search GPS or Asset ID" />
        </label>
        <button type="button" className="fg-next-btn">
          Next: CRM & Radius Management
        </button>
        <button type="button" className="fg-avatar" onClick={logout} title="Sign out">
          {initials}
        </button>
      </div>
    </header>
  );
}
