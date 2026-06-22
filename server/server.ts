import express from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import aiRoutes from './routes/ai';
import apiProxy from './api'; // MCP API proxy
import mcpStatus from './routes/mcp_status';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Allow larger payloads for images

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// API Routes
app.use('/api/ai', aiRoutes);
app.use('/api', apiProxy);
app.use('/api', mcpStatus);

// Serve static files from the React app
// In production, the client is built into the 'dist/client' directory
const clientBuildPath = path.join(__dirname, '../../dist/client');
app.use(express.static(clientBuildPath));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});


app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Serving static files from: ${clientBuildPath}`)
});
