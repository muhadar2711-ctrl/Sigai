
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { bootstrapSystem } from './services/engine.js';
import stateRoutes from "./routes/state_router.js";
import { initFirebase } from './firebase.js';
import { getSupabase } from './supabase.js';
import aiRouter from './routes/ai_engine.js';

const app = express();
const port = process.env.PORT || 3001;

// ES Module-safe way to get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

// --- PRODUCTION FRONTEND SERVING ---
// Determine the path to the client build directory
const clientBuildPath = path.resolve(__dirname, '../../client');

// Serve static files from the React app
app.use(express.static(clientBuildPath));

// API routes
app.use("/api/state", stateRoutes);
app.use("/api/ai", aiRouter);

// Health check route
app.get("/health", (req: Request, res: Response) => {
  res.status(200).send("OK");
});

// The "catchall" handler: for any request that doesn't match one above,
// send back React's index.html file.
app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.resolve(clientBuildPath, 'index.html'));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`[HTTP] Server is listening on port ${port}`);
  
  try {
    initFirebase();
    console.log("[FIREBASE] Firebase initialized successfully.");
  } catch (error) {
    console.error("[FIREBASE] Firebase initialization failed:", error);
  }
  
  console.log("[SYSTEM] Bootstrapping system...");
  bootstrapSystem();
});
