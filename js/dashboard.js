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

            if (confirm('Are you sure you want to logout?')) {
                try {
                    await Auth.logout();
                } catch (error) {
                    console.error('Logout error:', error);
                    Auth.clearAuthData();
                    window.location.href = CONFIG.ROUTES.HOME;
                }
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

    // Load children
    await loadChildrenList();

    // Setup modals
    setupParentModals();
}

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

    // Load transaction history (empty for now)
    const transactionList = document.getElementById('childTransactionList');
    if (transactionList) {
        transactionList.innerHTML = '<p class="no-data">No transactions yet. Start saving!</p>';
    }
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
            alert('Username must be at least 4 characters');
            return;
        }

        // Validate PIN
        if (!/^[0-9]{4}$/.test(pin)) {
            alert('PIN must be exactly 4 digits');
            return;
        }
        // No digit more than twice
        const counts = {};
        for (const ch of pin) counts[ch] = (counts[ch] || 0) + 1;
        if (Object.values(counts).some(c => c > 2)) {
            alert('PIN cannot contain any digit more than twice');
            return;
        }

        // Validate initial balance
        if (initialBalance < 0) {
            alert('Initial balance cannot be negative');
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
                alert(`Child account created successfully!\nUsername: ${username}\nPIN: ${pin}\nInitial Balance: $${initialBalance.toFixed(2)}\n\nPlease save these credentials.`);
                form.reset();
                await loadChildrenList();
            } else {
                alert(result.error || 'Failed to create child account');
            }
        } catch (error) {
            console.error('Error creating child:', error);
            alert('An error occurred while creating the child account');
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
                childrenList.innerHTML = '<p class="no-data">No children added yet. Add your first child above!</p>';
            } else {
                childrenList.innerHTML = result.children.map(child => `
                    <div class="child-card sleek vertical">
                        <div class="card-header">
                            <button class="settings-btn" onclick="openChildSettings('${child.id}','${child.name}','${child.username}')">⚙️</button>
                        </div>
                        <div class="child-info">
                            <h3 class="child-name" title="Name">${child.name}</h3>
                            <div class="username-display" title="Username">@${child.username}</div>
                            <div class="balance-display" title="Account Balance">
                                <div class="balance-amount">$${(child.savings || 0).toFixed(2)}</div>
                            </div>
                        </div>
                        <div class="actions-column">
                            <button class="btn btn-primary action-btn" onclick="addMoney('${child.id}', '${child.name}')">Add Money</button>
                            <button class="btn btn-secondary action-btn" onclick="viewHistory('${child.id}')">History</button>
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

            // For now, just show a message (backend implementation needed)
            alert(`Money added!\nAmount: $${amount.toFixed(2)}\nDescription: ${description}\n\nNote: Backend integration pending`);

            addMoneyModal.style.display = 'none';
            addMoneyForm.reset();
        });
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
}

/**
 * Setup child action buttons
 */
function setupChildActions() {
    const requestBtn = document.getElementById('requestWithdrawalBtn');
    const transferBtn = document.getElementById('transferMoneyBtn');
    const withdrawalModal = document.getElementById('withdrawalModal');
    const transferModal = document.getElementById('transferModal');
    const withdrawalForm = document.getElementById('withdrawalForm');
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
            withdrawalModal.style.display = 'block';
        });
    }

    // Transfer money button
    if (transferBtn && transferModal) {
        transferBtn.addEventListener('click', () => {
            transferModal.style.display = 'block';
        });
    }

    // Withdrawal form submission
    if (withdrawalForm) {
        withdrawalForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const amount = document.getElementById('withdrawAmount').value;
            const reason = document.getElementById('withdrawReason').value;

            alert(`Withdrawal request sent!\nAmount: $${amount}\nReason: ${reason}\n\nYour parent will review this request.`);
            withdrawalModal.style.display = 'none';
            withdrawalForm.reset();
        });
    }

    // Transfer form submission
    if (transferForm) {
        transferForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const sibling = document.getElementById('siblingSelect').value;
            const amount = document.getElementById('transferAmount').value;
            const reason = document.getElementById('transferReason').value;

            alert(`Transfer request sent!\nAmount: $${amount}\nReason: ${reason}\n\nYour parent will review this request.`);
            transferModal.style.display = 'none';
            transferForm.reset();
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

window.viewHistory = function(childId) {
    alert('Transaction history feature coming soon!');
};


// Copy helper
window.copyToClipboard = async function(text, message = 'Copied!') {
    try {
        await navigator.clipboard.writeText(text);
        alert(message);
    } catch (e) {
        console.error('Copy failed', e);
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
    if (!confirm(`Delete child account for ${name}? This cannot be undone.`)) return;
    try {
        await API.deleteChild(childId);
        alert('Child account deleted');
        await loadChildrenList();
    } catch (e) {
        alert(e.message || 'Failed to delete child');
    }
};
// Add some basic styles for elements not in the original CSS
const style = document.createElement('style');
// Open settings modal with child details
window.openChildSettings = function(childId, name, username) {
    const modal = document.getElementById('childSettingsModal');
    if (!modal) return;
    document.getElementById('settingsChildId').value = childId;
    document.getElementById('settingsChildName').textContent = name;
    document.getElementById('settingsChildUsername').textContent = `@${username}`;
    modal.style.display = 'flex';

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
        if (!/^\d{4}$/.test(newPin)) { alert('PIN must be exactly 4 digits'); return; }
        // No digit more than twice
        const counts = {}; for (const ch of newPin) counts[ch] = (counts[ch] || 0) + 1;
        if (Object.values(counts).some(c => c > 2)) { alert('PIN cannot contain any digit more than twice'); return; }
        if (newPin !== confirmPin) { alert('PINs do not match'); return; }
        if (!confirm('Are you sure you want to reset this PIN?')) return;
        const second = prompt('Type RESET to confirm');
        if (second !== 'RESET') { alert('PIN reset cancelled'); return; }
        try {
            await API.updateChildPin(childId, newPin);
            alert('PIN has been reset.');
            modal.style.display = 'none';
            resetForm.reset();
        } catch (err) {
            alert(err.message || 'Failed to reset PIN');
        }
    });

    // Delete child with double confirm
    const deleteBtn = document.getElementById('deleteChildBtn');
    deleteBtn?.addEventListener('click', async ()=>{
        const childId = document.getElementById('settingsChildId').value;
        const name = document.getElementById('settingsChildName').textContent;
        if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
        const second = prompt('Type DELETE to confirm');
        if (second !== 'DELETE') { alert('Deletion cancelled'); return; }
        try {
            await API.deleteChild(childId);
            alert('Child deleted');
            modal.style.display = 'none';
            await loadChildrenList();
        } catch (err) {
            alert(err.message || 'Failed to delete child');
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