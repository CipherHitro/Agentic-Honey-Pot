const { Session } = require('../models/scamModel')
const { analyzeScamMessage } = require('../services/geminiService')

async function ReceiveMessageAndProcess(req,res) {
            /*{
                "sessionId" : "wertyu-dfghj-ertyui",
                "message" : {
                    "sender": "scammer",
                    "text": "Your bank account will be blocked today. Verify immediately.",
                    "timestamp": 1770005528731
                },
                "conversationHistory": [],
                "metadata": {
                    "channel": "SMS",
                    "language": "English",
                    "locale": "IN"
                }
            }*/
    const { message, metadata } = req.body
    // console.log(message);
    const aiResponse = await analyzeScamMessage(message.text, metadata)
    console.log("AI response in the API call : " , aiResponse)

    console.log("body : " , req.body)
    return res.status(200).json({message: "ok"});
}

module.exports = {
    ReceiveMessageAndProcess
}
