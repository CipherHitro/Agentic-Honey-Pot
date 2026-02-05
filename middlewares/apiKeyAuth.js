import { configDotenv } from "dotenv";
configDotenv()

const apiKeyAuth = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const validApiKey = process.env.API_SECRET_KEY;

    // Check if API key is provided
    if (!apiKey) {
        return res.status(401).json({
            status: 'error',
            message: 'API key is required. Please provide x-api-key header.'
        });
    }

    // Validate API key
    if (apiKey !== validApiKey) {
        return res.status(403).json({
            status: 'error',
            message: 'Invalid API key. Access denied.'
        });
    }

    // API key is valid, proceed to the next middleware/route
    next();
};

export { apiKeyAuth };