import Session from '../models/scamModel.js';

const GUVI_API_ENDPOINT = "https://hackathon.guvi.in/api/updateHoneyPotFinalResult";
const MESSAGE_THRESHOLD = 10;

/**
 * Check if session has reached message threshold and has extracted intelligence
 * If yes, submit final results to GUVI API
 */
export async function checkAndSubmitFinalResult(sessionId) {
    try {
        // Fetch session from database
        const session = await Session.findOne({ sessionId });

        if (!session) {
            console.log(`[FINAL SUBMISSION] Session ${sessionId} not found`);
            return { submitted: false, reason: "Session not found" };
        }

        // Check if already submitted (prevent duplicate submissions)
        if (session.finalResultSubmitted) {
            console.log(`[FINAL SUBMISSION] Session ${sessionId} already submitted`);
            return { submitted: false, reason: "Already submitted" };
        }

        // Check message threshold
        if (session.totalMessagesExchanged < MESSAGE_THRESHOLD) {
            console.log(`[FINAL SUBMISSION] Session ${sessionId} - Messages: ${session.totalMessagesExchanged}/${MESSAGE_THRESHOLD} - Not ready yet`);
            return { submitted: false, reason: "Insufficient messages", current: session.totalMessagesExchanged, threshold: MESSAGE_THRESHOLD };
        }

        // Check if any intelligence was extracted
        const hasIntelligence = 
            session.extractedIntelligence.bankAccounts.length > 0 ||
            session.extractedIntelligence.upiIds.length > 0 ||
            session.extractedIntelligence.phishingLinks.length > 0 ||
            session.extractedIntelligence.phoneNumbers.length > 0 ||
            session.extractedIntelligence.suspiciousKeywords.length > 0;

        if (!hasIntelligence) {
            console.log(`[FINAL SUBMISSION] Session ${sessionId} - No intelligence extracted yet`);
            return { submitted: false, reason: "No intelligence extracted" };
        }

        // Prepare payload for GUVI API
        const payload = {
            sessionId: session.sessionId,
            scamDetected: session.scamDetected,
            totalMessagesExchanged: session.totalMessagesExchanged,
            extractedIntelligence: {
                bankAccounts: session.extractedIntelligence.bankAccounts || [],
                upiIds: session.extractedIntelligence.upiIds || [],
                phishingLinks: session.extractedIntelligence.phishingLinks || [],
                phoneNumbers: session.extractedIntelligence.phoneNumbers || [],
                suspiciousKeywords: session.extractedIntelligence.suspiciousKeywords || []
            },
            agentNotes: session.agentNotes || "Intelligence extraction completed through honey-pot agent interaction"
        };

        console.log(`[FINAL SUBMISSION] Submitting results for session ${sessionId}...`);
        console.log(`[FINAL SUBMISSION] Payload:`, JSON.stringify(payload, null, 2));

        // Make POST request to GUVI API with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout
        
        const response = await fetch(GUVI_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        }).finally(() => clearTimeout(timeoutId));

        const responseData = await response.json();

        if (!response.ok) {
            console.error(`[FINAL SUBMISSION] API Error: ${response.status}`, responseData);
            throw new Error(`GUVI API returned ${response.status}: ${JSON.stringify(responseData)}`);
        }

        console.log(`[FINAL SUBMISSION] ✅ Successfully submitted session ${sessionId} to GUVI API`);
        console.log(`[FINAL SUBMISSION] Response:`, responseData);

        // Mark session as submitted to prevent duplicates
        session.finalResultSubmitted = true;
        session.finalResultSubmittedAt = new Date();
        session.guviApiResponse = responseData;
        session.status = 'completed';
        await session.save();

        return {
            submitted: true,
            sessionId: sessionId,
            messagesExchanged: session.totalMessagesExchanged,
            intelligenceExtracted: {
                bankAccounts: session.extractedIntelligence.bankAccounts.length,
                upiIds: session.extractedIntelligence.upiIds.length,
                phishingLinks: session.extractedIntelligence.phishingLinks.length,
                phoneNumbers: session.extractedIntelligence.phoneNumbers.length,
                suspiciousKeywords: session.extractedIntelligence.suspiciousKeywords.length
            },
            guviApiResponse: responseData
        };

    } catch (error) {
        console.error(`[FINAL SUBMISSION ERROR] Session ${sessionId}:`, error);
        return {
            submitted: false,
            reason: "Submission failed",
            error: error.message
        };
    }
}

/**
 * Manual endpoint to trigger final submission for a specific session
 * This can be used for testing or manual intervention
 */
export async function manualSubmitFinalResult(req, res) {
    try {
        const { sessionId } = req.body;

        if (!sessionId) {
            return res.status(400).json({
                status: "error",
                message: "Missing sessionId in request body"
            });
        }

        const result = await checkAndSubmitFinalResult(sessionId);

        if (result.submitted) {
            return res.status(200).json({
                status: "success",
                message: "Final results submitted to GUVI API",
                data: result
            });
        } else {
            return res.status(200).json({
                status: "info",
                message: "Final results not submitted",
                reason: result.reason,
                data: result
            });
        }

    } catch (error) {
        console.error("[MANUAL SUBMISSION ERROR]:", error);
        return res.status(500).json({
            status: "error",
            message: "Failed to process manual submission",
            error: error.message
        });
    }
}
