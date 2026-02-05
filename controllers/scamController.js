const Session = require('../models/scamModel');
const { analyzeScamMessage } = require('../services/geminiService');
const { modelWithTools, SYSTEM_PROMPT, recordScamIntelligence } = require('../services/aiChatService');

async function ReceiveMessageAndProcess(req, res) {
    try {
        const { sessionId, message, metadata } = req.body;
        
        // Validation
        if (!sessionId || !message?.text) {
            return res.status(400).json({ 
                status: "error", 
                message: "Missing required fields: sessionId and message.text are required" 
            });
        }

        let session = await Session.findOne({ sessionId });

        // Step 1: Initialize new session if needed
        if (!session) {
            console.log(`[NEW SESSION] ${sessionId} - Analyzing initial message...`);
            
            const analysis = await analyzeScamMessage(message.text, metadata);
            
            session = new Session({
                sessionId,
                scamDetected: analysis.isScam,
                status: analysis.isScam ? 'active' : 'completed',
                metadata: metadata || {},
                conversationHistory: [],
                extractedIntelligence: {
                    bankAccounts: [],
                    upiIds: [],
                    phishingLinks: [],
                    phoneNumbers: [],
                    suspiciousKeywords: analysis.keywords || []
                },
                agentNotes: analysis.reasoning || "",
                totalMessagesExchanged: 0
            });

            // If not a scam, save and exit early
            if (!analysis.isScam) {
                await session.save();
                return res.status(200).json({ 
                    status: "success", 
                    reply: "Thank you for your message.", 
                    scamDetected: false 
                });
            }
        }

        // Step 2: Check if session is still active
        if (session.status === 'completed') {
            return res.status(200).json({
                status: "success",
                reply: "This conversation has ended. Thank you!",
                scamDetected: true
            });
        }

        // Step 3: Build conversation context for AI
        const conversationMessages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...session.conversationHistory.map(msg => ({
                role: msg.sender === "scammer" ? "user" : "assistant",
                content: msg.text
            })),
            { role: "user", content: message.text }
        ];

        console.log(`[AI PROCESSING] Session ${sessionId} - Message #${session.totalMessagesExchanged + 1}`);

        // Step 4: First AI invocation (may include tool calls)
        let aiResponse = await modelWithTools.invoke(conversationMessages);

        // Step 5: Process tool calls if present
        if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
            console.log(`[TOOL CALLS] ${aiResponse.tool_calls.length} intelligence extraction(s) detected`);
            
            const toolMessages = [];
            
            for (const toolCall of aiResponse.tool_calls) {
                // Inject sessionId into tool arguments
                const toolArgs = {
                    ...toolCall.args,
                    sessionId: sessionId
                };

                // Execute the tool
                const toolResult = await recordScamIntelligence.invoke(toolArgs);
                
                toolMessages.push({
                    role: "tool",
                    content: toolResult,
                    tool_call_id: toolCall.id
                });
            }

            // Step 6: Second AI invocation to generate natural response after logging
            const finalMessages = [
                ...conversationMessages,
                aiResponse, // The message with tool_calls
                ...toolMessages // The tool results
            ];

            aiResponse = await modelWithTools.invoke(finalMessages);
        }

        // Step 7: Extract final AI reply
        const aiReply = aiResponse.content || "Just a moment... checking my app...";

        // Step 8: Update conversation history
        session.conversationHistory.push(
            { sender: "scammer", text: message.text, timestamp: Date.now() },
            { sender: "user", text: aiReply, timestamp: Date.now() }
        );
        
        session.totalMessagesExchanged = session.conversationHistory.length;
        session.status = 'active';

        // Step 9: Save to database
        await session.save();

        console.log(`[RESPONSE SENT] Session ${sessionId} - Total extracted: UPI(${session.extractedIntelligence.upiIds.length}), Bank(${session.extractedIntelligence.bankAccounts.length}), Links(${session.extractedIntelligence.phishingLinks.length}), Phones(${session.extractedIntelligence.phoneNumbers.length})`);

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

    } catch (error) {
        console.error("[CRITICAL ERROR]", error);
        
        // Try to mark session as error state
        try {
            if (req.body.sessionId) {
                await Session.findOneAndUpdate(
                    { sessionId: req.body.sessionId },
                    { status: 'error', agentNotes: error.message }
                );
            }
        } catch (dbError) {
            console.error("[DB ERROR]", dbError);
        }

        return res.status(500).json({ 
            status: "error", 
            message: "An error occurred processing your request",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
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
                metadata: session.metadata
            }
        });
    } catch (error) {
        console.error("Error fetching session:", error);
        return res.status(500).json({ status: "error", message: error.message });
    }
}

module.exports = { ReceiveMessageAndProcess, GetSessionIntelligence };