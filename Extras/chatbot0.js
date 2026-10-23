/**
 * Chatbot functionality
 */

// Initialize chat functionality
function initChat() {
    // Get chat elements
    const chatMessages = document.getElementById('chatMessages');
    const userInput = document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton');
    const typingIndicator = document.getElementById('typingIndicator');
    
    if (!chatMessages || !userInput || !sendButton || !typingIndicator) {
        console.error('Chat elements not found in the DOM');
        return;
    }
    
    // Hide typing indicator initially
    typingIndicator.style.display = 'none';
    
    // Check if user is authenticated
    if (!isAuthenticated()) {
        // Add a message to log in
        addMessage("Please log in to use the chatbot. <a href='/login.html'>Click here to log in</a>", 'bot-message');
        
        // Disable input
        userInput.disabled = true;
        userInput.placeholder = "Please log in to chat...";
        sendButton.disabled = true;
        
        return;
    }
    
    // Load chat history
    loadChatHistory();
    
    // Handle send button click
    sendButton.addEventListener('click', sendMessage);
    
    // Handle enter key press in input field
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    // Function to send message
    async function sendMessage() {
        const message = userInput.value.trim();
        if (message === '') return;
        
        // Add user message to chat
        addMessage(message, 'user-message');
        
        // Clear input
        userInput.value = '';
        
        // Show typing indicator
        typingIndicator.style.display = 'flex';
        
        try {
            // Call API using the function from api.js
            const response = await sendChatMessage(message);
            
            // Hide typing indicator
            typingIndicator.style.display = 'none';
            
            if (response.error) {
                // Handle error
                addMessage(`Error: ${response.error}`, 'bot-message error');
                return;
            }
            
            // Add bot message
            addMessage(response.response, 'bot-message');
            
        } catch (error) {
            console.error('Error sending message:', error);
            typingIndicator.style.display = 'none';
            addMessage("I'm sorry, I'm having trouble connecting right now. Please try again later.", 'bot-message error');
        }
    }
    
    // Function to add a message to chat
    function addMessage(text, className) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message ' + className;
        
        // Format message text with line breaks and bullet points
        messageDiv.innerHTML = text;
        
        // Add timestamp
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        messageDiv.appendChild(timeDiv);
        
        // Add to chat
        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Function to load chat history
    async function loadChatHistory() {
        try {
            // Add loading message
            const loadingMsg = document.createElement('div');
            loadingMsg.className = 'message system-message';
            loadingMsg.textContent = 'Loading chat history...';
            chatMessages.appendChild(loadingMsg);
            
            // Get chat history
            const response = await getChatHistory();
            
            // Remove loading message
            chatMessages.removeChild(loadingMsg);
            
            if (response.error) {
                console.error('Error loading chat history:', response.error);
                return;
            }
            
            // Display chat history
            if (response.history && response.history.length > 0) {
                response.history.forEach(item => {
                    addMessage(item.message, 'user-message');
                    addMessage(item.response, 'bot-message');
                });
            } else {
                // Add welcome message if no history
                addMessage("Hello there! I'm your MOMCare Assistant. How can I help with your postpartum journey today?", 'bot-message');
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
            
            // Add welcome message
            addMessage("Hello there! I'm your MOMCare Assistant. How can I help with your postpartum journey today?", 'bot-message');
        }
    }
} 