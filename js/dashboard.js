// Dashboard page functionality
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Dashboard] Initializing dashboard');

    // Get user data - Auth module already verified token on page load
    const user = Auth.getUser();

    if (!user) {
        console.log('[Dashboard] No user data found, redirecting to login');
        window.location.href = CONFIG.ROUTES.LOGIN;
        return;
    }

    // Skip redundant token verification - auth.js already did this
    // The auth module's automatic verification runs before DOMContentLoaded
    console.log('[Dashboard] User authenticated:', user.username || user.email);

    // Display user information
    displayUserInfo(user);

    // Setup logout functionality
    setupLogout();

    // Hide loading state
    const loadingState = document.getElementById('loadingState');
    if (loadingState) {
        loadingState.style.display = 'none';
    }

    // Ensure UX helpers (toasts, confirms) are available for all roles
    setupUXHelpers();

    // Load content based on user role
    if (user.role === 'parent') {
        loadParentDashboard();
    } else if (user.role === 'child') {
        loadChildDashboard();
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

    if (parentDashboard) {
        parentDashboard.style.display = 'block';
    }
    if (childDashboard) {
        childDashboard.style.display = 'none';
    }

    // Setup add child form
    setupAddChildForm();

    // Load children and pending approvals
    await loadChildrenList();
    await loadPendingApprovals();

    // Setup modals
    setupParentModals();

    // Setup toasts and confirm modal
    setupUXHelpers();
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

            const cleanup = () => {
                btnOk.onclick = null;
                btnCancel.onclick = null;
                confirmModal.style.display = 'none';
            };
            btnOk.onclick = () => { cleanup(); resolve(true); };
            btnCancel.onclick = () => { cleanup(); resolve(false); };
            confirmModal.onclick = (e) => { if (e.target === confirmModal) { cleanup(); resolve(false); } };
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

        const cleanup = () => {
            inputEl.oninput = null;
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            modal.onclick = null;
            modal.style.display = 'none';
        };
        inputEl.oninput = () => {
            if (!requiredValue) { okBtn.disabled = inputEl.value.trim().length === 0; return; }
            okBtn.disabled = inputEl.value.trim() !== requiredValue;
        };
        okBtn.onclick = () => { const ok = !requiredValue || inputEl.value.trim() === requiredValue; cleanup(); resolve(ok); };
        cancelBtn.onclick = () => { cleanup(); resolve(false); };
        modal.onclick = (e) => { if (e.target === modal) { cleanup(); resolve(false); } };
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

        const cleanup = () => {
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            modal.onclick = null;
            modal.style.display = 'none';
        };
        okBtn.onclick = () => { const val = inputEl.value.trim(); cleanup(); resolve({ value: val, cancelled: false }); };
        cancelBtn.onclick = () => { cleanup(); resolve({ value: '', cancelled: true }); };
        modal.onclick = (e) => { if (e.target === modal) { cleanup(); resolve({ value: '', cancelled: true }); } };
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
    if (childDashboard) {
        childDashboard.style.display = 'block';
    }

    // Display child's actual balance from user data
    const balanceElement = document.getElementById('childBalance');
    if (balanceElement) {
        const user = Auth.getUser();
        const balance = (user && typeof user.savings === 'number') ? user.savings : 0;
        balanceElement.textContent = balance.toFixed(2);
    }

    // Setup child actions
    setupChildActions();

    // Load pending requests then transaction history
    await loadChildPendingRequests();
    await loadChildTransactionHistory();
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
                await loadChildrenList();
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
async function loadPendingApprovals() {
    const approvalsContainer = document.getElementById('approvalsList');
    const pendingCount = document.getElementById('pendingRequests');
    if (!approvalsContainer) return;

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
                    id: r._id || r.id,
                    childId: r.childId,
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
                    id: r._id || r.id,
                    fromChildId: r.fromChildId,
                    toChildId: r.toChildId,
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
                    id: r._id || r.id,
                    childId: r.childId,
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
                const date = new Date(item.date).toLocaleDateString();
                const time = new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                let label, desc, meta, approveAction, rejectAction;

                if (item.kind === 'withdrawal') {
                    label = 'Withdrawal';
                    desc = item.reason;
                    const child = childMap[String(item.childId)] || {};
                    meta = `Child: ${child.name || item.childId}`;
                    approveAction = `approveWithdrawal('${item.id}')`;
                    rejectAction = `rejectWithdrawalPrompt('${item.id}')`;
                } else if (item.kind === 'transfer') {
                    label = 'Transfer';
                    desc = `Transfer: ${item.reason}`;
                    const from = childMap[String(item.fromChildId)] || {};
                    const to = childMap[String(item.toChildId)] || {};
                    meta = `From: ${from.name || item.fromChildId} → To: ${to.name || item.toChildId}`;
                    approveAction = `approveTransfer('${item.id}')`;
                    rejectAction = `rejectTransferPrompt('${item.id}')`;
                } else if (item.kind === 'money_addition') {
                    label = 'Money Request';
                    desc = item.reason;
                    const child = childMap[String(item.childId)] || {};
                    meta = `Child: ${child.name || item.childId}`;
                    approveAction = `approveMoneyAddition('${item.id}')`;
                    rejectAction = `rejectMoneyAdditionPrompt('${item.id}')`;
                }
                return `
                    <div class="approval-item">
                        <div class="approval-details">
                            <div class="approval-title">${label} - $${Number(item.amount).toFixed(2)}</div>
                            <div class="approval-desc">${desc}</div>
                            <div class="approval-meta">${meta} • ${date} ${time}</div>
                        </div>
                        <div class="approval-actions">
                            <button class="btn btn-secondary" onclick="${rejectAction}">Reject</button>
                            <button class="btn btn-primary" onclick="${approveAction}">Approve</button>
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
        const res = await API.approveWithdrawalRequest(id);
        if (res.success) {
            showToast('Withdrawal approved', '', 'success');
            await Promise.all([loadPendingApprovals(), loadChildrenList()]);
        } else {
            showToast('Failed to approve', res.error || '', 'error');
        }
    } catch (e) {
        console.error('Approve withdrawal failed', e);
        showToast('Failed to approve', '', 'error');
    }
};
window.rejectWithdrawalPrompt = async function(id) {
    try {
        const promptRes = await openTextPrompt({ title: 'Reject Withdrawal', message: 'Add a reason (optional):', placeholder: 'Reason (optional)', okText: 'Reject', cancelText: 'Cancel' });
        if (!promptRes || promptRes.cancelled) return;
        const res = await API.rejectWithdrawalRequest(id, promptRes.value || '');
        if (res.success) {
            showToast('Withdrawal rejected');
            await loadPendingApprovals();
        } else {
            showToast('Failed to reject', res.error || '', 'error');
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
        const res = await API.approveTransferRequest(id);
        if (res.success) {
            showToast('Transfer approved', '', 'success');
            await Promise.all([loadPendingApprovals(), loadChildrenList()]);
        } else {
            showToast('Failed to approve', res.error || '', 'error');
        }
    } catch (e) {
        console.error('Approve transfer failed', e);
        showToast('Failed to approve', '', 'error');
    }
};
window.rejectTransferPrompt = async function(id) {
    try {
        const promptRes = await openTextPrompt({ title: 'Reject Transfer', message: 'Add an optional reason (or leave blank):', placeholder: 'Reason (optional)', okText: 'Continue', cancelText: 'Cancel' });
        const ok = await openConfirm({ title: 'Reject Transfer', message: 'Reject this transfer request?', okText: 'Reject' });
        if (!ok) return;
        const res = await API.rejectTransferRequest(id, promptRes?.value || '');
        if (res.success) {
            showToast('Transfer rejected');
            await loadPendingApprovals();
        } else {
            showToast('Failed to reject', res.error || '', 'error');
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
        const res = await API.approveMoneyAdditionRequest(id);
        if (res.success) {
            showToast('Money request approved', '', 'success');
            await Promise.all([loadPendingApprovals(), loadChildrenList()]);
        } else {
            showToast('Failed to approve', res.error || '', 'error');
        }
    } catch (e) {
        console.error('Approve money addition failed', e);
        showToast('Failed to approve', '', 'error');
    }
};
window.rejectMoneyAdditionPrompt = async function(id) {
    try {
        const promptRes = await openTextPrompt({ title: 'Reject Money Request', message: 'Add an optional reason (or leave blank):', placeholder: 'Reason (optional)', okText: 'Continue', cancelText: 'Cancel' });
        const ok = await openConfirm({ title: 'Reject Money Request', message: 'Reject this money addition request?', okText: 'Reject' });
        if (!ok) return;
        const res = await API.rejectMoneyAdditionRequest(id, promptRes?.value || '');
        if (res.success) {
            showToast('Money request rejected');
            await loadPendingApprovals();
        } else {
            showToast('Failed to reject', res.error || '', 'error');
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
                    <div class="child-card sleek vertical">
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
        childrenList.innerHTML = '<p class="error">Error loading children</p>';
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

    // Click outside modal to close
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

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

                    // Refresh children list to show updated balance
                    await loadChildrenList();
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
                    await loadChildrenList();
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

        // Close modal when clicking outside (already handled above, but being explicit)
        addChildModal.addEventListener('click', (e) => {
            if (e.target === addChildModal) {
                addChildModal.style.display = 'none';
            }
        });
    }

    // Setup Transaction History Modal
    const transactionHistoryModal = document.getElementById('transactionHistoryModal');
    const transactionHistoryClose = document.getElementById('transactionHistoryClose');

    if (transactionHistoryModal && transactionHistoryClose) {
        // Close modal when X is clicked
        transactionHistoryClose.addEventListener('click', () => {
            transactionHistoryModal.style.display = 'none';
        });

        // Close modal when clicking outside
        transactionHistoryModal.addEventListener('click', (e) => {
            if (e.target === transactionHistoryModal) {
                transactionHistoryModal.style.display = 'none';
            }
        });
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
        transferBtn.addEventListener('click', async () => {
            // Populate siblings before showing modal
            try {
                const select = document.getElementById('siblingSelect');
                if (select) {
                    select.innerHTML = '<option value="">Select a sibling</option>';
                    const res = await API.request('/siblings');
                    if (res.success && Array.isArray(res.siblings)) {
                        res.siblings.forEach(sib => {
                            const opt = document.createElement('option');
                            opt.value = sib.id;
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
        modalTitle.textContent = `Transaction History - ${childName}`;
    }

    if (transactionContainer) {
        transactionContainer.innerHTML = '<p class="loading">Loading transactions...</p>';
    }

    modal.style.display = 'flex';

    try {
        const result = await API.getTransactions(childId);

        if (result.success && result.transactions) {
            let processed = result.transactions;
            try {
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
        await loadChildrenList();
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
async function loadChildPendingRequests() {
    const container = document.getElementById('childPendingList');
    if (!container) return;
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
                    description: r.reason,
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
                        description: `${isOutgoing ? 'To' : 'From'} ${counterpartName}: ${r.reason}`,
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
                    description: `Money request: ${r.reason}`,
                    amount: r.amount
                }));
        }

        if (items.length === 0) {
            container.innerHTML = '<p class="no-data">No pending requests</p>';
            return;
        }

        // Render as list similar to transactions
        const html = items.sort((a,b) => new Date(b.date) - new Date(a.date)).map(item => {
            const dt = new Date(item.date);
            const date = dt.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: '2-digit' });
            const time = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const icon = item.type === 'withdrawal' ? '💵' : '🔄';
            const label = item.type === 'withdrawal' ? 'Withdrawal (Pending)' : 'Transfer (Pending)';
            return `
                <div class="transaction-item ${item.type}">
                    <div class="transaction-icon">${icon}</div>
                    <div class="transaction-details">
                        <div class="transaction-description">${item.description}</div>
                        <div class="transaction-meta">
                            <span class="transaction-type">${label}</span>
                            <span class="transaction-date">${date} at ${time}</span>
                        </div>
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
 * Load transaction history for child dashboard
 */
async function loadChildTransactionHistory() {

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

    const transactionList = document.getElementById('childTransactionList');
    if (!transactionList) return;

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
    window.addEventListener('click', (e)=>{ if (e.target === modal) modal.style.display='none'; });

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
            await loadChildrenList();
        } catch (err) {
            showToast('Failed to delete child', err.message || '', 'error');
        }
    });
})();
style.textContent = `
    .child-card.sleek.vertical {
        background: white;
        border: 2px solid var(--neutral-500);
        border-radius: 12px;
        padding: 16px;
        transition: all 0.2s ease;
        display: flex;
        flex-direction: column;
        min-height: 160px;
        position: relative;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        backdrop-filter: blur(10px);
        cursor: default;
    }
    .child-card.sleek.vertical:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(15px);
        border-color: var(--neutral-600);
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