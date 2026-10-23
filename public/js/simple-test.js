// Simple test script to override chatbot's message processing
document.addEventListener('DOMContentLoaded', function() {
    console.log("🧪 Simple test script loaded");
    
    // Wait for chatbot to initialize
    setTimeout(function() {
        // Create test panel
        const panel = document.createElement('div');
        panel.style.position = 'fixed';
        panel.style.top = '10px';
        panel.style.right = '10px';
        panel.style.backgroundColor = '#f1f1f1';
        panel.style.padding = '10px';
        panel.style.border = '1px solid #ccc';
        panel.style.borderRadius = '5px';
        panel.style.zIndex = '1000';
        
        panel.innerHTML = `
            <h3>Test Controls</h3>
            <button id="test-button-1">Send "1"</button>
            <button id="test-button-2">Send "2"</button>
            <button id="force-emotional">Force Emotional State</button>
            <div>Current state: <span id="state-display">Unknown</span></div>
        `;
        
        document.body.appendChild(panel);
        
        // Style the buttons
        const buttons = panel.querySelectorAll('button');
        buttons.forEach(button => {
            button.style.margin = '5px';
            button.style.padding = '5px 10px';
            button.style.cursor = 'pointer';
        });
        
        // Set up button handlers
        document.getElementById('test-button-1').addEventListener('click', function() {
            sendTestMessage("1");
        });
        
        document.getElementById('test-button-2').addEventListener('click', function() {
            sendTestMessage("2");
        });
        
        document.getElementById('force-emotional').addEventListener('click', function() {
            window.conversationState = 'POSTPARTUM_EMOTIONAL_STATE';
            console.log("🔄 Forced state to:", window.conversationState);
            updateStateDisplay();
            
            // Add placeholder message
            const messages = document.getElementById('chat-messages');
            if (messages) {
                const message = document.createElement('div');
                message.className = 'message bot-message';
                message.innerHTML = '<div class="message-content">How have you been feeling emotionally since the birth?<br>1. 😞 Sad or tearful<br>2. 😰 Anxious or worried<br>3. 🙂 Mostly okay<br>4. 😐 Numb or empty<br>5. 😡 Irritable or angry<br>6. ❤️ Happy or excited</div>';
                messages.appendChild(message);
                messages.scrollTop = messages.scrollHeight;
            }
        });
        
        function sendTestMessage(message) {
            console.log("🧪 Sending test message:", message);
            
            // Put the message in the input field
            const input = document.getElementById('message-input');
            if (input) {
                input.value = message;
                
                // Trigger the form submission
                const form = document.getElementById('chat-form');
                if (form) {
                    const event = new Event('submit');
                    form.dispatchEvent(event);
                }
            }
        }
        
        // Update state display
        function updateStateDisplay() {
            const display = document.getElementById('state-display');
            if (display) {
                display.textContent = window.conversationState || 'Unknown';
            }
        }
        
        // Set up interval to update state display
        setInterval(updateStateDisplay, 500);
    }, 1000);
}); 