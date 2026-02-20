export function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const payload = {
    error: err.message || "Internal server error"
  };
  if (status === 500) {
    console.error("Unhandled error", err);
  }
  res.status(status).json(payload);
}
