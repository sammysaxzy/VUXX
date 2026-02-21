import { useMemo, useState } from "react";

const PLANS = ["Home 40Mbps", "Biz 60Mbps", "Biz 100Mbps", "Enterprise 200Mbps"];

export default function ProvisionDrawer({
  isOpen,
  onClose,
  onSubmit,
  loading,
  nodes = []
}) {
  const [values, setValues] = useState({
    fullName: "",
    phone: "",
    email: "",
    planId: PLANS[0],
    mstId: "",
    latitude: "",
    longitude: "",
    installationDocs: "",
    metadata: ""
  });

  const mstOptions = useMemo(() => nodes.filter((node) => node.type === "mst"), [nodes]);

  const handleChange = (field) => (event) => {
    setValues((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const payload = {
      fullName: values.fullName,
      phone: values.phone,
      email: values.email,
      planId: values.planId,
      mstId: values.mstId || null,
      latitude: Number(values.latitude),
      longitude: Number(values.longitude),
      accountStatus: "active",
      paymentStatus: "paid",
      installationDocs: {
        notes: values.installationDocs
      },
      metadata: {
        metadata: values.metadata
      }
    };
    onSubmit?.(payload);
  };

  return (
    <aside className={`provision-drawer ${isOpen ? "open" : ""}`}>
      <header>
        <div>
          <strong>Provision drawer</strong>
          <p className="muted small">Identity, technical, and docs.</p>
        </div>
        <button type="button" className="ghost-btn" onClick={onClose}>
          Close
        </button>
      </header>
      <form onSubmit={handleSubmit}>
        <section className="drawer-section">
          <h4>Identity metadata</h4>
          <label className="form-field">
            Full name
            <input value={values.fullName} onChange={handleChange("fullName")} required />
          </label>
          <label className="form-field">
            Phone
            <input value={values.phone} onChange={handleChange("phone")} />
          </label>
          <label className="form-field">
            Email
            <input type="email" value={values.email} onChange={handleChange("email")} required />
          </label>
        </section>

        <section className="drawer-section">
          <h4>Technical config</h4>
          <label className="form-field">
            Plan
            <select value={values.planId} onChange={handleChange("planId")}>
              {PLANS.map((plan) => (
                <option key={plan} value={plan}>
                  {plan}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            MST
            <select value={values.mstId} onChange={handleChange("mstId")}>
              <option value="">Select MST</option>
              {mstOptions.map((mst) => (
                <option key={mst.id} value={mst.id}>
                  {mst.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Latitude
            <input type="number" value={values.latitude} onChange={handleChange("latitude")} required />
          </label>
          <label className="form-field">
            Longitude
            <input type="number" value={values.longitude} onChange={handleChange("longitude")} required />
          </label>
        </section>

        <section className="drawer-section">
          <h4>Installation docs</h4>
          <textarea value={values.installationDocs} onChange={handleChange("installationDocs")} rows={4} />
          <label className="form-field">
            Metadata tag
            <input value={values.metadata} onChange={handleChange("metadata")} />
          </label>
        </section>

        <div className="drawer-actions">
          <button type="submit" className="primary-btn" disabled={loading}>
            {loading ? "Saving..." : "Submit"}
          </button>
          <button type="button" className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </aside>
  );
}
