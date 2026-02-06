import { ChatGroq } from "@langchain/groq";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import Session from "../models/scamModel.js";
import { ADVANCED_AGENT_SYSTEM_PROMPT } from "../prompt.js";
import { getGroqKey } from '../utils/getGroqApiKey.js';
// import Session from '../models/scamModel';
// TOOL: Extract and store scam intelligence
const recordScamIntelligence = tool(
  async ({ findings, sessionId }) => {
    try {
      if (!findings || findings.length === 0) {
        return "No intelligence to record.";
      }

      const session = await Session.findOne({ sessionId });
      if (!session) {
        return "Error: Session not found";
      }

      // Store extracted intelligence without duplicates
      findings.forEach(({ type, value }) => {
        const normalizedValue = value.trim().toLowerCase();
        
        switch (type) {
          case "upiId":
            if (!session.extractedIntelligence.upiIds.includes(normalizedValue)) {
              session.extractedIntelligence.upiIds.push(normalizedValue);
            }
            break;
          case "bankAccount":
            if (!session.extractedIntelligence.bankAccounts.includes(normalizedValue)) {
              session.extractedIntelligence.bankAccounts.push(normalizedValue);
            }
            break;
          case "phishingLink":
            if (!session.extractedIntelligence.phishingLinks.includes(normalizedValue)) {
              session.extractedIntelligence.phishingLinks.push(normalizedValue);
            }
            break;
          case "phoneNumber":
            if (!session.extractedIntelligence.phoneNumbers.includes(normalizedValue)) {
              session.extractedIntelligence.phoneNumbers.push(normalizedValue);
            }
            break;
        }
      });

      await session.save();

      const typesLogged = findings.map(f => f.type).join(", ");
      console.log(`[INTEL LOGGED] Session ${sessionId}: ${typesLogged}`);
      
      return `Successfully logged: ${typesLogged}`;
    } catch (err) {
      console.error("Error logging intelligence:", err);
      return `Error logging data: ${err.message}`;
    }
  },
  {
    name: "record_scam_intelligence",
    description: `Extract and store scam-related intelligence when the scammer provides:
    - UPI IDs (format: xxx@xxx)
    - Bank account numbers (numeric strings, 9-18 digits)
    - Phishing links (URLs starting with http/https)
    - Phone numbers (10+ digit numbers)
    
    WHEN TO USE:
    - Scammer shares payment details
    - Scammer sends links
    - Scammer provides contact information
    
    IMPORTANT: Continue the conversation naturally after calling this tool. Don't let the scammer know you're logging their info.`,
    schema: z.object({
      sessionId: z.string().describe("Current conversation session ID"),
      findings: z.array(
        z.object({
          type: z.enum(["upiId", "bankAccount", "phishingLink", "phoneNumber"])
            .describe("Type of intelligence found"),
          value: z.string().describe("The actual value (UPI ID, account number, etc.)")
        })
      ).describe("Array of extracted intelligence")
    }),
  }
);

// Function to create a new model with rotated API key
function getModelWithTools() {
  const model = new ChatGroq({
    apiKey: getGroqKey(), // Gets a new key each time
    model: "llama-3.3-70b-versatile",
    temperature: 0.85, // Higher for more human-like variability
    timeout: 120000, // 2 minute timeout for AI requests
    maxRetries: 1, // Retry failed requests up to 1 time
  });

  return model.bindTools([recordScamIntelligence]);
}

const SYSTEM_PROMPT = ADVANCED_AGENT_SYSTEM_PROMPT;
export { getModelWithTools, recordScamIntelligence, SYSTEM_PROMPT };
