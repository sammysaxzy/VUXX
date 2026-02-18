export function requireTenant(req, res, next) {
  if (!req.user?.tenantId && req.user?.role !== "super_admin") {
    return res.status(400).json({ error: "Tenant context missing" });
  }
  return next();
}
