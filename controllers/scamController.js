const { Session } = require('../models/scamModel')
const { analyzeScamMessage } = require('../services/geminiService')

async function ReceiveMessageAndProcess(req,res) {
           
    const { message, metadata } = req.body
    // console.log(message);
    const aiResponse = await analyzeScamMessage(message.text, metadata)
    console.log("AI response in the API call : " , aiResponse)

    return res.status(200).json({message: "ok"});
}

module.exports = {
    ReceiveMessageAndProcess
}
