import Session from '../models/scamModel.js';
import { analyzeScamMessage } from '../services/geminiService.js';
import { modelWithTools, recordScamIntelligence, SYSTEM_PROMPT } from '../services/aiChatService.js';
import { getSentimentScore } from '../utils/sentimentAnalysis.js';
import { ADVANCED_AGENT_SYSTEM_PROMPT } from '../prompt.js';
import { ToolMessage } from "@langchain/core/messages";
import { checkAndSubmitFinalResult } from './finalSubmissionController.js';

// Helper function to add timeout to promises
function withTimeout(promise, timeoutMs, errorMessage = 'Operation timed out') {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
        )
    ]);
}

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
        // 1. Validation
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
        let session = await Session.findOne({ sessionId });

        if (session) {
            // ========== EXISTING SESSION FLOW ==========
            console.log(`[EXISTING SESSION] ${sessionId} - Scam Status: ${session.scamDetected}`);

            // Check if session is completed or error state
            if (session.status === 'completed' || session.status === 'error') {
                return res.status(200).json({
                    status: "success",
                    reply: "This conversation has ended. Thank you!",
                    scamDetected: session.scamDetected
                });
            }

            if (!session.scamDetected) {
                // Not a scammer - Just return simple response
                return res.status(200).json({
                    status: "success",
                    reply: "This session is not identified as a scam.",
                    scamDetected: false,
                    message: "No further action required."
                });
            }

            // ========== SCAM SESSION - AI RESPONSE WITH TOOL CALLING ==========
            
            // Step 1: Build conversation context for AI
            const conversationMessages = [
                ["system", ADVANCED_AGENT_SYSTEM_PROMPT],
                ...session.conversationHistory.map(msg => [
                    msg.sender === "scammer" ? "human" : "ai", 
                    msg.text
                ]),
                ["human", message.text]
            ];

            console.log(`[AI PROCESSING] Session ${sessionId} - Message #${session.totalMessagesExchanged + 1}`);

            // Step 2: First AI invocation (may include tool calls) with timeout
            let aiResponse = await withTimeout(
                modelWithTools.invoke(conversationMessages),
                90000, // 90 second timeout for AI response
                'AI response timed out after 90 seconds'
            );

            // Step 3: Process tool calls if present
            if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
                console.log(`[TOOL CALLS] ${aiResponse.tool_calls.length} intelligence extraction(s) detected`);
                
                const toolMessages = [];
                
                for (const toolCall of aiResponse.tool_calls) {
                    try {
                        // Inject sessionId into tool arguments
                        const toolArgs = {
                            ...toolCall.args,
                            sessionId: sessionId
                        };

                        // Execute the tool
                        const toolResult = await recordScamIntelligence.invoke(toolArgs);
                        
                        // Correct LangChain tool message format
                        toolMessages.push(
                            new ToolMessage({
                                content: toolResult,
                                tool_call_id: toolCall.id
                            })
                        );
                    } catch (toolError) {
                        console.error(`[TOOL ERROR] ${toolCall.name}:`, toolError);
                        toolMessages.push(
                            new ToolMessage({
                                content: `Error: ${toolError.message}`,
                                tool_call_id: toolCall.id
                            })
                        );
                    }
                }

                // Step 4: Second AI invocation to generate natural response after logging
                const finalMessages = [
                    ...conversationMessages,
                    aiResponse, // The AIMessage with tool_calls
                    ...toolMessages // The ToolMessage responses
                ];

                aiResponse = await withTimeout(
                    modelWithTools.invoke(finalMessages),
                    90000, // 90 second timeout
                    'AI response timed out after 90 seconds'
                );
            }

            // Step 5: Extract final AI reply with validation
            if (!aiResponse || !aiResponse.content) {
                throw new Error("AI returned empty or invalid response");
            }
            
            const aiReply = aiResponse.content;

            // Step 6: Update conversation history
            session.conversationHistory.push(
                { sender: "scammer", text: message.text, timestamp: Date.now() },
                { sender: "user", text: aiReply, timestamp: Date.now() }
            );
            
            session.totalMessagesExchanged = session.conversationHistory.length;
            session.status = 'active';
            session.metadata = metadata || session.metadata;

            // Step 7: Save to database
            await session.save();

            console.log(`[RESPONSE SENT] Session ${sessionId} - Total extracted: UPI(${session.extractedIntelligence.upiIds.length}), Bank(${session.extractedIntelligence.bankAccounts.length}), Links(${session.extractedIntelligence.phishingLinks.length}), Phones(${session.extractedIntelligence.phoneNumbers.length})`);

            // Step 8: Check if ready to submit final results to GUVI API
            const submissionResult = await checkAndSubmitFinalResult(sessionId);
            if (submissionResult.submitted) {
                console.log(`[GUVI SUBMISSION] ✅ Final results submitted for session ${sessionId}`);
            }

            return res.status(200).json({
                status: "success",
                reply: aiReply,
                scamDetected: true,
                sessionInfo: {
                    messagesExchanged: session.totalMessagesExchanged,
                    intelligenceGathered: {
                        upiIds: session.extractedIntelligence.upiIds.length,
                        bankAccounts: session.extractedIntelligence.bankAccounts.length,
                        phishingLinks: session.extractedIntelligence.phishingLinks.length,
                        phoneNumbers: session.extractedIntelligence.phoneNumbers.length
                    }
                }
            });

        } else {
            // ========== NEW SESSION - DOUBLE LAYER ANALYSIS ==========
            console.log(`[NEW SESSION] ${sessionId} - Running double-layer analysis...`);

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
                // ========== SAFE - Not triggering honey-pot agent ==========
                
                // Use atomic upsert to prevent race conditions
                session = await Session.findOneAndUpdate(
                    { sessionId },
                    {
                        $setOnInsert: {
                            sessionId: sessionId,
                            status: 'completed',
                            scamDetected: false,
                            metadata: metadata || {},
                            conversationHistory: [{
                                sender: message.sender || "user",
                                text: message.text,
                                timestamp: message.timestamp || Date.now()
                            }],
                            extractedIntelligence: {
                                bankAccounts: [],
                                upiIds: [],
                                phishingLinks: [],
                                phoneNumbers: [],
                                suspiciousKeywords: []
                            },
                            agentNotes: "Not a scam - below risk threshold",
                            totalMessagesExchanged: 1
                        }
                    },
                    { upsert: true, new: true }
                );

                return res.status(200).json({
                    status: "success",
                    reply: "Thank you for your message.",
                    scamDetected: false,
                    riskAssessment: {
                        totalRiskScore: finalAssessment.totalRiskScore,
                        decision: finalAssessment.decision,
                        confidence: finalAssessment.confidence
                    }
                });

            } else {
                // ========== HIGH RISK - Trigger honey-pot agent with tool calling ==========
                
                const messages = [
                    ["system", ADVANCED_AGENT_SYSTEM_PROMPT],
                    ["human", message.text]
                ];

                console.log(`[AI PROCESSING] New scam session - Generating first response`);

                // Step 1: First AI invocation with timeout
                let aiResponse = await withTimeout(
                    modelWithTools.invoke(messages),
                    90000, // 90 second timeout
                    'AI response timed out after 90 seconds'
                );

                // Step 2: Process tool calls if present
                if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
                    console.log(`[TOOL CALLS] ${aiResponse.tool_calls.length} intelligence extraction(s) detected in first message`);
                    
                    // Create session first so tools can save to it
                    const tempSession = await Session.findOneAndUpdate(
                        { sessionId },
                        {
                            $setOnInsert: {
                                sessionId: sessionId,
                                status: 'active',
                                scamDetected: true,
                                metadata: metadata || {},
                                conversationHistory: [],
                                extractedIntelligence: {
                                    bankAccounts: [],
                                    upiIds: [],
                                    phishingLinks: [],
                                    phoneNumbers: [],
                                    suspiciousKeywords: geminiResult.keywords || []
                                },
                                agentNotes: `Risk Score: ${finalAssessment.totalRiskScore} - ${geminiResult.reasoning || ""}`,
                                totalMessagesExchanged: 0
                            }
                        },
                        { upsert: true, new: true }
                    );

                    const toolMessages = [];
                    
                    for (const toolCall of aiResponse.tool_calls) {
                        try {
                            const toolArgs = {
                                ...toolCall.args,
                                sessionId: sessionId
                            };

                            const toolResult = await recordScamIntelligence.invoke(toolArgs);
                            
                            toolMessages.push(
                                new ToolMessage({
                                    content: toolResult,
                                    tool_call_id: toolCall.id
                                })
                            );
                        } catch (toolError) {
                            console.error(`[TOOL ERROR] ${toolCall.name}:`, toolError);
                            toolMessages.push(
                                new ToolMessage({
                                    content: `Error: ${toolError.message}`,
                                    tool_call_id: toolCall.id
                                })
                            );
                        }
                    }

                    // Step 3: Second AI invocation
                    const finalMessages = [
                        ...messages,
                        aiResponse,
                        ...toolMessages
                    ];

                    aiResponse = await withTimeout(
                        modelWithTools.invoke(finalMessages),
                        90000, // 90 second timeout
                        'AI response timed out after 90 seconds'
                    );
                }

                // Step 4: Validate AI response
                if (!aiResponse || !aiResponse.content) {
                    throw new Error("AI returned empty or invalid response");
                }

                const aiReply = aiResponse.content;

                // Step 5: Create or update session with conversation history
                session = await Session.findOneAndUpdate(
                    { sessionId },
                    {
                        $setOnInsert: {
                            sessionId: sessionId,
                            status: 'active',
                            scamDetected: true,
                            metadata: metadata || {},
                            extractedIntelligence: {
                                bankAccounts: [],
                                upiIds: [],
                                phishingLinks: [],
                                phoneNumbers: [],
                                suspiciousKeywords: geminiResult.keywords || []
                            },
                            agentNotes: `Risk Score: ${finalAssessment.totalRiskScore} - ${geminiResult.reasoning || ""}`,
                        },
                        $push: {
                            conversationHistory: {
                                $each: [
                                    {
                                        sender: message.sender || "scammer",
                                        text: message.text,
                                        timestamp: message.timestamp || Date.now()
                                    },
                                    {
                                        sender: "user",
                                        text: aiReply,
                                        timestamp: Date.now()
                                    }
                                ]
                            }
                        },
                        $set: {
                            totalMessagesExchanged: 2
                        }
                    },
                    { upsert: true, new: true }
                );

                console.log(`[SCAM DETECTED] Session ${sessionId} created - Agent activated`);

                return res.status(200).json({
                    status: "success",
                    reply: aiReply,
                    scamDetected: true,
                    sessionStatus: 'active',
                    riskAssessment: {
                        totalRiskScore: finalAssessment.totalRiskScore,
                        decision: finalAssessment.decision,
                        confidence: finalAssessment.confidence
                    }
                });
            }
        }

    } catch (error) {
        console.error("[CRITICAL ERROR]", error);
        
        // Check if it's a timeout error
        const isTimeoutError = error.name === 'AbortError' || 
                               error.message?.includes('timeout') || 
                               error.message?.includes('timed out');
        
        // Try to mark session as error state
        try {
            if (req.body.sessionId) {
                await Session.findOneAndUpdate(
                    { sessionId: req.body.sessionId },
                    { 
                        status: isTimeoutError ? 'active' : 'error', 
                        agentNotes: `${isTimeoutError ? 'Timeout - retryable' : 'Error'}: ${error.message}` 
                    }
                );
            }
        } catch (dbError) {
            console.error("[DB ERROR]", dbError);
        }

        // Return appropriate error response
        if (isTimeoutError) {
            return res.status(504).json({ 
                status: "error", 
                message: "Request processing timed out. Please try again.",
                retryable: true
            });
        }

        return res.status(500).json({ 
            status: "error", 
            message: "An error occurred processing your request",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            retryable: false
        });
    }
}

// Optional: Endpoint to get session intelligence summary
async function GetSessionIntelligence(req, res) {
    try {
        const { sessionId } = req.params;
        
        const session = await Session.findOne({ sessionId });
        
        if (!session) {
            return res.status(404).json({ status: "error", message: "Session not found" });
        }

        return res.status(200).json({
            status: "success",
            data: {
                sessionId: session.sessionId,
                scamDetected: session.scamDetected,
                status: session.status,
                extractedIntelligence: session.extractedIntelligence,
                totalMessages: session.totalMessagesExchanged,
                conversationHistory: session.conversationHistory,
                metadata: session.metadata,
                agentNotes: session.agentNotes,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt
            }
        });
    } catch (error) {
        console.error("Error fetching session:", error);
        return res.status(500).json({ status: "error", message: error.message });
    }
}

export { ReceiveMessageAndProcess, GetSessionIntelligence };