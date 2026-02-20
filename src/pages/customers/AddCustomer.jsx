import { useEffect, useMemo, useState } from "react";
import CustomerForm from "../../components/customers/CustomerForm.jsx";
import { createCustomer } from "../../services/customerService.js";
import { fetchNodes } from "../../services/nodeService.js";

export default function AddCustomer({ onCreated }) {
  const [loading, setLoading] = useState(false);
  const [infrastructureError, setInfrastructureError] = useState("");
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [formResetKey, setFormResetKey] = useState(0);
  const [nodes, setNodes] = useState([]);
  const [nodesLoading, setNodesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadNodes() {
      setNodesLoading(true);
      setInfrastructureError("");
      try {
        const payload = await fetchNodes();
        if (!cancelled) {
          setNodes(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setInfrastructureError(error?.response?.data?.error || error?.message || "Unable to load infrastructure data");
        }
      } finally {
        if (!cancelled) {
          setNodesLoading(false);
        }
      }
    }
    loadNodes();
    return () => {
      cancelled = true;
    };
  }, []);

  const areaOptions = useMemo(() => {
    const areas = nodes.map((node) => node.area).filter(Boolean);
    return areas.length ? Array.from(new Set(areas)) : ["General"];
  }, [nodes]);

  const oltOptions = useMemo(() => nodes.filter((node) => node.type === "olt"), [nodes]);
  const mstOptions = useMemo(() => nodes.filter((node) => node.type === "mst"), [nodes]);

  const hasInfrastructure = oltOptions.length > 0 && mstOptions.length > 0;
  const disabled = loading || nodesLoading || !hasInfrastructure;
  const helperMessage = nodesLoading
    ? "Loading OLT/MST inventory..."
    : !hasInfrastructure
      ? "Add at least one OLT and MST in the infra map to enable onboarding."
      : "";

  async function handleSubmit(values) {
    setLoading(true);
    setFeedback({ type: "", message: "" });
    try {
      const customer = await createCustomer(values);
      setFeedback({ type: "success", message: `Customer ${customer.name} queued for onboarding.` });
      setFormResetKey((prev) => prev + 1);
      onCreated?.(customer);
    } catch (error) {
      setFeedback({ type: "error", message: error?.response?.data?.error || error?.message || "Could not create customer" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="customers-module add-customer-panel">
      <div className="customers-module-head">
        <div>
          <h2>Add Customer</h2>
          <p className="muted">Kick off CRM onboarding and GIS node provisioning.</p>
        </div>
        <span className="plan-chip">GIS & CRM</span>
      </div>

      {feedback.message && (
        <div className={`customers-toast ${feedback.type === "error" ? "error" : "success"}`}>
          {feedback.message}
        </div>
      )}

      {infrastructureError && <p className="muted error">{infrastructureError}</p>}
      {helperMessage && <p className="muted">{helperMessage}</p>}

      <CustomerForm
        key={formResetKey}
        onSubmit={handleSubmit}
        submitLabel={loading ? "Creating..." : "Create customer"}
        disabled={disabled}
        areaOptions={areaOptions}
        oltOptions={oltOptions}
        mstOptions={mstOptions}
      />
    </section>
  );
}
