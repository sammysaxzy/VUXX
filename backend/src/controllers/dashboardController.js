import { query } from "../config/db.js";

function tenantIdOrThrow(req) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    const error = new Error("Tenant context missing");
    error.status = 400;
    throw error;
  }
  return tenantId;
}

export async function getDashboardMetrics(req, res, next) {
  try {
    const tenantId = tenantIdOrThrow(req);
    const [customerResult, radiusResult, ticketResult] = await Promise.all([
      query("SELECT account_status, payment_status FROM customers WHERE tenant_id = $1", [tenantId]),
      query("SELECT status FROM radius_sessions WHERE tenant_id = $1", [tenantId]),
      query("SELECT status FROM tickets WHERE tenant_id = $1", [tenantId])
    ]);
    const customers = customerResult.rows;
    const sessions = radiusResult.rows;
    const tickets = ticketResult.rows;

    const overdue = customers.filter((row) => row.payment_status === "overdue").length;
    const activeSubs = customers.filter((row) => row.account_status === "active").length;
    const offline = sessions.filter((row) => row.status !== "active").length;
    const open = tickets.filter((row) => row.status !== "resolved").length;
    const activeSessions = sessions.filter((row) => row.status === "active").length;
    const radiusLoad = `${activeSessions}/${Math.max(sessions.length, 1)}`;
    const throughput = `${Math.min(100, Math.round((activeSessions / Math.max(customers.length, 1)) * 60 + 40))}%`;

    res.json({
      overdue,
      offline,
      open,
      activeSubs,
      radiusLoad,
      throughput,
      totalCustomers: customers.length,
      totalSessions: sessions.length,
      totalTickets: tickets.length
    });
  } catch (error) {
    next(error);
  }
}
