import natural from 'natural';

const analyzer = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');
const tokenizer = new natural.WordTokenizer();

// Scam-specific keyword patterns
const SCAM_KEYWORDS = {
    urgency: ['urgent', 'immediately', 'now', 'quick', 'hurry', 'expire', 'limited time', 'act now', 'last chance'],
    financial: ['bank', 'account', 'card', 'cvv', 'pin', 'otp', 'upi', 'payment', 'refund', 'prize', 'won', 'lottery'],
    credentials: ['verify', 'confirm', 'update details', 'click here', 'link', 'password', 'login'],
    threat: ['suspend', 'block', 'freeze', 'unauthorized', 'security alert', 'locked', 'deactivate']
};

async function getSentimentScore(text) {
    if (!text || typeof text !== 'string') {
        return {
            score: 0,
            magnitude: 0,
            scamProbability: 0,
            indicators: {}
        };
    }

    const lowerText = text.toLowerCase();
    const tokens = tokenizer.tokenize(lowerText);
    
    // Base sentiment score from AFINN
    const sentimentScore = analyzer.getSentiment(tokens);
    
    // Count scam keyword matches
    const indicators = {};
    let totalMatches = 0;
    
    for (const [category, keywords] of Object.entries(SCAM_KEYWORDS)) {
        const matches = keywords.filter(keyword => lowerText.includes(keyword)).length;
        indicators[category] = matches;
        totalMatches += matches;
    }
    
    // Detect patterns
    const hasURL = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-z0-9]+\.(com|in|org|net))/i.test(text);
    const hasPhone = /\d{10}|\d{3}[-.\s]\d{3}[-.\s]\d{4}/.test(text);
    const hasUPI = /@(paytm|ybl|oksbi|okaxis|okicici|okhdfcbank)/i.test(text);
    
    // Calculate scam probability
    // Extreme sentiment (both very negative and very positive can indicate scams)
    const sentimentMagnitude = Math.abs(sentimentScore);
    const sentimentFactor = sentimentMagnitude > 2 ? 0.3 : sentimentMagnitude > 1 ? 0.15 : 0;
    
    // Keyword-based probability
    const keywordFactor = Math.min(totalMatches * 0.15, 0.6);
    
    // Pattern bonuses
    const patternBonus = (hasURL ? 0.15 : 0) + (hasPhone ? 0.1 : 0) + (hasUPI ? 0.1 : 0);
    
    const scamProbability = Math.min(sentimentFactor + keywordFactor + patternBonus, 1.0);
    
    return {
        score: parseFloat(sentimentScore.toFixed(3)),
        magnitude: parseFloat(sentimentMagnitude.toFixed(3)),
        scamProbability: parseFloat(scamProbability.toFixed(3)),
        indicators: {
            ...indicators,
            hasURL,
            hasPhone,
            hasUPI,
            totalKeywordMatches: totalMatches
        },
        classification: sentimentScore > 1 ? 'positive' : sentimentScore < -1 ? 'negative' : 'neutral'
    };
}

export { getSentimentScore };