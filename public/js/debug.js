// Debug script to check form elements
document.addEventListener('DOMContentLoaded', () => {
  console.log('DEBUG: Document loaded');
  
  // Check chat form
  const chatForm = document.getElementById('chat-form');
  console.log('DEBUG: Chat form found:', !!chatForm);
  
  // Check message input
  const messageInput = document.getElementById('message-input');
  console.log('DEBUG: Message input found:', !!messageInput);
  
  if (messageInput) {
    console.log('DEBUG: Message input styles:', {
      display: window.getComputedStyle(messageInput).display,
      visibility: window.getComputedStyle(messageInput).visibility,
      width: window.getComputedStyle(messageInput).width,
      height: window.getComputedStyle(messageInput).height
    });
    
    // Force visibility and styling
    messageInput.style.display = 'block';
    messageInput.style.visibility = 'visible';
    messageInput.style.width = 'calc(100% - 60px)';
    messageInput.style.minHeight = '45px';
    messageInput.style.maxHeight = '45px';
    messageInput.style.backgroundColor = '#ffffff';
    messageInput.style.border = '2px solid #d1d5db';
    messageInput.style.borderRadius = '20px';
    messageInput.style.padding = '0.8rem 1rem';
    messageInput.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
    messageInput.style.color = '#333';
    messageInput.style.fontWeight = '500';
    
    // Add focus handler
    messageInput.addEventListener('focus', () => {
      console.log('DEBUG: Input focused');
      messageInput.style.borderColor = 'var(--primary-color)';
      messageInput.style.boxShadow = '0 0 0 3px rgba(108, 99, 255, 0.2)';
    });
    
    // Add blur handler
    messageInput.addEventListener('blur', () => {
      console.log('DEBUG: Input blurred');
      messageInput.style.borderColor = '#d1d5db';
      messageInput.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
    });
    
    // Add click handler
    messageInput.addEventListener('click', () => {
      console.log('DEBUG: Input clicked');
    });
  }
  
  // Check chat interface
  const chatInterface = document.getElementById('chat-interface');
  console.log('DEBUG: Chat interface found:', !!chatInterface);
  
  if (chatInterface) {
    console.log('DEBUG: Chat interface styles:', {
      display: window.getComputedStyle(chatInterface).display,
      flexDirection: window.getComputedStyle(chatInterface).flexDirection,
      height: window.getComputedStyle(chatInterface).height
    });
    
    // Force display for chat interface
    chatInterface.style.display = 'flex';
    chatInterface.style.flexDirection = 'column';
    chatInterface.style.flex = '1';
    chatInterface.style.position = 'relative';
    chatInterface.style.width = '100%';
    chatInterface.style.maxWidth = '100%';
    chatInterface.style.overflow = 'hidden';
  }
  
  // Check chat container
  const chatContainer = document.getElementById('chat-messages');
  if (chatContainer) {
    console.log('DEBUG: Chat container styles:', {
      height: window.getComputedStyle(chatContainer).height,
      paddingBottom: window.getComputedStyle(chatContainer).paddingBottom,
      position: window.getComputedStyle(chatContainer).position
    });
    
    // Force styles for chat container to prevent overlap
    chatContainer.style.overflowY = 'auto';
    chatContainer.style.flex = '1';
  }
  
  // Check input wrapper
  const inputWrapper = document.querySelector('.input-wrapper');
  if (inputWrapper) {
    console.log('DEBUG: Input wrapper found:', !!inputWrapper);
    
    // Force styles for input wrapper
    inputWrapper.style.width = '100%';
    inputWrapper.style.backgroundColor = '#f8f9fa';
    inputWrapper.style.borderTop = '2px solid var(--border-light)';
    inputWrapper.style.position = 'relative';
    inputWrapper.style.zIndex = '100';
    inputWrapper.style.boxShadow = '0 -2px 10px rgba(0,0,0,0.05)';
    inputWrapper.style.minHeight = '80px';
    inputWrapper.style.maxHeight = '80px';
  }
  
  // Check input container
  const inputContainer = document.querySelector('.input-container');
  console.log('DEBUG: Input container found:', !!inputContainer);
  
  if (inputContainer) {
    console.log('DEBUG: Input container styles:', {
      display: window.getComputedStyle(inputContainer).display,
      padding: window.getComputedStyle(inputContainer).padding,
      position: window.getComputedStyle(inputContainer).position
    });
    
    // Force styles for input container
    inputContainer.style.display = 'flex';
    inputContainer.style.padding = '1rem';
    inputContainer.style.position = 'relative';
    inputContainer.style.width = '100%';
    inputContainer.style.maxWidth = '1200px';
    inputContainer.style.margin = '0 auto';
    inputContainer.style.height = '100%';
    inputContainer.style.alignItems = 'center';
    inputContainer.style.backgroundColor = 'transparent';
    inputContainer.style.borderTop = 'none';
  }
});

// Debug script to help troubleshoot authentication issues
document.addEventListener('DOMContentLoaded', function() {
  // Create debug panel
  const debugPanel = document.createElement('div');
  debugPanel.style.position = 'fixed';
  debugPanel.style.bottom = '10px';
  debugPanel.style.right = '10px';
  debugPanel.style.padding = '10px';
  debugPanel.style.background = 'rgba(0,0,0,0.8)';
  debugPanel.style.color = 'white';
  debugPanel.style.borderRadius = '5px';
  debugPanel.style.fontSize = '12px';
  debugPanel.style.maxWidth = '400px';
  debugPanel.style.maxHeight = '200px';
  debugPanel.style.overflow = 'auto';
  debugPanel.style.zIndex = '9999';
  debugPanel.style.fontFamily = 'monospace';
  
  // Add toggle button
  const toggleButton = document.createElement('button');
  toggleButton.textContent = 'Auth Debug';
  toggleButton.style.position = 'fixed';
  toggleButton.style.bottom = '10px';
  toggleButton.style.right = '10px';
  toggleButton.style.padding = '5px 10px';
  toggleButton.style.background = '#ff9ec7';
  toggleButton.style.color = 'white';
  toggleButton.style.border = 'none';
  toggleButton.style.borderRadius = '5px';
  toggleButton.style.cursor = 'pointer';
  toggleButton.style.zIndex = '10000';
  
  // Hide panel initially
  debugPanel.style.display = 'none';
  
  // Toggle panel visibility
  toggleButton.addEventListener('click', function() {
    if (debugPanel.style.display === 'none') {
      debugPanel.style.display = 'block';
      updateDebugInfo();
    } else {
      debugPanel.style.display = 'none';
    }
  });
  
  // Function to update debug info
  function updateDebugInfo() {
    const localToken = localStorage.getItem('token');
    const sessionToken = sessionStorage.getItem('token');
    const localUser = localStorage.getItem('user');
    const sessionUser = localStorage.getItem('user');
    
    let html = '<h3>Authentication Debug</h3>';
    
    // Local storage info
    html += '<h4>localStorage</h4>';
    html += `<p>Token: ${localToken ? 'Present (first 10 chars: ' + localToken.substring(0, 10) + '...)' : 'Not found'}</p>`;
    html += `<p>User: ${localUser ? 'Present' : 'Not found'}</p>`;
    if (localUser) {
      try {
        const userData = JSON.parse(localUser);
        html += `<p>User data: ${JSON.stringify(userData, null, 2)}</p>`;
      } catch (e) {
        html += `<p>Error parsing user data: ${e.message}</p>`;
      }
    }
    
    // Session storage info
    html += '<h4>sessionStorage</h4>';
    html += `<p>Token: ${sessionToken ? 'Present (first 10 chars: ' + sessionToken.substring(0, 10) + '...)' : 'Not found'}</p>`;
    html += `<p>User: ${sessionUser ? 'Present' : 'Not found'}</p>`;
    
    // Current page
    html += '<h4>Page Info</h4>';
    html += `<p>Current URL: ${window.location.href}</p>`;
    
    debugPanel.innerHTML = html;
  }
  
  // Add elements to page
  document.body.appendChild(debugPanel);
  document.body.appendChild(toggleButton);
}); 