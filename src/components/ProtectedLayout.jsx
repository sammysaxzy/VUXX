import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header.jsx";
import { NocProvider } from "../context/NocContext.jsx";

export default function ProtectedLayout() {
  const location = useLocation();
  const fullscreenRoutes = new Set(["/dashboard", "/distribution-hubs"]);
  const fullscreenDashboard = fullscreenRoutes.has(location.pathname);

  if (fullscreenDashboard) {
    return (
      <NocProvider>
        <Outlet />
      </NocProvider>
    );
  }

  return (
    <NocProvider>
      <div className="fg-frame">
        <Header />
        <main className="fg-app-shell">
          <Outlet />
        </main>
        <footer className="fg-statusbar">
          <div className="fg-status-left">
            <span className="fg-status-dot"></span>
            <span>System Online</span>
            <span className="fg-status-divider"></span>
            <span>Draft Mode: Project Willow Brook</span>
          </div>
          <div className="fg-status-right">
            <span>Assets: 1,429</span>
            <span>Errors: 0</span>
            <span>v4.2.1-stable</span>
          </div>
        </footer>
      </div>
    </NocProvider>
  );
}
