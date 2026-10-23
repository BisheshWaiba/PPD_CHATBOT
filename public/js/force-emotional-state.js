// Script to force the chatbot into emotional state mode for testing
document.addEventListener('DOMContentLoaded', function() {
    // Wait for the chatbot to initialize
    setTimeout(function() {
        console.log("🔧 DEBUG SCRIPT ACTIVE");
        console.log("🔧 Setting up emotional state test environment");
        
        // Override any existing conversation state
        window.conversationState = 'POSTPARTUM_EMOTIONAL_STATE';
        
        // Force the display of the emotional state question
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            // Clear existing messages
            chatMessages.innerHTML = '';
            
            // Add a test bot message
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message bot-message';
            messageDiv.innerHTML = `
                <div class="message-content">
                    <p>How have you been feeling emotionally since the birth?</p>
                    <p>1. 😞 Sad or tearful</p>
                    <p>2. 😰 Anxious or worried</p>
                    <p>3. 🙂 Mostly okay</p>
                    <p>4. 😐 Numb or empty</p>
                    <p>5. 😡 Irritable or angry</p>
                    <p>6. ❤️ Happy or excited</p>
                </div>
            `;
            chatMessages.appendChild(messageDiv);
        }
        
        console.log("🔧 Test environment ready - Ready to test emotional state inputs");
        console.log("🔧 Current state:", window.conversationState);
        
        // Special test function to manually handle emotional inputs
        window.testEmotionalInput = function(input) {
            console.log("🧪 TESTING INPUT:", input);
            
            // Direct number test
            if (input === "1" || input === "2" || input === "3" || 
                input === "4" || input === "5" || input === "6") {
                console.log("✅ Direct digit match - THIS SHOULD WORK!");
                return true;
            }
            
            // Number in text test
            if (/^[1-6]/.test(input)) {
                console.log("✅ Starts with digit - THIS SHOULD WORK!");
                return true;
            }
            
            // Try parsing
            const numValue = parseInt(input);
            if (!isNaN(numValue) && numValue >= 1 && numValue <= 6) {
                console.log("✅ Can parse as valid number - THIS SHOULD WORK!");
                return true;
            }
            
            // Check text patterns
            if (/\bsad\b|\btearful\b/i.test(input)) {
                console.log("✅ Contains 'sad' or 'tearful' - THIS SHOULD WORK!");
                return true;
            }
            
            console.log("❌ All tests failed - Input not recognized");
            return false;
        };
        
        // Add manual test button
        const testPanel = document.getElementById('debug-panel');
        if (testPanel) {
            const testInput = document.createElement('div');
            testInput.innerHTML = `
                <h4>Direct Emotional State Test</h4>
                <input type="text" id="test-emotional-input" placeholder="Test a response...">
                <button id="test-emotional-button">Test</button>
                <div id="test-result"></div>
            `;
            testPanel.appendChild(testInput);
            
            // Set up the test button
            document.getElementById('test-emotional-button').addEventListener('click', function() {
                const input = document.getElementById('test-emotional-input').value;
                const result = window.testEmotionalInput(input);
                document.getElementById('test-result').textContent = result ? 
                    "✅ Success: Input should work!" : 
                    "❌ Fail: Input would not be recognized";
            });
        }
    }, 1000);
}); 