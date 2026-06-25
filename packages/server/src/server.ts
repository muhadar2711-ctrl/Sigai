
import express from 'express';
import cors from 'cors';
import { bootstrapSystem } from './services/engine.js';
import stateRoutes from "./routes/state_routes.js";
import { initFirebase } from './firebase.js';
import { getSupabase } from './supabase.js';
import aiRouter from './routes/ai_engine.js'; // Corrected import

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

initFirebase();

// Basic uptime check
app.get("/"), (req, res) => {
  res.send("OK");
}

app.get('/supabase-test', async (req, res) => {
  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).send('Supabase not initialized');
  }
  try {
    const { data, error } = await supabase.from('your_table').select('*');
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).send(error);
  }
});

// API routes
app.use("/state", stateRoutes);
app.use("/ai", aiRouter); // Use the imported router

app.listen(port, () => {
  console.log(`[HTTP] Server is running on port ${port}`);
  bootstrapSystem();
});
