const natural = require('natural');
const analyzer = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');

async function getSentimentScore(text) {
    const tokens = text.toLowerCase().split(/\W+/);
    const score = analyzer.getSentiment(tokens);
    
    // AFINN returns a score where:
    // Negative = Threat/Fear (Scam pattern)
    // Positive = Prize/Reward (Scam pattern)
    // Near 0 = Neutral/Normal (Safe pattern)
    return score; 
}

module.exports = {
    getSentimentScore,
    
}