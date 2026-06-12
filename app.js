/**
 * Shared Cash Safe Application
 * Vanilla JS App for interacting with Google Apps Script backend.
 */

// ==========================================
// 1. Centralized Configuration & Globals
// ==========================================
const APP_CONFIG = {
  scriptUrl: 'https://script.google.com/macros/s/AKfycbz9q1WjOBA4csr-opiXVDJVEN2Ny4h63cNn_9KaHGB4PalUy-wBE0IzPUn9MxUrnUeY/exec', 
  users: {
    "Ayman": "3009",
    "Sakr": "3009",
    "El3taby": "2008", 
    "S3od": "3009"
  }
};

let selectedUserForLogin = null;
let currentUser = null;
let currentBalance = 0;

// ==========================================
// DOM Element References
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  // Views & Headers
  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');
  const globalHeader = document.getElementById('global-header');
  
  // Login Elements
  const userBtns = document.querySelectorAll('.user-btn');
  const pinContainer = document.getElementById('pin-container');
  const pinInput = document.getElementById('pin-input');
  const pinLabel = document.getElementById('pin-label');
  const loginSpinner = document.getElementById('login-spinner');
  
  // Dashboard Elements
  const amountInput = document.getElementById('amount-input');
  const descInput = document.getElementById('desc-input');
  const btnDeposit = document.getElementById('btn-deposit');
  const btnWithdraw = document.getElementById('btn-withdraw');
  const logoutBtn = document.getElementById('logout-btn');
  const currentBalanceDisplay = document.getElementById('current-balance');
  const historyContainer = document.getElementById('history-container');
  const notificationArea = document.getElementById('notification-area');

  // ==========================================
  // 2. Formatters & Helpers
  // ==========================================
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-EG', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    }).format(amount);
  };

  const spinnerSvg = `<svg class="animate-spin h-5 w-5 mr-2 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

  // ==========================================
  // 3. Notifications
  // ==========================================
  let notificationTimeout;
  
  function showNotification(message, isError = true) {
    clearTimeout(notificationTimeout);
    
    // Create inner pill for notification
    const bgColor = isError ? 'bg-rose-500' : 'bg-emerald-500';
    notificationArea.innerHTML = `<div class="mx-auto ${bgColor} text-white px-6 py-3 rounded-full shadow-lg font-medium text-sm flex items-center gap-2">
      ${isError ? `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>` 
                : `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`}
      ${message}
    </div>`;
    
    notificationArea.classList.remove('-translate-y-full', 'opacity-0');
    
    notificationTimeout = setTimeout(() => {
      notificationArea.classList.add('-translate-y-full', 'opacity-0');
    }, 3500);
  }

  // ==========================================
  // 4. API Communication
  // ==========================================
  async function apiCall(options = {}) {
    try {
      const fetchConfig = { method: options.method || 'GET', redirect: 'follow' };

      if (options.method === 'POST') {
        fetchConfig.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
        fetchConfig.body = JSON.stringify(options.payload);
      }

      const url = options.method === 'GET' 
        ? `${APP_CONFIG.scriptUrl}?action=get` 
        : APP_CONFIG.scriptUrl;

      const response = await fetch(url, fetchConfig);
      if (!response.ok) throw new Error(`Network error: ${response.status}`);
      
      const data = await response.json();
      if (data.status === 'error') throw new Error(data.message || 'Server error occurred.');
      
      return data;
    } catch (error) {
      showNotification(error.message || "Failed to communicate with server.", true);
      throw error; 
    }
  }

  async function fetchDashboardData() {
    const data = await apiCall({ method: 'GET' });
    currentBalance = parseFloat(data.data.currentBalance) || 0;
    renderDashboard(currentBalance, data.data.transactions || []);
  }

  // ==========================================
  // 5. Auth Logic (Grid & Auto-Submit)
  // ==========================================
  
  // Handle User Selection from Grid
  userBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Clear previous selection visually
      userBtns.forEach(b => {
        b.classList.remove('ring-2', 'ring-blue-500', 'bg-gray-700');
        b.classList.add('bg-gray-800');
      });
      
      // Select new user
      btn.classList.remove('bg-gray-800');
      btn.classList.add('ring-2', 'ring-blue-500', 'bg-gray-700');
      selectedUserForLogin = btn.getAttribute('data-user');
      
      // Enable and focus PIN
      pinContainer.classList.remove('pin-disabled');
      pinLabel.textContent = `Enter PIN for ${selectedUserForLogin}`;
      pinInput.value = '';
      pinInput.focus();
    });
  });

  // Zero-Click PIN Submission
  pinInput.addEventListener('input', async (e) => {
    // If they typed 4 digits for anyone BUT El3taby, OR 6 digits for El3taby
    const requiredLength = selectedUserForLogin === 'El3taby' ? 6 : 4;

    if (e.target.value.length === requiredLength) {
      const enteredPin = e.target.value;
      
      if (APP_CONFIG.users[selectedUserForLogin] !== enteredPin) {
          pinInput.value = '';
          return showNotification("Invalid PIN.", true);
      }

      // Lock UI and show spinner
      pinInput.blur();
      loginSpinner.classList.remove('hidden');

      try {
        currentUser = selectedUserForLogin;
        await fetchDashboardData();
        
        // Hide global header on dashboard to save space
        globalHeader.classList.add('hidden');
        loginView.classList.add('hidden');
        dashboardView.classList.remove('hidden');
        
        // Update mini avatar
        document.getElementById('logged-in-user').textContent = currentUser;
        document.getElementById('user-avatar-mini').textContent = currentUser.charAt(0);

      } catch (error) {
         currentUser = null;
      } finally {
        loginSpinner.classList.add('hidden');
        pinInput.value = '';
      }
    }
  });

  logoutBtn.addEventListener('click', () => {
    currentUser = null; selectedUserForLogin = null; currentBalance = 0;
    
    amountInput.value = ''; descInput.value = ''; historyContainer.innerHTML = '';
    currentBalanceDisplay.innerHTML = `<span class="text-2xl text-gray-500 font-medium mr-1">EGP</span>0.00`;
    
    dashboardView.classList.add('hidden');
    loginView.classList.remove('hidden');
    globalHeader.classList.remove('hidden');
    
    // Reset Grid and PIN
    userBtns.forEach(b => b.classList.remove('ring-2', 'ring-blue-500', 'bg-gray-700'));
    pinContainer.classList.add('pin-disabled');
    pinLabel.textContent = 'Enter PIN';
    pinInput.value = '';
  });

  // ==========================================
  // 6. Transaction Logic
  // ==========================================
  async function handleTransaction(type, btnElement) {
    const amountVal = parseFloat(amountInput.value);
    const descVal = descInput.value.trim();

    if (isNaN(amountVal) || amountVal <= 0) return showNotification("Enter a valid amount.", true);
    if (!descVal) return showNotification("Description needed.", true);
    if (type === 'OUT' && amountVal > currentBalance) return showNotification("Insufficient funds.", true);

    const originalHtml = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.innerHTML = spinnerSvg;

    try {
      await apiCall({ 
        method: 'POST', 
        payload: { action: 'add', user: currentUser, type: type, amount: amountVal, description: descVal } 
      });
      amountInput.value = ''; descInput.value = '';
      await fetchDashboardData();
    } finally {
      btnElement.disabled = false;
      btnElement.innerHTML = originalHtml;
    }
  }

  btnDeposit.addEventListener('click', () => handleTransaction('IN', btnDeposit));
  btnWithdraw.addEventListener('click', () => handleTransaction('OUT', btnWithdraw));

  // ==========================================
  // 7. Dynamic Rendering (Sleek UI)
  // ==========================================
  function renderDashboard(balance, history) {
    currentBalanceDisplay.innerHTML = `<span class="text-2xl text-gray-500 font-medium mr-1">EGP</span>${formatCurrency(balance)}`;
    historyContainer.innerHTML = '';

    if (history.length === 0) {
      historyContainer.innerHTML = '<p class="text-gray-500 text-sm italic py-4 text-center">No recent activity.</p>';
      return;
    }

    history.forEach(item => {
      const isVoid = item.type === 'VOID';
      const isDeposit = item.type === 'IN';
      
      const amountColor = isDeposit ? 'text-emerald-400' : (isVoid ? 'text-gray-600 line-through' : 'text-rose-400');
      const dotColor = isDeposit ? 'bg-emerald-500' : (isVoid ? 'bg-gray-700' : 'bg-rose-500');
      const sign = isDeposit ? '+' : (isVoid ? '' : '-');
      const dateStr = new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

      // Unboxed, flat rows
      const row = document.createElement('div');
      row.className = `py-3.5 border-b border-gray-800/60 flex justify-between items-center group transition-opacity ${isVoid ? 'opacity-50' : ''}`;
      
      row.innerHTML = `
          <div class="flex items-center gap-3">
              <div class="w-1 h-8 rounded-full ${dotColor}"></div>
              <div class="flex flex-col">
                  <span class="text-white font-medium text-[15px] leading-tight">${item.description} ${isVoid ? '<span class="text-xs text-gray-500 ml-1">(VOID)</span>' : ''}</span>
                  <span class="text-xs text-gray-500 mt-0.5">${item.user} &bull; ${dateStr}</span>
              </div>
          </div>
          <div class="flex items-center gap-3">
              <span class="text-base font-bold ${amountColor}">${sign}${formatCurrency(item.amount)}</span>
              ${!isVoid ? `
              <button class="void-btn text-gray-600 hover:text-rose-500 transition-colors p-1.5 focus:outline-none" data-id="${item.id}" title="Void Transaction">
                  <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>` : `<div class="w-7"></div>`}
          </div>
      `;
      historyContainer.appendChild(row);
    });
  }

  // ==========================================
  // 8. Void Action
  // ==========================================
  historyContainer.addEventListener('click', async (e) => {
    const voidBtn = e.target.closest('.void-btn');
    if (!voidBtn || voidBtn.disabled) return;
    
    if (!confirm("Void this transaction?")) return; 

    const originalHtml = voidBtn.innerHTML;
    voidBtn.disabled = true;
    voidBtn.innerHTML = `<svg class="animate-spin w-4 h-4 text-rose-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

    try {
      await apiCall({ 
        method: 'POST', 
        payload: { action: 'void', transactionId: voidBtn.getAttribute('data-id'), user: currentUser } 
      });
      await fetchDashboardData(); 
    } catch (error) {
      voidBtn.disabled = false;
      voidBtn.innerHTML = originalHtml;
    }
  });

});
