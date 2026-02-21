import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import { NocProvider } from "./context/NocContext.jsx";
import Header from "./components/Header.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Customers from "./pages/Customers.jsx";
import RadiusPage from "./pages/Radius.jsx";
import TicketsPage from "./pages/Tickets.jsx";
import Reports from "./pages/Reports.jsx";

export default function App() {
  return (
    <AuthProvider>
      <NocProvider>
        <BrowserRouter>
          <Header />
          <main className="app-shell">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/radius" element={<RadiusPage />} />
              <Route path="/tickets" element={<TicketsPage />} />
              <Route path="/reports" element={<Reports />} />
            </Routes>
          </main>
        </BrowserRouter>
      </NocProvider>
    </AuthProvider>
  );
}
