// Special verification script for emotional state handling
document.addEventListener('DOMContentLoaded', function() {
    console.log("🔍 EMOTIONAL STATE VERIFICATION SCRIPT LOADED");
    
    // Force the chatbot into the EMOTIONAL state for testing
    function forceEmotionalState() {
        console.log("⚠️ Forcing chatbot into EMOTIONAL STATE for testing");
        window.conversationState = 'POSTPARTUM_EMOTIONAL_STATE';
        
        // Add test message
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            const botMessage = document.createElement('div');
            botMessage.className = 'message bot-message';
            botMessage.innerHTML = '<div class="message-content">How have you been feeling emotionally since the birth?<br>1. 😞 Sad or tearful<br>2. 😰 Anxious or worried<br>3. 🙂 Mostly okay<br>4. 😐 Numb or empty<br>5. 😡 Irritable or angry<br>6. ❤️ Happy or excited</div>';
            chatMessages.appendChild(botMessage);
        }
        
        // Set up direct button handlers for number responses
        document.getElementById('direct-test-1').addEventListener('click', () => submitDirectAnswer("1"));
        document.getElementById('direct-test-2').addEventListener('click', () => submitDirectAnswer("2"));
        document.getElementById('direct-test-3').addEventListener('click', () => submitDirectAnswer("3"));
        document.getElementById('direct-test-4').addEventListener('click', () => submitDirectAnswer("4"));
        document.getElementById('direct-test-5').addEventListener('click', () => submitDirectAnswer("5"));
        document.getElementById('direct-test-6').addEventListener('click', () => submitDirectAnswer("6"));
    }
    
    // Process input directly
    function submitDirectAnswer(value) {
        console.log("🔢 Direct test sending value:", value);
        const inputField = document.getElementById('message-input');
        inputField.value = value;
        
        // Directly trigger the form submit
        document.getElementById('chat-form').dispatchEvent(new Event('submit'));
    }
    
    // Create test panel
    function createTestPanel() {
        const panel = document.createElement('div');
        panel.className = 'test-panel';
        panel.style.position = 'fixed';
        panel.style.top = '10px';
        panel.style.right = '10px';
        panel.style.backgroundColor = '#f0f8ff';
        panel.style.border = '1px solid #007bff';
        panel.style.padding = '10px';
        panel.style.borderRadius = '4px';
        panel.style.zIndex = '1000';
        
        panel.innerHTML = `
            <h3>Emotional State Test</h3>
            <div class="test-buttons">
                <button id="direct-test-1" class="test-button">Send "1"</button>
                <button id="direct-test-2" class="test-button">Send "2"</button>
                <button id="direct-test-3" class="test-button">Send "3"</button>
                <button id="direct-test-4" class="test-button">Send "4"</button>
                <button id="direct-test-5" class="test-button">Send "5"</button>
                <button id="direct-test-6" class="test-button">Send "6"</button>
            </div>
            <div>Current state: <span id="current-state-display">Loading...</span></div>
        `;
        
        document.body.appendChild(panel);
        
        // Style the buttons
        const buttons = panel.querySelectorAll('.test-button');
        buttons.forEach(button => {
            button.style.margin = '5px';
            button.style.padding = '5px 10px';
            button.style.backgroundColor = '#007bff';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '3px';
            button.style.cursor = 'pointer';
        });
        
        // Set up state display update
        setInterval(() => {
            const stateDisplay = document.getElementById('current-state-display');
            if (stateDisplay) {
                stateDisplay.textContent = window.conversationState || 'Unknown';
            }
        }, 500);
    }
    
    // Initialize everything
    function init() {
        createTestPanel();
        setTimeout(forceEmotionalState, 1000); 
    }
    
    // Start the test harness
    init();
}); 