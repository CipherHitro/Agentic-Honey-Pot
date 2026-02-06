import express from 'express';
import { ReceiveMessageAndProcess } from '../controllers/scamController.js';
import { manualSubmitFinalResult } from '../controllers/finalSubmissionController.js';

const router = express.Router();

router.post('/scam-listener', ReceiveMessageAndProcess);
router.post('/submit-final-result', manualSubmitFinalResult);

export default router;