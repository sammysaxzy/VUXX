import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import Customers from "./pages/Customers.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import LoginPage from "./pages/Login.jsx";
import RadiusPage from "./pages/Radius.jsx";
import Reports from "./pages/Reports.jsx";
import TicketsPage from "./pages/Tickets.jsx";
import PrivateRoute from "./components/PrivateRoute.jsx";
import ProtectedLayout from "./components/ProtectedLayout.jsx";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<PrivateRoute />}>
            <Route element={<ProtectedLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/radius" element={<RadiusPage />} />
              <Route path="/tickets" element={<TicketsPage />} />
              <Route path="/reports" element={<Reports />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
