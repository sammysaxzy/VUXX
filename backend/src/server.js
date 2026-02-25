import http from "http";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import authRoutes from "./routes/auth.js";
import customersRoutes from "./routes/customers.js";
import radiusRoutes from "./routes/radius.js";
import mapRoutes from "./routes/map.js";
import ticketRoutes from "./routes/tickets.js";
import dashboardRoutes from "./routes/dashboard.js";
import logsRoutes from "./routes/logs.js";
import { authenticateToken } from "./middleware/auth.js";
import { requireTenant } from "./middleware/tenant.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { securityMiddleware } from "./middleware/security.js";
import { logRequest } from "./middleware/logRequests.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
  }
});

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("JWT_SECRET is required");
}

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error("Missing token"));
  }
  try {
    const payload = jwt.verify(token, jwtSecret);
    socket.user = payload;
    return next();
  } catch (error) {
    return next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  const tenantId = socket.user?.tenantId;
  if (tenantId) {
    socket.join(`tenant:${tenantId}`);
  }
});

app.set("io", io);
app.use(...securityMiddleware);
app.use(express.json({ limit: "1mb" }));
app.use(logRequest);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "isp-map-crm-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", authenticateToken, requireTenant, dashboardRoutes);
app.use("/api/logs", authenticateToken, requireTenant, logsRoutes);
app.use("/api/customers", authenticateToken, requireTenant, customersRoutes);
app.use("/api/radius", authenticateToken, requireTenant, radiusRoutes);
app.use("/api/map", authenticateToken, requireTenant, mapRoutes);
app.use("/api/tickets", authenticateToken, requireTenant, ticketRoutes);

app.use(errorHandler);

const port = Number(process.env.PORT || 4000);
server.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
