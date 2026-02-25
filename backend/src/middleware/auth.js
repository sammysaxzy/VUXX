import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be configured");
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function authenticateToken(req, _res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!token) {
    return next(httpError(401, "Missing authentication token"));
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.sub,
      role: payload.role,
      tenantId: payload.tenantId
    };
    return next();
  } catch (error) {
    return next(httpError(403, "Invalid authentication token"));
  }
}

export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(httpError(403, "Forbidden"));
    }
    return next();
  };
}
