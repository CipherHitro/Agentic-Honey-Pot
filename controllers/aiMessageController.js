const { recordScamIntelligence, SYSTEM_PROMPT, modelWithTools, model } = require('../services/aiChatService');

async function ReceiveMessageAndGivenAIResponse(req, res) {
  const { message, conversationHistory } = req.body;

  // 1. Format messages for LangChain/Groq
  const messages = [
    ["system", SYSTEM_PROMPT],
    ...conversationHistory.map(m => [m.sender === "scammer" ? "human" : "ai", m.text]),
    ["human", message.text]
  ];

  try {
    // 2. Initial invocation (AI decides to speak or use a tool)
    let response = await modelWithTools.invoke(messages);

    // 3. Handle Tool Calls (The Extraction Logic)
    // Inside your ReceiveMessageAndGivenAIResponse function:

    if (response.tool_calls?.length) {
      for (const call of response.tool_calls) {
        const { value } = call.args;

        // VALIDATION: Check if the AI is hallucinating a placeholder
        const isFakeData = /unknown|placeholder|waiting|none|pending/i.test(value);

        if (call.name === "record_scam_data" && !isFakeData) {
          const result = await recordScamIntelligence.invoke(call);
          // ... rest of your tool handling logic
        } else {
          console.log("[DEBUG] AI tried to call tool with fake data. Ignoring.");
        }
      }
    }

    // 5. Send the final text back to the frontend
    res.json({
      status: "success",
      reply: response.content || "istg my internet is so bad rn... one sec"
    });

  } catch (error) {
    console.error("Groq Honeypot Error:", error);
    res.status(500).json({ status: "error", message: "Agent failed to respond" });
  }
};

module.exports = {
  ReceiveMessageAndGivenAIResponse
};