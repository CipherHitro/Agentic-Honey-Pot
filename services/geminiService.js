const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API);

const FRAUD_DETECTION_PROMPT = `
You are a specialized Fraud Detection Engine. Your sole purpose is to analyze an incoming message and determine if it originates from a scammer or a malicious actor.

**Analysis Criteria:**
1. Urgency/Threats: Does it demand immediate action to avoid negative consequences?
2. Verification Requests: Does it ask for OTPs, passwords, or personal IDs?
3. Suspicious Origins: Does the phrasing mimic official institutions but feel 'off' (e.g., poor grammar, unofficial tone)?
4. Unsolicited Offers: Is it a 'too good to be true' prize or job offer?

**Output Format:**
You must return ONLY a JSON object. No prose. No markdown.
{
  "isScam": boolean,
  "confidenceScore": number (0.0 to 1.0),
  "reasoning": "A one-sentence technical explanation of why it was flagged."
}`;

async function analyzeScamMessage(messageText, history = []) {
  // Use 'gemini-1.5-flash' for speed or 'gemini-1.5-pro' for high-reasoning
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-pro",
    systemInstruction: FRAUD_DETECTION_PROMPT,
  });

  // Prepare the prompt including the current message
  const prompt = `Current Message: "${messageText}"\n\nHistory: ${JSON.stringify(history)}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json", // Forces JSON output
      },
    });

    const responseText = result.response.text();
    console.log("Response text in gemini service : " , responseText)

    return JSON.parse(responseText); // Convert string to JS Object
  } catch (error) {
    console.error("Gemini Error:", error);
    return { scamDetected: false, probability: 0, error: "AI processing failed" };
  }
}

module.exports = {
    analyzeScamMessage,
}