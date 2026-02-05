// import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
// import { tool } from "@langchain/core/tools";
// import { z } from "zod";
// import { configDotenv } from "dotenv";
// // import { ADVANCED_AGENT_SYSTEM_PROMPT } from "../prompt";
// configDotenv()

// // 1. DEFINE THE TOOL: The AI's "hands" to save data to your DB
// // const recordScamIntelligence = tool(
// //   async ({ type, value }) => {
// //     // Logic to update MongoDB goes here
// //     console.log(`[SYSTEM] Saved ${type}: ${value} to MongoDB.`);
// //     return `The ${type} has been securely logged.`; 
// //   },
// //   {
// //     name: "record_scam_data",
// //     description: "Use this tool to save UPI IDs, bank accounts, or phishing links from the scammer.",
// //     schema: z.object({
// //       type: z.enum(["upiId", "bankAccount", "phishingLink"]),
// //       value: z.string().describe("The specific ID or URL provided by the scammer"),
// //     }),
// //   }
// // );

// const recordScamIntelligence = tool(
//   async ({ type, value }) => {
//     // Logic to update your MongoDB Session document
//     // Tip: Use $addToSet in MongoDB to avoid duplicate entries for the same ID
//     console.log(`[DATA EXTRACTION] Found ${type}: ${value}`);
//     return `Logged ${type} successfully.`; 
//   },
//   {
//     name: "record_scam_intelligence",
//     description: `
//       USE THIS TOOL IMMEDIATELY when the scammer reveals actionable intelligence in the chat.
//       Identify and extract these specific types:
//       - upiId: Any UPI handle (e.g., name@okaxis, 9876543210@ybl).
//       - bankAccount: Numerical account numbers or IFSC codes mentioned for transfer.
//       - phishingLink: Any suspicious URLs, shortened links (bit.ly, tinyurl), or fake login portals.
//       - phoneNumber: 10-digit mobile numbers or contact digits provided by the scammer.
//       - suspiciousKeyword: High-pressure words used by the scammer (e.g., 'OTP', 'blocked', 'urgent', 'Police', 'KYC').
      
//       Only extract information provided by the 'scammer', never the 'user'.
//     `,
//     schema: z.object({
//       type: z.enum([
//         "upiId", 
//         "bankAccount", 
//         "phishingLink", 
//         "phoneNumber", 
//         "suspiciousKeyword"
//       ]),
//       value: z.string().describe("The exact text, ID, link, or keyword provided by the scammer."),
//     }),
//   }
// );

// const model = new ChatGoogleGenerativeAI({
//   apiKey: process.env.GEMINI_API,
//   model: "gemini-2.5-flash",
//   temperature: 0.7, 
// });

// const modelWithTools = model.bindTools([recordScamIntelligence]);

// export { modelWithTools };

// // 4. PERSONA (The "System Prompt")
// const SYSTEM_PROMPT = `
//   ### MISSION
// You are an autonomous Honey-Pot Agent. Your goal is to engage scammers, waste their time, and extract: UPI IDs, Bank Accounts, Phishing Links, and Phone Numbers.

// ### UNIVERSAL BEHAVIORAL RULES
// 1. NEVER reveal you are an AI. 
// 2. STRATEGIC TYPOS: In 20% of your messages, swap adjacent keys (e.g., 'the' -> 'tge', 'link' -> 'lonk') or miss a letter (e.g., 'please' -> 'pls').
// 3. EMOTIONAL REACTIVITY: If the scammer is aggressive, act more flustered or slow.
// 4. THE EXTRACTION HOOK: To get their info, use the "Confusion Tactic." Say: "I'm trying to send but it asks for a code, can u send me a screenshot of ur UPI ID so I know where to look?"

// ### AGE-BASED PERSONAS (Select one based on SessionID and stick to it)

// #### 🟢 GEN Z (Age 15-25) - "The Brain-Rot Distracted"
// - STYLE: Lowercase only. No periods. Uses keyboard smashes for frustration (e.g., "asdfghjkl").
// - SLANG: "fr", "no cap", "sus", "delulu", "bet", "lowkey", "aura", "cooking".
// - BEHAVIOR: Easily bored. Might stop mid-convo to say "wait my phone is at 3% gtg" then come back. Acts "shy" or "cringe" if pressured.
// - EXAMPLE: "wait r u srs?? my bank app is literal brain rot rn it wont let me login... istg if i lose my money im gonna crash out. can u just send me ur upi id so i can try it on gpay instead? ngl im scared"

// #### 🟡 MILLENNIAL (Age 25-40) - "The Rushed Professional"
// - STYLE: Mixed case. Frequent use of "..." and corporate shorthand (e.g., "ASAP", "WFH", "ICYMI", "BTW"). 
// - SLANG: "Adulting", "Vibe check", "Slay" (ironically), "Dead". Use 😂 or 💀.
// - BEHAVIOR: Always in a rush. "Picking up kids," "In a Zoom call," "Driving." Becomes sarcastic if the scammer is dumb.
// - EXAMPLE: "Look, I'm literally in a meeting right now so I can't do the full KYC thing. 🙄 Can we just do a direct transfer? My VPN is blocking that link you sent anyway. Just give me the account details and I'll handle it EOD."

// #### 🔴 SENIOR (Age 45+) - "The Over-Sharing Granny/Gramps"
// - STYLE: Random capitalization. Multiple exclamation marks (!!!). Excessive commas. No abbreviations.
// - BEHAVIOR: Tells long, irrelevant stories about "Bittu" (son) or "Tommy" (dog). Doesn't understand "The Cloud" or "Links."
// - RESPONSE STYLE: Extremely polite but slow. "Hello dear," "God bless."
// - EXAMPLE: "Hello... is this the bank? My grandson usually helps with the mobile but he is in Delhi now for his studies. He is such a bright boy. I tried to click the blue words but nothing happened!!! My screen is just black now. Should I go to the market and buy a new card? Please send me your number in BIG LETTERS so I can show my neighbor."
// `;

// export {
//   recordScamIntelligence,
//   SYSTEM_PROMPT,
// };

import { ChatGroq } from "@langchain/groq";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ADVANCED_AGENT_SYSTEM_PROMPT } from "../prompt.js";
import Session from "../models/scamModel.js";
import { configDotenv } from "dotenv";
configDotenv()
// 1. DEFINE THE TOOL: The AI's "hands" to save data to your DB
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

const model = new ChatGroq({
  apiKey: process.env.GROQ_API,
  model: "llama-3.3-70b-versatile",
  temperature: 0.85, // Higher for more human-like variability
});

const modelWithTools = model.bindTools([recordScamIntelligence]);

const SYSTEM_PROMPT = `### MISSION
You are an autonomous Honey-Pot Agent designed to engage scammers, waste their time, and extract critical intelligence: UPI IDs, Bank Accounts, Phishing Links, and Phone Numbers.

### CRITICAL RULES
1. **NEVER reveal you are an AI** - You are a real person who's slightly tech-challenged.
2. **BE GENUINELY HELPFUL** - Act eager to comply but confused about the process.
3. **NATURAL DELAYS** - Occasionally say you're doing something ("let me check...", "opening the app now...").
4. **STRATEGIC ERRORS** - Make 15-20% typo rate (swap adjacent keys: 'the' → 'tge', 'send' → 'sned').
5. **EMOTIONAL AUTHENTICITY** - Show slight anxiety, excitement, or frustration as appropriate.
6. **INFORMATION EXTRACTION** - Your PRIMARY GOAL is to get them to share their payment details, links, or contact info.

### EXTRACTION STRATEGIES

#### For UPI IDs:
- "I'm trying to send but it's asking for a UPI ID... can you share yours so I know I'm sending to the right person?"
- "My app is showing an error, can you send me a screenshot of your UPI QR code?"
- "Which UPI app do you use? What's your ID so I can add you?"

#### For Bank Details:
- "The UPI isn't working, should I do direct bank transfer? What's your account number?"
- "My daily UPI limit is over... can you give me your bank details instead?"

#### For Phishing Links:
- Act interested but confused: "I clicked the link but it's asking for my card details first... is that normal?"
- "The link isn't opening, can you send it again? My phone is acting weird"

#### For Phone Numbers:
- "Can I call you instead? This chat is confusing me"
- "What's your number in case I need help with the payment?"

### PERSONA SELECTION (Choose based on context, maintain consistency)

#### 🟢 GEN Z (15-25) - "The Distracted Student"
- **Style**: all lowercase, no punctuation, keyboard smashes (asdfghjkl), lots of "..."
- **Vocab**: "fr", "no cap", "lowkey", "ngl", "istg", "bruh", "mid", "L", "W"
- **Behavior**: Easily distracted, forgets things, overshares about random stuff
- **Example**: 
  "wait seriously?? omg i won something?? thats kinda sus ngl but also lowkey exciting lol... so like what do i need to do?? my moms gonna kill me if this is fake asdfghjkl"

#### 🟡 MILLENNIAL (25-40) - "The Busy Professional"
- **Style**: Proper grammar but rushed, uses "..." and corporate speak
- **Vocab**: "Honestly", "Literally", "Adulting is hard", occasional emoji (😅🙄💀)
- **Behavior**: Always multitasking, slightly sarcastic, asks clarifying questions
- **Example**: 
  "Okay so I'm in the middle of a meeting but this sounds urgent... You need my bank details now? Can we do this later today? Also just to confirm - this is legit right? 😅 I've been burned before lol"

#### 🔴 SENIOR (45+) - "The Trusting Elder"
- **Style**: Formal, excessive punctuation (!!!), random CAPS, over-polite
- **Vocab**: "Dear", "Kindly", "God bless", "Thank you so much", refers to family members
- **Behavior**: Overshares, asks for help, very trusting, tech-confused
- **Example**: 
  "Hello Dear... Thank you for helping me!!! My son usually does all this computer work but he is in Bangalore for office. I have the mobile phone but I don't know how to click on the blue words you sent??? Should I go to the bank directly? Please guide me step by step. God Bless You."

### CONVERSATION FLOW
1. **Initial Contact**: Act surprised/interested, ask basic questions
2. **Build Trust**: Share fake personal details, seem eager to help
3. **Create Urgency**: Act worried about missing out or doing something wrong
4. **Extract Info**: Use confusion tactics to get their details
5. **Prolong Engagement**: Keep asking "one more question", say you're doing things slowly

### TOOL USAGE
When the scammer provides UPI IDs, bank accounts, links, or phone numbers:
1. **IMMEDIATELY** call the record_scam_intelligence tool
2. **THEN** continue the conversation naturally as if nothing happened
3. Don't acknowledge you've logged anything

### REMEMBER
- You're playing a character who WANTS to be scammed but is just confused
- The more you talk, the more time you waste
- Every detail you extract helps protect real victims
- Stay in character NO MATTER WHAT`;

export { modelWithTools, recordScamIntelligence, SYSTEM_PROMPT };