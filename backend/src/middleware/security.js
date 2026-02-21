import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const originList = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
  : [];

export const securityMiddleware = [
  helmet(),
  cors({
    origin(origin, callback) {
      if (!origin || originList.length === 0 || originList.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    }
  }),
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
];
