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

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('childName').value.trim();
        const username = document.getElementById('childUsername').value.trim().toLowerCase();
        const pin = document.getElementById('childPinSetup').value.trim();
        const initialBalance = parseFloat(document.getElementById('initialBalance').value) || 0;

        // Validate PIN
        if (!/^[0-9]{4}$/.test(pin)) {
            alert('PIN must be exactly 4 digits');
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
                    <div class="child-card sleek">
                        <div class="child-info">
                            <div class="child-header">
                                <h3>${child.name}</h3>
                                <div class="credentials">
                                    <span class="chip username">@${child.username}</span>
                                    <button class="icon-btn" title="Copy username" onclick="copyToClipboard('${child.username}', 'Username copied!')">📋</button>
                                </div>
                            </div>
                            <div class="balance">
                                <span class="label">Balance</span>
                                <span class="amount">$${(child.savings || 0).toFixed(2)}</span>
                            </div>
                            <div class="actions-row">
                                <button class="btn btn-small btn-primary" onclick="addMoney('${child.id}', '${child.name}')">Add Money</button>
                                <button class="btn btn-small btn-secondary" onclick="viewHistory('${child.id}')">History</button>
                                <button class="btn btn-small btn-warning" onclick="promptChangePin('${child.id}', '${child.username}')">Change PIN</button>
                                <button class="btn btn-small btn-danger" onclick="confirmDeleteChild('${child.id}', '${child.name}')">Delete</button>
                            </div>
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
        modal.style.display = 'block';
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
style.textContent = `
    .child-card.sleek {
        background: white;
        border: 1px solid var(--neutral-200);
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow-md);
        padding: 16px;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .child-card.sleek:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-lg);
    }
    .child-card .child-header {
        display: flex; justify-content: space-between; align-items: center; gap: 8px;
    }
    .child-card .credentials { display: inline-flex; align-items: center; gap: 6px; }
    .chip.username {
        background: var(--neutral-100); color: var(--neutral-700);
        border: 1px solid var(--neutral-300);
        padding: 2px 8px; border-radius: 999px; font-size: 12px;
    }
    .icon-btn { background: transparent; border: none; cursor: pointer; }
    .child-card .balance { display: flex; justify-content: space-between; margin: 12px 0; }
    .child-card .amount { font-weight: 700; color: var(--primary-700); }
    .child-card .actions-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .btn.btn-small.btn-warning { background: #f59e0b; color: white; }
    .btn.btn-small.btn-danger { background: #ef4444; color: white; }
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