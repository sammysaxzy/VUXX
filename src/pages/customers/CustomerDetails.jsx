export default function CustomerDetails({ customer }) {
  if (!customer) {
    return (
      <section className="customers-module helpers">
        <h2>Customer Details</h2>
        <p>Select a customer to view their full profile.</p>
      </section>
    );
  }

  return (
    <section className="customers-module helpers">
      <h2>{customer.name}</h2>
      <p>
        <strong>Phone:</strong> {customer.phone || "—"}
      </p>
      <p>
        <strong>Email:</strong> {customer.email || "—"}
      </p>
      <p>
        <strong>Plan:</strong> {customer.plan}
      </p>
      <p>
        <strong>Account:</strong> {customer.accountStatus}
      </p>
      <p>
        <strong>Payment:</strong> {customer.paymentStatus}
      </p>
      <p>
        <strong>Install status:</strong> {customer.installStatus}
      </p>
    </section>
  );
}
