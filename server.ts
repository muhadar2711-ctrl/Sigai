import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { initializeEngines } from "./server/engine.js";
import { apiRouter } from "./server/api.js";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Bootstrap structural folders safely
  try {
    const logsDir = path.join(process.cwd(), "logs");
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    
    // Auto-create empty ai.log to prevent read errors
    const aiLogFile = path.join(logsDir, "ai.log");
    if (!fs.existsSync(aiLogFile)) {
      fs.writeFileSync(aiLogFile, "", "utf-8");
    }
  } catch (e) {
    console.error("Failed to bootstrap structural directories:", e);
  }

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Enable CORS for frontend decoupling
  app.use(cors({
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-admin-token", "x-grok-key", "x-webhook-token"]
  }));

  // API Routes
  app.use("/api", apiRouter);

  // Initialize Trading Engines & Scheduler
  initializeEngines();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
