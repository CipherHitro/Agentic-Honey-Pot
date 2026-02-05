const express = require("express")
const { ReceiveMessageAndProcess } = require('../controllers/scamController')
const { ReceiveMessageAndGivenAIResponse } = require('../controllers/aiMessageController')
const router = express.Router();

router.post('/scam-listener', ReceiveMessageAndProcess)
router.post('/generate-response', ReceiveMessageAndGivenAIResponse)

module.exports = router