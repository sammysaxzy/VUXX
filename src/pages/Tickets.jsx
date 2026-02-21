import { useCallback, useEffect, useMemo, useState } from "react";
import { createTicket, fetchNodes, fetchCustomers, fetchTickets, updateTicket } from "../services/api.js";

const TICKET_STATUSES = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "escalated", label: "Escalated" },
  { key: "resolved", label: "Resolved" }
];

const ISSUE_TYPES = [
  { value: "outage", label: "Outage" },
  { value: "installation", label: "Installation" },
  { value: "service", label: "Service request" },
  { value: "maintenance", label: "Maintenance" }
];

const ENGINEERS = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Field Engineer 1" },
  { id: "22222222-2222-2222-2222-222222222222", name: "Field Engineer 2" },
  { id: "33333333-3333-3333-3333-333333333333", name: "NOC Desk" }
];

function formatSla(slaDue) {
  if (!slaDue) return "No SLA";
  const diff = new Date(slaDue).getTime() - Date.now();
  if (diff <= 0) return "Overdue";
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formState, setFormState] = useState({
    customerId: "",
    nodeId: "",
    issueType: "outage",
    severity: "medium",
    assignedTo: ENGINEERS[0].id,
    slaMinutes: 120,
    description: ""
  });

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await fetchTickets();
      setTickets(payload);
    } catch (err) {
      setError(err?.message || "Unable to load tickets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
    fetchCustomers().then(setCustomers).catch((err) => console.error(err));
    fetchNodes().then(setNodes).catch((err) => console.error(err));
  }, [loadTickets]);

  const grouped = useMemo(() => {
    return TICKET_STATUSES.reduce((acc, column) => {
      acc[column.key] = tickets.filter((ticket) => ticket.status === column.key);
      return acc;
    }, {});
  }, [tickets]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        customerId: formState.customerId || null,
        nodeId: formState.nodeId || null,
        severity: formState.severity,
        description: formState.description || "No description",
        assignedTo: formState.assignedTo || null,
        slaMinutes: Number(formState.slaMinutes)
      };
      const ticket = await createTicket(payload);
      setTickets((prev) => [ticket, ...prev]);
      setFormState((prev) => ({ ...prev, description: "" }));
    } catch (err) {
      console.error("Unable to create ticket", err);
    }
  };

  const handleStatusChange = async (ticketId, status) => {
    try {
      const updated = await updateTicket(ticketId, { status });
      setTickets((prev) => prev.map((ticket) => (ticket.id === updated.id ? updated : ticket)));
    } catch (error) {
      console.error("Ticket update failed", error);
    }
  };

  return (
    <section className="tickets-page">
      <header className="module-header">
        <div>
          <h2>Trouble ticket board</h2>
          <p className="muted">SWAT board for escalations.</p>
        </div>
      </header>
      {error && <p className="muted error">{error}</p>}
      <div className="tickets-layout">
        <div className="ticket-board">
          <div className="ticket-columns">
            {TICKET_STATUSES.map((column) => (
              <div key={column.key} className="ticket-column">
                <header>
                  <h3>{column.label}</h3>
                  <span className="pill small">{grouped[column.key]?.length || 0}</span>
                </header>
                <div className="ticket-stack">
                  {grouped[column.key]?.map((ticket) => (
                    <article key={ticket.id} className="ticket-card">
                      <div className="ticket-meta">
                        <strong>{ticket.description}</strong>
                        <small>{ticket.nodeName || "N/A"}</small>
                      </div>
                      <p className="muted small">{formatSla(ticket.slaDue)}</p>
                      <select value={ticket.status} onChange={(event) => handleStatusChange(ticket.id, event.target.value)}>
                        {TICKET_STATUSES.map((item) => (
                          <option key={item.key} value={item.key}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <form className="ticket-form" onSubmit={handleSubmit}>
          <h3>Trigger ticket</h3>
          <label className="form-field">
            Customer
            <select value={formState.customerId} onChange={(event) => setFormState({ ...formState, customerId: event.target.value })}>
              <option value="">Unassigned</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.fullName}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Node
            <select value={formState.nodeId} onChange={(event) => setFormState({ ...formState, nodeId: event.target.value })}>
              <option value="">Select node</option>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Issue type
            <select value={formState.issueType} onChange={(event) => setFormState({ ...formState, issueType: event.target.value })}>
              {ISSUE_TYPES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Severity
            <select value={formState.severity} onChange={(event) => setFormState({ ...formState, severity: event.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label className="form-field">
            Assigned engineer
            <select value={formState.assignedTo} onChange={(event) => setFormState({ ...formState, assignedTo: event.target.value })}>
              {ENGINEERS.map((engineer) => (
                <option key={engineer.id} value={engineer.id}>
                  {engineer.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            SLA timer (min)
            <input
              type="number"
              min="30"
              value={formState.slaMinutes}
              onChange={(event) => setFormState({ ...formState, slaMinutes: event.target.value })}
            />
          </label>
          <label className="form-field">
            Description
            <textarea
              value={formState.description}
              onChange={(event) => setFormState({ ...formState, description: event.target.value })}
              rows={3}
            />
          </label>
          <button type="submit" className="primary-btn">
            Create ticket
          </button>
        </form>
      </div>
    </section>
  );
}
