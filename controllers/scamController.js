import Session from '../models/scamModel.js';
import { analyzeScamMessage } from '../services/geminiService.js';
import { modelWithTools, SYSTEM_PROMPT } from '../services/aiChatService.js';
import { getSentimentScore } from '../utils/sentimentAnalysis.js';

async function ReceiveMessageAndProcess(req, res) {
    try {
        // 1. Safety Check: Validate request body
        if (!req.body || !req.body.sessionId) {
            return res.status(400).json({
                status: "error",
                message: "Missing sessionId in request body"
            });
        }

        if (!req.body.message || !req.body.message.text) {
            return res.status(400).json({
                status: "error",
                message: "Missing message text in request body"
            });
        }

        const { sessionId, message, metadata } = req.body;

        // 2. Check if session already exists
        let session = await Session.findOne({ sessionId: sessionId });

        if (session) {
            // ========== EXISTING SESSION ==========
            console.log(`Session ${sessionId} found. Scam status: ${session.scamDetected}`);

            if (session.scamDetected) {
                // This is a scammer - Generate AI response
                const conversationHistory = session.conversationHistory || [];
                
                // Build conversation messages for AI
                const messages = [
                    ["system", SYSTEM_PROMPT],
                    ...conversationHistory.map(m => [
                        m.sender === "scammer" ? "human" : "ai", 
                        m.text
                    ]),
                    ["human", message.text]
                ];

                // Generate AI response
                const aiResponse = await modelWithTools.invoke(messages);
                const aiReply = aiResponse.content || "Oh, wait, I'm getting a call, one second...";

                // Update session with both user message and AI response
                session.conversationHistory.push({
                    sender: message.sender || "scammer",
                    text: message.text,
                    timestamp: message.timestamp || Date.now()
                });

                session.conversationHistory.push({
                    sender: "user", // AI Agent's response
                    text: aiReply,
                    timestamp: Date.now()
                });

                session.totalMessagesExchanged += 2; // User message + AI response
                session.metadata = metadata || session.metadata;

                await session.save();

                return res.status(200).json({
                    status: "success",
                    reply: aiReply,
                    scamDetected: true,
                    sessionStatus: session.status
                });

            } else {
                // Not a scammer - Just return simple response
                return res.status(200).json({
                    status: "success",
                    reply: "This session is not identified as a scam.",
                    scamDetected: false,
                    message: "No further action required."
                });
            }

        } else {
            // ========== NEW SESSION ==========
            console.log(`New session ${sessionId} - Analyzing message...`);

            // Analyze the message to identify if it's a scam
            const analysisResult = await analyzeScamMessage(message.text, metadata);

            if (!analysisResult.isScam) {
                // Not a scammer - Create session and return simple response
                const newSession = new Session({
                    sessionId: sessionId,
                    status: 'completed',
                    scamDetected: false,
                    metadata: metadata,
                    conversationHistory: [{
                        sender: message.sender || "scammer",
                        text: message.text,
                        timestamp: message.timestamp || Date.now()
                    }],
                    totalMessagesExchanged: 1
                });

                await newSession.save();

                return res.status(200).json({
                    status: "success",
                    reply: "This is not identified as a scam message.",
                    scamDetected: false,
                    confidenceScore: analysisResult.confidenceScore
                });

            } else {
                // This is a scammer - Generate AI response and create session
                const messages = [
                    ["system", SYSTEM_PROMPT],
                    ["human", message.text]
                ];

                // Generate AI response
                const aiResponse = await modelWithTools.invoke(messages);
                const aiReply = aiResponse.content || "Oh, wait, I'm getting a call, one second...";

                // Perform sentiment analysis
                const sentimentAnalysis = await getSentimentScore(message.text);
                console.log("==================== SENTIMENT ANALYSIS ====================");
                console.log("Message:", message.text.substring(0, 50) + "...");
                console.log("Sentiment Score:", sentimentAnalysis.score);
                console.log("Magnitude:", sentimentAnalysis.magnitude);
                console.log("Scam Probability:", (sentimentAnalysis.scamProbability * 100).toFixed(1) + "%");
                console.log("Classification:", sentimentAnalysis.classification);
                console.log("Indicators:", JSON.stringify(sentimentAnalysis.indicators, null, 2));
                console.log("===========================================================");

                // Create new session with both user message and AI response
                const newSession = new Session({
                    sessionId: sessionId,
                    status: 'active',
                    scamDetected: true,
                    metadata: metadata,
                    conversationHistory: [
                        {
                            sender: message.sender || "scammer",
                            text: message.text,
                            timestamp: message.timestamp || Date.now()
                        },
                        {
                            sender: "user", // AI Agent's response
                            text: aiReply,
                            timestamp: Date.now()
                        }
                    ],
                    totalMessagesExchanged: 2 // User message + AI response
                });

                await newSession.save();

                return res.status(200).json({
                    status: "success",
                    reply: aiReply,
                    scamDetected: true,
                    confidenceScore: analysisResult.confidenceScore,
                    sessionStatus: 'active',
                    sentimentAnalysis: sentimentAnalysis
                });
            }
        }

    } catch (error) {
        console.error("Critical Error:", error);
        return res.status(500).json({ 
            status: "error", 
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}

export { ReceiveMessageAndProcess };