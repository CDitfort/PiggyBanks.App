// Registration page functionality
function setupRegisterPage() {
    // Ensure reCAPTCHA v3 badge loads promptly on this page
    try { Auth.preloadRecaptcha('register_page'); } catch (e) {}
    // Redirect if already authenticated
    Auth.redirectIfAuthenticated();
    
    const form = document.getElementById('registerForm');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');

    // Step pagination setup
    const steps = Array.from(document.querySelectorAll('.form-step'));
    const nextBtn = document.getElementById('nextStep');
    const prevBtn = document.getElementById('prevStep');
    const submitBtn = document.getElementById('submitButton');
    const stepIndicator = document.getElementById('stepIndicator');
    const totalSteps = steps.length;
    let currentStep = 0;
    let navGuard = false;
    let emailVerifiedOk = false;
    let lastVerifiedEmail = '';
    const emailInput = document.getElementById('email');
    const emailStatus = document.getElementById('emailVerifyStatus');

    // If user edits the email after a verification, force re-check
    if (emailInput) {
        emailInput.addEventListener('input', () => {
            emailVerifiedOk = false;
            lastVerifiedEmail = '';
            if (emailStatus) { emailStatus.style.display = 'none'; emailStatus.textContent = ''; }
        });
    }

    function showStep(index) {
        // Clear messages and any previous error highlights when changing steps
        clearMessages();
        clearAllFieldErrors();

        steps.forEach((el, i) => {
            el.style.display = i === index ? 'block' : 'none';
        });
        // Toggle navigation buttons (hide Back on first step)
        if (prevBtn) prevBtn.style.display = index === 0 ? 'none' : 'inline-flex';
        if (nextBtn) nextBtn.style.display = index >= (steps.length - 1) ? 'none' : 'inline-flex';
        if (submitBtn) submitBtn.style.display = index >= (steps.length - 1) ? 'inline-flex' : 'none';

        // Update step indicator
        if (stepIndicator) {
            stepIndicator.textContent = `Step ${index + 1} of ${totalSteps}`;
        }

        // Reset email status text when entering/leaving steps
        if (emailStatus) {
            emailStatus.style.display = 'none';
            emailStatus.textContent = '';
        }

        // Focus the first input/select in the current step
        focusCurrentInput(index);
    }

    function focusCurrentInput(index) {
        try {
            const container = steps[index];
            if (!container) return;
            const el = container.querySelector('input, select, textarea, button');
            if (el) {
                setTimeout(() => {
                    try { el.focus(); if (el.select) el.select(); } catch (_) {}
                }, 0);
            }
        } catch (_) {}
    }

    function updateStepUI() {
        showStep(currentStep);
    }

    // Clear inline messages (errors/success) between steps
    function clearMessages() {
        try {
            if (errorMessage) { errorMessage.textContent = ''; errorMessage.style.display = 'none'; }
            if (successMessage) { successMessage.textContent = ''; successMessage.style.display = 'none'; }
        } catch (_) {}
    }

    // Error highlight helpers
    function clearAllFieldErrors() {
        try {
            form.querySelectorAll('.form-group.input-error').forEach(g => g.classList.remove('input-error'));
            form.querySelectorAll('[aria-invalid="true"]').forEach(el => el.setAttribute('aria-invalid', 'false'));
        } catch (_) {}
    }

    function markFieldError(el) {
        try {
            if (!el) return;
            const group = el.closest('.form-group') || el.parentElement;
            if (group) {
                group.classList.remove('input-error'); // reset to replay animation
                // Force reflow to restart CSS animation
                void group.offsetWidth;
                group.classList.add('input-error');
            }
            el.setAttribute('aria-invalid', 'true');
            if (typeof el.focus === 'function') el.focus({ preventScroll: false });
            if (typeof el.scrollIntoView === 'function') {
                try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
            }
            // Prompt browser-native validity UI (for required/type mismatch) to guide the user
            if (typeof el.reportValidity === 'function') {
                try { el.reportValidity(); } catch (_) {}
            }
        } catch (_) {}
    }

    function clearFieldError(el) {
        try {
            if (!el) return;
            const group = el.closest('.form-group') || el.parentElement;
            if (group) group.classList.remove('input-error');
            el.setAttribute('aria-invalid', 'false');
            if (typeof el.setCustomValidity === 'function') {
                try { el.setCustomValidity(''); } catch (_) {}
            }
        } catch (_) {}
    }

    async function goNext() {
        // Validate current step before proceeding
        if (currentStep === 0) {
            const name = (document.getElementById('name')?.value || '').trim();
            if (!name || name.length < 2) {
                showError('Please enter your first name (at least 2 characters).');
                markFieldError(document.getElementById('name'));
                return;
            }
        } else if (currentStep === 1) {
            // Email step: validate via Reoon POWER mode
            const email = (emailInput?.value || '').trim().toLowerCase();

            // Basic presence/format checks first
            if (!email) {
                showError('Please enter your email address.');
                markFieldError(emailInput);
                return;
            }
            if (!/.+@.+\..+/.test(email)) {
                showError('Please enter a valid email address.');
                markFieldError(emailInput);
                return;
            }

            // If we already verified this exact email as acceptable, skip re-check and proceed
            if (!(emailVerifiedOk && lastVerifiedEmail === email)) {
                const startTs = Date.now();
                const minShowMs = 1200; // ensure user sees verification feedback

                if (emailStatus) {
                    emailStatus.style.display = 'block';
                    emailStatus.style.color = '#6c757d';
                    emailStatus.textContent = 'Checking your email address... this may take a moment.';
                }
                // Disable navigation during verification
                if (nextBtn) nextBtn.disabled = true;
                if (prevBtn) prevBtn.disabled = true;

                try {
                    const r = await fetch(`${CONFIG.API_BASE_URL}/email-verifier?email=${encodeURIComponent(email)}`, {
                        method: 'GET',
                        headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' }
                    });
                    let data = await r.json().catch(() => ({}));
                    // Debug: surface full payload and status for troubleshooting
                    try { console.info('[EmailVerify] response', { ok: r.ok, status: r.status, data }); } catch (_) {}

                    const treated = String((data && data.treated) || '').toLowerCase();
                    const status = String((data && data.status) || '').toLowerCase();
                    const attempts = typeof (data && data.attempts) === 'number' ? data.attempts : undefined;
                    const elapsed = typeof (data && data.elapsed_ms) === 'number' ? data.elapsed_ms : (Date.now() - startTs);
                    const attemptsDetail = Array.isArray(data && data.attempts_detail) ? data.attempts_detail : [];
                    const summary = attemptsDetail.length
                        ? ` [${attemptsDetail.map(a => {
                            try {
                                const idx = (a && (a.attempt || a.index)) || '?';
                                const st = (a && a.status) || (a && a.error ? 'error' : 'unknown');
                                return `${idx}:${st}`;
                            } catch (_) { return ''; }
                        }).filter(Boolean).join(', ')}]`
                        : '';
                    const disabledTag = (data && data.disabled) ? ' [verifier:disabled]' : '';
                    const detail = ` (checked in ${elapsed}ms, attempts: ${attempts != null ? attempts : 'n/a'})${summary}${disabledTag}`;

                    // If server responded with non-OK or explicit failure, gracefully accept as unknown
                    if (!r.ok || (data && data.success === false)) {
                        if (emailStatus) {
                            emailStatus.style.display = 'block';
                            emailStatus.style.color = '#6c757d';
                            emailStatus.textContent = 'We could not verify right now, but you can continue.';
                        }
                        if (errorMessage) { errorMessage.textContent = ''; errorMessage.style.display = 'none'; }
                        const wait = Math.max(0, minShowMs - (Date.now() - startTs));
                        if (wait) { await new Promise(res => setTimeout(res, wait)); }
                        emailVerifiedOk = true;
                        lastVerifiedEmail = email;
                        return;
                    }

                    if (treated === 'accept') {
                        if (emailStatus) {
                            emailStatus.style.display = 'block';
                            emailStatus.style.color = '#28a745';
                            emailStatus.textContent = (status === 'unknown' ? 'Email accepted.' : 'Email verified.');
                        }
                        if (errorMessage) { errorMessage.textContent = ''; errorMessage.style.display = 'none'; }
                        // Keep result visible for a short time
                        const wait = Math.max(0, minShowMs - (Date.now() - startTs));
                        if (wait) { await new Promise(res => setTimeout(res, wait)); }
                        // Cache acceptance and require a second Next click to continue
                        emailVerifiedOk = true;
                        lastVerifiedEmail = email;
                        return;
                    } else if (treated === 'inbox_full' || status === 'inbox_full') {
                        if (emailStatus) {
                            emailStatus.style.display = 'block';
                            emailStatus.style.color = '#dc3545';
                            emailStatus.textContent = 'This mailbox is full. Please use a different email address.';
                        }
                        if (errorMessage) { errorMessage.textContent = ''; errorMessage.style.display = 'none'; }
                        markFieldError(emailInput);
                        return;
                    } else {
                        if (emailStatus) {
                            emailStatus.style.display = 'block';
                            emailStatus.style.color = '#dc3545';
                            emailStatus.textContent = 'This email address does not appear to be valid. Please use a different one.';
                        }
                        if (errorMessage) { errorMessage.textContent = ''; errorMessage.style.display = 'none'; }
                        markFieldError(emailInput);
                        return;
                    }
                } catch (e) {
                    const elapsed = (Date.now() - startTs);
                    if (emailStatus) {
                        emailStatus.style.display = 'block';
                        emailStatus.style.color = '#6c757d';
                        emailStatus.textContent = 'We could not verify right now, but you can continue.';
                    }
                    if (errorMessage) { errorMessage.textContent = ''; errorMessage.style.display = 'none'; }
                    // Keep feedback visible for a short time
                    const wait = Math.max(0, minShowMs - elapsed);
                    if (wait) { await new Promise(res => setTimeout(res, wait)); }
                    // Treat as unknown (acceptable), require another Next click
                    emailVerifiedOk = true;
                    lastVerifiedEmail = email;
                    return;
                } finally {
                    if (nextBtn) nextBtn.disabled = false;
                    if (prevBtn) prevBtn.disabled = false;
                }
            }
        } else if (currentStep === 2) {
            const pwd = (document.getElementById('password')?.value || '');
            if (!pwd || pwd.length < 6) {
                showError('Password must be at least 6 characters long');
                markFieldError(document.getElementById('password'));
                return;
            }
        } else if (currentStep === 3) {
            const pwd = (document.getElementById('password')?.value || '');
            const cpw = (document.getElementById('confirmPassword')?.value || '');
            if (pwd !== cpw) {
                showError('Passwords do not match');
                markFieldError(document.getElementById('confirmPassword'));
                return;
            }
        } else if (currentStep === 4) {
            const q = (document.getElementById('securityQuestion')?.value || '');
            if (!q) {
                showError('Please choose a security question');
                markFieldError(document.getElementById('securityQuestion'));
                return;
            }
        } else if (currentStep === 5) {
            const a = (document.getElementById('securityAnswer')?.value || '').trim();
            if (!a || a.length < 2) {
                showError('Security answer must be at least 2 characters long');
                markFieldError(document.getElementById('securityAnswer'));
                return;
            }
        }
        // Passed validation for this step -> advance
        if (currentStep < steps.length - 1) {
            currentStep++;
            updateStepUI();
        }
    }

    function goPrev() {
        if (currentStep > 0) {
            currentStep--;
            updateStepUI();
        }
    }

    // Click navigation with guard against duplicate triggers
    function guardedGoNext() {
        if (navGuard) return;
        navGuard = true;
        Promise.resolve().then(() => goNext()).finally(() => {
            setTimeout(() => { navGuard = false; }, 0);
        });
    }

    if (nextBtn) nextBtn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); guardedGoNext(); });
    if (prevBtn) prevBtn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); goPrev(); });

    // Expose helpers globally for inline fallback
    window.PBFormNav = {
        next: () => { try { goNext(); } catch (_) {} },
        prev: () => { try { goPrev(); } catch (_) {} }
    };

    // Enter to advance steps
    document.querySelectorAll('.form-step input, .form-step select').forEach(el => {
        el.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                ev.stopPropagation();
                if (currentStep < steps.length - 1) {
                    guardedGoNext();
                } else {
                    // On last step, submit
                    form.requestSubmit ? form.requestSubmit() : form.submit();
                }
            }
        });
    });

    // Clear error highlighting on field interaction
    ['name','email','password','confirmPassword','securityAnswer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => clearFieldError(el));
            el.addEventListener('blur', () => {
                const v = (el.value || '').toString().trim();
                if (v.length > 0) clearFieldError(el);
            });
        }
    });
    const selSecQ = document.getElementById('securityQuestion');
    if (selSecQ) {
        selSecQ.addEventListener('change', () => clearFieldError(selSecQ));
    }

    // Initialize UI
    updateStepUI();
    
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
                // Show one-time recovery code modal (only shown now)
                try {
                    const modal = document.getElementById('recoveryCodeModal');
                    const codeBox = document.getElementById('recoveryCodeValue');
                    const btnCopy = document.getElementById('copyRecoveryCode');
                    const btnAck = document.getElementById('ackRecoveryCode');
                    const copySuccess = document.getElementById('recoveryCopySuccess');

                    // Advise user clearly that this code is shown only once
                    showSuccess('Account created! Your one-time recovery code is shown below. Save it now — you will never see it again.');

                    if (modal && codeBox && btnCopy && btnAck) {
                        const recoveryCode = (result.recoveryCode || '').toString();
                        codeBox.textContent = recoveryCode;
                        if (copySuccess) { copySuccess.textContent = ''; copySuccess.style.display = 'none'; }

                        // Open modal
                        modal.style.display = 'flex';

                        // Wire copy button once
                        if (!btnCopy.dataset.bound) {
                            btnCopy.dataset.bound = 'true';
                            btnCopy.addEventListener('click', async () => {
                                try {
                                    await navigator.clipboard.writeText(codeBox.textContent || '');
                                    if (copySuccess) {
                                        copySuccess.textContent = 'Recovery code copied. Keep it somewhere safe.';
                                        copySuccess.style.display = 'block';
                                    }
                                } catch (e) {
                                    if (copySuccess) {
                                        copySuccess.textContent = 'Copy failed. Please select and copy the code manually.';
                                        copySuccess.style.display = 'block';
                                    }
                                }
                            });
                        }

                        // Wire acknowledgement button once
                        if (!btnAck.dataset.bound) {
                            btnAck.dataset.bound = 'true';
                            btnAck.addEventListener('click', () => {
                                // Hide modal and continue to dashboard
                                modal.style.display = 'none';
                                // Clear code text from DOM to avoid lingering
                                codeBox.textContent = '';
                                // Proceed to dashboard
                                window.location.href = CONFIG.ROUTES.DASHBOARD;
                            });
                        }
                    } else {
                        // Fallback: if modal is missing, just redirect (should not happen)
                        window.location.href = CONFIG.ROUTES.DASHBOARD;
                    }
                } catch (e) {
                    // As a safety net, redirect if modal display failed
                    window.location.href = CONFIG.ROUTES.DASHBOARD;
                }
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
        errorMessage.setAttribute('role', 'alert');
        successMessage.style.display = 'none';
        try {
            errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (_) {}
    }
    
    function showSuccess(message) {
        successMessage.textContent = message;
        successMessage.style.display = 'block';
        errorMessage.style.display = 'none';
    }
    
    function setFormLoading(loading) {
        const submitButton = form.querySelector('button[type="submit"]');
        const inputs = form.querySelectorAll('input');
        const selects = form.querySelectorAll('select');
        const nextButton = document.getElementById('nextStep');
        const prevButton = document.getElementById('prevStep');
        
        if (loading) {
            if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Creating Account...'; }
            inputs.forEach(input => input.disabled = true);
            selects.forEach(sel => sel.disabled = true);
            if (nextButton) nextButton.disabled = true;
            if (prevButton) prevButton.disabled = true;
        } else {
            if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Create Account'; }
            inputs.forEach(input => input.disabled = false);
            selects.forEach(sel => sel.disabled = false);
            if (nextButton) nextButton.disabled = false;
            if (prevButton) prevButton.disabled = false;
        }
    }
    
    // Password strength indicator (optional enhancement)
    const passwordInput = document.getElementById('password');
    const passwordHint = document.querySelector('[data-step="2"] .form-hint');
    
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
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupRegisterPage);
} else {
    try { setupRegisterPage(); } catch (e) { console.error('Register init error:', e); }
}