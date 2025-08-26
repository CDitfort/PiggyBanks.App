// API helper module for additional backend calls
const API = (function() {
    'use strict';

    // Use the centralized request handler from Auth module
    // This ensures consistency, deduplication, and proper request tracking
    const request = Auth.request;

    return {
        // Transaction endpoints (for future implementation)
        async addTransaction(childId, amount, description, type = 'deposit') {
            return request('/transactions', 'POST', {
                childId,
                amount,
                description,
                type
            });
        },

        async getTransactions(childId) {
            return request(`/transactions/${childId}`);
        },

        // Withdrawal request endpoints
        async createWithdrawalRequest(amount, reason) {
            return request('/withdrawal-requests', 'POST', {
                amount,
                reason
            });
        },

        async getWithdrawalRequests() {
            return request('/withdrawal-requests');
        },

        async approveWithdrawalRequest(requestId, amount) {
            const body = (amount !== undefined && amount !== null) ? { amount } : undefined;
            return request(`/withdrawal-requests/${requestId}/approve`, 'POST', body);
        },

        async rejectWithdrawalRequest(requestId, reason) {
            return request(`/withdrawal-requests/${requestId}/reject`, 'POST', { reason });
        },

        // Transfer endpoints
        async createTransferRequest(toChildId, amount, reason) {
            return request('/transfers', 'POST', {
                toChildId,
                amount,
                reason
            });
        },

        async getTransferRequests() {
            return request('/transfers');
        },

        async approveTransferRequest(requestId, amount) {
            const body = (amount !== undefined && amount !== null) ? { amount } : undefined;
            return request(`/transfers/${requestId}/approve`, 'POST', body);
        },

        async rejectTransferRequest(requestId, reason) {
            return request(`/transfers/${requestId}/reject`, 'POST', { reason });
        },

        // Money addition request endpoints
        async createMoneyAdditionRequest(amount, reason) {
            return request('/money-addition-requests', 'POST', {
                amount,
                reason
            });
        },

        async getMoneyAdditionRequests() {
            return request('/money-addition-requests');
        },

        async approveMoneyAdditionRequest(requestId, amount) {
            const body = (amount !== undefined && amount !== null) ? { amount } : undefined;
            return request(`/money-addition-requests/${requestId}/approve`, 'POST', body);
        },

        async rejectMoneyAdditionRequest(requestId, reason) {
            return request(`/money-addition-requests/${requestId}/reject`, 'POST', { reason });
        },

        // Child management
        async updateChildBalance(childId, amount) {
            return request(`/children/${childId}/balance`, 'PUT', { amount });
        },

        async getChildDetails(childId) {
            return request(`/children/${childId}`);
        },

        async deleteChild(childId) {
            return request(`/children/${childId}`, 'DELETE');
        },

        async updateChildPin(childId, pin) {
            return request(`/children/${childId}/pin`, 'PUT', { pin });
        },

            // Child preferences
            async updateMyPreferences(preferences) {
                // Add retry logic for preferences update due to occasional network issues
                let lastError;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        const result = await request('/children/me/preferences', 'PUT', preferences);
                        return result;
                    } catch (error) {
                        lastError = error;
                        console.warn(`[API] Preferences update attempt ${attempt} failed:`, error.message);

                        // Don't retry on authentication errors
                        if (error.message.includes('401') || error.message.includes('403')) {
                            throw error;
                        }

                        // Wait before retrying (exponential backoff)
                        if (attempt < 3) {
                            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
                        }
                    }
                }
                throw lastError;
            },


        // Username availability check
        async checkUsername(username) {
            const q = encodeURIComponent(username);
            return request(`/usernames/check?username=${q}`);
        },

        // Goals endpoints (for future implementation)
        async createGoal(childId, name, targetAmount, deadline) {
            return request('/goals', 'POST', {
                childId,
                name,
                targetAmount,
                deadline
            });
        },

        async getGoals(childId) {
            return request(`/goals/${childId}`);
        },

        async updateGoal(goalId, updates) {
            return request(`/goals/${goalId}`, 'PUT', updates);
        },

        async deleteGoal(goalId) {
            return request(`/goals/${goalId}`, 'DELETE');
        },

        // Chores endpoints (for future implementation)
        async createChore(childId, name, reward, description) {
            return request('/chores', 'POST', {
                childId,
                name,
                reward,
                description
            });
        },

        async getChores(childId) {
            return request(`/chores/${childId}`);
        },

        async completeChore(choreId) {
            return request(`/chores/${choreId}/complete`, 'POST');
        },

        // Statistics endpoints
        async getStatistics(childId) {
            return request(`/statistics/${childId}`);
        },

        async getFamilyStatistics() {
            return request('/statistics/family');
        },

        // Expose request method for direct use if needed
        request: request
    };
})();

// Make API available globally
window.API = API;

// Log when API module is loaded
// console.log('[API] Module loaded, using centralized Auth.request handler');