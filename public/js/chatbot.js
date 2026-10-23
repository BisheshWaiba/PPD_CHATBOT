import express from 'express';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Configure paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, '..', 'temp');

const router = express.Router();

// Ensure temp directory exists
async function ensureTempDir() {
    try {
        await fs.mkdir(TEMP_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating temp directory:', error);
    }
}

// Initialize
ensureTempDir();

// Process message using Python chatbot
async function processPythonChatbot(message) {
    try {
        const tempInputFile = path.join(TEMP_DIR, `input_${Date.now()}.txt`);
        const tempOutputFile = path.join(TEMP_DIR, `output_${Date.now()}.txt`);
        
        // Write message to temporary file
        await fs.writeFile(tempInputFile, message);
        
        // Execute Python script with input file
        return new Promise((resolve, reject) => {
            const pythonCommand = `python chatbot.py --input "${tempInputFile}" --output "${tempOutputFile}"`;
            
            exec(pythonCommand, async (error, stdout, stderr) => {
                try {
                    if (error) {
                        console.error(`Python execution error: ${error.message}`);
                        resolve("");
                        return;
                    }
                    
                    // Try to read output file
                    try {
                        const output = await fs.readFile(tempOutputFile, 'utf8');
                        resolve(output.trim());
                    } catch (readError) {
                        console.error(`Error reading output file: ${readError.message}`);
                        resolve("");
                    }
                    
                    // Clean up temp files
                    try {
                        await fs.unlink(tempInputFile);
                        await fs.unlink(tempOutputFile);
                    } catch (unlinkError) {
                        console.error(`Error removing temp files: ${unlinkError.message}`);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
    } catch (error) {
        console.error('Error in Python chatbot processing:', error);
        return "";
    }
}

// Handle chat message
router.post('/message', async (req, res) => {
    try {
        const { message } = req.body;
        const response = await processPythonChatbot(message);
        res.json({ response });
    } catch (error) {
        console.error('Error processing message:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Function to handle symptom check requests
function handleSymptomCheck() {
    const messageInput = document.getElementById('message-input');
    messageInput.value = "check symptoms";
    
    // Simulate a click on the send button
    const sendButton = document.getElementById('send-button');
    if (sendButton) {
        sendButton.click();
    } else {
        // If no send button, manually trigger form submission
        const chatForm = document.getElementById('chat-form');
        if (chatForm) {
            const event = new Event('submit');
            chatForm.dispatchEvent(event);
        }
    }
}

// Expose function globally for use in buttons
window.handleSymptomCheck = handleSymptomCheck;

export default router; 