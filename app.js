/**
 * Shared Cash Safe Application
 * Vanilla JS App for interacting with Google Apps Script backend.
 */

// ==========================================
// 1. Centralized Configuration & Globals
// ==========================================
const APP_CONFIG = {
  // Replace with your deployed Google Apps Script Web App URL
  scriptUrl: 'https://script.google.com/macros/s/AKfycbz9q1WjOBA4csr-opiXVDJVEN2Ny4h63cNn_9KaHGB4PalUy-wBE0IzPUn9MxUrnUeY/exec', 
  users: {
    "Ayman": "3009",
    "Sakr": "3009",
    "El3taby": "154208", 
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
  // 2. Formatters & Helpers
  // ==========================================
  
  // Formats numbers to look like proper currency (e.g., 1,500.00)
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-EG', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    }).format(amount);
  };

  // SVG Spinner for loading states
  const spinnerSvg = `<svg class="animate-spin h-5 w-5 mr-2 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

  // ==========================================
  // 3. Robust Error Handling & Notifications
  // ==========================================
  let notificationTimeout;
  
  function showNotification(message, isError = true) {
    clearTimeout(notificationTimeout);
    
    notificationArea.textContent = message;
    notificationArea.classList.remove('hidden');
    
    if (isError) {
      notificationArea.classList.add('bg-rose-100', 'text-rose-700', 'border-rose-400');
      notificationArea.classList.remove('bg-emerald-100', 'text-emerald-700', 'border-emerald-400');
    } else {
      notificationArea.classList.add('bg-emerald-100', 'text-emerald-700', 'border-emerald-400');
      notificationArea.classList.remove('bg-rose-100', 'text-rose-700', 'border-rose-400');
    }

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
        redirect: 'follow', 
      };

      if (options.method === 'POST') {
        fetchConfig.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
        fetchConfig.body = JSON.stringify(options.payload);
      }

      const url = options.method === 'GET' 
        ? `${APP_CONFIG.scriptUrl}?action=get` 
        : APP_CONFIG.scriptUrl;

      const response = await fetch(url, fetchConfig);
      
      if (!response.ok) {
        throw new Error(`Network error: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'error') {
        throw new Error(data.message || 'Server error occurred.');
      }

      return data;

    } catch (error) {
      showNotification(error.message || "Failed to communicate with the server.", true);
      throw error; 
    }
  }

  async function fetchDashboardData() {
    const data = await apiCall({ method: 'GET' });
    currentBalance = parseFloat(data.data.currentBalance) || 0;
    renderDashboard(currentBalance, data.data.transactions || []);
  }

  // ==========================================
  // 5. Authentication
  // ==========================================
  loginBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    
    const selectedUser = userDropdown.value;
    const enteredPin = pinInput.value;

    if (!selectedUser) return showNotification("Please select a user.", true);
    if (APP_CONFIG.users[selectedUser] !== enteredPin) {
        pinInput.value = ''; // Auto clear on fail
        return showNotification("Invalid PIN. Please try again.", true);
    }

    // --- Prevent double clicks during login ---
    const originalText = loginBtn.textContent;
    loginBtn.disabled = true;
    loginBtn.innerHTML = `${spinnerSvg} Logging in...`;

    try {
      currentUser = selectedUser;
      pinInput.value = ''; 
      
      // Fetch data BEFORE showing dashboard for a seamless UX
      await fetchDashboardData();
      
      loginView.classList.add('hidden');
      dashboardView.classList.remove('hidden');
      
      const loggedInUserDisplay = document.getElementById('logged-in-user');
      if (loggedInUserDisplay) loggedInUserDisplay.textContent = currentUser;

      showNotification(`Welcome, ${currentUser}!`, false);
      
      // Auto-focus amount input for convenience
      setTimeout(() => amountInput.focus(), 100);

    } catch (error) {
       // Error handled by apiCall, but we reset login state
       currentUser = null;
    } finally {
      // Re-enable button
      loginBtn.disabled = false;
      loginBtn.textContent = originalText;
    }
  });

  logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    currentUser = null;
    currentBalance = 0;
    
    amountInput.value = '';
    descInput.value = '';
    historyContainer.innerHTML = '';
    currentBalanceDisplay.textContent = '0.00';
    
    dashboardView.classList.add('hidden');
    loginView.classList.remove('hidden');
    
    userDropdown.selectedIndex = 0;
    showNotification("Logged out successfully.", false);
  });

  // ==========================================
  // 6. Client-Side Validation & Transaction Logic
  // ==========================================
  async function handleTransaction(type, btnElement) {
    const amountVal = parseFloat(amountInput.value);
    const descVal = descInput.value.trim();

    // Validations
    if (isNaN(amountVal) || amountVal <= 0) {
      return showNotification("Please enter a valid amount greater than 0.", true);
    }
    if (!descVal) {
      return showNotification("Description cannot be empty.", true);
    }
    if (type === 'OUT' && amountVal > currentBalance) {
      return showNotification("Insufficient funds in the safe.", true);
    }

    // --- Prevent double clicks during transaction ---
    const originalHtml = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.innerHTML = `${spinnerSvg} Processing...`;

    const payload = {
      action: 'add',
      user: currentUser,
      type: type, 
      amount: amountVal,
      description: descVal
    };

    try {
      await apiCall({ method: 'POST', payload: payload });
      showNotification("Transaction successful!", false);
      
      // Clear inputs only on success
      amountInput.value = '';
      descInput.value = '';
      
      // Update data
      await fetchDashboardData();
    } catch (error) {
      // Handled by apiCall
    } finally {
      // Always re-enable the button
      btnElement.disabled = false;
      btnElement.innerHTML = originalHtml;
    }
  }

  // Pass the button element to the handler so we can disable it
  btnDeposit.addEventListener('click', (e) => {
    e.preventDefault();
    handleTransaction('IN', btnDeposit);
  });

  btnWithdraw.addEventListener('click', (e) => {
    e.preventDefault();
    handleTransaction('OUT', btnWithdraw);
  });

  // ==========================================
  // 7. Dynamic Rendering
  // ==========================================
  function renderDashboard(balance, history) {
    // Uses the new currency formatter
    currentBalanceDisplay.innerHTML = `<span class="text-3xl text-gray-500 font-normal mr-1">EGP</span>${formatCurrency(balance)}`;
    
    historyContainer.innerHTML = '';

    if (history.length === 0) {
      historyContainer.innerHTML = '<p class="text-gray-500 italic p-4 text-center">No transactions found.</p>';
      return;
    }

    history.forEach(item => {
      const isVoid = item.type === 'VOID';
      const isDeposit = item.type === 'IN';
      
      const amountColor = isDeposit ? 'text-emerald-400' : (isVoid ? 'text-gray-500 line-through' : 'text-rose-400');
      const sign = isDeposit ? '+' : (isVoid ? '' : '-');
      const formattedDate = new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

      const row = document.createElement('div');
      row.className = `bg-gray-800 border ${isVoid ? 'border-gray-700/30 opacity-50' : 'border-gray-700/60'} rounded-2xl p-4 shadow-sm flex flex-col relative overflow-hidden group flex-shrink-0`;
      
      // Added matching SVG to the void button dynamically
      row.innerHTML = `
          ${!isVoid ? `<div class="absolute left-0 top-0 bottom-0 w-1.5 ${isDeposit ? 'bg-emerald-500' : 'bg-rose-500'}"></div>` : ''}
          <div class="flex justify-between items-start ml-2">
              <div class="flex flex-col">
                  <span class="text-white font-bold text-base">${item.description} ${isVoid ? '(VOID)' : ''}</span>
                  <span class="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                      ${item.user} &bull; ${formattedDate}
                  </span>
              </div>
              <span class="text-lg font-extrabold ${amountColor} ml-3 whitespace-nowrap">${sign} ${formatCurrency(item.amount)}</span>
          </div>
          <div class="flex justify-end border-t border-gray-700/50 pt-3 mt-3 ml-2">
              <button class="void-btn text-xs font-semibold text-gray-500 hover:text-rose-400 bg-gray-900 border border-gray-700 hover:border-rose-500/50 rounded-lg px-4 py-2 transition-all active:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5" 
              data-id="${item.id}" ${isVoid ? 'disabled' : ''}>
                  ${isVoid ? 'Already Voided' : `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Void Transaction`}
              </button>
          </div>
      `;
      historyContainer.appendChild(row);
    });
  }

  // ==========================================
  // 8. Void Confirmation & Action (Event Delegation)
  // ==========================================
  historyContainer.addEventListener('click', async (e) => {
    // Fix: Use closest() in case they click the SVG inside the button
    const voidBtn = e.target.closest('.void-btn');
    
    if (voidBtn) {
      e.preventDefault();
      if (voidBtn.disabled) return; // Prevent action if already processing/voided
      
      const transactionId = voidBtn.getAttribute('data-id');
      
      if (!confirm("Are you sure you want to void this transaction? This cannot be undone.")) {
        return; 
      }

      // --- Prevent double clicking void ---
      const originalHtml = voidBtn.innerHTML;
      voidBtn.disabled = true;
      voidBtn.innerHTML = `${spinnerSvg} Voiding...`;

      const payload = {
        action: 'void',
        transactionId: transactionId,
        user: currentUser 
      };

      try {
        await apiCall({ method: 'POST', payload: payload });
        showNotification("Transaction voided successfully.", false);
        await fetchDashboardData(); 
      } catch (error) {
        // If it fails, revert the button back so they can try again.
        // (If it succeeds, renderDashboard entirely rebuilds the button list anyway)
        voidBtn.disabled = false;
        voidBtn.innerHTML = originalHtml;
      }
    }
  });

});
