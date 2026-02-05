import Session from '../models/scamModel.js';
import { analyzeScamMessage } from '../services/geminiService.js';
import { modelWithTools, SYSTEM_PROMPT } from '../services/aiChatService.js';
import { getSentimentScore } from '../utils/sentimentAnalysis.js';
import { ADVANCED_AGENT_SYSTEM_PROMPT } from '../prompt.js';

// Combined Risk Assessment Function
function getFinalRiskAssessment(geminiRes, sentimentRes) {
    const GEMINI_WEIGHT = 0.7;
    const SENTIMENT_WEIGHT = 0.3;

    // Normalize Gemini score: if isScam is false, the risk is effectively 0
    const geminiRisk = geminiRes.isScam ? geminiRes.confidenceScore : 0;
    
    // Combine scores
    const totalRiskScore = (geminiRisk * GEMINI_WEIGHT) + (sentimentRes.scamProbability * SENTIMENT_WEIGHT);

    // Final decision thresholds
    let decision = "SAFE";
    if (totalRiskScore > 0.75) decision = "HIGH_RISK_SCAM";
    else if (totalRiskScore > 0.40) decision = "SUSPICIOUS";

    return {
        totalRiskScore: parseFloat(totalRiskScore.toFixed(3)),
        decision: decision,
        confidence: totalRiskScore > 0.75 ? "HIGH" : totalRiskScore > 0.40 ? "MODERATE" : "LOW",
        // Logic: Should we trigger the Honey-Pot Agent?
        triggerAgent: totalRiskScore > 0.5
    };
}

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
                    ["system", ADVANCED_AGENT_SYSTEM_PROMPT],
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
            // ========== NEW SESSION - DOUBLE LAYER ANALYSIS ==========
            console.log(`New session ${sessionId} - Running double-layer analysis...`);

            // LAYER 1: Gemini AI Analysis
            const geminiResult = await analyzeScamMessage(message.text, metadata);
            console.log("🤖 Gemini Analysis:", {
                isScam: geminiResult.isScam,
                confidence: (geminiResult.confidenceScore * 100).toFixed(1) + "%"
            });

            // LAYER 2: Sentiment Analysis
            const sentimentResult = await getSentimentScore(message.text);
            console.log("📊 Sentiment Analysis:", {
                scamProbability: (sentimentResult.scamProbability * 100).toFixed(1) + "%",
                classification: sentimentResult.classification,
                indicators: sentimentResult.indicators
            });

            // COMBINED DECISION: Weighted risk assessment
            const finalAssessment = getFinalRiskAssessment(geminiResult, sentimentResult);
            console.log("🎯 Final Risk Assessment:", {
                totalRiskScore: (finalAssessment.totalRiskScore * 100).toFixed(1) + "%",
                decision: finalAssessment.decision,
                confidence: finalAssessment.confidence,
                triggerAgent: finalAssessment.triggerAgent
            });

            if (!finalAssessment.triggerAgent) {
                // SAFE - Not triggering honey-pot agent
                const newSession = new Session({
                    sessionId: sessionId,
                    status: 'completed',
                    scamDetected: false,
                    metadata: metadata,
                    conversationHistory: [{
                        sender: message.sender || "user",
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
                    
                });

            } else {
                // HIGH RISK - Trigger honey-pot agent
                const messages = [
                    ["system", ADVANCED_AGENT_SYSTEM_PROMPT],
                    ["human", message.text]
                ];

                // Generate AI response
                const aiResponse = await modelWithTools.invoke(messages);
                const aiReply = aiResponse.content || "Oh, wait, I'm getting a call, one second...";

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
                    totalMessagesExchanged: 2
                });

                await newSession.save();

                return res.status(200).json({
                    status: "success",
                    reply: aiReply,
                    scamDetected: true,
                    sessionStatus: 'active',
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