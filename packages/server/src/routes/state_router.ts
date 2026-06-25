import express, { Request, Response } from 'express';
import { systemState } from '../state/state_manager.js';

const router = express.Router();

router.get('/', (req: Request, res: Response) => {
  res.json(systemState);
});

export default router;
