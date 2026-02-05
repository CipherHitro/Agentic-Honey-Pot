const { recordScamIntelligence, SYSTEM_PROMPT, modelWithTools,model } = require('../services/aiChatService');

// const model = new ChatGoogleGenerativeAI({
//   apiKey: process.env.GOOGLE_API_KEY,
//   modelName: "gemini-1.5-flash",
//   temperature: 0.7, // 0.7 allows for natural, varied human-like speech
// });

// const modelWithTools = model.bindTools([recordScamIntelligence]);

    // function injectHumanError(text) {
    //   if (Math.random() > 0.8) { // 20% chance to add a typo
    //     const words = text.split(' ');
    //     const index = Math.floor(Math.random() * words.length);
    //     // Simple typo: swap 'the' for 'teh'
    //     words[index] = words[index].replace('th', 'ht').replace('ie', 'ei'); 
    //     return words.join(' ');
    //   }
    //   return text;
    // }



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