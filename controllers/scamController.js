const Session = require('../models/scamModel')
const { analyzeScamMessage } = require('../services/geminiService')

async function ReceiveMessageAndProcess(req, res) {
    try {
        // 1. Safety Check: Check if req.body exists
        if (!req.body || !req.body.sessionId) {
            return res.status(400).json({
                status: "error",
                message: "Missing sessionId in request body"
            });
        }
    

        const { sessionId, message, metadata } = req.body;

        // 2. Identification Logic (Your Gemini function)
        const aiResponse = await analyzeScamMessage(message.text, metadata);

        // 3. Prepare Update Data
        // If it's the FIRST message, MongoDB creates it. 
        // If it's the SECOND+, it updates it.
        const updateData = {
            $set: {
                metadata: metadata,
                scamDetected: aiResponse.isScam,
                status: aiResponse.isScam ? 'active' : 'pending'
            },
            $push: { 
                conversationHistory: {
                    sender: message.sender,
                    text: message.text,
                    timestamp: message.timestamp || Date.now()
                } 
            },
            $inc: { totalMessagesExchanged: 1 }
        };

        // 4. The "Upsert" Operation
        // This command works for both "New" and "Existing" sessions automatically
        const session = await Session.findOneAndUpdate(
            { sessionId: sessionId }, // Filter
            updateData,               // Data to change/add
            { 
              upsert: true,           // Create if doesn't exist
              new: true,              // Return the updated document
              setDefaultsOnInsert: true // Applies schema defaults (like status: 'pending')
            }
        );

        return res.status(200).json({
            status: "success",
            reply: aiResponse.isScam ? "Wait, I need to find my glasses first..." : "Okay!",
            scamDetected: session.scamDetected
        });

    } catch (error) {
        console.error("Critical Error:", error);
        return res.status(500).json({ status: "error", message: error.message });
    }
}

module.exports = {
    ReceiveMessageAndProcess
}
