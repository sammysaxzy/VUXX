import http from "http";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import customersRoutes from "./routes/customers.js";
import infraRoutes from "./routes/infra.js";
import radiusRoutes from "./routes/radius.js";
import { requireAuth } from "./middleware/auth.js";
import { requireTenant } from "./middleware/tenant.js";
import { errorHandler } from "./middleware/errorHandler.js";

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
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "isp-map-crm-backend" });
});

app.use("/api/customers", requireAuth, requireTenant, customersRoutes);
app.use("/api/radius", requireAuth, requireTenant, radiusRoutes);
app.use("/api", requireAuth, requireTenant, infraRoutes);

app.use(errorHandler);

const port = Number(process.env.PORT || 4000);
server.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
