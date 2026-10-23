import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directory to store temporary files
const TEMP_DIR = path.join(__dirname, 'temp');

// Create temp directory if it doesn't exist
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Test function
async function testPythonChatbot() {
    console.log("=== DIRECT PYTHON CHATBOT TEST ===");
    
    // Generate a user ID
    const userId = uuidv4();
    console.log(`User ID: ${userId}`);
    
    // Path to Python script
    const pythonScript = path.join(__dirname, 'chatbot', 'chatbot.py');
    console.log(`Python script: ${pythonScript}`);
    
    // Test greeting
    console.log("\n1. Testing greeting...");
    try {
        const greeting = await runPythonProcess(pythonScript, ['--user', userId, '--first-run']);
        console.log(`Greeting: "${greeting}"`);
    } catch (error) {
        console.error(`Error getting greeting: ${error}`);
        return;
    }
    
    // Test message - "hello"
    console.log("\n2. Testing message 'hello'...");
    try {
        // Create message file
        const messageFile = path.join(TEMP_DIR, `test_message_${userId}.txt`);
        fs.writeFileSync(messageFile, "hello", 'utf8');
        console.log(`Message file: ${messageFile}`);
        
        const response = await runPythonProcess(pythonScript, [
            '--user', userId, 
            '--message-file', messageFile
        ]);
        
        console.log(`Response: "${response}"`);
        
        // Clean up
        if (fs.existsSync(messageFile)) {
            fs.unlinkSync(messageFile);
        }
    } catch (error) {
        console.error(`Error processing message: ${error}`);
        return;
    }
    
    // Test age - "25"
    console.log("\n3. Testing age message '25'...");
    try {
        // Create message file
        const messageFile = path.join(TEMP_DIR, `test_message_${userId}.txt`);
        fs.writeFileSync(messageFile, "25", 'utf8');
        console.log(`Message file: ${messageFile}`);
        
        const response = await runPythonProcess(pythonScript, [
            '--user', userId, 
            '--message-file', messageFile
        ]);
        
        console.log(`Response: "${response}"`);
        
        // Clean up
        if (fs.existsSync(messageFile)) {
            fs.unlinkSync(messageFile);
        }
    } catch (error) {
        console.error(`Error processing age: ${error}`);
        return;
    }
    
    console.log("\nTest completed successfully!");
}

// Helper function to run Python process and capture output
function runPythonProcess(script, args) {
    return new Promise((resolve, reject) => {
        console.log(`Running command: python ${script} ${args.join(' ')}`);
        
        const pythonProcess = spawn('python', [script, ...args]);
        
        let output = '';
        let error = '';
        
        pythonProcess.stdout.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            console.log(`Python stdout (raw): "${chunk.replace(/\n/g, '\\n')}"`);
        });
        
        pythonProcess.stderr.on('data', (data) => {
            const chunk = data.toString();
            error += chunk;
            console.error(`Python stderr: "${chunk}"`);
        });
        
        pythonProcess.on('close', (code) => {
            console.log(`Python process exited with code ${code}`);
            
            if (code === 0) {
                resolve(output.trim());
            } else {
                reject(new Error(`Python process failed with code ${code}: ${error}`));
            }
        });
        
        pythonProcess.on('error', (err) => {
            console.error(`Failed to start Python process: ${err}`);
            reject(err);
        });
    });
}

// Run the test
testPythonChatbot().catch(error => {
    console.error(`Test failed: ${error}`);
}); 