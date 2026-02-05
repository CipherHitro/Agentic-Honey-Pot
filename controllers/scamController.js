const Session  = require('../models/scamModel');
const { modelWithTools, recordScamIntelligence, SYSTEM_PROMPT } = require('../services/aiChatService');

async function ReceiveMessageAndProcess(req, res) {
    const { sessionId, message, metadata } = req.body;

    try {
        // 1. SESSION MANAGEMENT (Multi-turn Pillar)
        // Find existing session or create a new one with a random persona
        console.log("Session ID:", sessionId);
        console.log("Session:" , Session);
        let session = await Session.findOne({ sessionId });
        
        if (!session) {
            const personas = ["GEN_Z", "MILLENNIAL", "SENIOR"];
            const selectedPersona = personas[Math.floor(Math.random() * personas.length)];
            
            session = new Session({
                sessionId,
                persona: selectedPersona,
                conversationHistory: [],
                metadata
            });
        }
        console.log("Session after retrieval/creation:", session);
        // 2. CONSTRUCT MESSAGE CHAIN (Self-Correction Pillar)
        const messages = [
            { role: "system", content: `${SYSTEM_PROMPT}\n\nACT AS PERSONA: ${session.persona}` },
            ...session.conversationHistory.map(m => ({
                role: m.sender === "scammer" ? "user" : "assistant",
                content: m.text
            })),
            { role: "user", content: message.text }
        ];

        // 3. AI REASONING LOOP (Adaptation Pillar)
        let response = await modelWithTools.invoke(messages);

        // Handle Tool Calls (Extraction Pillar)
        if (response.tool_calls && response.tool_calls.length > 0) {
            const toolResults = [];
            for (const call of response.tool_calls) {
                // This triggers your MongoDB save logic inside the tool
                const result = await recordScamIntelligence.invoke(call.args);
                
                toolResults.push({
                    role: "tool",
                    tool_call_id: call.id,
                    content: result
                });
            }

            // Get the final "human" response after the tool has processed
            const finalChat = await modelWithTools.invoke([
                ...messages,
                response,
                ...toolResults
            ]);
            response = finalChat;
        }

        // 4. UPDATE SESSION & RESPOND (Human-like Pillar)
        const aiText = response.content || "Wait... my phone is acting up. Say that again?";
        console.log("AI Response Text:", aiText);
        // Save history to MongoDB
        session.conversationHistory.push({ sender: "scammer", text: message.text });
        // session.conversationHistory.push({ sender: "ai", text: aiText });
        await session.save();

        return res.status(200).json({
            status: "success",
            reply: aiText,
            persona: session.persona // Helpful for debugging
        });

    } catch (error) {
        console.error("Agent Loop Failed:", error);
        return res.status(500).json({ status: "error", message: "Internal Agent Error" });
    }
}

module.exports = { ReceiveMessageAndProcess };