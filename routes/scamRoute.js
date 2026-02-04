const express = require("express")
const { ReceiveMessageAndProcess } = require('../controllers/scamController')
const router = express.Router();

router.post('/scam-listener',ReceiveMessageAndProcess)

module.exports = router