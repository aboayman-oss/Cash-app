// ==========================================
// CONFIGURATION & AUTH
// ==========================================
const APPS_SCRIPT_URL = 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE';

// Phase 4: PINs live in JS (acceptable for trusted roommates)
const ROOMMATES = {
  "Ahmed": "1111",
  "Mohamed": "2222",
  "Ali": "3333"
};

// ==========================================
// STATE
// ==========================================
let state = {
  user: null,
  balance: 0.00,
  history: []
};

// ==========================================
// DOM ELEMENTS
// ==========================================
const els = {
  loader: document.getElementById('loader'),
  loginView: document.getElementById('login-view'),
  dashView: document.getElementById('dashboard-view'),
  
  // Login
  loginForm: document.getElementById('login-form'),
  loginUser: document.getElementById('login-user'),
  loginPin: document.getElementById('login-pin'),
  loginError: document.getElementById('login-error'),
  
  // Dashboard
  currentUserName: document.getElementById('current-user-name'),
  displayBalance: document.getElementById('display-balance'),
  historyList: document.getElementById('history-list'),
  btnLogout: document.getElementById('btn-logout'),
  
  // Transaction Buttons
  btnDeposit: document.getElementById('btn-deposit'),
  btnWithdraw: document.getElementById('btn-withdraw'),
  
  // Modal
  txModal: document.getElementById('tx-modal'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  txForm: document.getElementById('tx-form'),
  txType: document.getElementById('tx-type'),
  txAmount: document.getElementById('tx-amount'),
  txDesc: document.getElementById('tx-desc'),
  txError: document.getElementById('tx-error'),
  txModalTitle: document.getElementById('tx-modal-title'),
  txSubmitBtn: document.getElementById('tx-submit-btn')
};

// ==========================================
// AUTH & VIEW ROUTING (Phase 2)
// ==========================================
els.loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const user = els.loginUser.value;
  const pin = els.loginPin.value;

  if (!user || ROOMMATES[user] !== pin) {
    els.loginError.classList.remove('hidden');
    return;
  }

  els.loginError.classList.add('hidden');
  state.user = user;
  els.currentUserName.textContent = user;
  els.loginPin.value = ''; // clear for next time
  
  // Navigate to Dashboard and Fetch Data
  els.loginView.classList.add('hidden');
  els.dashView.classList.remove('hidden');
  els.dashView.classList.add('flex');
  
  fetchSafeData();
});

els.btnLogout.addEventListener('click', () => {
  state.user = null;
  els.dashView.classList.add('hidden');
  els.dashView.classList.remove('flex');
  els.loginView.classList.remove('hidden');
});

// ==========================================
// API INTEGRATION (Phase 3)
// ==========================================

// Helper: Standard Fetch wrapper avoiding CORS preflight via text/plain
async function safeFetch(method, payload = null) {
  els.loader.classList.remove('hidden');
  
  try {
    const options = {
      method: method,
      redirect: 'follow', // Crucial for Apps Script CORS fix
    };

    if (payload) {
      // Sending as text/plain prevents strict CORS preflights from failing
      options.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      options.body = JSON.stringify(payload);
    }

    const response = await fetch(APPS_SCRIPT_URL, options);
    const data = await response.json();
    return data;

  } catch (error) {
    console.error("API Error:", error);
    alert("Connection error. Check your internet or Apps Script URL.");
    return null;
  } finally {
    els.loader.classList.add('hidden');
  }
}

// 1. GET: Fetch Balance + History
async function fetchSafeData() {
  const data = await safeFetch('GET');
  if (data) {
    state.balance = Number(data.balance);
    state.history = data.history || [];
    renderDashboard();
  }
}

// 2. POST: Add Transaction
async function submitTransaction(type, amount, description) {
  const payload = {
    action: 'add',
    user: state.user,
    type: type,
    amount: amount,
    description: description
  };

  const data = await safeFetch('POST', payload);
  if (data && data.success) {
    closeModal();
    fetchSafeData(); // Re-fetch to guarantee sync with Sheets
  } else {
    showTxError(data?.error || "Failed to save transaction.");
  }
}

// 3. POST: Void Transaction
async function voidTransaction(transactionId) {
  const payload = {
    action: 'void',
    user: state.user,
    id: transactionId
  };

  const data = await safeFetch('POST', payload);
  if (data && data.success) {
    fetchSafeData(); // Re-fetch to recalculate balance and display void row
  } else {
    alert(data?.error || "Failed to void transaction.");
  }
}

// ==========================================
// UI RENDERING & VALIDATION (Phase 2 & 4)
// ==========================================

function renderDashboard() {
  els.displayBalance.textContent = state.balance.toFixed(2);
  els.historyList.innerHTML = '';

  if (state.history.length === 0) {
    els.historyList.innerHTML = `<p class="text-center text-gray-400 mt-6 text-sm">No transactions yet.</p>`;
    return;
  }

  state.history.forEach(tx => {
    // Phase 4: Void button logic
    const isVoid = tx.type === 'VOID';
    const isOut = tx.type === 'OUT';
    
    const amountColor = isVoid ? 'text-gray-500 line-through' : (isOut ? 'text-red-600' : 'text-green-600');
    const amountPrefix = isOut || isVoid ? '-' : '+';
    
    const row = document.createElement('div');
    row.className = `bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center ${isVoid ? 'opacity-60' : ''}`;
    
    row.innerHTML = `
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <span class="font-bold text-gray-800 text-sm">${tx.user}</span>
          <span class="text-xs text-gray-400 font-medium">${new Date(tx.date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</span>
          ${isVoid ? `<span class="bg-gray-200 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-sm">VOID</span>` : ''}
        </div>
        <p class="text-sm text-gray-600 mt-0.5">${tx.description}</p>
      </div>
      <div class="flex flex-col items-end pl-4">
        <span class="font-bold ${amountColor}">
          ${amountPrefix}$${Math.abs(tx.amount).toFixed(2)}
        </span>
        <button class="void-btn mt-1 text-xs font-bold text-red-400 hover:text-red-600 transition disabled:opacity-0" 
          data-id="${tx.id}" ${isVoid ? 'disabled' : ''}>
          VOID
        </button>
      </div>
    `;
    
    els.historyList.appendChild(row);
  });

  // Attach event listeners to new Void buttons
  document.querySelectorAll('.void-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const txId = e.target.getAttribute('data-id');
      // Phase 2: Confirmation Prompt
      if (confirm("Are you sure you want to void this transaction? This will automatically offset the balance.")) {
        voidTransaction(txId);
      }
    });
  });
}

// ==========================================
// MODAL LOGIC & FORM VALIDATION (Phase 4)
// ==========================================

function openModal(type) {
  els.txType.value = type;
  els.txAmount.value = '';
  els.txDesc.value = '';
  els.txError.classList.add('hidden');
  
  if (type === 'IN') {
    els.txModalTitle.textContent = 'Add Deposit';
    els.txSubmitBtn.className = "w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl transition shadow-md mt-2";
  } else {
    els.txModalTitle.textContent = 'Withdraw Funds';
    els.txSubmitBtn.className = "w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl transition shadow-md mt-2";
  }

  els.txModal.classList.remove('hidden');
}

function closeModal() {
  els.txModal.classList.add('hidden');
}

function showTxError(msg) {
  els.txError.textContent = msg;
  els.txError.classList.remove('hidden');
}

// Open modal bindings
els.btnDeposit.addEventListener('click', () => openModal('IN'));
els.btnWithdraw.addEventListener('click', () => openModal('OUT'));
els.btnCloseModal.addEventListener('click', closeModal);

// Form submission & Validation
els.txForm.addEventListener('submit', (e) => {
  e.preventDefault(); // Phase 3: No page reload
  
  const type = els.txType.value;
  const amount = Number(els.txAmount.value);
  const desc = els.txDesc.value.trim();

  // Phase 4 Validations
  if (!amount || amount <= 0) {
    showTxError("Amount must be greater than 0.");
    return;
  }
  if (!desc) {
    showTxError("Description cannot be empty.");
    return;
  }
  if (type === 'OUT' && amount > state.balance) {
    showTxError(`Insufficient funds. Max withdrawal is $${state.balance.toFixed(2)}.`);
    return;
  }

  els.txError.classList.add('hidden');
  submitTransaction(type, amount, desc);
});
