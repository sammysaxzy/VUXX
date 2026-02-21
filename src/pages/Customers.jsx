import { useState } from "react";
import { createCustomer, updateCustomer } from "../services/api.js";
import { useNocState } from "../context/NocContext.jsx";
import StatsCards from "../components/StatsCards.jsx";
import CustomerTable from "../components/CustomerTable.jsx";
import ProvisionDrawer from "../components/ProvisionDrawer.jsx";
import RadiusPanel from "../components/RadiusPanel.jsx";

export default function Customers() {
  const { metrics, customers, nodes, radiusSessions, refreshCustomers, refreshRadiusSessions } = useNocState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleProvision = () => {
    setDrawerOpen(true);
  };

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      await createCustomer(values);
      refreshCustomers();
    } finally {
      setLoading(false);
      setDrawerOpen(false);
    }
  };

  const handleToggleStatus = async (customer) => {
    const nextStatus = customer.accountStatus === "active" ? "suspended" : "active";
    setLoading(true);
    try {
      await updateCustomer(customer.id, { accountStatus: nextStatus });
      refreshCustomers();
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="customers-view">
      <header className="module-header">
        <div>
          <h2>Customer Management</h2>
          <p className="muted">Identity and CRM controls for the NOC.</p>
        </div>
        <button type="button" className="primary-btn" onClick={handleProvision}>
          Open provision drawer
        </button>
      </header>

      <StatsCards metrics={metrics} />

      <div className="customers-content">
        <CustomerTable
          customers={customers}
          onToggleStatus={handleToggleStatus}
          onTriggerProvision={handleProvision}
        />
        <RadiusPanel sessions={radiusSessions} onRefresh={refreshRadiusSessions} />
      </div>

      <ProvisionDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
        loading={loading}
        nodes={nodes}
      />
    </section>
  );
}
