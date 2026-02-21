export default function CustomerTable({
  customers = [],
  onSelectCustomer,
  onToggleStatus,
  onTriggerProvision
}) {
  return (
    <div className="customer-table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Plan</th>
            <th>Account</th>
            <th>Payment</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.id} onClick={() => onSelectCustomer(customer)}>
              <td>{customer.fullName}</td>
              <td>{customer.phone || "—"}</td>
              <td>{customer.planId}</td>
              <td>
                <span className={`pill ${customer.accountStatus === "active" ? "ok" : "danger"}`}>
                  {customer.accountStatus}
                </span>
              </td>
              <td>
                <span className={`pill ${customer.paymentStatus === "paid" ? "ok" : "warn"}`}>
                  {customer.paymentStatus}
                </span>
              </td>
              <td>
                <button type="button" onClick={(event) => { event.stopPropagation(); onToggleStatus?.(customer); }}>
                  {customer.accountStatus === "active" ? "Suspend" : "Activate"}
                </button>
                <button type="button" onClick={(event) => { event.stopPropagation(); onTriggerProvision?.(customer); }}>
                  Provision
                </button>
              </td>
            </tr>
          ))}
          {customers.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No subscribers yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
