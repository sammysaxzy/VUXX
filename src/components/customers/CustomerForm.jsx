import { useEffect, useMemo, useState } from "react";
import {
  ACCOUNT_STATUSES,
  PAYMENT_STATUSES,
  PLAN_TIERS
} from "../../services/customerService.js";

const DEFAULT_FORM = {
  name: "",
  phone: "",
  email: "",
  address: "",
  area: "",
  oltId: "",
  mstId: "",
  plan: PLAN_TIERS[0],
  accountStatus: ACCOUNT_STATUSES[0],
  paymentStatus: PAYMENT_STATUSES[0],
  latitude: 0,
  longitude: 0,
  cpePhoto: "",
  mstPhoto: ""
};

const isPreviewable = (value) => typeof value === "string" && value.startsWith("data:");

export default function CustomerForm({
  initialValues = {},
  onSubmit,
  onCancel,
  submitLabel = "Save",
  disabled = false,
  areaOptions = [],
  oltOptions = [],
  mstOptions = []
}) {
  const [formValues, setFormValues] = useState({ ...DEFAULT_FORM });
  const [photoLabels, setPhotoLabels] = useState({ cpePhoto: "", mstPhoto: "" });

  useEffect(() => {
    const base = { ...DEFAULT_FORM, ...initialValues };
    if (!base.area && areaOptions.length) {
      base.area = areaOptions[0];
    }
    if (!base.oltId && oltOptions.length) {
      base.oltId = oltOptions[0].id;
    }
    if (!base.mstId) {
      const candidate = mstOptions.find((mst) => mst.olt_id === base.oltId);
      if (candidate) {
        base.mstId = candidate.id;
      }
    }
    setFormValues(base);
    setPhotoLabels({
      cpePhoto: initialValues.cpePhotoName || "",
      mstPhoto: initialValues.mstPhotoName || ""
    });
  }, [initialValues, areaOptions, oltOptions, mstOptions]);

  const filteredMsts = useMemo(
    () => mstOptions.filter((mst) => mst.olt_id === formValues.oltId),
    [mstOptions, formValues.oltId]
  );

  function handleChange(field, parser = (value) => value) {
    return (event) => {
      const raw = event.target.value;
      setFormValues((prev) => ({ ...prev, [field]: parser(raw) }));
    };
  }

  function handleOltChange(event) {
    const oltId = event.target.value;
    const nextMst = mstOptions.find((mst) => mst.olt_id === oltId);
    setFormValues((prev) => ({
      ...prev,
      oltId,
      mstId: nextMst ? nextMst.id : ""
    }));
  }

  function handlePhoto(field) {
    return (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        setFormValues((prev) => ({ ...prev, [field]: "" }));
        setPhotoLabels((prev) => ({ ...prev, [field]: "" }));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setFormValues((prev) => ({ ...prev, [field]: reader.result }));
        setPhotoLabels((prev) => ({ ...prev, [field]: file.name }));
      };
      reader.readAsDataURL(file);
    };
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(formValues);
  }

  return (
    <form className="customer-form responsive-form" onSubmit={handleSubmit}>
      <div className="customer-form-grid">
        <label className="form-field">
          Full Name
          <input
            name="name"
            value={formValues.name}
            onChange={handleChange("name")}
            required
            disabled={disabled}
          />
        </label>

        <label className="form-field">
          Phone
          <input name="phone" value={formValues.phone} onChange={handleChange("phone")} disabled={disabled} />
        </label>

        <label className="form-field">
          Email
          <input
            name="email"
            type="email"
            value={formValues.email}
            onChange={handleChange("email")}
            required
            disabled={disabled}
          />
        </label>

        <label className="form-field">
          Address
          <input name="address" value={formValues.address} onChange={handleChange("address")} disabled={disabled} />
        </label>

        <label className="form-field">
          Area
          <select value={formValues.area} onChange={handleChange("area")} required disabled={disabled}>
            {areaOptions.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          OLT
          <select value={formValues.oltId} onChange={handleOltChange} required disabled={disabled || oltOptions.length === 0}>
            {oltOptions.map((olt) => (
              <option key={olt.id} value={olt.id}>
                {olt.name}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          MST
          <select value={formValues.mstId} onChange={handleChange("mstId")} required disabled={disabled || !filteredMsts.length}>
            {filteredMsts.map((mst) => (
              <option key={mst.id} value={mst.id}>
                {mst.name}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          Plan
          <select value={formValues.plan} onChange={handleChange("plan")} disabled={disabled}>
            {PLAN_TIERS.map((plan) => (
              <option key={plan} value={plan}>
                {plan}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          Account Status
          <select value={formValues.accountStatus} onChange={handleChange("accountStatus")} disabled={disabled}>
            {ACCOUNT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          Payment Status
          <select value={formValues.paymentStatus} onChange={handleChange("paymentStatus")} disabled={disabled}>
            {PAYMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          Latitude
          <input
            type="number"
            step="0.000001"
            value={formValues.latitude}
            onChange={handleChange("latitude", (value) => Number(value))}
            disabled={disabled}
            required
          />
        </label>

        <label className="form-field">
          Longitude
          <input
            type="number"
            step="0.000001"
            value={formValues.longitude}
            onChange={handleChange("longitude", (value) => Number(value))}
            disabled={disabled}
            required
          />
        </label>
      </div>

      <div className="photo-grid">
        <label className="photo-input full-span">
          CPE Photo
          <input type="file" accept="image/*" onChange={handlePhoto("cpePhoto")} disabled={disabled} />
          {photoLabels.cpePhoto && <span className="photo-hint">{photoLabels.cpePhoto}</span>}
          {isPreviewable(formValues.cpePhoto) && (
            <div className="photo-preview">
              <img src={formValues.cpePhoto} alt="CPE preview" loading="lazy" />
            </div>
          )}
        </label>

        <label className="photo-input full-span">
          MST Photo
          <input type="file" accept="image/*" onChange={handlePhoto("mstPhoto")} disabled={disabled} />
          {photoLabels.mstPhoto && <span className="photo-hint">{photoLabels.mstPhoto}</span>}
          {isPreviewable(formValues.mstPhoto) && (
            <div className="photo-preview">
              <img src={formValues.mstPhoto} alt="MST preview" loading="lazy" />
            </div>
          )}
        </label>
      </div>

      <div className="customer-form-actions">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={disabled}>
            Cancel
          </button>
        )}
        <button type="submit" disabled={disabled}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
