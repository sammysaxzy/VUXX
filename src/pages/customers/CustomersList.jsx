import { useCallback, useEffect, useMemo, useState } from "react";
import AddCustomer from "./AddCustomer.jsx";
import CustomerForm from "../../components/customers/CustomerForm.jsx";
import CustomerTable from "../../components/customers/CustomerTable.jsx";
import RadiusSessionPanel from "../../components/customers/RadiusSessionPanel.jsx";
import {
  fetchCustomers,
  updateCustomer,
  updateCustomerPlan,
  updateCustomerStatus,
  PLAN_TIERS
} from "../../services/customerService.js";
import { fetchRadiusSessions, updateRadiusStatus } from "../../services/radiusService.js";

export default function CustomersList() {
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState("");

  const [radiusSessions, setRadiusSessions] = useState([]);
  const [radiusLoading, setRadiusLoading] = useState(false);
  const [radiusError, setRadiusError] = useState("");

  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [planTarget, setPlanTarget] = useState(null);
  const [planSelection, setPlanSelection] = useState(PLAN_TIERS[0]);
  const [formError, setFormError] = useState("");
  const [planError, setPlanError] = useState("");

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true);
    setCustomersError("");
    try {
      const payload = await fetchCustomers();
      setCustomers(payload);
    } catch (error) {
      const message = error?.response?.data?.error || error?.message || "Unable to load customers";
      setCustomersError(message);
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  const loadRadiusSessions = useCallback(
    async (customerIdOverride) => {
      setRadiusLoading(true);
      setRadiusError("");
      try {
        const targetId = customerIdOverride ?? selectedCustomerId;
        const payload = await fetchRadiusSessions(targetId);
        setRadiusSessions(payload);
      } catch (error) {
        const message = error?.response?.data?.error || error?.message || "Unable to load RADIUS sessions";
        setRadiusError(message);
      } finally {
        setRadiusLoading(false);
      }
    },
    [selectedCustomerId]
  );

  useEffect(() => {
    loadCustomers();
    loadRadiusSessions();
  }, [loadCustomers, loadRadiusSessions]);

  useEffect(() => {
    if (planTarget) {
      setPlanSelection(planTarget.plan || PLAN_TIERS[0]);
    }
  }, [planTarget]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  function handleRowSelect(customerId) {
    setSelectedCustomerId((prev) => (prev === customerId ? null : customerId));
  }

  async function handleToggleStatus(customerId) {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return;
    const next = customer.accountStatus === "active" ? "suspended" : "active";
    try {
      const updated = await updateCustomerStatus(customerId, next);
      setCustomers((prev) => prev.map((c) => (c.id === customerId ? updated : c)));
      loadRadiusSessions();
    } catch (error) {
      console.error("Unable to toggle customer status", error);
    }
  }

  async function handleUpgradePlan(customerId, plan) {
    setPlanError("");
    try {
      const updated = await updateCustomerPlan(customerId, plan);
      setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setPlanTarget(null);
    } catch (error) {
      console.error("Plan upgrade failed", error);
      const message = error?.response?.data?.error || error?.message || "Upgrade failed";
      setPlanError(message);
    }
  }

  async function handleUpdateCustomer(customerId, payload) {
    setFormError("");
    try {
      const updated = await updateCustomer(customerId, payload);
      setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditingCustomer(null);
    } catch (error) {
      console.error("Customer update failed", error);
      const message = error?.response?.data?.error || error?.message || "Update failed";
      setFormError(message);
    }
  }

  async function handleRadiusStatusChange(sessionId, status) {
    try {
      await updateRadiusStatus(sessionId, status);
      await loadRadiusSessions();
    } catch (error) {
      console.error("Radius status update failed", error);
      throw error;
    }
  }

  async function handleCustomerCreated(customer) {
    await loadCustomers();
    await loadRadiusSessions(customer.id);
    setSelectedCustomerId(customer.id);
  }

  const summary = useMemo(() => {
    const total = customers.length;
    const overdue = customers.filter((customer) => customer.paymentStatus === "overdue").length;
    const suspended = customers.filter((customer) => customer.accountStatus === "suspended").length;
    return { total, overdue, suspended };
  }, [customers]);

  return (
    <section className="customers-module customers-page">
      <header className="customers-module-head">
        <div>
          <h2>Customers</h2>
          <p className="muted">CRM and GIS data for the ISP live network.</p>
        </div>
        <div className="customers-module-metrics">
          <div>
            <strong>{summary.total}</strong>
            <span>Total</span>
          </div>
          <div>
            <strong>{summary.overdue}</strong>
            <span>Overdue</span>
          </div>
          <div>
            <strong>{summary.suspended}</strong>
            <span>Suspended</span>
          </div>
        </div>
      </header>

      <div className="customers-view-grid">
        <div className="customers-view-main">
          {customersLoading && <p className="muted">Loading customers...</p>}
          {customersError && <p className="muted error">{customersError}</p>}

          {!customersLoading && !customersError && (
            <>
              <CustomerTable
                customers={customers}
                onToggleStatus={(customer) => handleToggleStatus(customer.id)}
                onEdit={(customer) => {
                  setEditingCustomer(customer);
                  setFormError("");
                }}
                onUpgrade={(customer) => {
                  setPlanTarget(customer);
                  setPlanError("");
                }}
                selectedCustomerId={selectedCustomerId}
                onSelectCustomer={handleRowSelect}
              />

              <div className="customers-module-actions">
                {editingCustomer && (
                  <section className="customers-module-pane">
                    <h3>Edit {editingCustomer.name}</h3>
                    <CustomerForm
                      initialValues={editingCustomer}
                      onSubmit={(values) => handleUpdateCustomer(editingCustomer.id, values)}
                      onCancel={() => setEditingCustomer(null)}
                      submitLabel="Save changes"
                    />
                    {formError && <p className="muted error small">{formError}</p>}
                  </section>
                )}
                {planTarget && (
                  <section className="customers-module-pane">
                    <h3>Upgrade plan for {planTarget.name}</h3>
                    <label>
                      New plan
                      <select value={planSelection} onChange={(event) => setPlanSelection(event.target.value)}>
                        {PLAN_TIERS.map((plan) => (
                          <option key={plan} value={plan}>
                            {plan}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="customer-form-actions">
                      <button type="button" onClick={() => setPlanTarget(null)}>
                        Cancel
                      </button>
                      <button type="button" onClick={() => handleUpgradePlan(planTarget.id, planSelection)}>
                        Apply upgrade
                      </button>
                    </div>
                    {planError && <p className="muted error small">{planError}</p>}
                  </section>
                )}
              </div>
            </>
          )}

          <RadiusSessionPanel
            sessions={radiusSessions}
            loading={radiusLoading}
            error={radiusError}
            selectedCustomerId={selectedCustomerId}
            selectedCustomerName={selectedCustomer?.name}
            onRefresh={loadRadiusSessions}
            onStatusChange={handleRadiusStatusChange}
          />
        </div>

        <aside className="customers-view-side">
          <AddCustomer onCreated={handleCustomerCreated} />
        </aside>
      </div>
    </section>
  );
}
