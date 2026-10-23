/**
 * API functions for communicating with the backend
 */

// Base URL for API requests
const API_BASE_URL = '';

/**
 * Register a new user
 * @param {Object} userData - User data object with name, email, password
 * @returns {Promise<Object>} - Response from the server
 */
async function registerUser(userData) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: userData.firstName + ' ' + userData.lastName,
                email: userData.email,
                password: userData.password
            })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Registration error:', error);
        return { error: 'Network error. Please try again.' };
    }
}

/**
 * Login a user
 * @param {Object} credentials - User credentials {email, password}
 * @returns {Promise<Object>} - Response from the server with token if successful
 */
async function loginUser(credentials) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: credentials.email,
                password: credentials.password
            })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Login error:', error);
        return { error: 'Network error. Please try again.' };
    }
}

/**
 * Send a message to the chatbot
 * @param {string} message - The message to send 
 * @returns {Promise<Object>} - Response from the chatbot
 */
async function sendChatMessage(message) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            return { error: 'Not authenticated' };
        }

        const response = await fetch(`${API_BASE_URL}/api/chatbot/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify({ message })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Chat message error:', error);
        return { error: 'Network error. Please try again.' };
    }
}

/**
 * Get chat history for the logged-in user
 * @returns {Promise<Object>} - Response with chat history
 */
async function getChatHistory() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            return { error: 'Not authenticated' };
        }

        const response = await fetch(`${API_BASE_URL}/api/chatbot/history`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            }
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Chat history error:', error);
        return { error: 'Network error. Please try again.' };
    }
}

/**
 * Get current user profile information
 * @returns {Promise<Object>} - User profile data
 */
async function getUserProfile() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            return { error: 'Not authenticated' };
        }

        const response = await fetch(`${API_BASE_URL}/api/auth/user`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            }
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Get user profile error:', error);
        return { error: 'Network error. Please try again.' };
    }
} 