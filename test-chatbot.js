import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const API_URL = 'http://localhost:8004/api/chatbot';
const TEST_MESSAGE = "Hello";

async function runTest() {
    console.log("=== CHATBOT API TEST ===");
    console.log("Starting test...");
    
    try {
        // Step 1: Get a greeting and session ID
        console.log("\n1. Getting greeting...");
        const greetingResponse = await fetch(`${API_URL}/greeting`);
        
        if (!greetingResponse.ok) {
            throw new Error(`Failed to get greeting: ${greetingResponse.status} ${greetingResponse.statusText}`);
        }
        
        const greetingData = await greetingResponse.json();
        console.log(`   Session ID: ${greetingData.sessionId}`);
        console.log(`   Greeting: "${greetingData.response}"`);
        
        const sessionId = greetingData.sessionId;
        
        // Step 2: Send a test message
        console.log("\n2. Sending test message...");
        console.log(`   Message: "${TEST_MESSAGE}"`);
        
        const messageResponse = await fetch(`${API_URL}/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Id': sessionId
            },
            body: JSON.stringify({ message: TEST_MESSAGE })
        });
        
        if (!messageResponse.ok) {
            throw new Error(`Failed to send message: ${messageResponse.status} ${messageResponse.statusText}`);
        }
        
        const messageData = await messageResponse.json();
        console.log(`   Response: "${messageData.response}"`);
        
        // Step 3: Send a test message with age
        console.log("\n3. Sending age message...");
        const AGE_MESSAGE = "25";
        console.log(`   Message: "${AGE_MESSAGE}"`);
        
        const ageResponse = await fetch(`${API_URL}/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Id': sessionId
            },
            body: JSON.stringify({ message: AGE_MESSAGE })
        });
        
        if (!ageResponse.ok) {
            throw new Error(`Failed to send age: ${ageResponse.status} ${ageResponse.statusText}`);
        }
        
        const ageData = await ageResponse.json();
        console.log(`   Response: "${ageData.response}"`);
        
        console.log("\nTest completed successfully!");
        
    } catch (error) {
        console.error(`ERROR: ${error.message}`);
        console.error(error);
    }
}

runTest(); 