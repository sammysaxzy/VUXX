import { recordLog } from "../services/logService.js";

export async function logRequest(req, _res, next) {
  const level = "info";
  const source = "http";
  const message = `${req.method} ${req.originalUrl}`;
  const tenantId = req.user?.tenantId;
  try {
    if (tenantId) {
      await recordLog({ tenantId, level, source, message });
    }
  } catch (error) {
    console.error("Request log failed", error);
  }
  next();
}
