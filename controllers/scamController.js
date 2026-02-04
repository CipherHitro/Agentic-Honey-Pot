const { Session } = require('../models/scamModel')

async function ReceiveMessageAndProcess(req,res) {
        // {
        //     "sessionId": "S1",
        //     "message": { "sender": "scammer", "text": "Your account is blocked" },
        //     "conversationHistory": []
        // }
    console.log("body : " , req.body)
}

module.exports = {
    ReceiveMessageAndProcess
}
