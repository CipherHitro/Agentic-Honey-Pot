import express from 'express';
import { ReceiveMessageAndProcess } from '../controllers/scamController.js';

const router = express.Router();

router.post('/scam-listener', ReceiveMessageAndProcess);

export default router;