import Session from '../models/scamModel.js';
import { analyzeScamMessage } from '../services/geminiService.js';
import { modelWithTools, recordScamIntelligence, SYSTEM_PROMPT } from '../services/aiChatService.js';
import { ToolMessage } from "@langchain/core/messages";

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

        // Step 1: Initialize new session if needed (with race condition protection)
        if (!session) {
            console.log(`[NEW SESSION] ${sessionId} - Analyzing initial message...`);
            
            const analysis = await analyzeScamMessage(message.text, metadata);
            
            // Atomic upsert to prevent duplicate sessions
            session = await Session.findOneAndUpdate(
                { sessionId },
                {
                    $setOnInsert: {
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
                    }
                },
                { upsert: true, new: true }
            );

            // If not a scam, exit early
            if (!analysis.isScam) {
                return res.status(200).json({ 
                    status: "success", 
                    reply: "Thank you for your message.", 
                    scamDetected: false 
                });
            }
        }

        // Step 2: Check if session is still active
        if (session.status === 'completed' || session.status === 'error') {
            return res.status(200).json({
                status: "success",
                reply: "This conversation has ended. Thank you!",
                scamDetected: true
            });
        }

        // Step 3: Build conversation context for AI (CORRECT FORMAT)
        const conversationMessages = [
            ["system", SYSTEM_PROMPT],
            ...session.conversationHistory.map(msg => [
                msg.sender === "scammer" ? "human" : "ai", 
                msg.text
            ]),
            ["human", message.text]
        ];

        console.log(`[AI PROCESSING] Session ${sessionId} - Message #${session.totalMessagesExchanged + 1}`);

        // Step 4: First AI invocation (may include tool calls)
        let aiResponse = await modelWithTools.invoke(conversationMessages);

        // Step 5: Process tool calls if present
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

            // Step 6: Second AI invocation to generate natural response after logging
            const finalMessages = [
                ...conversationMessages,
                aiResponse, // The AIMessage with tool_calls
                ...toolMessages // The ToolMessage responses
            ];

            aiResponse = await modelWithTools.invoke(finalMessages);
        }

        // Step 7: Extract final AI reply with validation
        if (!aiResponse || !aiResponse.content) {
            throw new Error("AI returned empty or invalid response");
        }
        
        const aiReply = aiResponse.content;

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
            reply: aiReply
            // scamDetected: true,
            // sessionInfo: {
            //     messagesExchanged: session.totalMessagesExchanged,
            //     intelligenceGathered: {
            //         upiIds: session.extractedIntelligence.upiIds.length,
            //         bankAccounts: session.extractedIntelligence.bankAccounts.length,
            //         phishingLinks: session.extractedIntelligence.phishingLinks.length,
            //         phoneNumbers: session.extractedIntelligence.phoneNumbers.length
            //     }
            // }
        });

    } catch (error) {
        console.error("[CRITICAL ERROR]", error);
        
        // Try to mark session as error state
        try {
            if (req.body.sessionId) {
                await Session.findOneAndUpdate(
                    { sessionId: req.body.sessionId },
                    { 
                        status: 'error', 
                        agentNotes: `Error: ${error.message}` 
                    }
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
export { ReceiveMessageAndProcess };