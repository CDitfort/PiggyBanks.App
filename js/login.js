document.addEventListener('DOMContentLoaded', () => {
  console.log('[Login] Page initialized');

  // Request state tracking to prevent duplicate submissions
  let parentLoginInProgress = false;
  let childLoginInProgress = false;

  // Redirect if already authenticated
  Auth.redirectIfAuthenticated();

  // Accessibility roles for the toggle
  const selector = document.querySelector('.login-type-selector');
  if (selector) selector.setAttribute('role', 'tablist');

  const buttons = Array.from(document.querySelectorAll('.login-type-btn'));
  buttons.forEach((btn) => btn.setAttribute('role', 'tab'));

  const parentForm = document.getElementById('parentLoginForm');
  const childForm = document.getElementById('childLoginForm');
  const parentFooter = document.getElementById('parentFooter');
  const childFooter = document.getElementById('childFooter');
  const parentErrorMessage = document.getElementById('parentErrorMessage');
  const childErrorMessage = document.getElementById('childErrorMessage');

  // Interactive Loading Tips during login
  const LOGIN_TIPS = [
    'Parents approve withdrawals before money leaves.',
    'Kids log in with a simple 4-digit PIN.',
    'Add notes so everyone remembers why money changed.',
    'Kids can request money; parents review and approve.',
    'Kids can request to send money to siblings.',
    'Dashboard shows balances and recent activity.',
    'Parents can add money instantly—no approval needed.',
    'Set a savings goal and track progress.',
    'You can log out anytime from dashboard header.',
    'Pro tip: Keep PINs private and easy to remember.',
    'Kids can view their balance anytime on dashboard.',
    'Request money additions with optional reasons.',
    'Transfer money to siblings with parent approval.',
    'Check transaction history to see all activity.',
    'Use your PIN to login quickly and securely.',
    'Parents can instantly add money without approval.',
    'Approve or deny child requests from one place.',
    'Manage all children accounts from parent dashboard.',
    'Monitor family spending with detailed oversight.',
    'Track all family transactions in one location.'
  ];

  const tipsPanel = document.getElementById('loginLoadingTips');
  const tipTextEl = tipsPanel ? tipsPanel.querySelector('.tip-text') : null;
  const progressEl = tipsPanel ? tipsPanel.querySelector('.tip-progress') : null;
  const progressFillEl = tipsPanel ? tipsPanel.querySelector('.tip-progress-fill') : null;
  let tipsIntervalId = null;
  let shownTipIndices = [];
  let tipsActive = false;

  function pickRandomTipIndex() {
    if (LOGIN_TIPS.length <= 1) return 0;

    // If all tips have been shown, reset the shown list
    if (shownTipIndices.length >= LOGIN_TIPS.length) {
      shownTipIndices = [];
    }

    // Get available tip indices (not yet shown)
    const availableIndices = [];
    for (let i = 0; i < LOGIN_TIPS.length; i++) {
      if (!shownTipIndices.includes(i)) {
        availableIndices.push(i);
      }
    }

    // Pick random from available indices
    const randomIndex = Math.floor(Math.random() * availableIndices.length);
    const selectedIndex = availableIndices[randomIndex];

    // Mark this tip as shown
    shownTipIndices.push(selectedIndex);

    return selectedIndex;
  }

  function renderTip() {
    if (tipTextEl) {
      tipTextEl.textContent = LOGIN_TIPS[pickRandomTipIndex()];
    }
  }

  function startLoginTips() {
    if (!tipsPanel || tipsActive) return;
    tipsActive = true;
    // Reset shown tips for new session
    shownTipIndices = [];
    tipsPanel.style.display = '';
    renderTip();
    if (tipsIntervalId) clearInterval(tipsIntervalId);
    tipsIntervalId = setInterval(renderTip, 5000);
    // animate progress bar
    if (progressFillEl) {
      progressFillEl.style.width = '0%';
      let elapsed = 0;
      const step = 100; // ms
      if (window.__loginProgressTimer) clearInterval(window.__loginProgressTimer);
      window.__loginProgressTimer = setInterval(() => {
        elapsed += step;
        const pct = Math.min(100, (elapsed / 5000) * 100);
        progressFillEl.style.width = pct + '%';
        if (elapsed >= 5000) elapsed = 0;
      }, step);
    }
  }

  function stopLoginTips() {
    tipsActive = false;
    if (tipsIntervalId) {
      clearInterval(tipsIntervalId);
      tipsIntervalId = null;
    }
    if (window.__loginProgressTimer) {
      clearInterval(window.__loginProgressTimer);
      window.__loginProgressTimer = null;
    }
    if (tipsPanel) tipsPanel.style.display = 'none';
  }



  function setMode(type) {
    buttons.forEach((btn) => {
      const active = btn.dataset.type === type;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.setAttribute('tabindex', active ? '0' : '-1');
    });

    const showParent = type === 'parent';
    if (parentForm) parentForm.style.display = showParent ? '' : 'none';
    if (childForm) childForm.style.display = showParent ? 'none' : '';
    if (parentFooter) parentFooter.style.display = showParent ? '' : 'none';
    if (childFooter) childFooter.style.display = showParent ? 'none' : '';

    // Focus the first input of the visible form for better UX
    const firstInput = (showParent ? parentForm : childForm)?.querySelector('input');
    if (firstInput) firstInput.focus();
  }

  // Wire up click and keyboard interaction for toggle
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.type));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setMode(btn.dataset.type);
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const idx = buttons.indexOf(btn);
        const nextIdx = e.key === 'ArrowRight' ? (idx + 1) % buttons.length : (idx - 1 + buttons.length) % buttons.length;
        buttons[nextIdx].focus();
      }
    });
  });

  // Initialize to active button type (default to parent)
  const activeBtn = document.querySelector('.login-type-btn.active');
  setMode(activeBtn ? activeBtn.dataset.type : 'parent');

  // PIN input enhancements for child login
  const pinInputs = Array.from(document.querySelectorAll('.pin-input'));
  const hiddenPin = document.getElementById('childPin');

  function updateHiddenPin() {
    if (!hiddenPin) return;
    hiddenPin.value = pinInputs.map((i) => (i.value || '').replace(/[^0-9]/g, '')).join('');
  }

  pinInputs.forEach((input, idx) => {
    // Only numeric characters
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^0-9]/g, '');
      if (input.value && idx < pinInputs.length - 1) {
        pinInputs[idx + 1].focus();
      }
      updateHiddenPin();
    });

    // Backspace behavior and key filtering
    input.addEventListener('keydown', (e) => {
      const allowed = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight'];
      if (e.key.length === 1 && !/[0-9]/.test(e.key)) {
        e.preventDefault();
      }
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        e.preventDefault();
        pinInputs[idx - 1].focus();
        pinInputs[idx - 1].value = '';
        updateHiddenPin();
      }
      if (!allowed.includes(e.key) && e.key.length === 1 && /[0-9]/.test(e.key)) {
        // If typing a digit when the field already has one, replace and move on
        if (input.value.length === input.maxLength) {
          input.value = '';
        }
      }
    });

    // Paste support (e.g., pasting 4 digits at once)
    input.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      const digits = (text.match(/[0-9]/g) || []).slice(0, pinInputs.length);
      if (digits.length) {
        e.preventDefault();
        pinInputs.forEach((i) => (i.value = ''));
        digits.forEach((d, i) => {
          if (i < pinInputs.length) pinInputs[i].value = d;
        });
        const next = digits.length < pinInputs.length ? pinInputs[digits.length] : pinInputs[pinInputs.length - 1];
        next.focus();
        updateHiddenPin();
      }
    });
  });

  // Parent Login Form Handler
  if (parentForm) {
    parentForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Check if a login is already in progress
      if (parentLoginInProgress) {
        console.log('[Login] Parent login already in progress, ignoring duplicate submission');
        return;
      }

      // Clear error message
      if (parentErrorMessage) {
        parentErrorMessage.textContent = '';
        parentErrorMessage.style.display = 'none';
      }

      // Get form data
      const formData = new FormData(parentForm);
      const email = formData.get('email').trim().toLowerCase();
      const password = formData.get('password');

      if (!email || !password) {
        showParentError('Email and password are required');
        return;
      }

      // Set login in progress flag
      parentLoginInProgress = true;
      console.log('[Login] Starting parent login for:', email);

      // Disable form during submission
      setParentFormLoading(true);

      try {
        const startTime = Date.now();
        const result = await Auth.loginParent(email, password);
        const duration = Date.now() - startTime;
        console.log(`[Login] Parent login completed in ${duration}ms`);

        if (result.success) {
          console.log('[Login] Parent login successful, redirecting to dashboard');
          // Redirect to dashboard
          window.location.href = CONFIG.ROUTES.DASHBOARD;
        } else {
          console.log('[Login] Parent login failed:', result.error);
          showParentError(result.error || 'Invalid email or password');
          setParentFormLoading(false);
          parentLoginInProgress = false;
        }
      } catch (error) {
        console.error('[Login] Parent login error:', error);
        showParentError('An unexpected error occurred. Please try again.');
        setParentFormLoading(false);
        parentLoginInProgress = false;
      }
    });
  }

  // Child Login Form Handler
  if (childForm) {
    childForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Check if a login is already in progress
      if (childLoginInProgress) {
        console.log('[Login] Child login already in progress, ignoring duplicate submission');
        return;
      }

      // Clear error message
      if (childErrorMessage) {
        childErrorMessage.textContent = '';
        childErrorMessage.style.display = 'none';
      }

      // Get form data
      const formData = new FormData(childForm);
      const username = formData.get('username').trim().toLowerCase();
      const pin = hiddenPin ? hiddenPin.value : '';

      if (!username) {
        showChildError('Username is required');
        return;
      }

      if (!pin || pin.length !== 4) {
        showChildError('Please enter a 4-digit PIN');
        return;
      }

      // Set login in progress flag
      childLoginInProgress = true;
      console.log('[Login] Starting child login for:', username);

      // Disable form during submission
      setChildFormLoading(true);

      try {
        const startTime = Date.now();
        const result = await Auth.loginChild(username, pin);
        const duration = Date.now() - startTime;
        console.log(`[Login] Child login completed in ${duration}ms`);

        if (result.success) {
          console.log('[Login] Child login successful, redirecting to dashboard');
          // Redirect to dashboard
          window.location.href = CONFIG.ROUTES.DASHBOARD;
        } else {
          console.log('[Login] Child login failed:', result.error);
          showChildError(result.error || 'Invalid username or PIN');
          // Clear PIN inputs
          pinInputs.forEach(input => input.value = '');
          if (hiddenPin) hiddenPin.value = '';
          pinInputs[0].focus();
          setChildFormLoading(false);
          childLoginInProgress = false;
        }
      } catch (error) {
        console.error('[Login] Child login error:', error);
        showChildError('An unexpected error occurred. Please try again.');
        setChildFormLoading(false);
        childLoginInProgress = false;
      }
    });
  }

  // Helper functions
  function showParentError(message) {
    if (parentErrorMessage) {
      parentErrorMessage.textContent = message;
      parentErrorMessage.style.display = 'block';
    }
  }

  function showChildError(message) {
    if (childErrorMessage) {
      childErrorMessage.textContent = message;
      childErrorMessage.style.display = 'block';
    }
  }

  function setParentFormLoading(loading) {
    const submitButton = parentForm.querySelector('button[type="submit"]');
    const inputs = parentForm.querySelectorAll('input');

    if (loading) {
      submitButton.disabled = true;
      submitButton.textContent = 'Logging in...';
      inputs.forEach(input => input.disabled = true);
      startLoginTips();
    } else {
      submitButton.disabled = false;
      submitButton.textContent = 'Login as Parent';
      inputs.forEach(input => input.disabled = false);
      stopLoginTips();
    }
  }

  function setChildFormLoading(loading) {
    const submitButton = childForm.querySelector('button[type="submit"]');
    const inputs = childForm.querySelectorAll('input');

    if (loading) {
      submitButton.disabled = true;
      submitButton.textContent = 'Logging in...';
      inputs.forEach(input => input.disabled = true);
      startLoginTips();
    } else {
      submitButton.disabled = false;
      submitButton.textContent = 'Login as Child';
      inputs.forEach(input => input.disabled = false);
      stopLoginTips();
    }
  }

  // Add keyboard shortcut to submit forms (Enter key)
  // This is already handled by default form submission, but we'll ensure it's working
  if (parentForm) {
    parentForm.querySelectorAll('input').forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !parentLoginInProgress) {
          e.preventDefault();
          parentForm.dispatchEvent(new Event('submit'));
        }
      });
    });
  }

  if (childForm) {
    childForm.querySelectorAll('input:not(.pin-input)').forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !childLoginInProgress) {
          e.preventDefault();
          childForm.dispatchEvent(new Event('submit'));
        }
      });
    });
  }

  // Forgot Password functionality
  const forgotPasswordLink = document.querySelector('.forgot-password');
  const forgotPasswordModal = document.getElementById('forgotPasswordModal');
  const forgotPasswordClose = document.getElementById('forgotPasswordClose');
  const emailVerificationStep = document.getElementById('emailVerificationStep');
  const securityQuestionStep = document.getElementById('securityQuestionStep');
  const emailVerificationForm = document.getElementById('emailVerificationForm');
  const securityQuestionForm = document.getElementById('securityQuestionForm');
  const cancelEmailVerification = document.getElementById('cancelEmailVerification');
  const backToEmailStep = document.getElementById('backToEmailStep');
  // Recovery-code step elements
  const useRecoveryCodeLink = document.getElementById('useRecoveryCodeLink');
  const recoveryCodeStep = document.getElementById('recoveryCodeStep');
  const recoveryCodeForm = document.getElementById('recoveryCodeForm');
  const backToSecurityStep = document.getElementById('backToSecurityStep');

  // Open forgot password modal
  if (forgotPasswordLink && forgotPasswordModal) {
    forgotPasswordLink.addEventListener('click', (e) => {
      e.preventDefault();
      forgotPasswordModal.style.display = 'flex';
      emailVerificationStep.style.display = 'block';
      securityQuestionStep.style.display = 'none';
      // Clear forms
      emailVerificationForm.reset();
      securityQuestionForm.reset();
      // Clear messages
      clearForgotPasswordMessages();
    });
  }

  // Close modal
  if (forgotPasswordClose) {
    forgotPasswordClose.addEventListener('click', () => {
      forgotPasswordModal.style.display = 'none';
    });
  }

  if (cancelEmailVerification) {
    cancelEmailVerification.addEventListener('click', () => {
      forgotPasswordModal.style.display = 'none';
    });
  }

  // Click outside modal to close (only if the press started on the backdrop)
  if (forgotPasswordModal) {
    let downOnBackdrop = false;
    forgotPasswordModal.addEventListener('mousedown', (e) => { downOnBackdrop = (e.target === forgotPasswordModal); });
    forgotPasswordModal.addEventListener('touchstart', (e) => { downOnBackdrop = (e.target === forgotPasswordModal); }, { passive: true });
    forgotPasswordModal.addEventListener('click', (e) => {
      if (e.target === forgotPasswordModal && downOnBackdrop) {
        forgotPasswordModal.style.display = 'none';
      }
      downOnBackdrop = false;
    });
  }

  // Back to email step
  if (backToEmailStep) {
    backToEmailStep.addEventListener('click', () => {
      emailVerificationStep.style.display = 'block';
      securityQuestionStep.style.display = 'none';
      clearForgotPasswordMessages();
    });
  }

  // Switch to Recovery Code step
  if (useRecoveryCodeLink) {
    useRecoveryCodeLink.addEventListener('click', (e) => {
      e.preventDefault();
      // Move from security question to recovery code step
      if (securityQuestionStep) securityQuestionStep.style.display = 'none';
      if (recoveryCodeStep) recoveryCodeStep.style.display = 'block';
      const emailVal = document.getElementById('verifiedEmail')?.value || '';
      const emailForCodeField = document.getElementById('verifiedEmailForCode');
      if (emailForCodeField) emailForCodeField.value = emailVal;
      clearForgotPasswordMessages();
    });
  }

  // Back to Security Question step
  if (backToSecurityStep) {
    backToSecurityStep.addEventListener('click', () => {
      if (recoveryCodeStep) recoveryCodeStep.style.display = 'none';
      if (securityQuestionStep) securityQuestionStep.style.display = 'block';
      clearForgotPasswordMessages();
    });
  }

  // Email verification form handler
  if (emailVerificationForm) {
    emailVerificationForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(emailVerificationForm);
      const email = formData.get('resetEmail').trim().toLowerCase();

      if (!email) {
        showEmailVerificationError('Email is required');
        return;
      }

      try {
        setEmailVerificationLoading(true);
        const response = await fetch(`${CONFIG.API_BASE_URL}/forgot-password/verify-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email })
        });

        const result = await response.json();

        if (result.success) {
          // Move to security question step
          document.getElementById('displaySecurityQuestion').textContent = result.securityQuestion;
          document.getElementById('verifiedEmail').value = email;
          const emailForCodeField = document.getElementById('verifiedEmailForCode');
          if (emailForCodeField) emailForCodeField.value = email;
          emailVerificationStep.style.display = 'none';
          securityQuestionStep.style.display = 'block';
          clearForgotPasswordMessages();
        } else {
          showEmailVerificationError(result.error || 'Email not found');
        }
      } catch (error) {
        console.error('Email verification error:', error);
        showEmailVerificationError('An unexpected error occurred. Please try again.');
      } finally {
        setEmailVerificationLoading(false);
      }
    });
  }

  // Security question form handler
  if (securityQuestionForm) {
    securityQuestionForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(securityQuestionForm);
      const email = formData.get('verifiedEmail');
      const securityAnswer = formData.get('securityAnswerInput').trim();
      const newPassword = formData.get('newPasswordInput');
      const confirmPassword = formData.get('confirmNewPasswordInput');

      if (!securityAnswer) {
        showSecurityQuestionError('Security answer is required');
        return;
      }

      if (!newPassword) {
        showSecurityQuestionError('New password is required');
        return;
      }

      if (newPassword.length < 6) {
        showSecurityQuestionError('Password must be at least 6 characters long');
        return;
      }

      if (newPassword !== confirmPassword) {
        showSecurityQuestionError('Passwords do not match');
        return;
      }

      try {
        setSecurityQuestionLoading(true);
        const response = await fetch(`${CONFIG.API_BASE_URL}/forgot-password/reset`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            securityAnswer,
            newPassword
          })
        });

        const result = await response.json();

        if (result.success) {
          showPasswordResetSuccess('Password reset successfully! You can now login with your new password.');
          setTimeout(() => {
            forgotPasswordModal.style.display = 'none';
            // Focus on login form
            const emailInput = document.getElementById('parentEmail');
            if (emailInput) {
              emailInput.value = email;
              emailInput.focus();
            }
          }, 3000);
        } else {
          showSecurityQuestionError(result.error || 'Failed to reset password');
        }
      } catch (error) {
        console.error('Password reset error:', error);
        showSecurityQuestionError('An unexpected error occurred. Please try again.');
      } finally {
        setSecurityQuestionLoading(false);
      }
    });
  }

  // Helper functions for forgot password
  function clearForgotPasswordMessages() {
    const emailError = document.getElementById('emailVerificationError');
    const securityError = document.getElementById('securityQuestionError');
    const successMessage = document.getElementById('passwordResetSuccess');

    if (emailError) {
      emailError.textContent = '';
      emailError.style.display = 'none';
    }
    if (securityError) {
      securityError.textContent = '';
      securityError.style.display = 'none';
    }
    if (successMessage) {
      successMessage.textContent = '';
      successMessage.style.display = 'none';
    }
  }

  function showEmailVerificationError(message) {
    const errorElement = document.getElementById('emailVerificationError');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }
  }

  function showSecurityQuestionError(message) {
    const errorElement = document.getElementById('securityQuestionError');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }
  }

  function showPasswordResetSuccess(message) {
    const successElement = document.getElementById('passwordResetSuccess');
    if (successElement) {
      successElement.textContent = message;
      successElement.style.display = 'block';
    }
  }

  function setEmailVerificationLoading(loading) {
    const submitButton = emailVerificationForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = loading;
      submitButton.textContent = loading ? 'Verifying...' : 'Continue';
    }
  }

  function setSecurityQuestionLoading(loading) {
    const submitButton = securityQuestionForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = loading;
      submitButton.textContent = loading ? 'Resetting...' : 'Reset Password';
    }
  }

 // Recovery Code form handler
 if (recoveryCodeForm) {
   recoveryCodeForm.addEventListener('submit', async (e) => {
     e.preventDefault();

     const formData = new FormData(recoveryCodeForm);
     const email = (formData.get('verifiedEmailForCode') || '').toString().trim().toLowerCase();
     const recoveryCode = (formData.get('recoveryCodeInput') || '').toString().trim();
     const newPassword = (formData.get('newPasswordCodeInput') || '').toString();
     const confirmPassword = (formData.get('confirmNewPasswordCodeInput') || '').toString();

     if (!email) { showRecoveryCodeError('Email is missing. Please go back and verify your email again.'); return; }
     if (!recoveryCode) { showRecoveryCodeError('Recovery code is required'); return; }
     if (!newPassword) { showRecoveryCodeError('New password is required'); return; }
     if (newPassword.length < 6) { showRecoveryCodeError('Password must be at least 6 characters long'); return; }
     if (newPassword !== confirmPassword) { showRecoveryCodeError('Passwords do not match'); return; }

     try {
       setRecoveryCodeLoading(true);
       const response = await fetch(`${CONFIG.API_BASE_URL}/forgot-password/reset-with-code`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ email, recoveryCode, newPassword })
       });

       const result = await response.json();
       if (result.success) {
         showPasswordResetSuccessCode('Password reset successfully! You can now login with your new password.');
         setTimeout(() => {
           forgotPasswordModal.style.display = 'none';
           const emailInput = document.getElementById('parentEmail');
           if (emailInput) {
             emailInput.value = email;
             emailInput.focus();
           }
         }, 3000);
       } else {
         showRecoveryCodeError(result.error || 'Failed to reset password');
       }
     } catch (error) {
       console.error('Password reset with code error:', error);
       showRecoveryCodeError('An unexpected error occurred. Please try again.');
     } finally {
       setRecoveryCodeLoading(false);
     }
   });
 }

 // Helpers for Recovery Code step
 function showRecoveryCodeError(message) {
   const errorElement = document.getElementById('recoveryCodeError');
   if (errorElement) {
     errorElement.textContent = message;
     errorElement.style.display = 'block';
   }
 }

 function showPasswordResetSuccessCode(message) {
   const successElement = document.getElementById('passwordResetSuccessCode');
   if (successElement) {
     successElement.textContent = message;
     successElement.style.display = 'block';
   }
 }

 function setRecoveryCodeLoading(loading) {
   const submitButton = recoveryCodeForm?.querySelector('button[type="submit"]');
   if (submitButton) {
     submitButton.disabled = loading;
     submitButton.textContent = loading ? 'Resetting...' : 'Reset Password';
   }
 }

 console.log('[Login] Event handlers attached successfully');
});

