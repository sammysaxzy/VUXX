import { Outlet } from "react-router-dom";
import Header from "./Header.jsx";
import { NocProvider } from "../context/NocContext.jsx";

export default function ProtectedLayout() {
  return (
    <NocProvider>
      <Header />
      <main className="app-shell">
        <Outlet />
      </main>
    </NocProvider>
  );
}
