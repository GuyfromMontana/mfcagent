import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Check if already logged in
const { data: { user } } = await supabase.auth.getUser();
if (user) {
    window.location.href = 'dashboard.html';
}

// Handle login form submission
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('errorMessage');
    const loginText = document.getElementById('loginText');
    const loginSpinner = document.getElementById('loginSpinner');
    
    // Show loading state
    loginText.style.display = 'none';
    loginSpinner.style.display = 'inline-block';
    errorMessage.style.display = 'none';
    
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) throw error;
        
        // Successful login
        window.location.href = 'dashboard.html';
        
    } catch (error) {
        console.error('Login error:', error);
        errorMessage.textContent = error.message || 'Invalid email or password';
        errorMessage.style.display = 'block';
        
        // Reset button state
        loginText.style.display = 'inline';
        loginSpinner.style.display = 'none';
    }
});