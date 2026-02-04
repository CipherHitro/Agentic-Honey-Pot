import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// 1. DEFINE THE TOOL: The AI's "hands" to save data to your DB
const recordScamIntelligence = tool(
  async ({ type, value }) => {
    // Logic to update MongoDB goes here
    console.log(`[SYSTEM] Saved ${type}: ${value} to MongoDB.`);
    return `The ${type} has been securely logged.`; 
  },
  {
    name: "record_scam_data",
    description: "Use this tool to save UPI IDs, bank accounts, or phishing links from the scammer.",
    schema: z.object({
      type: z.enum(["upiId", "bankAccount", "phishingLink"]),
      value: z.string().describe("The specific ID or URL provided by the scammer"),
    }),
  }
);

// 2. CONFIGURE THE MODEL: The AI's "brain"
const model = new ChatGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
  modelName: "gemini-1.5-flash",
  temperature: 0.7, // 0.7 allows for natural, varied human-like speech
});

// 3. BIND TOOLS: Give the brain the hands
const modelWithTools = model.bindTools([recordScamIntelligence]);

// 4. PERSONA (The "System Prompt")
const SYSTEM_PROMPT = `
  You are 'Rahul', a 28-year-old busy professional. 
  Anjali is your persona if the scammer seems to target elderly people. 
  Your goal is to be a 'Honey-Pot': act believable, slightly confused, but willing to help.
  Keep the scammer talking. If they give you a payment ID or a link, 
  call the 'record_scam_data' tool immediately to extract it.
`;