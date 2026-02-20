import StatusBadge from "./StatusBadge.jsx";

export default function CustomerTable({
  customers,
  onToggleStatus,
  onEdit,
  onUpgrade,
  selectedCustomerId,
  onSelectCustomer
}) {
  return (
    <div className="customer-table-wrapper">
      <table className="customer-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Email</th>
            <th>Plan</th>
            <th>Account Status</th>
            <th>Payment Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr
              key={customer.id}
              className={customer.id === selectedCustomerId ? "selected" : ""}
              onClick={() => onSelectCustomer?.(customer.id)}
            >
              <td>{customer.name}</td>
              <td>{customer.phone || "—"}</td>
              <td>{customer.email || "—"}</td>
              <td>{customer.plan}</td>
              <td>
                <StatusBadge variant="account" status={customer.accountStatus} />
              </td>
              <td>
                <StatusBadge variant="payment" status={customer.paymentStatus} />
              </td>
              <td className="customer-table-actions">
                <button type="button" onClick={(event) => { event.stopPropagation(); onToggleStatus(customer); }}>
                  {customer.accountStatus === "active" ? "Suspend" : "Activate"}
                </button>
                <button type="button" onClick={(event) => { event.stopPropagation(); onEdit(customer); }}>
                  Edit
                </button>
                <button type="button" onClick={(event) => { event.stopPropagation(); onUpgrade(customer); }}>
                  Upgrade plan
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
