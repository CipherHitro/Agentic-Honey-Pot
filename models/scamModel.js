const mongoose = require('mongoose')

const MessageSchema = new mongoose.Schema({
  sender: { 
    type: String, 
    enum: ['scammer', 'user'], // 'user' is your AI Agent's persona
    required: true 
  },
  text: { type: String, required: true },
  timestamp: { type: Number, default: () => Date.now() }
});

const SessionSchema = new mongoose.Schema({
  sessionId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true // Important for fast lookups during the hackathon
  },
  status: { 
    type: String, 
    enum: ['pending', 'active', 'completed', 'error'], 
    default: 'pending' 
  },
  scamDetected: { type: Boolean, default: false },
  
  // Metadata provided by the Mock Scammer API
  metadata: {
    channel: String,
    language: String,
    locale: String
  },

  // Stores the full conversation history for LLM context
  conversationHistory: [MessageSchema],

  // This object gets updated every time the AI extracts new info
  extractedIntelligence: {
    bankAccounts: [{ type: String }],
    upiIds: [{ type: String }],
    phishingLinks: [{ type: String }],
    phoneNumbers: [{ type: String }],
    suspiciousKeywords: [{ type: String }]
  },

  agentNotes: { type: String, default: "" },
  totalMessagesExchanged: { type: Number, default: 0 }
}, { timestamps: true });

const Session = mongoose.model('Session', SessionSchema);
module.exports = Session