document.addEventListener('DOMContentLoaded', () => {
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
      
      // Disable form during submission
      setParentFormLoading(true);
      
      try {
        const result = await Auth.loginParent(email, password);
        
        if (result.success) {
          // Redirect to dashboard
          window.location.href = CONFIG.ROUTES.DASHBOARD;
        } else {
          showParentError(result.error || 'Invalid email or password');
          setParentFormLoading(false);
        }
      } catch (error) {
        console.error('Parent login error:', error);
        showParentError('An unexpected error occurred. Please try again.');
        setParentFormLoading(false);
      }
    });
  }
  
  // Child Login Form Handler
  if (childForm) {
    childForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Clear error message
      if (childErrorMessage) {
        childErrorMessage.textContent = '';
        childErrorMessage.style.display = 'none';
      }
      
      // Get form data
      const formData = new FormData(childForm);
      const username = formData.get('username').trim();
      const pin = hiddenPin ? hiddenPin.value : '';
      
      if (!username) {
        showChildError('Username is required');
        return;
      }
      
      if (!pin || pin.length !== 4) {
        showChildError('Please enter a 4-digit PIN');
        return;
      }
      
      // Disable form during submission
      setChildFormLoading(true);
      
      try {
        const result = await Auth.loginChild(username, pin);
        
        if (result.success) {
          // Redirect to dashboard
          window.location.href = CONFIG.ROUTES.DASHBOARD;
        } else {
          showChildError(result.error || 'Invalid username or PIN');
          // Clear PIN inputs
          pinInputs.forEach(input => input.value = '');
          if (hiddenPin) hiddenPin.value = '';
          pinInputs[0].focus();
          setChildFormLoading(false);
        }
      } catch (error) {
        console.error('Child login error:', error);
        showChildError('An unexpected error occurred. Please try again.');
        setChildFormLoading(false);
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
    } else {
      submitButton.disabled = false;
      submitButton.textContent = 'Login as Parent';
      inputs.forEach(input => input.disabled = false);
    }
  }
  
  function setChildFormLoading(loading) {
    const submitButton = childForm.querySelector('button[type="submit"]');
    const inputs = childForm.querySelectorAll('input');
    
    if (loading) {
      submitButton.disabled = true;
      submitButton.textContent = 'Logging in...';
      inputs.forEach(input => input.disabled = true);
    } else {
      submitButton.disabled = false;
      submitButton.textContent = 'Login as Child';
      inputs.forEach(input => input.disabled = false);
    }
  }
});

