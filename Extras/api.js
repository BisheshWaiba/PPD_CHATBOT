/**
 * API utility functions for client-side
 */

// Base API URL
const API_BASE_URL = '/api';

// API endpoints
const API_ENDPOINTS = {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    CONTACT: '/contact',
    PROTECTED: '/protected',
};

// Register a new user
async function registerUser(userData) {
    try {
        const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.REGISTER}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(userData),
        });
        
        return await response.json();
    } catch (error) {
        console.error('Registration error:', error);
        throw error;
    }
}

// Login a user
async function loginUser(credentials) {
    try {
        console.log('Attempting login with credentials:', { 
            email: credentials.email,
            passwordProvided: !!credentials.password,
            remember: credentials.remember
        });
        
        const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.LOGIN}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(credentials),
        });
        
        const data = await response.json();
        
        // Log response details for debugging
        console.log('Login response status:', response.status);
        console.log('Login response data:', { 
            success: !!data.token, 
            message: data.message,
            hasToken: !!data.token,
            hasUser: !!data.user 
        });
        
        return data;
    } catch (error) {
        console.error('Login error details:', error);
        throw new Error(`Login failed: ${error.message}`);
    }
}

// Submit contact form
async function submitContactForm(formData) {
    try {
        const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.CONTACT}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData),
        });
        
        return await response.json();
    } catch (error) {
        console.error('Contact form submission error:', error);
        throw error;
    }
}

// Get protected data (requires authentication)
async function getProtectedData() {
    try {
        const token = localStorage.getItem('token');
        
        if (!token) {
            throw new Error('No authentication token found');
        }
        
        const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.PROTECTED}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token,
            },
        });
        
        if (response.status === 401) {
            // Token expired or invalid
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            throw new Error('Authentication expired. Please log in again.');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Protected data fetch error:', error);
        throw error;
    }
}

// Extract error message from API response
function getErrorMessage(error) {
    if (error.response && error.response.data) {
        if (error.response.data.message) {
            return error.response.data.message;
        }
        if (error.response.data.errors && error.response.data.errors.length > 0) {
            return error.response.data.errors.map(err => err.msg).join(', ');
        }
    }
    return error.message || 'An unknown error occurred';
}

// Handle form validation errors from the server
function displayValidationErrors(errors, formElement) {
    if (!errors || !errors.length || !formElement) return;
    
    // Clear previous error messages
    const previousErrors = formElement.querySelectorAll('.error-message');
    previousErrors.forEach(el => el.remove());
    
    // Display new error messages
    errors.forEach(error => {
        const field = formElement.querySelector(`[name="${error.path}"]`);
        if (field) {
            const errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            errorElement.textContent = error.msg;
            errorElement.style.color = 'red';
            errorElement.style.fontSize = '0.8rem';
            errorElement.style.marginTop = '5px';
            
            field.parentNode.insertBefore(errorElement, field.nextSibling);
            field.classList.add('error-input');
        }
    });
} 