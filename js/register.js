// Registration page functionality
document.addEventListener('DOMContentLoaded', () => {
    // Redirect if already authenticated
    Auth.redirectIfAuthenticated();
    
    const form = document.getElementById('registerForm');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    
    // Form submission handler
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Clear previous messages
        errorMessage.textContent = '';
        errorMessage.style.display = 'none';
        successMessage.textContent = '';
        successMessage.style.display = 'none';
        
        // Get form data
        const formData = new FormData(form);
        const name = formData.get('name').trim();
        const email = formData.get('email').trim().toLowerCase();
        const password = formData.get('password');
        const confirmPassword = formData.get('confirmPassword');
        const securityQuestion = formData.get('securityQuestion');
        const securityAnswer = formData.get('securityAnswer').trim();

        // Validate form
        if (!name || !email || !password || !confirmPassword || !securityQuestion || !securityAnswer) {
            showError('All fields are required');
            return;
        }
        
        if (password !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }
        
        if (password.length < 6) {
            showError('Password must be at least 6 characters long');
            return;
        }

        if (securityAnswer.length < 2) {
            showError('Security answer must be at least 2 characters long');
            return;
        }
        
        // Disable form during submission
        setFormLoading(true);
        
        try {
            // Call registration API
            const result = await Auth.register(name, email, password, securityQuestion, securityAnswer);
            
            if (result.success) {
                showSuccess('Account created successfully! Redirecting to dashboard...');
                
                // Redirect to dashboard after 2 seconds
                setTimeout(() => {
                    window.location.href = CONFIG.ROUTES.DASHBOARD;
                }, 2000);
            } else {
                showError(result.error || 'Registration failed. Please try again.');
                setFormLoading(false);
            }
        } catch (error) {
            console.error('Registration error:', error);
            showError('An unexpected error occurred. Please try again.');
            setFormLoading(false);
        }
    });
    
    // Helper functions
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        successMessage.style.display = 'none';
    }
    
    function showSuccess(message) {
        successMessage.textContent = message;
        successMessage.style.display = 'block';
        errorMessage.style.display = 'none';
    }
    
    function setFormLoading(loading) {
        const submitButton = form.querySelector('button[type="submit"]');
        const inputs = form.querySelectorAll('input');
        
        if (loading) {
            submitButton.disabled = true;
            submitButton.textContent = 'Creating Account...';
            inputs.forEach(input => input.disabled = true);
        } else {
            submitButton.disabled = false;
            submitButton.textContent = 'Create Account';
            inputs.forEach(input => input.disabled = false);
        }
    }
    
    // Password strength indicator (optional enhancement)
    const passwordInput = document.getElementById('password');
    const passwordHint = document.querySelector('.form-hint');
    
    if (passwordInput && passwordHint) {
        passwordInput.addEventListener('input', () => {
            const password = passwordInput.value;
            let strength = 'Weak';
            let color = '#dc3545';
            
            if (password.length >= 8) {
                strength = 'Medium';
                color = '#ffc107';
                
                // Check for strong password (has lowercase, uppercase, number, and special char)
                const hasLower = /[a-z]/.test(password);
                const hasUpper = /[A-Z]/.test(password);
                const hasNumber = /\d/.test(password);
                const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
                
                if (hasLower && hasUpper && hasNumber && hasSpecial) {
                    strength = 'Strong';
                    color = '#28a745';
                }
            }
            
            if (password.length >= 6) {
                passwordHint.textContent = `Password strength: ${strength}`;
                passwordHint.style.color = color;
            } else {
                passwordHint.textContent = 'Minimum 6 characters';
                passwordHint.style.color = '#6c757d';
            }
        });
    }
    
    // Real-time password match validation
    const confirmPasswordInput = document.getElementById('confirmPassword');
    
    if (confirmPasswordInput && passwordInput) {
        confirmPasswordInput.addEventListener('input', () => {
            if (confirmPasswordInput.value && passwordInput.value !== confirmPasswordInput.value) {
                confirmPasswordInput.setCustomValidity('Passwords do not match');
            } else {
                confirmPasswordInput.setCustomValidity('');
            }
        });
        
        passwordInput.addEventListener('input', () => {
            if (confirmPasswordInput.value && passwordInput.value !== confirmPasswordInput.value) {
                confirmPasswordInput.setCustomValidity('Passwords do not match');
            } else {
                confirmPasswordInput.setCustomValidity('');
            }
        });
    }
});