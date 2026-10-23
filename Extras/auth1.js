/**
 * Authentication utility functions
 */

/**
 * Check if user is authenticated (has a valid token)
 * @returns {boolean} - True if authenticated, false otherwise
 */
function isAuthenticated() {
    const token = localStorage.getItem('token');
    return !!token;
}

/**
 * Redirect if user is already authenticated
 * Used on login/signup pages to redirect logged-in users
 */
function redirectIfAuthenticated() {
    if (isAuthenticated()) {
        window.location.href = '/home.html';
    }
}

/**
 * Redirect if user is not authenticated
 * Used on protected pages to ensure user is logged in
 */
function requireAuthentication() {
    if (!isAuthenticated()) {
        window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
    }
}

/**
 * Log user out by removing token and user data
 */
function logoutUser() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

/**
 * Get the current user data from localStorage
 * @returns {Object|null} - User data object or null if not logged in
 */
function getCurrentUser() {
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
}

/**
 * Update user interface based on authentication status
 * Call this function on all pages to update the UI
 */
function updateAuthUI() {
    const authLinks = document.querySelectorAll('.auth-links');
    const userMenus = document.querySelectorAll('.user-menu');
    
    if (isAuthenticated()) {
        // User is logged in
        const user = getCurrentUser();
        
        // Update user menus
        userMenus.forEach(menu => {
            if (menu) {
                menu.style.display = 'block';
                const userNameElement = menu.querySelector('.user-name');
                if (userNameElement && user && user.name) {
                    userNameElement.textContent = user.name;
                }
            }
        });
        
        // Hide login/signup links
        authLinks.forEach(link => {
            if (link) {
                link.style.display = 'none';
            }
        });
        
        // Update any profile sections
        const profileSections = document.querySelectorAll('.profile-section');
        profileSections.forEach(section => {
            if (section && user) {
                const nameElement = section.querySelector('.profile-name');
                const emailElement = section.querySelector('.profile-email');
                
                if (nameElement && user.name) {
                    nameElement.textContent = user.name;
                }
                
                if (emailElement && user.email) {
                    emailElement.textContent = user.email;
                }
            }
        });
    } else {
        // User is not logged in
        userMenus.forEach(menu => {
            if (menu) {
                menu.style.display = 'none';
            }
        });
        
        authLinks.forEach(link => {
            if (link) {
                link.style.display = 'flex';
            }
        });
    }
}

/**
 * Initialize authentication on page load
 * Call this on all pages to set up auth
 */
function initAuth() {
    // Update the UI based on auth status
    updateAuthUI();
    
    // Set up logout buttons
    const logoutButtons = document.querySelectorAll('.logout-button');
    logoutButtons.forEach(button => {
        if (button) {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                logoutUser();
            });
        }
    });
}

// Initialize auth when the DOM is ready
document.addEventListener('DOMContentLoaded', initAuth); 