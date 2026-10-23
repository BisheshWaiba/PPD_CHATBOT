// Debug script to intercept and log chatbot responses
document.addEventListener('DOMContentLoaded', function() {
    console.log("🔎 Debug chatbot script loaded");
    
    // Wait for chatbot to initialize
    setTimeout(function() {
        // Create a logging panel
        createDebugPanel();
        
        // Intercept the original processUserMessage function
        const originalProcessUserMessage = window.processUserMessage;
        if (typeof originalProcessUserMessage === 'function') {
            console.log("✅ Successfully intercepted processUserMessage function");
            
            // Override with our debug version
            window.processUserMessage = async function(userMessage) {
                logDebug("📤 Sending message: " + userMessage);
                logDebug("📊 Current state: " + window.conversationState);
                
                // Call the original function
                const result = await originalProcessUserMessage.call(this, userMessage);
                
                // Log the result
                logDebug("📥 New state: " + window.conversationState);
                
                return result;
            };
        }
        
        // Create chat form submit interceptor
        const chatForm = document.getElementById('chat-form');
        if (chatForm) {
            const originalSubmit = chatForm.onsubmit;
            chatForm.onsubmit = function(event) {
                const messageInput = document.getElementById('message-input');
                if (messageInput) {
                    logDebug("💬 Form submitted with: " + messageInput.value);
                    logDebug("📊 State: " + window.conversationState);
                }
                
                // Call original handler if it exists
                if (typeof originalSubmit === 'function') {
                    return originalSubmit.call(this, event);
                }
            };
        }
    }, 1000);
    
    function createDebugPanel() {
        const panel = document.createElement('div');
        panel.id = 'debug-panel';
        panel.style.position = 'fixed';
        panel.style.bottom = '10px';
        panel.style.right = '10px';
        panel.style.width = '300px';
        panel.style.height = '200px';
        panel.style.backgroundColor = '#263238';
        panel.style.color = '#ECEFF1';
        panel.style.padding = '10px';
        panel.style.overflowY = 'auto';
        panel.style.zIndex = '1000';
        panel.style.fontFamily = 'monospace';
        panel.style.fontSize = '12px';
        panel.style.border = '1px solid #546E7A';
        panel.style.borderRadius = '4px';
        
        // Add a title
        const title = document.createElement('div');
        title.textContent = '🐛 Debug Console';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '5px';
        title.style.borderBottom = '1px solid #546E7A';
        title.style.paddingBottom = '5px';
        panel.appendChild(title);
        
        // Add log container
        const logContainer = document.createElement('div');
        logContainer.id = 'debug-log';
        panel.appendChild(logContainer);
        
        document.body.appendChild(panel);
    }
    
    // Function to log messages to the debug panel
    window.logDebug = function(message) {
        console.log(message); // Also log to console
        
        const logContainer = document.getElementById('debug-log');
        if (logContainer) {
            const entry = document.createElement('div');
            entry.className = 'debug-entry';
            entry.style.marginBottom = '4px';
            entry.style.wordBreak = 'break-word';
            
            // Format timestamp
            const now = new Date();
            const timestamp = 
                String(now.getHours()).padStart(2, '0') + ':' + 
                String(now.getMinutes()).padStart(2, '0') + ':' + 
                String(now.getSeconds()).padStart(2, '0');
            
            entry.textContent = `[${timestamp}] ${message}`;
            
            logContainer.appendChild(entry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    };
    
    // Log startup
    window.logDebug("🚀 Debug logging initialized");
}); 