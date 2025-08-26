// Dashboard page functionality
document.addEventListener('DOMContentLoaded', async () => {
    // console.log('[Dashboard] Initializing dashboard');

    // Get user data - Auth module already verified token on page load
    const user = Auth.getUser();

    if (!user) {
        console.log('[Dashboard] No user data found, redirecting to login');
        window.location.href = CONFIG.ROUTES.LOGIN;
        return;
    }

    // Skip redundant token verification - auth.js already did this
    // The auth module's automatic verification runs before DOMContentLoaded
    // console.log('[Dashboard] User authenticated:', user.username || user.email);

    // Display user information
    displayUserInfo(user);

    // Setup logout functionality
    setupLogout();

    // Setup loading and error states
    const loadingState = document.getElementById('loadingState');
    const errorState = document.getElementById('errorState');


	    // Rotating tips during dashboard loading
	    const DASHBOARD_TIPS = [
	        'Parents add money instantly.',
	        'Pending approvals are listed below children cards.',
	        'Kids can request withdrawals that parents approve or deny.',
	        'Track every change in the transaction history.',
	        'Set savings goals and watch progress grow.',
	        'Transfers between siblings start as a request.',
	        'Use notes on transactions to remember the “why”.',
	        'Children log in with a simple 4-digit PIN.',
	        'Balances update immediately after approvals.',
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
	    const tipsPanel = document.getElementById('dashboardLoadingTips');
	    const tipTextEl = tipsPanel ? tipsPanel.querySelector('.tip-text') : null;
	    const progressEl = tipsPanel ? tipsPanel.querySelector('.tip-progress') : null;
const progressFillEl = tipsPanel ? tipsPanel.querySelector('.tip-progress-fill') : null;
	    let tipsIntervalId = null;
	    let shownTipIndices = [];
	    let tipsActive = false;

	    function pickRandomTipIndex() {
	        if (DASHBOARD_TIPS.length <= 1) return 0;

	        // If all tips have been shown, reset the shown list
	        if (shownTipIndices.length >= DASHBOARD_TIPS.length) {
	            shownTipIndices = [];
	        }

	        // Get available tip indices (not yet shown)
	        const availableIndices = [];
	        for (let i = 0; i < DASHBOARD_TIPS.length; i++) {
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
	        if (tipTextEl) tipTextEl.textContent = DASHBOARD_TIPS[pickRandomTipIndex()];
                if (progressFillEl) progressFillEl.style.width = '0%';

	    }
                if (progressFillEl) progressFillEl.style.width = '0%';


	    function startDashboardTips() {
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
            if (window.__dashProgressTimer) clearInterval(window.__dashProgressTimer);
            window.__dashProgressTimer = setInterval(() => {
                elapsed += step;
                const pct = Math.min(100, (elapsed / 5000) * 100);
                progressFillEl.style.width = pct + '%';
                if (elapsed >= 5000) elapsed = 0;
            }, step);
        }
	    }

	    function stopDashboardTips() {
	        tipsActive = false;
	        if (tipsIntervalId) {
	            clearInterval(tipsIntervalId);
	            tipsIntervalId = null;
        }
        if (window.__dashProgressTimer) {
            clearInterval(window.__dashProgressTimer);
            window.__dashProgressTimer = null;
	        }
	        if (tipsPanel) tipsPanel.style.display = 'none';
	    }



    const showLoading = () => { if (loadingState) loadingState.style.display = 'block'; startDashboardTips(); };
    const hideLoading = () => { if (loadingState) loadingState.style.display = 'none'; stopDashboardTips(); };
    const showError = () => { if (errorState) errorState.style.display = 'block'; };

    // Show loader while fetching dashboard data
    showLoading();

    // Ensure UX helpers (toasts, confirms) are available for all roles

    // Safety: force-hide loader after a timeout in case of unexpected errors before try/finally runs
    const FORCE_HIDE_AFTER_MS = 10000;
    setTimeout(() => {
        try {
            const el = document.getElementById('loadingState');
            const tips = document.getElementById('dashboardLoadingTips');
            if (el && el.style.display !== 'none') {
                console.warn('[Dashboard] Force-hiding loader after timeout');
                el.style.display = 'none';
            }
            if (tips && tips.style.display !== 'none') tips.style.display = 'none';
        } catch (_) {}
    }, FORCE_HIDE_AFTER_MS);

    setupUXHelpers();

    // Load content based on user role and hide loader when done
    try {
        if (user.role === 'parent') {
            const settingsBtn = document.getElementById('parentSettingsBtn');
            if (settingsBtn) {
                settingsBtn.style.display = 'block';
            }
            // Hide main loading overlay immediately after showing dashboard
            hideLoading();
            await loadParentDashboard();
            setupParentSettings();
            startParentRealtimeUpdates();
        } else if (user.role === 'child') {
            const settingsBtn = document.getElementById('parentSettingsBtn');
            if (settingsBtn) {
                settingsBtn.style.display = 'none';
            }
            // Hide main loading overlay immediately after showing dashboard
            hideLoading();
            await loadChildDashboard();
            startChildRealtimeUpdates();
        }
    } catch (e) {
        console.error('[Dashboard] Failed to load dashboard', e);
        hideLoading();
        showError();
    }
});

/**
 * Display user information
 */
function displayUserInfo(user) {
    const userNameElement = document.getElementById('userName');

    if (userNameElement) {
        userNameElement.textContent = `Welcome, ${user.name || user.username}!`;
    }
}

/**
 * Setup logout functionality
 */
function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();

            try {
                await Auth.logout();
            } catch (error) {
                console.error('Logout error:', error);
                Auth.clearAuthData();
                window.location.href = CONFIG.ROUTES.HOME;
            }
        });
    }
}

/**
 * Load parent dashboard
 */
async function loadParentDashboard() {
    const parentDashboard = document.getElementById('parentDashboard');
    const childDashboard = document.getElementById('childDashboard');

    if (childDashboard) {
        childDashboard.style.display = 'none';
    }

    // Show parent dashboard immediately to prevent blank screen
    if (parentDashboard) {
        parentDashboard.style.display = 'block';
    }

    // Setup add child form
    setupAddChildForm();

    // Setup modals and UX helpers first (non-async operations)
    setupParentModals();
    setupUXHelpers();

    // Load data in parallel for better performance
    await Promise.all([
        loadChildrenList(),
        loadPendingApprovals()
    ]);
}

/**
 * UX helpers: toasts and confirmation modal
 */
function setupUXHelpers() {
    const container = document.getElementById('toastContainer');
    window.showToast = (title, subtitle = '', type = 'info', timeout = 3000) => {
        if (!container) return alert(`${title}${subtitle ? '\n' + subtitle : ''}`);
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.innerHTML = `<div class="title">${title}</div>${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}`;
        container.appendChild(el);
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(6px)';
            setTimeout(() => container.removeChild(el), 300);
        }, timeout);
    };

    const confirmModal = document.getElementById('confirmModal');
    const confirmTitle = document.getElementById('confirmTitle');
    const confirmMessage = document.getElementById('confirmMessage');
    const btnOk = document.getElementById('confirmOk');
    const btnCancel = document.getElementById('confirmCancel');

    window.openConfirm = ({ title = 'Please Confirm', message = 'Are you sure?', okText = 'OK', cancelText = 'Cancel', okButtonClass = 'btn-primary' } = {}) => {
        return new Promise((resolve) => {
            if (!confirmModal) return resolve(confirm(message));
            confirmTitle.textContent = title;
            confirmMessage.textContent = message;
            btnOk.textContent = okText;
            btnCancel.textContent = cancelText;

            // Apply custom button class
            btnOk.className = `btn ${okButtonClass}`;
            if (okButtonClass === 'btn-danger') {
                btnOk.style.background = '#ef4444';
                btnOk.style.color = 'white';
                btnOk.style.borderColor = '#dc2626';
            } else {
                // Reset to default primary styles
                btnOk.style.background = '';
                btnOk.style.color = '';
                btnOk.style.borderColor = '';
            }

            confirmModal.style.display = 'flex';

            let downOnBackdrop = false;
            const onMouseDown = (e) => { downOnBackdrop = (e.target === confirmModal); };
            const onTouchStart = (e) => { downOnBackdrop = (e.target === confirmModal); };
            const onBackdropClick = (e) => {
                if (e.target === confirmModal && downOnBackdrop) {
                    cleanup(); resolve(false);
                }
                downOnBackdrop = false;
            };

            const cleanup = () => {
                btnOk.onclick = null;
                btnCancel.onclick = null;
                confirmModal.removeEventListener('mousedown', onMouseDown);
                confirmModal.removeEventListener('touchstart', onTouchStart);
                confirmModal.removeEventListener('click', onBackdropClick);
                confirmModal.style.display = 'none';
            };
            btnOk.onclick = () => { cleanup(); resolve(true); };
            btnCancel.onclick = () => { cleanup(); resolve(false); };
            confirmModal.addEventListener('mousedown', onMouseDown);
            confirmModal.addEventListener('touchstart', onTouchStart, { passive: true });
            confirmModal.addEventListener('click', onBackdropClick);
        });
    };
}


// Input confirmation modal (type a keyword)
window.openInputConfirm = ({ title = 'Confirm', message = 'Type to confirm', placeholder = '', requiredValue = '', okText = 'OK', cancelText = 'Cancel', okButtonClass = 'btn-primary' } = {}) => {
    return new Promise((resolve) => {
        let modal = document.getElementById('inputConfirmModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'inputConfirmModal';
            modal.className = 'modal';
            modal.style.display = 'none';
            modal.innerHTML = `
                <div class="modal-content">
                    <h3 id="inputConfirmTitle"></h3>
                    <p id="inputConfirmMessage"></p>
                    <input id="inputConfirmField" class="input input-confirm" style="padding: 10px; margin-top: 5px; border: 1px solid #ccc; border-radius: 8px; width: 100%; font-size: 1rem; box-sizing: border-box;" />
                    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
                        <button id="inputConfirmCancel" class="btn btn-secondary">${cancelText}</button>
                        <button id="inputConfirmOk" class="btn btn-primary" disabled>${okText}</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
        }
        const titleEl = modal.querySelector('#inputConfirmTitle');
        const msgEl = modal.querySelector('#inputConfirmMessage');
        const inputEl = modal.querySelector('#inputConfirmField');
        const okBtn = modal.querySelector('#inputConfirmOk');
        const cancelBtn = modal.querySelector('#inputConfirmCancel');

        titleEl.textContent = title;
        msgEl.textContent = message;
        inputEl.value = '';
        inputEl.placeholder = placeholder || (requiredValue ? `${requiredValue}` : 'Type here');
        okBtn.textContent = okText;
        cancelBtn.textContent = cancelText;
        okBtn.disabled = !!requiredValue;

        // Apply custom button class
        okBtn.className = `btn ${okButtonClass}`;
        if (okButtonClass === 'btn-danger') {
            okBtn.style.background = '#ef4444';
            okBtn.style.color = 'white';
            okBtn.style.borderColor = '#dc2626';
        }

        modal.style.display = 'flex';
        inputEl.focus();

        let downOnBackdrop = false;
        const onMouseDown = (e) => { downOnBackdrop = (e.target === modal); };
        const onTouchStart = (e) => { downOnBackdrop = (e.target === modal); };
        const onBackdropClick = (e) => {
            if (e.target === modal && downOnBackdrop) {
                cleanup(); resolve(false);
            }
            downOnBackdrop = false;
        };

        const cleanup = () => {
            inputEl.oninput = null;
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            modal.removeEventListener('mousedown', onMouseDown);
            modal.removeEventListener('touchstart', onTouchStart);
            modal.removeEventListener('click', onBackdropClick);
            modal.style.display = 'none';
        };
        inputEl.oninput = () => {
            if (!requiredValue) { okBtn.disabled = inputEl.value.trim().length === 0; return; }
            okBtn.disabled = inputEl.value.trim() !== requiredValue;
        };
        okBtn.onclick = () => { const ok = !requiredValue || inputEl.value.trim() === requiredValue; cleanup(); resolve(ok); };
        cancelBtn.onclick = () => { cleanup(); resolve(false); };
        modal.addEventListener('mousedown', onMouseDown);
        modal.addEventListener('touchstart', onTouchStart, { passive: true });
        modal.addEventListener('click', onBackdropClick);
    });
};



// Text prompt modal that returns the entered string (or empty string if cancelled)
window.openTextPrompt = ({ title = 'Reason', message = '', placeholder = 'Optional', okText = 'OK', cancelText = 'Cancel' } = {}) => {
    return new Promise((resolve) => {
        let modal = document.getElementById('textPromptModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'textPromptModal';
            modal.className = 'modal';
            modal.style.display = 'none';
            modal.innerHTML = `
                <div class="modal-content">
                    <h3 id="textPromptTitle"></h3>
                    <p id="textPromptMessage"></p>
                    <textarea id="textPromptField" class="input" style="padding: 10px; margin-top: 5px; border: 1px solid #ccc; border-radius: 8px; width: 100%; font-size: 1rem; box-sizing: border-box; min-height: 80px;"></textarea>
                    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
                        <button id="textPromptCancel" class="btn btn-secondary">${cancelText}</button>
                        <button id="textPromptOk" class="btn btn-primary">${okText}</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
        }
        const titleEl = modal.querySelector('#textPromptTitle');
        const msgEl = modal.querySelector('#textPromptMessage');
        const inputEl = modal.querySelector('#textPromptField');
        const okBtn = modal.querySelector('#textPromptOk');
        const cancelBtn = modal.querySelector('#textPromptCancel');

        titleEl.textContent = title;
        msgEl.textContent = message;
        inputEl.value = '';
        inputEl.placeholder = placeholder;
        okBtn.textContent = okText;
        cancelBtn.textContent = cancelText;

        modal.style.display = 'flex';
        inputEl.focus();

        let downOnBackdrop = false;
        const onMouseDown = (e) => { downOnBackdrop = (e.target === modal); };
        const onTouchStart = (e) => { downOnBackdrop = (e.target === modal); };
        const onBackdropClick = (e) => {
            if (e.target === modal && downOnBackdrop) {
                cleanup(); resolve({ value: '', cancelled: true });
            }
            downOnBackdrop = false;
        };

        const cleanup = () => {
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            modal.removeEventListener('mousedown', onMouseDown);
            modal.removeEventListener('touchstart', onTouchStart);
            modal.removeEventListener('click', onBackdropClick);
            modal.style.display = 'none';
        };
        okBtn.onclick = () => { const val = inputEl.value.trim(); cleanup(); resolve({ value: val, cancelled: false }); };
        cancelBtn.onclick = () => { cleanup(); resolve({ value: '', cancelled: true }); };
        modal.addEventListener('mousedown', onMouseDown);
        modal.addEventListener('touchstart', onTouchStart, { passive: true });
        modal.addEventListener('click', onBackdropClick);
    });
};

/**
 * Load child dashboard
 */
async function loadChildDashboard() {
    const parentDashboard = document.getElementById('parentDashboard');
    const childDashboard = document.getElementById('childDashboard');

    if (parentDashboard) {
        parentDashboard.style.display = 'none';
    }

    // Show child dashboard immediately to prevent blank screen
    if (childDashboard) {
        childDashboard.style.display = 'block';
    }

    // Display child's actual balance from user data and personalize headings
    const balanceElement = document.getElementById('childBalance');
    const user = Auth.getUser();
    if (balanceElement && user) {
        const balance = (typeof user.savings === 'number') ? user.savings : 0;
        balanceElement.textContent = balance.toFixed(2);
    }

    // Personalize headings with child's name
    try {
        const name = user?.name || user?.username || 'My';
        const possessive = name.endsWith('s') ? `${name}'` : `${name}'s`;
        const piggyTitle = document.getElementById('childPiggyTitle');
        const actionsTitle = document.getElementById('childActionsTitle');
        const pendingTitle = document.getElementById('childPendingTitle');
        const historyTitle = document.getElementById('childHistoryTitle');
        if (piggyTitle) piggyTitle.textContent = `${possessive} Piggy Bank`;
        if (actionsTitle) actionsTitle.textContent = `What would you like to do ${name}?`;
        if (pendingTitle) pendingTitle.textContent = `${possessive} Pending Requests`;
        if (historyTitle) historyTitle.textContent = `${possessive} Transaction History`;
    } catch (e) { /* ignore */ }

    // Setup color picker modal for balance background
    try {
        const colorBtn = document.getElementById('balanceColorBtn');
        const colorInput = document.getElementById('balanceColorPicker');
        const pickerBox = document.getElementById('balancePickerBox');
        const modal = document.getElementById('balanceColorModal');
        const closeBtn = document.getElementById('closeBalanceColorModal');
        const saveBtn = document.getElementById('saveBalanceColor');
        if (colorBtn && colorInput && pickerBox && modal && closeBtn && saveBtn) {
            const preview = document.getElementById('balancePreview');
            const previewAmt = document.getElementById('balancePreviewAmount');

            function applyPreview(hex) {
                if (!preview) return;
                preview.style.background = `linear-gradient(135deg, ${hex} 0%, ${shadeColor(hex, -20)} 100%)`;
            }

            function updatePickerSwatch(color) {
                const swatch = pickerBox.querySelector('.color-swatch');
                if (swatch) {
                    swatch.style.backgroundColor = color;
                }
            }

            colorBtn.addEventListener('click', () => {
                const current = user.preferences?.backgroundColor || '#667eea';
                colorInput.value = current;
                applyPreview(current);
                updatePickerSwatch(current);
                if (previewAmt) previewAmt.textContent = (Auth.getUser()?.savings ?? 0).toFixed(2);
                modal.style.display = 'flex';
                // Ensure the embedded picker is visible and initialized inside the modal
                renderEmbeddedPicker(current);
            });

            // Build an embedded custom color picker so it appears inside the modal
            const embedded = document.getElementById('embeddedPickerContainer');
            function hsvToHex(h, s, v) {
                s /= 100; v /= 100;
                const c = v * s;
                const x = c * (1 - Math.abs((h / 60) % 2 - 1));
                const m = v - c;
                let [r, g, b] = [0, 0, 0];
                if (h < 60) [r, g, b] = [c, x, 0];
                else if (h < 120) [r, g, b] = [x, c, 0];
                else if (h < 180) [r, g, b] = [0, c, x];
                else if (h < 240) [r, g, b] = [0, x, c];
                else if (h < 300) [r, g, b] = [x, 0, c];
                else [r, g, b] = [c, 0, x];
                const to255 = (n) => Math.round((n + m) * 255);
                const hex = (n) => n.toString(16).padStart(2, '0');
                return `#${hex(to255(r))}${hex(to255(g))}${hex(to255(b))}`;
            }
            function hexToHsv(hex) {
                let c = hex.replace('#', '');
                if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
                const r = parseInt(c.slice(0,2), 16) / 255;
                const g = parseInt(c.slice(2,4), 16) / 255;
                const b = parseInt(c.slice(4,6), 16) / 255;
                const max = Math.max(r, g, b), min = Math.min(r, g, b);
                const d = max - min;
                let h = 0; if (d !== 0) {
                    switch (max) {
                        case r: h = ((g - b) / d) % 6; break;
                        case g: h = (b - r) / d + 2; break;
                        case b: h = (r - g) / d + 4; break;
                    }
                    h *= 60; if (h < 0) h += 360;
                }
                const s = max === 0 ? 0 : d / max;
                const v = max;
                return { h, s: s * 100, v: v * 100 };
            }
            function renderEmbeddedPicker(startHex) {
                if (!embedded) return;
                embedded.style.display = 'flex';
                const startHSV = hexToHsv(startHex);
                embedded.innerHTML = `
                    <div class="picker-sv" id="pickerSV">
                        <div class="picker-handle" id="svHandle" style="left:${startHSV.s}%; top:${100-startHSV.v}%"></div>
                    </div>
                    <div class="picker-hue" id="pickerHue">
                        <div class="picker-handle" id="hHandle" style="left:${startHSV.h/3.6}%; top:50%"></div>
                    </div>
                `;
                const sv = embedded.querySelector('#pickerSV');
                const hue = embedded.querySelector('#pickerHue');
                const svHandle = embedded.querySelector('#svHandle');
                const hHandle = embedded.querySelector('#hHandle');
                let H = startHSV.h, S = startHSV.s, V = startHSV.v;
                function updateAll(push=true) {
                    // Update SV background to current hue
                    sv.style.backgroundColor = hsvToHex(H, 100, 100);
                    // Update handles
                    svHandle.style.left = `${S}%`;
                    svHandle.style.top = `${100 - V}%`;
                    hHandle.style.left = `${H/3.6}%`;
                    const hex = hsvToHex(H, S, V);
                    colorInput.value = hex;
                    updatePickerSwatch(hex);
                    applyPreview(hex);
                    if (push) {
                        const swatch = document.querySelector('.color-swatch');
                        if (swatch) swatch.style.backgroundColor = hex;
                    }
                }
                function onSV(e) {
                    const rect = sv.getBoundingClientRect();
                    const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
                    const y = Math.min(Math.max(0, e.clientY - rect.top), rect.height);
                    S = Math.round((x / rect.width) * 100);
                    V = Math.round(100 - (y / rect.height) * 100);
                    updateAll();
                }
                function onHue(e) {
                    const rect = hue.getBoundingClientRect();
                    const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
                    H = Math.round((x / rect.width) * 360);
                    updateAll();
                }
                const drag = (el, handler) => {
                    const move = (ev) => handler(ev);
                    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                    window.addEventListener('mousemove', move);
                    window.addEventListener('mouseup', up);
                };
                sv.addEventListener('mousedown', (e) => { onSV(e); drag(sv, onSV); });
                hue.addEventListener('mousedown', (e) => { onHue(e); drag(hue, onHue); });
                // Initialize background and preview
                updateAll(false);
            }

            // Clicking the box reveals embedded picker in place (no OS dialog)
            pickerBox.addEventListener('click', () => {
                const current = colorInput.value || '#667eea';
                renderEmbeddedPicker(current);
            });

            // Also allow Enter/Space to open the embedded picker for accessibility
            pickerBox.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const current = colorInput.value || '#667eea';
                    renderEmbeddedPicker(current);
                }
            });
            closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
            let downOnBackdrop = false;
            modal.addEventListener('mousedown', (e) => { downOnBackdrop = (e.target === modal); });
            modal.addEventListener('touchstart', (e) => { downOnBackdrop = (e.target === modal); }, { passive: true });
            modal.addEventListener('click', (e) => { if (e.target === modal && downOnBackdrop) modal.style.display = 'none'; downOnBackdrop = false; });
            saveBtn.addEventListener('click', async () => {
                const base = colorInput.value;

                // Disable save button to prevent double-clicks
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';

                try {
                    console.log('[Dashboard] Saving background color:', base);
                    const res = await API.updateMyPreferences({ backgroundColor: base });
                    console.log('[Dashboard] Background color save response:', res);
                    if (res && res.success) {
                        const localUser = Auth.getUser() || {};
                        localUser.preferences = localUser.preferences || {};
                        localUser.preferences.backgroundColor = base;
                        localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(localUser));
                        // Immediately apply to the header background without a refresh
                        const display = document.getElementById('balanceDisplay');
                        if (display) {
                            const grad = `linear-gradient(135deg, ${base} 0%, ${shadeColor(base, -20)} 100%)`;
                            display.style.background = grad;
                        }
                        showToast('Background color saved', 'Your dashboard has been updated', 'success');
                        modal.style.display = 'none';
                    } else {
                        const errorMsg = (res && res.error) || 'Please try again';
                        console.error('Save preferences failed:', res);
                        showToast('Failed to save', errorMsg, 'error');
                    }
                } catch (err) {
                    console.error('Save preferences error:', err);
                    let errorMsg = 'Please try again';

                    // Provide more specific error messages
                    if (err.message.includes('Server returned an error page')) {
                        errorMsg = 'Server error. Please try again in a moment.';
                    } else if (err.message.includes('response format error')) {
                        errorMsg = 'Connection issue. Please try again.';
                    } else if (err.message.includes('Failed to fetch')) {
                        errorMsg = 'Network error. Please check your connection.';
                    }

                    showToast('Failed to save', errorMsg, 'error');
                } finally {
                    // Re-enable save button
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save Color';
                }
            });
        }
    } catch (e) { /* ignore */ }

    // Apply saved background color (if any)
    try {
        const balanceDisplay = document.getElementById('balanceDisplay');
        const savedColor = user?.preferences?.backgroundColor;
        if (balanceDisplay && savedColor) {
            balanceDisplay.style.background = `linear-gradient(135deg, ${savedColor} 0%, ${shadeColor(savedColor, -20)} 100%)`;
        }
    } catch (e) { /* ignore */ }


    // Setup child actions
    setupChildActions();

    // Utility: lighten/darken a hex color by percent (-100 to +100)
    function shadeColor(hex, percent) {
        try {
            let c = hex.replace('#','');
            if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
            const num = parseInt(c, 16);
            let r = (num >> 16) & 0xFF;
            let g = (num >> 8) & 0xFF;
            let b = num & 0xFF;
            const amt = Math.round(2.55 * percent);
            r = Math.min(255, Math.max(0, r + amt));
            g = Math.min(255, Math.max(0, g + amt));
            b = Math.min(255, Math.max(0, b + amt));
            return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
        } catch (e) { return hex; }
    }


    // Load pending requests and transaction history in parallel
    await Promise.all([
        loadChildPendingRequests(),
        loadChildTransactionHistory()
    ]);
}

/**
 * Setup add child form for parents
 */
function setupAddChildForm() {
    const form = document.getElementById('addChildForm');

    if (!form) return;

    // Setup real-time validation first
    setupAddChildRealTimeValidation(form);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('childName').value.trim();
        const username = document.getElementById('childUsername').value.trim().toLowerCase();
        const pin = document.getElementById('childPinSetup').value.trim();
        const initialBalance = parseFloat(document.getElementById('initialBalance').value) || 0;

        // Validate username
        if (username.length < 4) {
            showToast('Invalid username', 'At least 4 characters', 'error');
            return;
        }

        // Validate PIN
        if (!/^[0-9]{4}$/.test(pin)) {
            showToast('Invalid PIN', 'PIN must be exactly 4 digits', 'error');
            return;
        }
        // No digit more than twice
        const counts = {};
        for (const ch of pin) counts[ch] = (counts[ch] || 0) + 1;
        if (Object.values(counts).some(c => c > 2)) {
            showToast('Invalid PIN', 'No digit can appear more than twice', 'error');
            return;
        }

        // Validate initial balance
        if (initialBalance < 0) {
            showToast('Invalid balance', 'Initial balance cannot be negative', 'error');
            return;
        }

        // Disable form during submission
        const submitButton = form.querySelector('button[type="submit"]');
        const originalText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = 'Creating...';

        try {
            const result = await Auth.createChild(name, username, pin, initialBalance);

            if (result.success) {
                showToast('Child account created', `@${username}`, 'success');
                const addChildModalEl = document.getElementById('addChildModal');
                if (addChildModalEl) addChildModalEl.style.display = 'none';
                form.reset();

                const child = result.child || { id: '', name, username, savings: initialBalance || 0 };
                const list = document.getElementById('childrenList');
                if (list) {
                    const empty = list.querySelector('.children-empty');
                    if (empty) list.innerHTML = '';
                    list.insertAdjacentHTML('beforeend', `
                        <div class="child-card sleek vertical" data-child-id="${child.id}">
                            <div class="card-header">
                                <button class="settings-btn" onclick="openChildSettings('${child.id}','${child.name}','${child.username}')">⚙️</button>
                            </div>
                            <div class="child-info">
                                <h3 class="child-name" title="Name">${child.name}</h3>

                                <div class="balance-display" title="Account Balance">
                                    <div class="balance-amount">$${(child.savings || 0).toFixed(2)}</div>
                                </div>
                            </div>
                            <div class="actions-column" style="display:flex; gap:8px; flex-wrap:wrap;">
                                <button class="btn btn-primary action-btn" onclick="addMoney('${child.id}', '${child.name}')">Add Money</button>
                                <button class="btn btn-secondary action-btn" onclick="removeMoney('${child.id}', '${child.name}')">Remove Money</button>
                                <button class="btn btn-secondary action-btn" onclick="viewHistory('${child.id}', '${child.name}')">History</button>
                            </div>
                        </div>
                    `);
                }
                const totalChildrenElement = document.getElementById('totalChildren');
                if (totalChildrenElement) {
                    const n = parseInt(totalChildrenElement.textContent || '0', 10) || 0;
                    totalChildrenElement.textContent = String(n + 1);
                }
                const totalBalanceElement = document.getElementById('totalBalance');
                if (totalBalanceElement) {
                    const tb = parseFloat(totalBalanceElement.textContent || '0') || 0;
                    totalBalanceElement.textContent = (tb + (Number(child.savings) || 0)).toFixed(2);
                }
            } else {
                showToast('Failed to create child', result.error || 'Please try again', 'error');
            }
        } catch (error) {
            console.error('Error creating child:', error);
            showToast('Error', 'An error occurred while creating the child account', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = originalText;
        }
    });
}

/**
 * Setup real-time validation for Add Child form
 */
function setupAddChildRealTimeValidation(form) {
    // Real-time username availability check with debounce
    const usernameInput = document.getElementById('childUsername');
    const usernameHelp = document.getElementById('usernameHelp');
    let usernameTimer;

    // Real-time PIN validation for add child
    const pinInput = document.getElementById('childPinSetup');
    const pinHelp = document.getElementById('pinHelp');

    function updateAddChildSubmitState() {
        const submitButton = form.querySelector('button[type="submit"]');
        const userOk = usernameInput?.dataset.valid === 'true';
        const pinOk = pinInput?.dataset.valid === 'true';
        // Name and balance basic checks
        const nameOk = document.getElementById('childName').value.trim().length > 0;
        const balOk = parseFloat(document.getElementById('initialBalance').value || '0') >= 0;
        submitButton.disabled = !(userOk && pinOk && nameOk && balOk);
    }

    if (usernameInput && usernameHelp) {
        usernameInput.addEventListener('input', () => {
            clearTimeout(usernameTimer);
            const val = usernameInput.value.trim().toLowerCase();
            if (val.length < 4) {
                usernameHelp.textContent = 'Username must be at least 4 characters';
                usernameHelp.style.color = '#dc3545';
                usernameInput.dataset.valid = 'false';
                updateAddChildSubmitState();
                return;
            }
            usernameHelp.textContent = 'Checking availability…';
            usernameHelp.style.color = '#6c757d';
            usernameTimer = setTimeout(async () => {
                const current = usernameInput.value.trim().toLowerCase();
                if (current !== val) return; // stale value, ignore
                try {
                    const res = await API.checkUsername(current);
                    if (current !== usernameInput.value.trim().toLowerCase()) return; // still stale
                    if (res.available) {
                        usernameHelp.textContent = 'Username is available';
                        usernameHelp.style.color = '#28a745';
                        usernameInput.dataset.valid = 'true';
                    } else {
                        usernameHelp.textContent = res.message || 'Username is taken';
                        usernameHelp.style.color = '#dc3545';
                        usernameInput.dataset.valid = 'false';
                    }
                } catch (e) {
                    usernameHelp.textContent = 'Unable to check availability';
                    usernameHelp.style.color = '#dc3545';
                    usernameInput.dataset.valid = 'false';
                } finally {
                    updateAddChildSubmitState();
                }
            }, 500);
        });
    }

    if (pinInput && pinHelp) {
        pinInput.addEventListener('input', () => {
            const val = pinInput.value.trim();
            let ok = /^\d{4}$/.test(val);
            if (ok) {
                const counts = {}; for (const ch of val) counts[ch] = (counts[ch] || 0) + 1;
                ok = !Object.values(counts).some(c => c > 2);
            }
            pinInput.style.borderColor = ok ? '#28a745' : '#dc3545';
            pinInput.dataset.valid = ok ? 'true' : 'false';

            // Update help text
            if (val.length === 0) {
                pinHelp.textContent = 'Exactly 4 digits, no digit more than twice';
                pinHelp.style.color = '#6c757d';
            } else if (ok) {
                pinHelp.textContent = 'PIN looks good';
                pinHelp.style.color = '#28a745';
            } else {
                pinHelp.textContent = 'Invalid PIN - check requirements';
                pinHelp.style.color = '#dc3545';
            }

            updateAddChildSubmitState();
        });
    }

    // Initialize button state
    updateAddChildSubmitState();
}

/**
 * Load pending approvals for parent
 */
async function loadPendingApprovals(options = {}) {
    const approvalsContainer = document.getElementById('approvalsList');
    const pendingCount = document.getElementById('pendingRequests');
    if (!approvalsContainer) return;

    // If user is editing or has an unsaved edited amount, skip soft refresh to preserve state
    if (options.soft) {
        const busyRow = approvalsContainer.querySelector('.approval-item[data-editing="true"], .approval-item[data-edited="true"]');
        if (busyRow) return;
    }

    // Show loading state (skip for soft refresh to avoid flicker)
    if (!options.soft) {
        approvalsContainer.innerHTML = '<div class="loading-placeholder">Loading pending approvals...</div>';
    }

    try {
        const [withdrawals, transfers, moneyAdditions] = await Promise.all([
            API.getWithdrawalRequests(),
            API.getTransferRequests(),
            API.getMoneyAdditionRequests()
        ]);

        const items = [];
        if (withdrawals.success && Array.isArray(withdrawals.requests)) {
            withdrawals.requests
                .filter(r => r.status === 'pending')
                .forEach(r => items.push({
                    kind: 'withdrawal',
                    id: String(r._id || r.id),
                    childId: r.userId,
                    amount: r.amount,
                    reason: r.reason,
                    date: r.createdAt
                }));
        }
        if (transfers.success && Array.isArray(transfers.requests)) {
            transfers.requests
                .filter(r => r.status === 'pending')
                .forEach(r => items.push({
                    kind: 'transfer',
                    id: String(r._id || r.id),
                    fromChildId: r.fromUserId,
                    toChildId: r.toUserId,
                    amount: r.amount,
                    reason: r.reason,
                    date: r.createdAt
                }));
        }
        if (moneyAdditions.success && Array.isArray(moneyAdditions.requests)) {
            moneyAdditions.requests
                .filter(r => r.status === 'pending')
                .forEach(r => items.push({
                    kind: 'money_addition',
                    id: String(r._id || r.id),
                    childId: r.userId,
                    amount: r.amount,
                    reason: r.reason,
                    date: r.createdAt
                }));
        }

        if (pendingCount) pendingCount.textContent = String(items.length);

        if (items.length === 0) {
            approvalsContainer.innerHTML = '<p class="no-data">No pending approvals</p>';
            return;
        }

        // Build a map of childId -> {name, username}
        const childrenRes = await Auth.request('/children');
        const childMap = {};
        if (childrenRes && childrenRes.children) {
            childrenRes.children.forEach(c => {
                childMap[String(c.id)] = { name: c.name, username: c.username };
            });
        }

        const pageSize = 5;
        let currentPage = 1;
        const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

        const renderPage = () => {
            const start = (currentPage - 1) * pageSize;
            const pageItems = items
                .slice()
                .sort((a,b) => new Date(b.date) - new Date(a.date))
                .slice(start, start + pageSize);
            const html = pageItems.map(item => {
                const d = new Date(item.date);
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year2 = String(d.getFullYear()).slice(-2);
                const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                const dateTime = `${day}/${month}/${year2} ${time}`;
                let label, reason, meta, approveAction, rejectAction;

                if (item.kind === 'withdrawal') {
                    label = 'Withdrawal Request';
                    reason = item.reason || '';
                    const child = childMap[String(item.childId)] || {};
                    meta = `From: ${child.name || item.childId}`;
                    approveAction = `approveWithdrawal('${item.id}')`;
                    rejectAction = `rejectWithdrawalPrompt('${item.id}')`;
                } else if (item.kind === 'transfer') {
                    label = 'Transfer Request';
                    reason = item.reason || '';
                    const from = childMap[String(item.fromChildId)] || {};
                    const to = childMap[String(item.toChildId)] || {};
                    meta = `From: ${from.name || item.fromChildId} → To: ${to.name || item.toChildId}`;
                    approveAction = `approveTransfer('${item.id}')`;
                    rejectAction = `rejectTransferPrompt('${item.id}')`;
                } else if (item.kind === 'money_addition') {
                    label = 'Add Money Request';
                    reason = item.reason || '';
                    const child = childMap[String(item.childId)] || {};
                    meta = `From: ${child.name || item.childId}`;
                    approveAction = `approveMoneyAddition('${item.id}')`;
                    rejectAction = `rejectMoneyAdditionPrompt('${item.id}')`;
                }
                const edited = (window.__approvalEdits && window.__approvalEdits[item.id] != null);
                const displayAmount = edited ? Number(window.__approvalEdits[item.id]) : Number(item.amount);
                return `
                    <div class="approval-item" data-kind="${item.kind}" data-id="${item.id}" data-child-id="${item.childId || ''}" data-from-child-id="${item.fromChildId || ''}" data-to-child-id="${item.toChildId || ''}" ${edited ? 'data-edited="true"' : ''}>
                        <div class="approval-details">
                            <div class="approval-title">
                                ${label} -
                                <span class="approval-amount-text">$${displayAmount.toFixed(2)}</span>
                                <input type="number" step="0.01" min="0.01" class="approval-amount-input" value="${displayAmount.toFixed(2)}" style="display:none; width: 90px; margin-left: 6px;" />
                            </div>
                            <div class="approval-meta">${meta} • ${dateTime}</div>
                            <div class="approval-desc">Reason: ${reason}</div>
                        </div>
                        <div class="approval-actions">
                            <button class="btn btn-secondary" type="button" data-action="edit" onclick="(function(btn){ var row=btn.closest('.approval-item'); var span=row.querySelector('.approval-amount-text'); var input=row.querySelector('.approval-amount-input'); var id=row.getAttribute('data-id'); var editing=input.style.display!=='none'; if(editing){ var v=parseFloat(input.value); if(!isFinite(v)||v<=0){ if(window.showToast){ showToast('Invalid amount','Enter a positive number','error'); } else { alert('Enter a positive number'); } input.focus(); return; } span.textContent='$'+v.toFixed(2); span.style.display=''; input.style.display='none'; btn.textContent='Edit'; row.removeAttribute('data-editing'); row.setAttribute('data-edited','true'); window.__approvalEdits = window.__approvalEdits || {}; window.__approvalEdits[id] = Number(v.toFixed(2)); } else { var cur=(span.textContent||'').replace(/[^0-9.]/g,''); input.value=cur; span.style.display='none'; input.style.display=''; input.focus(); btn.textContent='Done'; row.setAttribute('data-editing','true'); row.removeAttribute('data-edited'); if(window.__approvalEdits){ delete window.__approvalEdits[id]; } } })(this)">Edit</button>
                            <button class="btn btn-secondary" data-action="reject" onclick="${rejectAction}">Reject</button>
                            <button class="btn btn-primary" data-action="approve" onclick="${approveAction}">Approve</button>
                        </div>
                    </div>
                `;
            }).join('');
            approvalsContainer.innerHTML = html;

            const pager = document.getElementById('approvalsPagination');
            if (pager) {
                pager.innerHTML = renderPagination(currentPage, totalPages, (page) => {
                    currentPage = page;
                    renderPage();
                });
            }
        };

        renderPage();

/**
 * Render pagination controls
 */
function renderPagination(currentPage, totalPages, onPageChange) {
    const pageBtn = (p, active = false) => `<button class="page-btn ${active ? 'active' : ''}" data-page="${p}">${p}</button>`;
    const prev = currentPage > 1 ? `<button class="page-btn" data-page="${currentPage - 1}">Prev</button>` : '';
    const next = currentPage < totalPages ? `<button class="page-btn" data-page="${currentPage + 1}">Next</button>` : '';

    // show up to 5 pages around current
    const pages = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let p = start; p <= end; p++) pages.push(pageBtn(p, p === currentPage));

    const html = `${prev}${pages.join('')}${next}`;
    // attach click handling after container sets .innerHTML = html
    setTimeout(() => {
        const container = document.querySelector('.pagination');
        if (!container) return;
        Array.from(container.querySelectorAll('.page-btn')).forEach(btn => {
            btn.addEventListener('click', () => {
                const p = Number(btn.getAttribute('data-page'));
                if (p && p >= 1 && p <= totalPages) onPageChange(p);
            });
        });
    }, 0);
    return html;
}

    } catch (err) {
        console.error('Failed to load approvals', err);
        approvalsContainer.innerHTML = '<p class="no-data error">Failed to load approvals</p>';
    }
}

// Parent approval handlers
window.approveWithdrawal = async function(id) {
    try {
        const ok = await openConfirm({ title: 'Approve Withdrawal', message: 'Approve this withdrawal request?', okText: 'Approve' });
        if (!ok) return;

        const approvalsListEl = document.getElementById('approvalsList');
        const prevScroll = approvalsListEl ? approvalsListEl.scrollTop : 0;

        const row = document.querySelector(`.approval-item[data-kind="withdrawal"][data-id="${id}"]`) || document.querySelector(`.approval-item [onclick="approveWithdrawal('${id}')"]`)?.closest('.approval-item');
        let overrideAmount;
        if (row) {
            row.querySelectorAll('button').forEach(btn => btn.disabled = true);
            const input = row.querySelector('.approval-amount-input');
            if (input) {
                const v = parseFloat(input.value);
                if (!isFinite(v) || v <= 0) { showToast('Invalid amount', 'Enter a positive number', 'error'); row.querySelectorAll('button').forEach(btn => btn.disabled = false); return; }
                overrideAmount = Number(v.toFixed(2));
            }
        }
        if ((overrideAmount == null || !isFinite(overrideAmount) || overrideAmount <= 0) && window.__approvalEdits && window.__approvalEdits[id] != null) {
            const m = Number(window.__approvalEdits[id]);
            if (isFinite(m) && m > 0) overrideAmount = Number(m.toFixed(2));
        }

        const res = await API.approveWithdrawalRequest(id, overrideAmount);
        if (res.success) {
            showToast('Withdrawal approved', '', 'success');

            // Remove row
            if (row && row.parentElement) row.parentElement.removeChild(row);

            // Decrement pending counter
            const pendingCount = document.getElementById('pendingRequests');
            if (pendingCount) {
                const n = parseInt(pendingCount.textContent || '0', 10);
                if (!isNaN(n)) pendingCount.textContent = String(Math.max(0, n - 1));
            }

            // Update child balance in place if available
            const childId = row?.getAttribute('data-child-id');
            if (childId && typeof res.newBalance === 'number') {
                const el = document.querySelector(`.child-card[data-child-id="${childId}"] .balance-amount`);
                let oldBal = 0;
                if (el) {
                    oldBal = parseFloat((el.textContent || '').replace(/[^0-9.-]/g,'')) || 0;
                    el.textContent = `$${Number(res.newBalance).toFixed(2)}`;
                }
                const totalBalanceElement = document.getElementById('totalBalance');
                if (totalBalanceElement) {
                    const tb = parseFloat(totalBalanceElement.textContent || '0') || 0;
                    const delta = Number(res.newBalance) - oldBal;
                    totalBalanceElement.textContent = (tb + delta).toFixed(2);
                }
            }

            if (window.__approvalEdits) delete window.__approvalEdits[id];
            if (approvalsListEl) approvalsListEl.scrollTop = prevScroll;
        } else {
            // Friendlier, actionable error handling (keep row interactive, no page reload needed)
            const apiMsg = (res && (res.error || res.message || '')) || '';
            const insufficient = /insufficient|not enough|exceed|more than|over.*balance/i.test(apiMsg);
            if (row) row.querySelectorAll('button').forEach(btn => btn.disabled = false);

            if (insufficient) {
                // Try to show current available balance for this child
                let avail = null;
                try {
                    const fromChildId = row?.getAttribute('data-child-id');
                    const ch = await Auth.getChildren();
                    if (ch?.success && Array.isArray(ch.children)) {
                        const child = ch.children.find(c => String(c.id) === String(fromChildId));
                        if (child) avail = Number(child.savings) || 0;
                    }
                } catch (_) {}

                const more = avail != null ? `Available: $${avail.toFixed(2)}.` : '';
                showToast('Approval failed', `Not enough money. ${more} Adjust the amount and try again.`, 'error');

                // Re-open inline editor so parent can correct amount immediately
                try {
                    const span = row.querySelector('.approval-amount-text');
                    const input = row.querySelector('.approval-amount-input');
                    const editBtn = row.querySelector('[data-action="edit"]');
                    if (span && input && editBtn) {
                        const cur = parseFloat((span.textContent || '').replace(/[^0-9.]/g, '')) || parseFloat(input.value) || 0;
                        span.style.display = 'none';
                        input.style.display = '';
                        if (avail != null) {
                            input.setAttribute('max', avail.toFixed(2));
                            if (cur > avail) input.value = avail.toFixed(2);
                        }
                        editBtn.textContent = 'Done';
                        row.setAttribute('data-editing', 'true');
                        row.removeAttribute('data-edited');
                        input.focus();
                        if (input.select) input.select();
                    }
                } catch (_) {}
            } else {
                showToast('Failed to approve', apiMsg || 'Please try again', 'error');
            }
        }
    } catch (e) {
        console.error('Approve withdrawal failed', e);
        const row = document.querySelector(`.approval-item[data-kind="withdrawal"][data-id="${id}"]`) || document.querySelector(`.approval-item [onclick="approveWithdrawal('${id}')"]`)?.closest('.approval-item');
        if (row) row.querySelectorAll('button').forEach(btn => btn.disabled = false);

        const apiMsg = e && e.message ? String(e.message) : '';
        const insufficient = /insufficient|not enough|exceed|more than|over.*balance/i.test(apiMsg);

        if (insufficient && row) {
            // Try to show current available balance for this child
            let avail = null;
            try {
                const fromChildId = row?.getAttribute('data-child-id');
                const ch = await Auth.getChildren();
                if (ch?.success && Array.isArray(ch.children)) {
                    const child = ch.children.find(c => String(c.id) === String(fromChildId));
                    if (child) avail = Number(child.savings) || 0;
                }
            } catch (_) {}

            const more = avail != null ? `Available: $${avail.toFixed(2)}.` : '';
            showToast('Approval failed', `Not enough money. ${more} Adjust the amount and try again.`, 'error');

            // Re-open inline editor so parent can correct amount immediately
            try {
                const span = row.querySelector('.approval-amount-text');
                const input = row.querySelector('.approval-amount-input');
                const editBtn = row.querySelector('[data-action="edit"]');
                if (span && input && editBtn) {
                    const cur = parseFloat((span.textContent || '').replace(/[^0-9.]/g, '')) || parseFloat(input.value) || 0;
                    span.style.display = 'none';
                    input.style.display = '';
                    if (avail != null) {
                        input.setAttribute('max', avail.toFixed(2));
                        if (cur > avail) input.value = avail.toFixed(2);
                    }
                    editBtn.textContent = 'Done';
                    row.setAttribute('data-editing', 'true');
                    row.removeAttribute('data-edited');
                    input.focus();
                    if (input.select) input.select();
                }
            } catch (_) {}
        } else {
            showToast('Failed to approve', apiMsg || 'Please try again', 'error');
        }
    }
};
window.rejectWithdrawalPrompt = async function(id) {
    try {
        const promptRes = await openTextPrompt({ title: 'Reject Withdrawal', message: 'Add a reason (optional):', placeholder: 'Reason (optional)', okText: 'Reject', cancelText: 'Cancel' });
        if (!promptRes || promptRes.cancelled) return;
        const ok = await openConfirm({ title: 'Reject Withdrawal', message: 'Reject this withdrawal request?', okText: 'Reject' });
        if (!ok) return;

        const row = document.querySelector(`.approval-item[data-kind="withdrawal"][data-id="${id}"]`) || document.querySelector(`.approval-item [onclick="rejectWithdrawalPrompt('${id}')"]`)?.closest('.approval-item');
        if (row) row.querySelectorAll('button').forEach(btn => btn.disabled = true);

        const res = await API.rejectWithdrawalRequest(id, promptRes.value || '');
        if (res.success) {
            showToast('Withdrawal rejected');
            if (row && row.parentElement) row.parentElement.removeChild(row);

            const pendingCount = document.getElementById('pendingRequests');
            if (pendingCount) {
                const n = parseInt(pendingCount.textContent || '0', 10);
                if (!isNaN(n)) pendingCount.textContent = String(Math.max(0, n - 1));
            }
            if (window.__approvalEdits) delete window.__approvalEdits[id];
        } else {
            showToast('Failed to reject', res.error || '', 'error');
            if (row) row.querySelectorAll('button').forEach(btn => btn.disabled = false);
        }
    } catch (e) {
        console.error('Reject withdrawal failed', e);
        showToast('Failed to reject', '', 'error');
    }
};
window.approveTransfer = async function(id) {
    try {
        const ok = await openConfirm({ title: 'Approve Transfer', message: 'Approve this transfer request?', okText: 'Approve' });
        if (!ok) return;

        const approvalsListEl = document.getElementById('approvalsList');
        const prevScroll = approvalsListEl ? approvalsListEl.scrollTop : 0;

        const row = document.querySelector(`.approval-item[data-kind="transfer"][data-id="${id}"]`) || document.querySelector(`.approval-item [onclick="approveTransfer('${id}')"]`)?.closest('.approval-item');
        let overrideAmount;
        if (row) {
            row.querySelectorAll('button').forEach(btn => btn.disabled = true);
            const input = row.querySelector('.approval-amount-input');
            if (input) {
                const v = parseFloat(input.value);
                if (!isFinite(v) || v <= 0) { showToast('Invalid amount', 'Enter a positive number', 'error'); row.querySelectorAll('button').forEach(btn => btn.disabled = false); return; }
                overrideAmount = Number(v.toFixed(2));
            }
        }
        if ((overrideAmount == null || !isFinite(overrideAmount) || overrideAmount <= 0) && window.__approvalEdits && window.__approvalEdits[id] != null) {
            const m = Number(window.__approvalEdits[id]);
            if (isFinite(m) && m > 0) overrideAmount = Number(m.toFixed(2));
        }

        const res = await API.approveTransferRequest(id, overrideAmount);
        if (res.success) {
            showToast('Transfer approved', '', 'success');

            if (row && row.parentElement) row.parentElement.removeChild(row);

            const pendingCount = document.getElementById('pendingRequests');
            if (pendingCount) {
                const n = parseInt(pendingCount.textContent || '0', 10);
                if (!isNaN(n)) pendingCount.textContent = String(Math.max(0, n - 1));
            }

            const fromChildId = row?.getAttribute('data-from-child-id');
            const toChildId = row?.getAttribute('data-to-child-id');
            if (fromChildId && typeof res.fromNewBalance === 'number') {
                const el = document.querySelector(`.child-card[data-child-id="${fromChildId}"] .balance-amount`);
                if (el) el.textContent = `$${Number(res.fromNewBalance).toFixed(2)}`;
            }
            if (toChildId && typeof res.toNewBalance === 'number') {
                const el = document.querySelector(`.child-card[data-child-id="${toChildId}"] .balance-amount`);
                if (el) el.textContent = `$${Number(res.toNewBalance).toFixed(2)}`;
            }

            if (window.__approvalEdits) delete window.__approvalEdits[id];
            if (approvalsListEl) approvalsListEl.scrollTop = prevScroll;
        } else {
            // Friendlier, actionable error handling (keep row interactive, no page reload needed)
            const apiMsg = (res && (res.error || res.message || '')) || '';
            const insufficient = /insufficient|not enough|exceed|more than|over.*balance/i.test(apiMsg);
            if (row) row.querySelectorAll('button').forEach(btn => btn.disabled = false);

            if (insufficient) {
                // Try to show current available balance for the sender (transfer: from-child)
                let avail = null;
                try {
                    const fromChildId = row?.getAttribute('data-from-child-id');
                    const ch = await Auth.getChildren();
                    if (ch?.success && Array.isArray(ch.children)) {
                        const child = ch.children.find(c => String(c.id) === String(fromChildId));
                        if (child) avail = Number(child.savings) || 0;
                    }
                } catch (_) {}

                const more = avail != null ? `Available: $${avail.toFixed(2)}.` : '';
                showToast('Approval failed', `Not enough money. ${more} Adjust the amount and try again.`, 'error');

                // Re-open inline editor so parent can correct amount immediately
                try {
                    const span = row.querySelector('.approval-amount-text');
                    const input = row.querySelector('.approval-amount-input');
                    const editBtn = row.querySelector('[data-action="edit"]');
                    if (span && input && editBtn) {
                        const cur = parseFloat((span.textContent || '').replace(/[^0-9.]/g, '')) || parseFloat(input.value) || 0;
                        span.style.display = 'none';
                        input.style.display = '';
                        if (avail != null) {
                            input.setAttribute('max', avail.toFixed(2));
                            if (cur > avail) input.value = avail.toFixed(2);
                        }
                        editBtn.textContent = 'Done';
                        row.setAttribute('data-editing', 'true');
                        row.removeAttribute('data-edited');
                        input.focus();
                        if (input.select) input.select();
                    }
                } catch (_) {}
            } else {
                showToast('Failed to approve', apiMsg || 'Please try again', 'error');
            }
        }
    } catch (e) {
        console.error('Approve transfer failed', e);
        const row = document.querySelector(`.approval-item[data-kind="transfer"][data-id="${id}"]`) || document.querySelector(`.approval-item [onclick="approveTransfer('${id}')"]`)?.closest('.approval-item');
        if (row) row.querySelectorAll('button').forEach(btn => btn.disabled = false);

        const apiMsg = e && e.message ? String(e.message) : '';
        const insufficient = /insufficient|not enough|exceed|more than|over.*balance/i.test(apiMsg);

        if (insufficient && row) {
            // Try to show current available balance for the sender (transfer: from-child)
            let avail = null;
            try {
                const fromChildId = row?.getAttribute('data-from-child-id');
                const ch = await Auth.getChildren();
                if (ch?.success && Array.isArray(ch.children)) {
                    const child = ch.children.find(c => String(c.id) === String(fromChildId));
                    if (child) avail = Number(child.savings) || 0;
                }
            } catch (_) {}

            const more = avail != null ? `Available: $${avail.toFixed(2)}.` : '';
            showToast('Approval failed', `Not enough money. ${more} Adjust the amount and try again.`, 'error');

            // Re-open inline editor so parent can correct amount immediately
            try {
                const span = row.querySelector('.approval-amount-text');
                const input = row.querySelector('.approval-amount-input');
                const editBtn = row.querySelector('[data-action="edit"]');
                if (span && input && editBtn) {
                    const cur = parseFloat((span.textContent || '').replace(/[^0-9.]/g, '')) || parseFloat(input.value) || 0;
                    span.style.display = 'none';
                    input.style.display = '';
                    if (avail != null) {
                        input.setAttribute('max', avail.toFixed(2));
                        if (cur > avail) input.value = avail.toFixed(2);
                    }
                    editBtn.textContent = 'Done';
                    row.setAttribute('data-editing', 'true');
                    row.removeAttribute('data-edited');
                    input.focus();
                    if (input.select) input.select();
                }
            } catch (_) {}
        } else {
            showToast('Failed to approve', apiMsg || 'Please try again', 'error');
        }
    }
};
window.rejectTransferPrompt = async function(id) {
    try {
        const promptRes = await openTextPrompt({ title: 'Reject Transfer', message: 'Add an optional reason (or leave blank):', placeholder: 'Reason (optional)', okText: 'Continue', cancelText: 'Cancel' });
        const ok = await openConfirm({ title: 'Reject Transfer', message: 'Reject this transfer request?', okText: 'Reject' });
        if (!ok) return;

        const row = document.querySelector(`.approval-item[data-kind="transfer"][data-id="${id}"]`) || document.querySelector(`.approval-item [onclick="rejectTransferPrompt('${id}')"]`)?.closest('.approval-item');
        if (row) row.querySelectorAll('button').forEach(btn => btn.disabled = true);

        const res = await API.rejectTransferRequest(id, promptRes?.value || '');
        if (res.success) {
            showToast('Transfer rejected');

            if (row && row.parentElement) row.parentElement.removeChild(row);
            const pendingCount = document.getElementById('pendingRequests');
            if (pendingCount) {
                const n = parseInt(pendingCount.textContent || '0', 10);
                if (!isNaN(n)) pendingCount.textContent = String(Math.max(0, n - 1));
            }
            if (window.__approvalEdits) delete window.__approvalEdits[id];
        } else {
            showToast('Failed to reject', res.error || '', 'error');
            if (row) row.querySelectorAll('button').forEach(btn => btn.disabled = false);
        }
    } catch (e) {
        console.error('Reject transfer failed', e);
        showToast('Failed to reject', '', 'error');
    }
};

// Money addition approval handlers
window.approveMoneyAddition = async function(id) {
    try {
        const ok = await openConfirm({ title: 'Approve Money Request', message: 'Approve this money addition request?', okText: 'Approve' });
        if (!ok) return;

        const approvalsListEl = document.getElementById('approvalsList');
        const prevScroll = approvalsListEl ? approvalsListEl.scrollTop : 0;

        const row = document.querySelector(`.approval-item[data-kind="money_addition"][data-id="${id}"]`) || document.querySelector(`.approval-item [onclick="approveMoneyAddition('${id}')"]`)?.closest('.approval-item');
        let overrideAmount;
        if (row) {
            row.querySelectorAll('button').forEach(btn => btn.disabled = true);
            const input = row.querySelector('.approval-amount-input');
            if (input) {
                const v = parseFloat(input.value);
                if (!isFinite(v) || v <= 0) { showToast('Invalid amount', 'Enter a positive number', 'error'); row.querySelectorAll('button').forEach(btn => btn.disabled = false); return; }
                overrideAmount = Number(v.toFixed(2));
            }
        }
        if ((overrideAmount == null || !isFinite(overrideAmount) || overrideAmount <= 0) && window.__approvalEdits && window.__approvalEdits[id] != null) {
            const m = Number(window.__approvalEdits[id]);
            if (isFinite(m) && m > 0) overrideAmount = Number(m.toFixed(2));
        }

        const res = await API.approveMoneyAdditionRequest(id, overrideAmount);
        if (res.success) {
            showToast('Money request approved', '', 'success');

            if (row && row.parentElement) row.parentElement.removeChild(row);

            const pendingCount = document.getElementById('pendingRequests');
            if (pendingCount) {
                const n = parseInt(pendingCount.textContent || '0', 10);
                if (!isNaN(n)) pendingCount.textContent = String(Math.max(0, n - 1));
            }

            // Update the child's displayed balance if available from server response
            const childId = row?.getAttribute('data-child-id');
            if (childId && typeof res.newBalance === 'number') {
                const el = document.querySelector(`.child-card[data-child-id="${childId}"] .balance-amount`);
                let oldBal = 0;
                if (el) {
                    oldBal = parseFloat((el.textContent || '').replace(/[^0-9.-]/g,'')) || 0;
                    el.textContent = `$${Number(res.newBalance).toFixed(2)}`;
                }
                const totalBalanceElement = document.getElementById('totalBalance');
                if (totalBalanceElement) {
                    const tb = parseFloat(totalBalanceElement.textContent || '0') || 0;
                    const delta = Number(res.newBalance) - oldBal;
                    totalBalanceElement.textContent = (tb + delta).toFixed(2);
                }
            }

            if (window.__approvalEdits) delete window.__approvalEdits[id];
            if (approvalsListEl) approvalsListEl.scrollTop = prevScroll;
        } else {
            showToast('Failed to approve', res.error || 'Please try again', 'error');
            if (row) row.querySelectorAll('button').forEach(btn => btn.disabled = false);
        }
    } catch (e) {
        console.error('Approve money addition failed', e);
        const row = document.querySelector(`.approval-item[data-kind="money_addition"][data-id="${id}"]`) || document.querySelector(`.approval-item [onclick="approveMoneyAddition('${id}')"]`)?.closest('.approval-item');
        if (row) row.querySelectorAll('button').forEach(btn => btn.disabled = false);
        showToast('Failed to approve', e?.message || 'Please try again', 'error');
    }
};
window.rejectMoneyAdditionPrompt = async function(id) {
    try {
        const promptRes = await openTextPrompt({ title: 'Reject Money Request', message: 'Add an optional reason (or leave blank):', placeholder: 'Reason (optional)', okText: 'Continue', cancelText: 'Cancel' });
        const ok = await openConfirm({ title: 'Reject Money Request', message: 'Reject this money addition request?', okText: 'Reject' });
        if (!ok) return;

        const row = document.querySelector(`.approval-item[data-kind="money_addition"][data-id="${id}"]`) || document.querySelector(`.approval-item [onclick="rejectMoneyAdditionPrompt('${id}')"]`)?.closest('.approval-item');
        if (row) row.querySelectorAll('button').forEach(btn => btn.disabled = true);

        const res = await API.rejectMoneyAdditionRequest(id, promptRes?.value || '');
        if (res.success) {
            showToast('Money request rejected');

            if (row && row.parentElement) row.parentElement.removeChild(row);
            const pendingCount = document.getElementById('pendingRequests');
            if (pendingCount) {
                const n = parseInt(pendingCount.textContent || '0', 10);
                if (!isNaN(n)) pendingCount.textContent = String(Math.max(0, n - 1));
            }
            if (window.__approvalEdits) delete window.__approvalEdits[id];
        } else {
            showToast('Failed to reject', res.error || '', 'error');
            if (row) row.querySelectorAll('button').forEach(btn => btn.disabled = false);
        }
    } catch (e) {
        console.error('Reject money addition failed', e);
        showToast('Failed to reject', '', 'error');
    }
};

/**
 * Load children list for parent
 */
async function loadChildrenList() {
    const childrenList = document.getElementById('childrenList');
    const totalChildrenElement = document.getElementById('totalChildren');
    const totalBalanceElement = document.getElementById('totalBalance');

    if (!childrenList) return;

    // Show loading state
    childrenList.innerHTML = '<div class="loading-placeholder">Loading children accounts...</div>';

    try {
        const result = await Auth.getChildren();

        if (result.success && result.children) {
            // Update total children count
            if (totalChildrenElement) {
                totalChildrenElement.textContent = result.children.length;
            }

            // Calculate total balance
            const totalBalance = result.children.reduce((sum, child) => sum + (child.savings || 0), 0);
            if (totalBalanceElement) {
                totalBalanceElement.textContent = totalBalance.toFixed(2);
            }

            // Display children cards
            if (result.children.length === 0) {
                childrenList.innerHTML = '<p class="no-data children-empty">No children yet — click the + button on the right to add your first child.</p>';
            } else {
                childrenList.innerHTML = result.children.map(child => `
                    <div class="child-card sleek vertical" data-child-id="${child.id}">
                        <div class="card-header">
                            <button class="settings-btn" onclick="openChildSettings('${child.id}','${child.name}','${child.username}')">⚙️</button>
                        </div>
                        <div class="child-info">
                            <h3 class="child-name" title="Name">${child.name}</h3>

                            <div class="balance-display" title="Account Balance">
                                <div class="balance-amount">$${(child.savings || 0).toFixed(2)}</div>
                            </div>
                        </div>
                        <div class="actions-column" style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button class="btn btn-primary action-btn" onclick="addMoney('${child.id}', '${child.name}')">Add Money</button>
                            <button class="btn btn-secondary action-btn" onclick="removeMoney('${child.id}', '${child.name}')">Remove Money</button>
                            <button class="btn btn-secondary action-btn" onclick="viewHistory('${child.id}', '${child.name}')">History</button>
                        </div>
                    </div>
                `).join('');
            }
        } else {
            childrenList.innerHTML = '<p class="error">Failed to load children</p>';
        }
    } catch (error) {
        console.error('Error loading children:', error);
        childrenList.innerHTML = `<p class="error">Error loading children: ${error.message}</p>`;
    }
}

/**
 * Setup parent modals
 */
function setupParentModals() {
    // Add Money Modal
    const addMoneyModal = document.getElementById('addMoneyModal');
    const addMoneyForm = document.getElementById('addMoneyForm');
    const closeButtons = document.querySelectorAll('.modal .close');

    // Close modal functionality
    closeButtons.forEach(button => {
        button.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });

    // Backdrop close helper: only close when the press started on the backdrop
    const bindBackdropClose = (modalEl) => {
        if (!modalEl) return;
        let down = false;
        const onDown = (e) => { down = (e.target === modalEl); };
        const onClick = (e) => { if (e.target === modalEl && down) modalEl.style.display = 'none'; down = false; };
        modalEl.addEventListener('mousedown', onDown);
        modalEl.addEventListener('touchstart', onDown, { passive: true });
        modalEl.addEventListener('click', onClick);
    };
    bindBackdropClose(addMoneyModal);

    // Add money form submission
    if (addMoneyForm) {
        addMoneyForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const childId = document.getElementById('addMoneyChildId').value;
            const amount = parseFloat(document.getElementById('choreAmount').value);
            const description = document.getElementById('choreDescription').value;

            if (!childId || !amount || !description) {
                alert('Please fill in all fields');
                return;
            }

            if (amount <= 0) {
                alert('Amount must be greater than 0');
                return;
            }

            const submitButton = addMoneyForm.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            submitButton.disabled = true;
            submitButton.textContent = 'Adding...';

            try {
                const ok = await openConfirm({
                    title: 'Confirm Deposit',
                    message: `Add $${amount.toFixed(2)} to this child?`,
                    okText: 'Confirm',
                    cancelText: 'Cancel'
                });
                if (!ok) { submitButton.disabled = false; submitButton.textContent = originalText; return; }

                const result = await API.addTransaction(childId, amount, description, 'deposit');

                if (result.success) {
                    showToast('Deposit added', `New balance: $${result.newBalance.toFixed(2)}`, 'success');
                    addMoneyModal.style.display = 'none';
                    addMoneyForm.reset();

                    const card = document.querySelector(`.child-card[data-child-id="${childId}"]`);
                    let oldBal = 0;
                    if (card) {
                        const balEl = card.querySelector('.balance-amount');
                        if (balEl) {
                            oldBal = parseFloat((balEl.textContent || '').replace(/[^0-9.-]/g,'')) || 0;
                            balEl.textContent = `$${Number(result.newBalance).toFixed(2)}`;
                        }
                    }
                    const totalBalanceElement = document.getElementById('totalBalance');
                    if (totalBalanceElement) {
                        const tb = parseFloat(totalBalanceElement.textContent || '0') || 0;
                        const delta = Number(result.newBalance) - oldBal;
                        totalBalanceElement.textContent = (tb + delta).toFixed(2);
                    }
                } else {
                    showToast('Failed to add money', result.error || 'Unknown error', 'error');
                }
            } catch (error) {
                console.error('Error adding money:', error);
                showToast('Error', 'An error occurred while adding money', 'error');
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = originalText;
            }
        });

    // Remove money modal handling
    const removeMoneyModal = document.getElementById('removeMoneyModal');
    const removeMoneyForm = document.getElementById('removeMoneyForm');
    bindBackdropClose(removeMoneyModal);

    if (removeMoneyForm) {
        removeMoneyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const childId = document.getElementById('removeMoneyChildId').value;
            const amount = parseFloat(document.getElementById('removeAmount').value);
            const reason = document.getElementById('removeReason').value.trim();

            if (!childId || !amount || !reason) {
                alert('Please fill in all fields');
                return;
            }
            if (amount <= 0) {
                alert('Amount must be greater than 0');
                return;
            }

            const submitButton = removeMoneyForm.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            submitButton.disabled = true;
            submitButton.textContent = 'Removing...';

            try {
                const ok = await openConfirm({
                    title: 'Confirm Withdrawal',
                    message: `Remove $${amount.toFixed(2)} from this child?`,
                    okText: 'Confirm',
                    cancelText: 'Cancel',
                    okButtonClass: 'btn-danger'
                });
                if (!ok) { submitButton.disabled = false; submitButton.textContent = originalText; return; }

                const result = await API.addTransaction(childId, amount, `Removed by parent: ${reason}`, 'withdrawal');

                if (result.success) {
                    showToast('Money removed', `New balance: $${result.newBalance.toFixed(2)}`, 'success');
                    removeMoneyModal.style.display = 'none';
                    removeMoneyForm.reset();

                    const card = document.querySelector(`.child-card[data-child-id="${childId}"]`);
                    let oldBal = 0;
                    if (card) {
                        const balEl = card.querySelector('.balance-amount');
                        if (balEl) {
                            oldBal = parseFloat((balEl.textContent || '').replace(/[^0-9.-]/g,'')) || 0;
                            balEl.textContent = `$${Number(result.newBalance).toFixed(2)}`;
                        }
                    }
                    const totalBalanceElement = document.getElementById('totalBalance');
                    if (totalBalanceElement) {
                        const tb = parseFloat(totalBalanceElement.textContent || '0') || 0;
                        const delta = Number(result.newBalance) - oldBal;
                        totalBalanceElement.textContent = (tb + delta).toFixed(2);
                    }
                } else {
                    showToast('Failed to remove money', result.error || 'Unknown error', 'error');
                }
            } catch (error) {
                console.error('Error removing money:', error);
                showToast('Error', 'An error occurred while removing money', 'error');
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = originalText;
            }
        });
    }

    }

    // Setup Add Child Modal
    const addChildBtn = document.getElementById('addChildBtn');
    const addChildModal = document.getElementById('addChildModal');
    const addChildClose = document.getElementById('addChildClose');

    if (addChildBtn && addChildModal && addChildClose) {
        // Open modal when + button is clicked
        addChildBtn.addEventListener('click', () => {
            addChildModal.style.display = 'flex';
        });

        // Close modal when X is clicked
        addChildClose.addEventListener('click', () => {
            addChildModal.style.display = 'none';
        });

        // Close modal when clicking outside (only if press started on backdrop)
        bindBackdropClose(addChildModal);
    }

    // Setup Transaction History Modal
    const transactionHistoryModal = document.getElementById('transactionHistoryModal');
    const transactionHistoryClose = document.getElementById('transactionHistoryClose');

    if (transactionHistoryModal && transactionHistoryClose) {
        // Close modal when X is clicked
        transactionHistoryClose.addEventListener('click', () => {
            transactionHistoryModal.style.display = 'none';
        });

        // Close modal when clicking outside (only if press started on backdrop)
        bindBackdropClose(transactionHistoryModal);
    }
}

/**
 * Setup child action buttons
 */
function setupChildActions() {
    const requestBtn = document.getElementById('requestWithdrawalBtn');
    const requestAddMoneyBtn = document.getElementById('requestAddMoneyBtn');
    const transferBtn = document.getElementById('transferMoneyBtn');
    const withdrawalModal = document.getElementById('withdrawalModal');
    const addMoneyRequestModal = document.getElementById('addMoneyRequestModal');
    const transferModal = document.getElementById('transferModal');
    const withdrawalForm = document.getElementById('withdrawalForm');
    const addMoneyRequestForm = document.getElementById('addMoneyRequestForm');
    const transferForm = document.getElementById('transferForm');

    // Backdrop close helper for child modals
    const bindBackdropClose = (modalEl) => {
        if (!modalEl) return;
        let down = false;
        const onDown = (e) => { down = (e.target === modalEl); };
        const onClick = (e) => { if (e.target === modalEl && down) modalEl.style.display = 'none'; down = false; };
        modalEl.addEventListener('mousedown', onDown);
        modalEl.addEventListener('touchstart', onDown, { passive: true });
        modalEl.addEventListener('click', onClick);
    };
    bindBackdropClose(withdrawalModal);
    bindBackdropClose(addMoneyRequestModal);
    bindBackdropClose(transferModal);

    // Setup modal close buttons
    const closeButtons = document.querySelectorAll('.modal .close');
    closeButtons.forEach(button => {
        button.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });

    // Request withdrawal button
    if (requestBtn && withdrawalModal) {
        requestBtn.addEventListener('click', () => {
            withdrawalModal.style.display = 'flex';
        });
    }

    // Request money addition button
    if (requestAddMoneyBtn && addMoneyRequestModal) {
        requestAddMoneyBtn.addEventListener('click', () => {
            addMoneyRequestModal.style.display = 'flex';
        });
    }

    // Transfer money button
    if (transferBtn && transferModal) {
        if (!transferBtn.dataset.bound) {
            transferBtn.dataset.bound = 'true';
            transferBtn.addEventListener('click', async () => {
                try {
                    // Stamp to ignore stale responses from rapid multiple clicks
                    transferBtn.__siblingsReqSeq = (transferBtn.__siblingsReqSeq || 0) + 1;
                    const seq = transferBtn.__siblingsReqSeq;

                    const select = document.getElementById('siblingSelect');
                    if (select) {
                        // Reset options each time
                        select.innerHTML = '<option value="">Select a sibling</option>';
                        const res = await API.request('/siblings');

                        // Ignore if a newer click started a newer request
                        if (seq !== transferBtn.__siblingsReqSeq) return;

                        if (res.success && Array.isArray(res.siblings)) {
                            // Deduplicate siblings by id just in case
                            const seen = new Set();
                            res.siblings.forEach(sib => {
                                const idStr = String(sib.id);
                                if (seen.has(idStr)) return;
                                seen.add(idStr);
                                const opt = document.createElement('option');
                                opt.value = idStr;
                                opt.textContent = `${sib.name}`;
                                select.appendChild(opt);
                            });
                        }
                    }
                } catch (err) {
                    console.error('Failed to load siblings', err);
                }
                transferModal.style.display = 'flex';
            });
        }
    }

    // Withdrawal form submission
    if (withdrawalForm) {
        withdrawalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = document.getElementById('withdrawAmount').value;
            const reason = document.getElementById('withdrawReason').value;

            try {
                const res = await API.createWithdrawalRequest(amount, reason);
                const isOk = res && (res.success === true || res.ok === true || res.status === 'success');
                if (isOk) {
                    showToast('Request submitted', 'Withdrawal request sent for approval', 'success');
                    withdrawalModal.style.display = 'none';
                    withdrawalForm.reset();
                    await loadChildPendingRequests();
                } else {
                    showToast('Request failed', (res && (res.error || res.message)) || 'Failed to send request', 'error');
                }
            } catch (err) {
                console.error('Withdrawal request failed', err);
                showToast('Request failed', err?.message || 'Failed to send request', 'error');
            }
        });
    }

    // Transfer form submission
    if (transferForm) {
        transferForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const toChildId = document.getElementById('siblingSelect').value;
            const amount = document.getElementById('transferAmount').value;
            const reason = document.getElementById('transferReason').value;

            if (!toChildId) {
                showToast('Select a sibling', 'Please choose a sibling to transfer to', 'error');
                return;
            }
            try {
                const res = await API.createTransferRequest(toChildId, amount, reason);

// Global removeMoney function to open the modal for a specific child
window.removeMoney = function(childId, childName) {
    const modal = document.getElementById('removeMoneyModal');
    const childIdInput = document.getElementById('removeMoneyChildId');
    const modalTitle = modal?.querySelector('h2');

    if (modal && childIdInput) {
        childIdInput.value = childId;
        if (modalTitle) modalTitle.textContent = `Remove Money from ${childName}`;
        modal.style.display = 'flex';
    }
};

                const isOk = res && (res.success === true || res.ok === true || res.status === 'success');
                if (isOk) {
                    showToast('Request submitted', 'Transfer request sent for approval', 'success');
                    transferModal.style.display = 'none';
                    transferForm.reset();
                    await loadChildPendingRequests();
                } else {
                    showToast('Request failed', (res && (res.error || res.message)) || 'Failed to send request', 'error');
                }
            } catch (err) {
                console.error('Transfer request failed', err);
                showToast('Request failed', err?.message || 'Failed to send request', 'error');
            }
        });
    }

    // Money addition request form submission
    if (addMoneyRequestForm) {
        addMoneyRequestForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = document.getElementById('addMoneyAmount').value;
            const reason = document.getElementById('addMoneyReason').value;

            try {
                const res = await API.createMoneyAdditionRequest(amount, reason);
                const isOk = res && (res.success === true || res.ok === true || res.status === 'success');
                if (isOk) {
                    showToast('Request submitted', 'Money request sent for approval', 'success');
                    addMoneyRequestModal.style.display = 'none';
                    addMoneyRequestForm.reset();
                    await loadChildPendingRequests();
                } else {
                    showToast('Request failed', (res && (res.error || res.message)) || 'Failed to send request', 'error');
                }
            } catch (err) {
                console.error('Money addition request failed', err);
                showToast('Request failed', err?.message || 'Failed to send request', 'error');
            }
        });
    }
}

// Global functions for button clicks
window.addMoney = function(childId, childName) {
    const modal = document.getElementById('addMoneyModal');
    const childIdInput = document.getElementById('addMoneyChildId');
    const modalTitle = modal.querySelector('h2');

    if (modal && childIdInput) {
        childIdInput.value = childId;
        if (modalTitle) {
            modalTitle.textContent = `Add Money for ${childName}`;
        }
        modal.style.display = 'flex';
    }
};

window.removeMoney = function(childId, childName) {
    const modal = document.getElementById('removeMoneyModal');
    const childIdInput = document.getElementById('removeMoneyChildId');
    const modalTitle = modal?.querySelector('h2');
    if (modal && childIdInput) {
        childIdInput.value = childId;
        if (modalTitle) modalTitle.textContent = `Remove Money from ${childName}`;
        modal.style.display = 'flex';
    }
};


window.viewHistory = async function(childId, childName) {
    const modal = document.getElementById('transactionHistoryModal');
    if (!modal) return;

    const modalTitle = modal.querySelector('h2');
    const transactionContainer = document.getElementById('historyTransactionList');

    if (modalTitle) {
        const possessive = childName && childName.endsWith('s') ? `${childName}'` : `${childName}'s`;
        modalTitle.textContent = `${possessive} Transaction History`;
    }

    if (transactionContainer) {
        transactionContainer.innerHTML = '<p class="loading" style="padding: 10px;">Loading transactions...</p>';
    }

    modal.style.display = 'flex';

    try {
        const result = await API.getTransactions(childId);

        if (result.success && result.transactions) {
            let processed = result.transactions;
            try {
                // Get all children to map usernames to names for transfer descriptions
                const childrenRes = await Auth.getChildren();
                if (childrenRes?.success && Array.isArray(childrenRes.children)) {
                    const usernameToName = {};
                    childrenRes.children.forEach(c => {
                        if (c?.username && c?.name) usernameToName[c.username] = c.name;
                    });

                    processed = result.transactions.map(t => {
                        if (t?.type === 'transfer' && typeof t.description === 'string') {
                            const newDesc = replaceUsernamesWithNames(t.description, usernameToName);
                            return { ...t, description: newDesc };
                        }
                        return t;
                    });
                }
            } catch (e) {
                // ignore mapping failures, fall back to original descriptions
            }
            displayTransactions(processed, transactionContainer);
        } else {
            transactionContainer.innerHTML = '<p class="no-data">No transactions found</p>';
        }
    } catch (error) {
        console.error('Error loading transaction history:', error);
        transactionContainer.innerHTML = '<p class="no-data error">Failed to load transaction history</p>';
    }
};


// Copy helper
window.copyToClipboard = async function(text, message = 'Copied!') {
    try {
        await navigator.clipboard.writeText(text);
        showToast(message, '', 'success');
    } catch (e) {
        console.error('Copy failed', e);
        showToast('Copy failed', '', 'error');
    }
};

// Change PIN prompt
window.promptChangePin = async function(childId, username) {
    const newPin = prompt(`Enter a new 4-digit PIN for @${username}`);
    if (!newPin) return;
    if (!/^\d{4}$/.test(newPin)) {
        alert('PIN must be exactly 4 digits');
        return;
    }
    try {
        await API.updateChildPin(childId, newPin);
        alert('PIN updated successfully');
    } catch (e) {
        alert(e.message || 'Failed to update PIN');
    }
};

// Confirm delete
window.confirmDeleteChild = async function(childId, name) {
    const ok = await openConfirm({ title: 'Delete Child', message: `Delete child account for ${name}? This cannot be undone.`, okText: 'Delete', cancelText: 'Cancel' });
    if (!ok) return;
    try {
        await API.deleteChild(childId);
        showToast('Child account deleted', '', 'success');
        const modal = document.getElementById('childSettingsModal');
        if (modal) modal.style.display = 'none';

        // Remove card in place and update totals
        const card = document.querySelector(`.child-card[data-child-id="${childId}"]`);
        let bal = 0;
        if (card) {
            const balEl = card.querySelector('.balance-amount');
            if (balEl) bal = parseFloat((balEl.textContent || '').replace(/[^0-9.-]/g,'')) || 0;
            card.parentElement?.removeChild(card);
        }

        const totalChildrenElement = document.getElementById('totalChildren');
        if (totalChildrenElement) {
            const n = parseInt(totalChildrenElement.textContent || '0', 10) || 0;
            totalChildrenElement.textContent = String(Math.max(0, n - 1));
        }
        const totalBalanceElement = document.getElementById('totalBalance');
        if (totalBalanceElement) {
            const tb = parseFloat(totalBalanceElement.textContent || '0') || 0;
            totalBalanceElement.textContent = Math.max(0, tb - bal).toFixed(2);
        }

        const list = document.getElementById('childrenList');
        if (list && !list.querySelector('.child-card')) {
            list.innerHTML = '<p class="no-data children-empty">No children yet — click the + button on the right to add your first child.</p>';
        }
    } catch (e) {
        showToast('Failed to delete child', e.message || '', 'error');
    }
};
// Add some basic styles for elements not in the original CSS
const style = document.createElement('style');
/**
 * Setup real-time validation for Reset PIN form in settings modal
 */
function setupResetPinValidation() {
    const newPinInput = document.getElementById('newPin');
    const confirmPinInput = document.getElementById('confirmNewPin');
    const newPinHelp = document.getElementById('newPinHelp');
    const confirmPinHelp = document.getElementById('confirmPinHelp');
    const resetForm = document.getElementById('resetPinForm');
    const submitButton = resetForm?.querySelector('button[type="submit"]');

    function updateResetPinSubmitState() {
        if (!submitButton) return;
        const newPinOk = newPinInput?.dataset.valid === 'true';
        const confirmPinOk = confirmPinInput?.dataset.valid === 'true';
        submitButton.disabled = !(newPinOk && confirmPinOk);
    }

    // Real-time validation for new PIN
    if (newPinInput && newPinHelp) {
        newPinInput.addEventListener('input', () => {
            const val = newPinInput.value.trim();
            let ok = /^\d{4}$/.test(val);
            if (ok) {
                const counts = {};
                for (const ch of val) counts[ch] = (counts[ch] || 0) + 1;
                ok = !Object.values(counts).some(c => c > 2);
            }
            newPinInput.style.borderColor = ok ? '#28a745' : '#dc3545';
            newPinInput.dataset.valid = ok ? 'true' : 'false';

            // Update help text
            if (val.length === 0) {
                newPinHelp.textContent = 'Exactly 4 digits, no digit more than twice';
                newPinHelp.style.color = '#6c757d';
            } else if (ok) {
                newPinHelp.textContent = 'PIN looks good';
                newPinHelp.style.color = '#28a745';
            } else {
                newPinHelp.textContent = 'Invalid PIN - check requirements';
                newPinHelp.style.color = '#dc3545';
            }

            updateResetPinSubmitState();

            // Also trigger confirm PIN validation if it has a value
            if (confirmPinInput && confirmPinInput.value) {
                confirmPinInput.dispatchEvent(new Event('input'));
            }
        });
    }

    // Real-time validation for confirm PIN
    if (confirmPinInput && confirmPinHelp) {
        confirmPinInput.addEventListener('input', () => {
            const val = confirmPinInput.value.trim();
            const newPinVal = newPinInput?.value.trim() || '';
            const newPinValid = newPinInput?.dataset.valid === 'true';

            let ok = false;
            if (val.length === 0) {
                confirmPinHelp.textContent = 'Must match the PIN above';
                confirmPinHelp.style.color = '#6c757d';
            } else if (!newPinValid) {
                confirmPinHelp.textContent = 'Please enter a valid PIN above first';
                confirmPinHelp.style.color = '#dc3545';
            } else if (val === newPinVal) {
                ok = true;
                confirmPinHelp.textContent = 'PINs match';
                confirmPinHelp.style.color = '#28a745';
            } else {
                confirmPinHelp.textContent = 'PINs do not match';
                confirmPinHelp.style.color = '#dc3545';
            }

            confirmPinInput.style.borderColor = ok ? '#28a745' : '#dc3545';
            confirmPinInput.dataset.valid = ok ? 'true' : 'false';

            updateResetPinSubmitState();
        });
    }

    // Clear validation state when modal opens
    if (newPinInput) {
        newPinInput.value = '';
        newPinInput.style.borderColor = '';
        newPinInput.dataset.valid = 'false';
    }
    if (confirmPinInput) {
        confirmPinInput.value = '';
        confirmPinInput.style.borderColor = '';
        confirmPinInput.dataset.valid = 'false';
    }
    if (newPinHelp) {
        newPinHelp.textContent = 'Exactly 4 digits, no digit more than twice';
        newPinHelp.style.color = '#6c757d';
    }
    if (confirmPinHelp) {
        confirmPinHelp.textContent = 'Must match the PIN above';
        confirmPinHelp.style.color = '#6c757d';
    }

    updateResetPinSubmitState();
}

/**
 * Load pending requests (withdrawals and transfers) for child dashboard
 */
async function loadChildPendingRequests(options = {}) {
    const container = document.getElementById('childPendingList');
    if (!container) return;

    // Show loading state
    if (!options.soft) { container.innerHTML = '<div class="loading-placeholder">Loading pending requests...</div>'; }

    try {
        const [withdrawals, transfers, moneyAdditions] = await Promise.all([
            API.getWithdrawalRequests(),
            API.getTransferRequests(),
            API.getMoneyAdditionRequests()
        ]);
        const items = [];
        if (withdrawals.success && Array.isArray(withdrawals.requests)) {
            withdrawals.requests
                .filter(r => r.status === 'pending')
                .forEach(r => items.push({
                    type: 'withdrawal',
                    date: r.createdAt,
                    reason: r.reason,
                    amount: r.amount
                }));
        }
        if (transfers.success && Array.isArray(transfers.requests)) {
            const me = Auth.getUser();
            let siblingMap = {};
            try {
                const sibRes = await API.request('/siblings');
                if (sibRes?.success && Array.isArray(sibRes.siblings)) {
                    sibRes.siblings.forEach(s => { siblingMap[String(s.id)] = s.name; });
                }
            } catch (e) { /* ignore */ }
            transfers.requests
                .filter(r => r.status === 'pending')
                .forEach(r => {
                    const isOutgoing = String(r.fromChildId) === String(me.id);
                    const counterpartId = isOutgoing ? r.toChildId : r.fromChildId;
                    const counterpartName = siblingMap[String(counterpartId)] || 'sibling';
                    items.push({
                        type: 'transfer',
                        date: r.createdAt,
                        isOutgoing,
                        counterpartName,
                        reason: r.reason,
                        amount: r.amount
                    });
                });
        }
        if (moneyAdditions.success && Array.isArray(moneyAdditions.requests)) {
            moneyAdditions.requests
                .filter(r => r.status === 'pending')
                .forEach(r => items.push({
                    type: 'money_addition',
                    date: r.createdAt,
                    reason: r.reason,
                    amount: r.amount
                }));
        }

        if (items.length === 0) {
            container.innerHTML = '<p class="no-data">No pending requests</p>';
            return;
        }

        // Render as list consistent with parent approvals
        const html = items.sort((a,b) => new Date(b.date) - new Date(a.date)).map(item => {
            const d = new Date(item.date);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year2 = String(d.getFullYear()).slice(-2);
            const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
            const dateTime = `${day}/${month}/${year2} ${time}`;

            const me = Auth.getUser();
            const meName = (me && (me.name || me.username)) ? (me.name || me.username) : 'me';

            let icon = '🔄';
            let label = '';
            let meta = '';
            if (item.type === 'withdrawal') {
                icon = '💵';
                label = 'Withdrawal Request';
                meta = `From: ${meName}`;
            } else if (item.type === 'transfer') {
                icon = '🔄';
                label = 'Transfer Request';
                const fromTo = item.isOutgoing
                    ? `From: ${meName} → To: ${item.counterpartName}`
                    : `From: ${item.counterpartName} → To: ${meName}`;
                meta = fromTo;
            } else if (item.type === 'money_addition') {
                icon = '💰';
                label = 'Add Money Request';
                meta = `From: ${meName}`;
            }

            const reason = item.reason || '';

            return `
                <div class="transaction-item ${item.type}">
                    <div class="transaction-icon">${icon}</div>
                    <div class="transaction-details">
                        <div class="transaction-description">${label}</div>
                        <div class="transaction-meta">${meta} • ${dateTime}</div>
                        <div class="transaction-reason">Reason: ${reason}</div>
                    </div>
                    <div class="transaction-amount">$${Number(item.amount).toFixed(2)}</div>
                </div>
            `;
        }).join('');
        container.innerHTML = html;
    } catch (err) {
        console.error('Failed to load pending requests', err);
        container.innerHTML = '<p class="no-data error">Failed to load pending requests</p>';
    }
}

/**
 * Replace usernames with names in transfer description strings.
 * Handles patterns like "@username", "to username", "from username", and "(@username)".
 */
function replaceUsernamesWithNames(desc, usernameToName) {
    if (typeof desc !== 'string' || !usernameToName) return desc;
    let out = desc;
    // 1) @username -> Name
    out = out.replace(/@([a-z0-9_]+)/gi, (m, u) => usernameToName[u] || m);
    // 2) to username / from username / (@username)
    try {
        Object.entries(usernameToName).forEach(([u, name]) => {
            const uEsc = u.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
            out = out.replace(new RegExp(`\\bto\\s+@?${uEsc}\\b`, 'gi'), `to ${name}`);
            out = out.replace(new RegExp(`\\bfrom\\s+@?${uEsc}\\b`, 'gi'), `from ${name}`);
            out = out.replace(new RegExp(`\\(@?${uEsc}\\)`, 'gi'), `(${name})`);
            out = out.replace(new RegExp(`\\b@?${uEsc}'s\\b`, 'gi'), `${name}'s`);
            out = out.replace(new RegExp(`\\b@?${uEsc}\\b`, 'gi'), `${name}`);
        });
    } catch (_) { /* noop */ }
    return out;
}

/**
 * Load transaction history for child dashboard
 */
async function loadChildTransactionHistory(options = {}) {

    const transactionList = document.getElementById('childTransactionList');
    if (!transactionList) return;

    // Show loading state
    if (!options.soft) { transactionList.innerHTML = '<div class="loading-placeholder">Loading transaction history...</div>'; }

    try {
        const user = Auth.getUser();
        if (!user || user.role !== 'child') return;

        const result = await API.getTransactions(user.id);

        if (result.success && result.transactions) {
            // Replace @username references in transfer descriptions with child names for clarity
            let processed = result.transactions;
            try {
                const me = Auth.getUser();
                const usernameToName = {};
                if (me?.username && me?.name) usernameToName[me.username] = me.name;
                const sibRes = await API.request('/siblings');
                if (sibRes?.success && Array.isArray(sibRes.siblings)) {
                    sibRes.siblings.forEach(s => {
                        if (s?.username && s?.name) usernameToName[s.username] = s.name;
                    });
                }
                processed = result.transactions.map(t => {
                    if (t?.type === 'transfer' && typeof t.description === 'string') {
                        const newDesc = replaceUsernamesWithNames(t.description, usernameToName);
                        return { ...t, description: newDesc };
                    }
                    return t;
                });
            } catch (e) {
                // ignore mapping failures, fall back to original descriptions
            }
            displayTransactions(processed, transactionList);
        } else {
            transactionList.innerHTML = '<p class="no-data">No transactions yet. Start saving!</p>';
        }
    } catch (error) {
        console.error('Error loading transaction history:', error);
        transactionList.innerHTML = '<p class="no-data error">Failed to load transaction history</p>';
    }
}

/**
 * Display transactions in a list
 */
function displayTransactions(transactions, container) {
    if (!transactions || transactions.length === 0) {
        container.innerHTML = '<p class="no-data">No transactions yet. Start saving!</p>';
        return;
    }

    const transactionHTML = transactions.map(transaction => {
        const dt = new Date(transaction.createdAt);
        const date = dt.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: '2-digit' });
        const time = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const amount = Number(transaction.amount) || 0;
        const inferredDirection = transaction.direction || (
            transaction.type === 'transfer' && typeof transaction.description === 'string' && transaction.description.toLowerCase().includes('transfer from')
                ? 'in'
                : (transaction.type === 'transfer' ? 'out' : undefined)
        );
        const isPositive = (
            transaction.type === 'deposit' ||
            transaction.type === 'account_creation' ||
            (transaction.type === 'transfer' && inferredDirection === 'in')
        );
        const typeIcon = getTransactionIcon(transaction.type, inferredDirection);
        const typeLabel = getTransactionLabel(transaction.type, inferredDirection);

        return `
            <div class="transaction-item ${transaction.type}">
                <div class="transaction-icon">${typeIcon}</div>
                <div class="transaction-details">
                    <div class="transaction-description">${transaction.description}</div>
                    <div class="transaction-meta">
                        <span class="transaction-type">${typeLabel}</span>
                        <span class="transaction-date">${date} at ${time}</span>
                    </div>
                </div>
                <div class="transaction-amount ${isPositive ? 'positive' : 'negative'}">
                    ${isPositive ? '+' : '-'}$${amount.toFixed(2)}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = transactionHTML;
}

/**
 * Get icon for transaction type
 */
function getTransactionIcon(type, direction) {
    switch (type) {
        case 'deposit': return '💰';
        case 'withdrawal': return '💸';
        case 'transfer': return direction === 'in' ? '⬇️' : '⬆️';
        case 'account_creation': return '🎉';
        default: return '📝';
    }
}

/**
 * Get label for transaction type
 */
function getTransactionLabel(type, direction) {
    switch (type) {
        case 'deposit': return 'Deposit';
        case 'withdrawal': return 'Withdrawal';
        case 'transfer': return direction === 'in' ? 'Transfer In' : 'Transfer Out';
        case 'account_creation': return 'Account Creation';
        default: return 'Transaction';
    }
}

// Toggle collapsible sections in child settings modal
window.toggleSection = function(sectionId) {
    const section = document.getElementById(sectionId);
    let arrowId;

    // Map section IDs to their corresponding arrow IDs
    if (sectionId === 'pinResetSection') {
        arrowId = 'pinResetArrow';
    } else if (sectionId === 'deleteSection') {
        arrowId = 'deleteSectionArrow';
    }

    const arrow = document.getElementById(arrowId);

    if (!section || !arrow) return;

    if (section.style.display === 'none' || section.style.display === '') {
        section.style.display = 'block';
        arrow.style.transform = 'rotate(180deg)';
    } else {
        section.style.display = 'none';
        arrow.style.transform = 'rotate(0deg)';
    }
};

// Setup hover effects for section toggles
function setupSectionToggleHovers() {
    const toggles = document.querySelectorAll('.section-toggle');

    toggles.forEach(toggle => {
        toggle.addEventListener('mouseenter', function() {
            this.style.background = '#eff6ff';
            this.style.paddingLeft = '28px';
            const arrow = this.querySelector('.toggle-arrow');
            if (arrow) {
                arrow.style.color = '#2563eb';
                arrow.style.opacity = '1';
                arrow.style.transform = arrow.style.transform + ' scale(1.1)';
            }
        });

        toggle.addEventListener('mouseleave', function() {
            this.style.background = '#f8fafc';
            this.style.paddingLeft = '24px';
            const arrow = this.querySelector('.toggle-arrow');
            if (arrow) {
                arrow.style.color = '#6b7280';
                arrow.style.opacity = '0.7';
                arrow.style.transform = arrow.style.transform.replace(' scale(1.1)', '');
            }
        });
    });
}

// Open settings modal with child details
window.openChildSettings = function(childId, name, username) {
    const modal = document.getElementById('childSettingsModal');
    if (!modal) return;
    document.getElementById('settingsChildId').value = childId;
    document.getElementById('settingsChildName').textContent = name;
    document.getElementById('settingsChildUsername').textContent = username;

    // Reset collapsible sections to closed state
    document.getElementById('pinResetSection').style.display = 'none';
    document.getElementById('deleteSection').style.display = 'none';
    document.getElementById('pinResetArrow').style.transform = 'rotate(0deg)';
    document.getElementById('deleteSectionArrow').style.transform = 'rotate(0deg)';

    modal.style.display = 'flex';

    // Setup hover effects for the toggles
    setupSectionToggleHovers();

    // Setup real-time PIN validation when modal opens
    setupResetPinValidation();
};

// Wire up modal close and forms once on load
(function setupChildSettingsModal(){
    const modal = document.getElementById('childSettingsModal');
    if (!modal) return;
    const closeBtn = document.getElementById('childSettingsClose');
    closeBtn?.addEventListener('click', ()=> modal.style.display='none');
    let downOnBackdrop = false;
    modal.addEventListener('mousedown', (e) => { downOnBackdrop = (e.target === modal); });
    modal.addEventListener('touchstart', (e) => { downOnBackdrop = (e.target === modal); }, { passive: true });
    modal.addEventListener('click', (e) => { if (e.target === modal && downOnBackdrop) modal.style.display='none'; downOnBackdrop = false; });

    // Reset PIN form with double confirm
    const resetForm = document.getElementById('resetPinForm');
    resetForm?.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const childId = document.getElementById('settingsChildId').value;
        const newPin = document.getElementById('newPin').value.trim();
        const confirmPin = document.getElementById('confirmNewPin').value.trim();
        if (!/^\d{4}$/.test(newPin)) { showToast('Invalid PIN', 'PIN must be exactly 4 digits', 'error'); return; }
        // No digit more than twice
        const counts = {}; for (const ch of newPin) counts[ch] = (counts[ch] || 0) + 1;
        if (Object.values(counts).some(c => c > 2)) { showToast('Invalid PIN', 'No digit can appear more than twice', 'error'); return; }
        if (newPin !== confirmPin) { showToast('PINs do not match', '', 'error'); return; }
        const ok = await openConfirm({ title: 'Confirm PIN Reset', message: 'Are you sure you want to reset this PIN?', okText: 'Reset' });
        if (!ok) return;
        const secondOk = await openInputConfirm({ title: 'Type to confirm', message: 'Please type RESET to confirm', requiredValue: 'RESET', okText: 'Confirm' });
        if (!secondOk) { showToast('PIN reset cancelled'); return; }
        try {
            await API.updateChildPin(childId, newPin);
            showToast('PIN has been reset.', '', 'success');
            modal.style.display = 'none';
            resetForm.reset();
        } catch (err) {
            showToast('Failed to reset PIN', err.message || '', 'error');
        }
    });

    // Delete child with double confirm
    const deleteBtn = document.getElementById('deleteChildBtn');
    deleteBtn?.addEventListener('click', async ()=>{
        const childId = document.getElementById('settingsChildId').value;
        const name = document.getElementById('settingsChildName').textContent;
        const ok = await openConfirm({
            title: 'Delete Child',
            message: `Delete ${name}? This cannot be undone.`,
            okText: 'Delete',
            cancelText: 'Cancel',
            okButtonClass: 'btn-danger'
        });
        if (!ok) return;
        const secondOk = await openInputConfirm({
            title: 'Type to confirm',
            message: 'Please type DELETE to confirm',
            requiredValue: 'DELETE',
            okText: 'Delete',
            okButtonClass: 'btn-danger'
        });
        if (!secondOk) { showToast('Deletion cancelled'); return; }
        try {
            await API.deleteChild(childId);
            showToast('Child deleted', '', 'success');
            modal.style.display = 'none';

            // Remove card and update totals in place
            const card = document.querySelector(`.child-card[data-child-id="${childId}"]`);
            let bal = 0;
            if (card) {
                const balEl = card.querySelector('.balance-amount');
                if (balEl) bal = parseFloat((balEl.textContent || '').replace(/[^0-9.-]/g,'')) || 0;
                card.parentElement?.removeChild(card);
            }
            const totalChildrenElement = document.getElementById('totalChildren');
            if (totalChildrenElement) {
                const n = parseInt(totalChildrenElement.textContent || '0', 10) || 0;
                totalChildrenElement.textContent = String(Math.max(0, n - 1));
            }
            const totalBalanceElement = document.getElementById('totalBalance');
            if (totalBalanceElement) {
                const tb = parseFloat(totalBalanceElement.textContent || '0') || 0;
                totalBalanceElement.textContent = Math.max(0, tb - bal).toFixed(2);
            }
            const list = document.getElementById('childrenList');
            if (list && !list.querySelector('.child-card')) {
                list.innerHTML = '<p class="no-data children-empty">No children yet — click the + button on the right to add your first child.</p>';
            }
        } catch (err) {
            showToast('Failed to delete child', err.message || '', 'error');
        }
    });
})();
style.textContent = `
    .child-card.sleek.vertical {
        background: white;
        border-radius: 12px;
        padding: 16px;
        transition: all 0.2s ease;
        display: flex;
        flex-direction: column;
        min-height: 160px;
        position: relative;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(10px);
        cursor: default;
    }
    .child-card.sleek.vertical:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.9);
        backdrop-filter: blur(15px);
    }
    .child-card .card-header {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 4px;
    }
    .child-card .settings-btn {
        background: transparent;
        border: none;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 16px;
        color: var(--neutral-400);
        transition: color 0.2s ease;
    }
    .child-card .settings-btn:hover {
        color: var(--neutral-600);
    }
    .child-card .child-info {
        text-align: center;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 2px;
    }
    .child-card .child-name {
        font-size: 18px;
        font-weight: 600;
        color: var(--neutral-900);
        margin: 0;
    }
    .child-card .username-display {
        color: var(--neutral-500);
        font-size: 13px;
        margin-bottom: 8px;
    }
    .child-card .balance-display {
        margin-bottom: 16px;
        background: transparent !important;
        background-image: none !important;
    }
    .child-card .balance-amount {
        font-size: 20px;
        font-weight: 700;
        color: var(--neutral-800);
        background: transparent !important;
        background-image: none !important;
    }
    .child-card .actions-column {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .child-card .action-btn {
        width: 100%;
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 500;
        border-radius: 6px;
        transition: all 0.2s ease;
        border: 1px solid transparent;
        cursor: pointer;
    }
    .child-card .action-btn.btn-primary {
        background: var(--primary-600);
        color: white;
        border-color: var(--primary-600);
    }
    .child-card .action-btn.btn-primary:hover {
        background: var(--primary-700);
        border-color: var(--primary-700);
    }
    .child-card .action-btn.btn-secondary {
        background: transparent;
        color: var(--neutral-600);
        border-color: var(--neutral-300);
    }
    .child-card .action-btn.btn-secondary:hover {
        background: var(--neutral-50);
        color: var(--neutral-700);
    }
    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
    }
    .add-child-btn {
        background: var(--primary-600);
        color: white;
        border: none;
        border-radius: 50%;
        width: 48px;
        height: 48px;
        font-size: 24px;
        font-weight: 300;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .add-child-btn:hover {
        background: var(--primary-700);
        transform: scale(1.05);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }
    .children-cards {
        margin-top: 16px;
    }
`;

document.head.appendChild(style);

// Add some basic styles for elements not in the original CSS
const style2 = document.createElement('style');
style2.textContent = `
    .no-data {
        text-align: center;
        color: #6c757d;
        padding: 2rem;
    }

    .error {
        color: #dc3545;
        text-align: center;
        padding: 1rem;
    }

    .child-card {
        background: #f8f9fa;
        border-radius: 8px;
        padding: 1.5rem;
        margin-bottom: 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .child-info h3 {
        margin: 0 0 0.5rem 0;
    }

    .child-info .username {
        color: #6c757d;
        font-size: 0.9rem;
        margin: 0 0 0.5rem 0;
    }

    .child-info .balance {
        font-size: 1.1rem;
    }

    .child-info .balance .label {
        color: #6c757d;
        margin-right: 0.5rem;
    }

    .child-info .balance .amount {
        font-weight: bold;
        color: #28a745;
    }

    .child-actions {
        display: flex;
        gap: 0.5rem;
    }

    .btn-small {
        padding: 0.375rem 0.75rem;
        font-size: 0.875rem;
    }

    .modal {
        animation: fadeIn 0.3s;
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
`;
document.head.appendChild(style);

/**
 * Setup parent settings functionality
 */
function setupParentSettings() {
    const settingsBtn = document.getElementById('parentSettingsBtn');
    const settingsModal = document.getElementById('parentSettingsModal');
    const settingsClose = document.getElementById('parentSettingsClose');

    // Safety check - if elements don't exist, return early
    if (!settingsBtn || !settingsModal || !settingsClose) {
        console.warn('[Dashboard] Parent settings elements not found, skipping setup');
        return;
    }

    // Get current user data
    const user = Auth.getUser();
    if (!user) return;

    // Populate user info
    const nameElement = document.getElementById('settingsParentName');
    const emailElement = document.getElementById('settingsParentEmail');

    if (nameElement) nameElement.textContent = user.name || '';
    if (emailElement) emailElement.textContent = user.email || '';

    // Set security question text in forms that require it
    const securityQuestionSpans = [
        'emailSecurityQuestion',
        'passwordSecurityQuestion'
    ];

    // We'll need to fetch the security question from the server
    // For now, we'll set a placeholder
    securityQuestionSpans.forEach(id => {
        const span = document.getElementById(id);
        if (span) span.textContent = 'Loading...';
    });

    // Open settings modal
    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', async () => {
            settingsModal.style.display = 'flex';

            // Reset all sections to closed
            resetSettingsSections();

            // Fetch and display security question
            await loadSecurityQuestion();
        });
    }

    // Close modal
    if (settingsClose) {
        settingsClose.addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });
    }

    // Click outside modal to close (only if press started on backdrop)
    if (settingsModal) {
        let downOnBackdrop = false;
        settingsModal.addEventListener('mousedown', (e) => { downOnBackdrop = (e.target === settingsModal); });
        settingsModal.addEventListener('touchstart', (e) => { downOnBackdrop = (e.target === settingsModal); }, { passive: true });
        settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal && downOnBackdrop) settingsModal.style.display = 'none'; downOnBackdrop = false; });
    }

    // Setup section toggles
    setupSectionToggles();

    // Setup form handlers
    setupSettingsForms();
}

/**
 * Reset all settings sections to closed state
 */
function resetSettingsSections() {
    const sections = [
        { content: 'changeEmailSection', arrow: 'changeEmailArrow' },
        { content: 'changePasswordSection', arrow: 'changePasswordArrow' },
        { content: 'deleteAccountSection', arrow: 'deleteAccountArrow' }
    ];

    sections.forEach(section => {
        const content = document.getElementById(section.content);
        const arrow = document.getElementById(section.arrow);

        if (content) content.style.display = 'none';
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    });
}

/**
 * Load security question from server
 */
async function loadSecurityQuestion() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/parent/security-question`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${Auth.getToken()}`
            }
        });

        const result = await response.json();

        if (result.success) {
            const securityQuestionSpans = [
                'emailSecurityQuestion',
                'passwordSecurityQuestion'
            ];

            securityQuestionSpans.forEach(id => {
                const span = document.getElementById(id);
                if (span) span.textContent = result.securityQuestion;
            });
        } else {
            console.error('Failed to load security question:', result.error);

            // If user doesn't have security question, disable the forms and show message
            const securityQuestionSpans = [
                'emailSecurityQuestion',
                'passwordSecurityQuestion'
            ];

            securityQuestionSpans.forEach(id => {
                const span = document.getElementById(id);
                if (span) span.textContent = 'Security question not set up';
            });

            // Disable the forms (only email and password forms require security question)
            const forms = ['changeEmailForm', 'changePasswordForm'];
            forms.forEach(formId => {
                const form = document.getElementById(formId);
                if (form) {
                    const inputs = form.querySelectorAll('input, button');
                    inputs.forEach(input => input.disabled = true);

                    // Show error message
                    let errorType = '';
                    if (formId === 'changeEmailForm') errorType = 'changeEmail';
                    else if (formId === 'changePasswordForm') errorType = 'changePassword';

                    if (errorType) {
                        showSettingsError(errorType, 'Security question setup required. Please contact support.');
                    }
                }
            });
        }
    } catch (error) {
        console.error('Failed to load security question:', error);
    }
}

/**
 * Setup section toggle functionality
 */
function setupSectionToggles() {
    const toggles = [
        { toggle: 'changeEmailToggle', content: 'changeEmailSection', arrow: 'changeEmailArrow' },
        { toggle: 'changePasswordToggle', content: 'changePasswordSection', arrow: 'changePasswordArrow' },
        { toggle: 'deleteAccountToggle', content: 'deleteAccountSection', arrow: 'deleteAccountArrow' }
    ];

    toggles.forEach(item => {
        const toggle = document.getElementById(item.toggle);
        const content = document.getElementById(item.content);
        const arrow = document.getElementById(item.arrow);

        if (toggle && content && arrow) {
            toggle.addEventListener('click', () => {
                const isOpen = content.style.display === 'block';

                // Close all sections first
                resetSettingsSections();

                // Open this section if it was closed
                if (!isOpen) {
                    content.style.display = 'block';
                    arrow.style.transform = 'rotate(90deg)';
                }
            });
        }
    });
}

/**
 * Setup settings form handlers
 */
function setupSettingsForms() {
    // Change Email Form
    const changeEmailForm = document.getElementById('changeEmailForm');
    if (changeEmailForm) {
        changeEmailForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleChangeEmail(e);
        });
    }

    // Change Password Form
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleChangePassword(e);
        });
    }

    // Delete Account Form
    const deleteAccountForm = document.getElementById('deleteAccountForm');
    if (deleteAccountForm) {
        deleteAccountForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleDeleteAccount(e);
        });
    }
}

/**
 * Handle change email form submission
 */
async function handleChangeEmail(e) {
    const formData = new FormData(e.target);
    const newEmail = formData.get('newEmail').trim().toLowerCase();
    const securityAnswer = formData.get('emailSecurityAnswer').trim();

    // Clear previous messages
    clearSettingsMessages('changeEmail');

    if (!newEmail || !securityAnswer) {
        showSettingsError('changeEmail', 'All fields are required');
        return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
        showSettingsError('changeEmail', 'Invalid email format');
        return;
    }

    try {
        setSettingsLoading('changeEmail', true);

        const response = await fetch(`${CONFIG.API_BASE_URL}/parent/email`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Auth.getToken()}`
            },
            body: JSON.stringify({ newEmail, securityAnswer })
        });

        const result = await response.json();

        if (result.success) {
            showSettingsSuccess('changeEmail', 'Email updated successfully! Please log in again with your new email.');

            // Update displayed email
            document.getElementById('settingsParentEmail').textContent = newEmail;

            // Clear form
            e.target.reset();

            // Logout after 3 seconds
            setTimeout(() => {
                Auth.logout();
            }, 3000);
        } else {
            showSettingsError('changeEmail', result.error || 'Failed to update email');
        }
    } catch (error) {
        console.error('Change email error:', error);
        showSettingsError('changeEmail', 'An unexpected error occurred');
    } finally {
        setSettingsLoading('changeEmail', false);
    }
}

/**
 * Handle change password form submission
 */
async function handleChangePassword(e) {
    const formData = new FormData(e.target);
    const newPassword = formData.get('newPassword');
    const confirmPassword = formData.get('confirmNewPassword');
    const securityAnswer = formData.get('passwordSecurityAnswer').trim();

    // Clear previous messages
    clearSettingsMessages('changePassword');

    if (!newPassword || !confirmPassword || !securityAnswer) {
        showSettingsError('changePassword', 'All fields are required');
        return;
    }

    if (newPassword.length < 6) {
        showSettingsError('changePassword', 'Password must be at least 6 characters long');
        return;
    }

    if (newPassword !== confirmPassword) {
        showSettingsError('changePassword', 'Passwords do not match');
        return;
    }

    try {
        setSettingsLoading('changePassword', true);

        const response = await fetch(`${CONFIG.API_BASE_URL}/parent/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Auth.getToken()}`
            },
            body: JSON.stringify({ newPassword, securityAnswer })
        });

        const result = await response.json();

        if (result.success) {
            showSettingsSuccess('changePassword', 'Password updated successfully!');

            // Clear form
            e.target.reset();
        } else {
            showSettingsError('changePassword', result.error || 'Failed to update password');
        }
    } catch (error) {
        console.error('Change password error:', error);
        showSettingsError('changePassword', 'An unexpected error occurred');
    } finally {
        setSettingsLoading('changePassword', false);
    }
}

/**
 * Handle delete account form submission
 */
async function handleDeleteAccount(e) {
    // Clear previous messages
    clearSettingsMessages('deleteAccount');

    // Close the settings modal before showing confirmation dialogs
    const settingsModal = document.getElementById('parentSettingsModal');
    if (settingsModal) {
        settingsModal.style.display = 'none';
    }

    // Double confirmation
    const firstConfirm = await openConfirm({
        title: 'Delete Account',
        message: 'Are you sure you want to delete your account? This action cannot be undone and will permanently delete all your data and your children\'s accounts.',
        okText: 'Yes, Delete'
    });

    if (!firstConfirm) return;

    const secondConfirm = await openInputConfirm({
        title: 'Type to confirm',
        message: 'Please type DELETE to confirm account deletion',
        requiredValue: 'DELETE',
        okText: 'Delete Account'
    });

    if (!secondConfirm) {
        showSettingsError('deleteAccount', 'Account deletion cancelled');
        return;
    }

    try {
        setSettingsLoading('deleteAccount', true);

        const response = await fetch(`${CONFIG.API_BASE_URL}/parent/account`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Auth.getToken()}`
            }
        });

        const result = await response.json();

        if (result.success) {
            showToast('Account Deleted', 'Your account has been permanently deleted', 'success');

            // Redirect to home page after 2 seconds
            setTimeout(() => {
                Auth.logout();
            }, 2000);
        } else {
            showSettingsError('deleteAccount', result.error || 'Failed to delete account');
        }
    } catch (error) {
        console.error('Delete account error:', error);
        showSettingsError('deleteAccount', 'An unexpected error occurred');
    } finally {
        setSettingsLoading('deleteAccount', false);
    }
}

/**
 * Helper functions for settings forms
 */
function clearSettingsMessages(formType) {
    const errorElement = document.getElementById(`${formType}Error`);
    const successElement = document.getElementById(`${formType}Success`);

    if (errorElement) {
        errorElement.textContent = '';
        errorElement.style.display = 'none';
    }
    if (successElement) {
        successElement.textContent = '';
        successElement.style.display = 'none';
    }
}

function showSettingsError(formType, message) {
    const errorElement = document.getElementById(`${formType}Error`);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

function showSettingsSuccess(formType, message) {
    const successElement = document.getElementById(`${formType}Success`);
    if (successElement) {
        successElement.textContent = message;
        successElement.style.display = 'block';
    }
}

function setSettingsLoading(formType, loading) {
    const form = document.getElementById(`${formType}Form`);
    const submitButton = form?.querySelector('button[type="submit"]');

    if (submitButton) {
        submitButton.disabled = loading;

        const originalText = {
            'changeEmail': 'Update Email',
            'changePassword': 'Update Password',
            'deleteAccount': 'Delete Account'
        };

        const loadingText = {
            'changeEmail': 'Updating...',
            'changePassword': 'Updating...',
            'deleteAccount': 'Deleting...'
        };

        submitButton.textContent = loading ? loadingText[formType] : originalText[formType];
    }
}

// Realtime updates for Child dashboard: balance, pending requests, and transaction history
function startChildRealtimeUpdates() {
    try {
        const me = Auth.getUser();
        if (!me || me.role !== 'child') return;

        // Avoid multiple initializations
        if (window.__childRealtime && window.__childRealtime.active) return;

        window.__childRealtime = {
            active: true,
            inflight: false,
            timer: null,
            visibleMs: 5000,   // poll every 5s when tab is visible
            hiddenMs: 15000    // poll every 15s when tab is hidden
        };

        const schedule = () => {
            if (!window.__childRealtime || !window.__childRealtime.active) return;
            if (window.__childRealtime.timer) clearTimeout(window.__childRealtime.timer);
            const delay = document.visibilityState === 'visible'
                ? window.__childRealtime.visibleMs
                : window.__childRealtime.hiddenMs;

            window.__childRealtime.timer = setTimeout(async () => {
                await tick();
                schedule();
            }, delay);
        };

        const tick = async () => {
            if (!window.__childRealtime || !window.__childRealtime.active) return;
            if (window.__childRealtime.inflight) return; // skip overlapping ticks
            window.__childRealtime.inflight = true;

            try {
                // 1) Refresh minimal user state (balance, etc.) via /verify
                //    This keeps Auth.getUser() in sync and updates the header balance.
                try {
                    const verifyRes = await Auth.request('/verify');
                    if (verifyRes && verifyRes.success && verifyRes.user) {
                        // Update local cached user
                        localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(verifyRes.user));

                        // Update balance display if present
                        const balEl = document.getElementById('childBalance');
                        if (balEl) {
                            const newBal = Number(verifyRes.user.savings || 0);
                            const currentText = balEl.textContent || '';
                            const current = parseFloat(currentText.replace(/[^0-9.-]/g, '')) || 0;
                            if (Math.abs(newBal - current) > 0.0001) {
                                balEl.textContent = newBal.toFixed(2);
                            }
                        }
                    }
                } catch (e) {
                    // If auth expired, stop polling quietly
                    if (String(e && e.message || '').toLowerCase().includes('unauthorized') ||
                        String(e && e.message || '').includes('401')) {
                        stopChildRealtimeUpdates();
                        return;
                    }
                }

                // 2) Soft refresh pending requests section (no loaders to prevent flicker)
                try {
                    await loadChildPendingRequests({ soft: true });
                } catch (_) {}

                // 3) Soft refresh transaction history (no loaders)
                try {
                    await loadChildTransactionHistory({ soft: true });
                } catch (_) {}

            } finally {
                if (window.__childRealtime) window.__childRealtime.inflight = false;
            }
        };

        // Re-schedule on tab visibility changes to switch polling cadence
        document.addEventListener('visibilitychange', () => {
            if (!window.__childRealtime || !window.__childRealtime.active) return;
            if (window.__childRealtime.timer) clearTimeout(window.__childRealtime.timer);
            schedule();
        });

        // Initial immediate refresh, then schedule subsequent polls
        (async () => {
            await (async () => {
                try {
                    const verifyRes = await Auth.request('/verify');
                    if (verifyRes && verifyRes.success && verifyRes.user) {
                        localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(verifyRes.user));
                        const balEl = document.getElementById('childBalance');
                        if (balEl) {
                            const newBal = Number(verifyRes.user.savings || 0);
                            balEl.textContent = newBal.toFixed(2);
                        }
                    }
                } catch (_) {}
                try { await loadChildPendingRequests({ soft: true }); } catch (_) {}
                try { await loadChildTransactionHistory({ soft: true }); } catch (_) {}
            })();
            schedule();
        })();
    } catch (e) {
        // On any unexpected error, disable realtime to avoid tight loops
        stopChildRealtimeUpdates();
        console.warn('[Dashboard] Realtime updates initialization failed:', e && e.message);
    }
}

function stopChildRealtimeUpdates() {
    if (!window.__childRealtime) return;
    window.__childRealtime.active = false;
    if (window.__childRealtime.timer) {
        clearTimeout(window.__childRealtime.timer);
        window.__childRealtime.timer = null;
    }
}

// Realtime updates for Parent dashboard: pending approvals auto-refresh without reload
function startParentRealtimeUpdates() {
    try {
        const me = Auth.getUser();
        if (!me || me.role !== 'parent') return;

        // Avoid multiple initializations
        if (window.__parentRealtime && window.__parentRealtime.active) return;

        window.__parentRealtime = {
            active: true,
            inflight: false,
            timer: null,
            visibleMs: 5000,   // poll every 5s when tab is visible
            hiddenMs: 15000    // poll every 15s when tab is hidden
        };

        const schedule = () => {
            if (!window.__parentRealtime || !window.__parentRealtime.active) return;
            if (window.__parentRealtime.timer) clearTimeout(window.__parentRealtime.timer);
            const delay = document.visibilityState === 'visible'
                ? window.__parentRealtime.visibleMs
                : window.__parentRealtime.hiddenMs;

            window.__parentRealtime.timer = setTimeout(async () => {
                await tick();
                schedule();
            }, delay);
        };

        const tick = async () => {
            if (!window.__parentRealtime || !window.__parentRealtime.active) return;
            if (window.__parentRealtime.inflight) return; // skip overlapping ticks
            window.__parentRealtime.inflight = true;

            try {
                // Soft refresh approvals so new child requests appear automatically
                try { await loadPendingApprovals({ soft: true }); } catch (_) {}
            } finally {
                if (window.__parentRealtime) window.__parentRealtime.inflight = false;
            }
        };

        document.addEventListener('visibilitychange', () => {
            if (!window.__parentRealtime || !window.__parentRealtime.active) return;
            if (window.__parentRealtime.timer) clearTimeout(window.__parentRealtime.timer);
            schedule();
        });

        // Initial immediate refresh, then schedule subsequent polls
        (async () => {
            try { await loadPendingApprovals({ soft: true }); } catch (_) {}
            schedule();
        })();
    } catch (e) {
        stopParentRealtimeUpdates();
        console.warn('[Dashboard] Parent realtime updates initialization failed:', e && e.message);
    }
}

function stopParentRealtimeUpdates() {
    if (!window.__parentRealtime) return;
    window.__parentRealtime.active = false;
    if (window.__parentRealtime.timer) {
        clearTimeout(window.__parentRealtime.timer);
        window.__parentRealtime.timer = null;
    }

}
