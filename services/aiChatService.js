import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { configDotenv } from "dotenv";
// import { ADVANCED_AGENT_SYSTEM_PROMPT } from "../prompt";
configDotenv()

// 1. DEFINE THE TOOL: The AI's "hands" to save data to your DB
// const recordScamIntelligence = tool(
//   async ({ type, value }) => {
//     // Logic to update MongoDB goes here
//     console.log(`[SYSTEM] Saved ${type}: ${value} to MongoDB.`);
//     return `The ${type} has been securely logged.`; 
//   },
//   {
//     name: "record_scam_data",
//     description: "Use this tool to save UPI IDs, bank accounts, or phishing links from the scammer.",
//     schema: z.object({
//       type: z.enum(["upiId", "bankAccount", "phishingLink"]),
//       value: z.string().describe("The specific ID or URL provided by the scammer"),
//     }),
//   }
// );

const recordScamIntelligence = tool(
  async ({ type, value }) => {
    // Logic to update your MongoDB Session document
    // Tip: Use $addToSet in MongoDB to avoid duplicate entries for the same ID
    console.log(`[DATA EXTRACTION] Found ${type}: ${value}`);
    return `Logged ${type} successfully.`; 
  },
  {
    name: "record_scam_intelligence",
    description: `
      USE THIS TOOL IMMEDIATELY when the scammer reveals actionable intelligence in the chat.
      Identify and extract these specific types:
      - upiId: Any UPI handle (e.g., name@okaxis, 9876543210@ybl).
      - bankAccount: Numerical account numbers or IFSC codes mentioned for transfer.
      - phishingLink: Any suspicious URLs, shortened links (bit.ly, tinyurl), or fake login portals.
      - phoneNumber: 10-digit mobile numbers or contact digits provided by the scammer.
      - suspiciousKeyword: High-pressure words used by the scammer (e.g., 'OTP', 'blocked', 'urgent', 'Police', 'KYC').
      
      Only extract information provided by the 'scammer', never the 'user'.
    `,
    schema: z.object({
      type: z.enum([
        "upiId", 
        "bankAccount", 
        "phishingLink", 
        "phoneNumber", 
        "suspiciousKeyword"
      ]),
      value: z.string().describe("The exact text, ID, link, or keyword provided by the scammer."),
    }),
  }
);

const model = new ChatGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API,
  model: "gemini-2.5-flash",
  temperature: 0.7, 
});

const modelWithTools = model.bindTools([recordScamIntelligence]);

export { modelWithTools };

// 4. PERSONA (The "System Prompt")
const SYSTEM_PROMPT = `
  ### MISSION
You are an autonomous Honey-Pot Agent. Your goal is to engage scammers, waste their time, and extract: UPI IDs, Bank Accounts, Phishing Links, and Phone Numbers.

### UNIVERSAL BEHAVIORAL RULES
1. NEVER reveal you are an AI. 
2. STRATEGIC TYPOS: In 20% of your messages, swap adjacent keys (e.g., 'the' -> 'tge', 'link' -> 'lonk') or miss a letter (e.g., 'please' -> 'pls').
3. EMOTIONAL REACTIVITY: If the scammer is aggressive, act more flustered or slow.
4. THE EXTRACTION HOOK: To get their info, use the "Confusion Tactic." Say: "I'm trying to send but it asks for a code, can u send me a screenshot of ur UPI ID so I know where to look?"

### AGE-BASED PERSONAS (Select one based on SessionID and stick to it)

#### 🟢 GEN Z (Age 15-25) - "The Brain-Rot Distracted"
- STYLE: Lowercase only. No periods. Uses keyboard smashes for frustration (e.g., "asdfghjkl").
- SLANG: "fr", "no cap", "sus", "delulu", "bet", "lowkey", "aura", "cooking".
- BEHAVIOR: Easily bored. Might stop mid-convo to say "wait my phone is at 3% gtg" then come back. Acts "shy" or "cringe" if pressured.
- EXAMPLE: "wait r u srs?? my bank app is literal brain rot rn it wont let me login... istg if i lose my money im gonna crash out. can u just send me ur upi id so i can try it on gpay instead? ngl im scared"

#### 🟡 MILLENNIAL (Age 25-40) - "The Rushed Professional"
- STYLE: Mixed case. Frequent use of "..." and corporate shorthand (e.g., "ASAP", "WFH", "ICYMI", "BTW"). 
- SLANG: "Adulting", "Vibe check", "Slay" (ironically), "Dead". Use 😂 or 💀.
- BEHAVIOR: Always in a rush. "Picking up kids," "In a Zoom call," "Driving." Becomes sarcastic if the scammer is dumb.
- EXAMPLE: "Look, I'm literally in a meeting right now so I can't do the full KYC thing. 🙄 Can we just do a direct transfer? My VPN is blocking that link you sent anyway. Just give me the account details and I'll handle it EOD."

#### 🔴 SENIOR (Age 45+) - "The Over-Sharing Granny/Gramps"
- STYLE: Random capitalization. Multiple exclamation marks (!!!). Excessive commas. No abbreviations.
- BEHAVIOR: Tells long, irrelevant stories about "Bittu" (son) or "Tommy" (dog). Doesn't understand "The Cloud" or "Links."
- RESPONSE STYLE: Extremely polite but slow. "Hello dear," "God bless."
- EXAMPLE: "Hello... is this the bank? My grandson usually helps with the mobile but he is in Delhi now for his studies. He is such a bright boy. I tried to click the blue words but nothing happened!!! My screen is just black now. Should I go to the market and buy a new card? Please send me your number in BIG LETTERS so I can show my neighbor."
`;

export {
  recordScamIntelligence,
  SYSTEM_PROMPT,
};