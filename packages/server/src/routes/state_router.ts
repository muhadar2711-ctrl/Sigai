
import { Router } from 'express';
import { getSystemState } from '../state/state_manager.js';

const router = Router();

router.get('/', (req, res) => {
    res.json(getSystemState());
});

export default router;

// ... (rest of the file is the same)
