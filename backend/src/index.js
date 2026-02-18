import http from "http";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import authRoutes from "./routes/auth.js";
import infraRoutes from "./routes/infra.js";
import { requireAuth, requireRole } from "./middleware/auth.js";
import { requireTenant } from "./middleware/tenant.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Missing token"));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = payload;
    return next();
  } catch (error) {
    return next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  if (socket.user?.tenantId) {
    socket.join(`tenant:${socket.user.tenantId}`);
  }
});

app.set("io", io);
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "isp-map-crm-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api", requireAuth, requireTenant, infraRoutes);

app.get(
  "/api/admin/ping",
  requireAuth,
  requireRole("super_admin", "isp_admin"),
  (_req, res) => res.json({ ok: true })
);

const port = Number(process.env.PORT || 4000);
server.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
