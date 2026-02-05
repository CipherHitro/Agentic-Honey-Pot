const { recordScamIntelligence, SYSTEM_PROMPT, modelWithTools,model } = require('../services/aiChatService');


async function ReceiveMessageAndGivenAIResponse(req,res) {
    const { message, conversationHistory } = req.body;
    const messages = [
    ["system", SYSTEM_PROMPT],
    ...conversationHistory.map(m => [m.sender === "scammer" ? "human" : "ai", m.text]),
    ["human", message.text]
  ];

  try {
    // console.log("Messages sent to AI:", messages);
    const response = await modelWithTools.invoke(messages);

    if (response.tool_calls?.length) {
      for (const call of response.tool_calls) {
        if (call.name === "record_scam_data") {
          const result = await recordScamIntelligence.invoke(call.args);

          // Send result back to model
          const final = await model.invoke([
            response,
            {
              role: "tool",
              name: "record_scam_data",
              content: result,
            },
          ]);

          console.log(final.content);
        }
      }
  }

    // If the model called a tool, it might not return text immediately.
    // In a simple setup, we just return the AI's textual reply.
    res.json({
      status: "success",
      reply: response.content || "Oh, wait, I'm getting a call, one second..."
    });
  } catch (error) {
    console.error("Error generating AI response:", error);
    res.status(500).json({ status: "error", message: "AI Agent failed" });
  }
};

module.exports = {
    ReceiveMessageAndGivenAIResponse
}