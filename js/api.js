// API helper module for additional backend calls
const API = (function() {
    'use strict';
    
    /**
     * Base API request handler
     */
    async function request(endpoint, method = 'GET', body = null) {
        const token = localStorage.getItem(CONFIG.TOKEN_KEY);
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const options = {
            method,
            headers
        };
        
        if (body && method !== 'GET') {
            options.body = JSON.stringify(body);
        }
        
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, options);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }
            
            return data;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }
    
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
        
        async approveWithdrawalRequest(requestId) {
            return request(`/withdrawal-requests/${requestId}/approve`, 'POST');
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
        
        async approveTransferRequest(requestId) {
            return request(`/transfers/${requestId}/approve`, 'POST');
        },
        
        async rejectTransferRequest(requestId, reason) {
            return request(`/transfers/${requestId}/reject`, 'POST', { reason });
        },
        
        // Child management
        async updateChildBalance(childId, amount) {
            return request(`/children/${childId}/balance`, 'PUT', { amount });
        },
        
        async getChildDetails(childId) {
            return request(`/children/${childId}`);
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
        }
    };
})();

// Make API available globally
window.API = API;