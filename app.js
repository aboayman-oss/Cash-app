/**
 * Shared Cash Safe Application
 * Vanilla JS App for interacting with Google Apps Script backend.
 */

// ==========================================
// 1. Centralized Configuration & Globals
// ==========================================
const APP_CONFIG = {
  // Replace with your deployed Google Apps Script Web App URL
  scriptUrl: 'https://script.google.com/macros/s/AKfycbxqhKwQddxQmdheO4bhzcBOOOVdUYQ-9qoTim-X4bqOLzTCXkcMOxx8NyTMHOeer7_D/exec', 
  users: {
    "Ayman": "3009",
    "Sakr": "3009",
    "El3taby": "154208"
    "S3od": "3009"
  }
};

// Global application state
let currentUser = null;
let currentBalance = 0;

// ==========================================
// DOM Element References
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  // Views
  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');
  
  // Inputs
  const userDropdown = document.getElementById('user-dropdown');
  const pinInput = document.getElementById('pin-input');
  const amountInput = document.getElementById('amount-input');
  const descInput = document.getElementById('desc-input');
  
  // Buttons
  const loginBtn = document.getElementById('login-btn');
  const btnDeposit = document.getElementById('btn-deposit');
  const btnWithdraw = document.getElementById('btn-withdraw');
  const logoutBtn = document.getElementById('logout-btn');
  
  // Displays
  const currentBalanceDisplay = document.getElementById('current-balance');
  const historyContainer = document.getElementById('history-container');
  const notificationArea = document.getElementById('notification-area');

  // ==========================================
  // 2. Robust Error Handling & Notifications
  // ==========================================
  let notificationTimeout;
  
  function showNotification(message, isError = true) {
    // Clear any existing timeout to avoid premature hiding
    clearTimeout(notificationTimeout);
    
    // Set message and base styles
    notificationArea.textContent = message;
    notificationArea.classList.remove('hidden');
    
    // Adjust colors based on success/error state (Assuming Tailwind classes)
    if (isError) {
      notificationArea.classList.add('bg-red-100', 'text-red-700', 'border-red-400');
      notificationArea.classList.remove('bg-green-100', 'text-green-700', 'border-green-400');
    } else {
      notificationArea.classList.add('bg-green-100', 'text-green-700', 'border-green-400');
      notificationArea.classList.remove('bg-red-100', 'text-red-700', 'border-red-400');
    }

    // Auto-hide after 4 seconds
    notificationTimeout = setTimeout(() => {
      notificationArea.classList.add('hidden');
      notificationArea.textContent = '';
    }, 4000);
  }

  // ==========================================
  // 4. API Communication Helper
  // ==========================================
  async function apiCall(options = {}) {
    try {
      const fetchConfig = {
        method: options.method || 'GET',
        // CRUCIAL: Follow redirects silently to handle Google Apps Script CORS behavior
        redirect: 'follow', 
      };

      if (options.method === 'POST') {
        // Text/plain content type helps bypass complex CORS preflight issues in standard Apps Script setups
        // while still allowing the backend to parse the JSON string payload.
        fetchConfig.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
        fetchConfig.body = JSON.stringify(options.payload);
      }

      // If GET request, we usually append query parameters. Assuming default Apps Script behavior.
      const url = options.method === 'GET' 
        ? `${APP_CONFIG.scriptUrl}?action=get` 
        : APP_CONFIG.scriptUrl;

      const response = await fetch(url, fetchConfig);
      
      if (!response.ok) {
        throw new Error(`Network response was not ok. Status: ${response.status}`);
      }

      const data = await response.json();

      // Check for explicit backend application errors
      if (data.status === 'error') {
        throw new Error(data.message || 'An error occurred on the server.');
      }

      return data;

    } catch (error) {
      showNotification(error.message || "Failed to communicate with the server.", true);
      throw error; // Re-throw to prevent subsequent dependent code from executing
    }
  }

  // Fetch initial data function
  async function fetchDashboardData() {
    try {
      const data = await apiCall({ method: 'GET' });
      // Assuming backend returns { status: 'success', data: { balance: 100, history: [...] } }
      currentBalance = parseFloat(data.data.balance) || 0;
      renderDashboard(currentBalance, data.data.history || []);
    } catch (error) {
      // Error is already handled by apiCall's catch block
      console.error("Dashboard fetch failed:", error);
    }
  }

  // ==========================================
  // 3. Authentication
  // ==========================================
  loginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    
    const selectedUser = userDropdown.value;
    const enteredPin = pinInput.value;

    if (!selectedUser) {
      return showNotification("Please select a user.", true);
    }
    
    if (APP_CONFIG.users[selectedUser] !== enteredPin) {
      return showNotification("Invalid PIN. Please try again.", true);
    }

    // Login successful
    currentUser = selectedUser;
    pinInput.value = ''; // clear PIN for security
    
    // Switch views
    loginView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    
    showNotification(`Welcome, ${currentUser}!`, false);
    
    // Fetch user dashboard data
    fetchDashboardData();
  });

  // Logout
  logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    currentUser = null;
    currentBalance = 0;
    
    // Clear inputs and history
    amountInput.value = '';
    descInput.value = '';
    historyContainer.innerHTML = '';
    currentBalanceDisplay.textContent = '0';
    
    // Switch views
    dashboardView.classList.add('hidden');
    loginView.classList.remove('hidden');
    showNotification("Logged out successfully.", false);
  });

  // ==========================================
  // 5. Client-Side Validation & Transaction Logic
  // ==========================================
  async function handleTransaction(type) {
    const amountVal = parseFloat(amountInput.value);
    const descVal = descInput.value.trim();

    // Validations
    if (isNaN(amountVal) || amountVal <= 0) {
      return showNotification("Please enter a valid amount greater than 0.", true);
    }
    if (!descVal) {
      return showNotification("Description cannot be empty.", true);
    }

    // Withdraw specific validation
    if (type === 'OUT' && amountVal > currentBalance) {
      return showNotification("Insufficient funds in the safe.", true);
    }

    const payload = {
      action: 'add',
      user: currentUser,
      type: type, // 'IN' or 'OUT'
      amount: amountVal,
      description: descVal
    };

    try {
      await apiCall({ method: 'POST', payload: payload });
      showNotification("Transaction successful!", false);
      
      // Clear inputs
      amountInput.value = '';
      descInput.value = '';
      
      // Re-fetch to get updated state from truth (backend)
      fetchDashboardData();
    } catch (error) {
      // Error handled by apiCall
    }
  }

  btnDeposit.addEventListener('click', (e) => {
    e.preventDefault();
    handleTransaction('IN');
  });

  btnWithdraw.addEventListener('click', (e) => {
    e.preventDefault();
    handleTransaction('OUT');
  });

  // ==========================================
  // 6. Dynamic Rendering
  // ==========================================
  function renderDashboard(balance, history) {
    // Update balance text
    currentBalanceDisplay.textContent = balance.toFixed(2);
    
    // Clear existing history
    historyContainer.innerHTML = '';

    if (history.length === 0) {
      historyContainer.innerHTML = '<p class="text-gray-500 italic p-4 text-center">No transactions found.</p>';
      return;
    }

    // Build history UI
    history.forEach(item => {
      const isVoid = item.type === 'VOID';
      
      // Create wrapper div
      const row = document.createElement('div');
      row.className = `flex justify-between items-center p-3 border-b border-gray-200 ${isVoid ? 'bg-gray-100 opacity-60' : 'bg-white'}`;
      
      // Format transaction type and sign
      const isDeposit = item.type === 'IN';
      const amountColor = isDeposit ? 'text-green-600' : (isVoid ? 'text-gray-500' : 'text-red-600');
      const sign = isDeposit ? '+' : (isVoid ? '' : '-');

      // HTML template for the row
      row.innerHTML = `
        <div class="flex-1">
          <p class="font-semibold text-gray-800">${item.description} ${isVoid ? '(VOIDED)' : ''}</p>
          <p class="text-sm text-gray-500">${item.user} &bull; ${new Date(item.date).toLocaleDateString()}</p>
        </div>
        <div class="text-right flex items-center gap-4">
          <span class="font-bold ${amountColor}">${sign}${parseFloat(item.amount).toFixed(2)}</span>
          <button 
            class="void-btn text-xs font-semibold px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed" 
            data-id="${item.transactionId}"
            ${isVoid ? 'disabled' : ''}>
            ${isVoid ? 'Voided' : 'Void'}
          </button>
        </div>
      `;
      historyContainer.appendChild(row);
    });
  }

  // ==========================================
  // 7. Void Confirmation & Action (Event Delegation)
  // ==========================================
  historyContainer.addEventListener('click', async (e) => {
    // Check if clicked element is a void button
    if (e.target.classList.contains('void-btn')) {
      e.preventDefault();
      
      const transactionId = e.target.getAttribute('data-id');
      
      // Native confirmation before voiding
      if (!confirm("Are you sure you want to void this transaction? This cannot be undone.")) {
        return; 
      }

      const payload = {
        action: 'void',
        transactionId: transactionId,
        user: currentUser // Optional: Good for logging who voided it on backend
      };

      try {
        await apiCall({ method: 'POST', payload: payload });
        showNotification("Transaction voided successfully.", false);
        // Re-fetch to update history list and balance
        fetchDashboardData(); 
      } catch (error) {
        // Error handled in apiCall
      }
    }
  });

});
