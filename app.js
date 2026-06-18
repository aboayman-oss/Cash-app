/**
 * Shared Cash Safe — Frontend Logic (Refactored)
 *
 * Backend: Google Apps Script (Code.gs)
 * Host: GitHub Pages (static)
 *
 * All state is server-side. The frontend only holds:
 *  - the users list (incl. PINs, for client-side auto-submit UX)
 *  - the current dashboard snapshot (balance + transactions)
 *
 * Per the owner, security is intentionally light (small friend group),
 * so PIN validation is done client-side to preserve the zero-click
 * auto-submit UX. Admin operations are validated server-side.
 */

// =========================================================
// 1. CONFIG & STATE
// =========================================================
const APP_CONFIG = {
  // Same Apps Script web app URL as before
  scriptUrl: 'https://script.google.com/macros/s/AKfycbz9q1WjOBA4csr-opiXVDJVEN2Ny4h63cNn_9KaHGB4PalUy-wBE0IzPUn9MxUrnUeY/exec'
};

// Tailwind color classes for each user avatar.
// (kept in sync with the <select id="new-color"> options in index.html)
const COLOR_MAP = {
  blue:    { text: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    ring: 'ring-blue-500',    solid: 'bg-blue-600' },
  indigo:  { text: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20',  ring: 'ring-indigo-500',  solid: 'bg-indigo-600' },
  emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', ring: 'ring-emerald-500', solid: 'bg-emerald-600' },
  amber:   { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   ring: 'ring-amber-500',   solid: 'bg-amber-600' },
  rose:    { text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    ring: 'ring-rose-500',    solid: 'bg-rose-600' },
  purple:  { text: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20',  ring: 'ring-purple-500',  solid: 'bg-purple-600' },
  cyan:    { text: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20',    ring: 'ring-cyan-500',    solid: 'bg-cyan-600' },
  pink:    { text: 'text-pink-400',    bg: 'bg-pink-500/10',    border: 'border-pink-500/20',    ring: 'ring-pink-500',    solid: 'bg-pink-600' }
};
const DEFAULT_COLOR = 'blue';

let users = [];                    // [{username, pin, color, displayName}]
let selectedUserForLogin = null;
let currentUser = null;
let currentBalance = 0;
let adminPin = null;               // cached after admin login (session only)

// =========================================================
// 2. BOOTSTRAP
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
  cacheDom();
  bindEvents();
  loadUsers();                     // fetch user list for the login grid
});

// =========================================================
// 3. DOM REFERENCES
// =========================================================
let dom = {};
function cacheDom() {
  dom = {
    loginView:       document.getElementById('login-view'),
    dashboardView:   document.getElementById('dashboard-view'),
    globalHeader:    document.getElementById('global-header'),
    userGrid:        document.getElementById('user-grid'),
    pinContainer:    document.getElementById('pin-container'),
    pinInput:        document.getElementById('pin-input'),
    pinLabel:        document.getElementById('pin-label'),
    loginSpinner:    document.getElementById('login-spinner'),

    amountInput:     document.getElementById('amount-input'),
    descInput:       document.getElementById('desc-input'),
    descCounter:     document.getElementById('desc-counter'),
    transactionForm: document.getElementById('transaction-form'),
    btnDeposit:      document.getElementById('btn-deposit'),
    btnWithdraw:     document.getElementById('btn-withdraw'),

    logoutBtn:       document.getElementById('logout-btn'),
    refreshBtn:      document.getElementById('refresh-btn'),
    currentBalance:  document.getElementById('current-balance'),
    historyContainer:document.getElementById('history-container'),
    notificationArea:document.getElementById('notification-area'),
    lastRefreshed:   document.getElementById('last-refreshed'),

    loggedinUser:    document.getElementById('logged-in-user'),
    userAvatarMini:  document.getElementById('user-avatar-mini'),

    // Confirm modal
    confirmModal:    document.getElementById('confirm-modal'),
    confirmCard:     document.getElementById('confirm-modal-card'),
    confirmTitle:    document.getElementById('confirm-title'),
    confirmMessage:  document.getElementById('confirm-message'),
    confirmCancel:   document.getElementById('confirm-cancel'),
    confirmAccept:   document.getElementById('confirm-accept'),

    // Admin modal
    adminGear:       document.getElementById('admin-gear-btn'),
    adminModal:      document.getElementById('admin-modal'),
    adminCard:       document.getElementById('admin-modal-card'),
    adminClose:      document.getElementById('admin-close'),
    adminLoginStep:  document.getElementById('admin-login-step'),
    adminManageStep: document.getElementById('admin-manage-step'),
    adminPinInput:   document.getElementById('admin-pin-input'),
    adminLoginBtn:   document.getElementById('admin-login-btn'),
    adminUserList:   document.getElementById('admin-user-list'),
    newUsername:     document.getElementById('new-username'),
    newPin:          document.getElementById('new-pin'),
    newDisplayName:  document.getElementById('new-display-name'),
    newColor:        document.getElementById('new-color'),
    addUserBtn:      document.getElementById('add-user-btn')
  };
}

// =========================================================
// 4. EVENT BINDINGS
// =========================================================
function bindEvents() {
  // PIN auto-submit
  dom.pinInput.addEventListener('input', handlePinInput);

  // Transaction form (Enter-to-submit + button clicks)
  dom.transactionForm.addEventListener('submit', handleFormSubmit);

  // Description char counter
  dom.descInput.addEventListener('input', updateDescCounter);

  // Logout / refresh
  dom.logoutBtn.addEventListener('click', handleLogout);
  dom.refreshBtn.addEventListener('click', () => fetchDashboardData({ silent: true }));

  // Confirm modal
  dom.confirmCancel.addEventListener('click', closeConfirm);
  dom.confirmAccept.addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    else closeConfirm();
  });
  dom.confirmModal.addEventListener('click', (e) => {
    if (e.target === dom.confirmModal) closeConfirm();
  });

  // Admin modal
  dom.adminGear.addEventListener('click', openAdminModal);
  dom.adminClose.addEventListener('click', closeAdminModal);
  dom.adminModal.addEventListener('click', (e) => {
    if (e.target === dom.adminModal) closeAdminModal();
  });
  dom.adminLoginBtn.addEventListener('click', handleAdminLogin);
  dom.adminPinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAdminLogin();
  });
  dom.addUserBtn.addEventListener('click', handleAddUser);

  // History list (event delegation for void buttons + inline PIN edits)
  dom.historyContainer.addEventListener('click', handleHistoryClick);

  // Admin user list (event delegation)
  dom.adminUserList.addEventListener('click', handleAdminUserListClick);
  dom.adminUserList.addEventListener('keydown', handleAdminUserListKeydown);

  // Auto-refresh when tab becomes visible again
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentUser) {
      fetchDashboardData({ silent: true });
    }
  });
}

// =========================================================
// 5. FORMATTERS & HELPERS
// =========================================================
const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);

const spinnerSvg = `<svg class="animate-spin h-5 w-5 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

const smallSpinnerSvg = `<svg class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

function colorOf(name) {
  return COLOR_MAP[name] || COLOR_MAP[DEFAULT_COLOR];
}

function updateDescCounter() {
  const len = dom.descInput.value.length;
  dom.descCounter.textContent = `${len}/150`;
  dom.descCounter.classList.toggle('text-rose-400', len >= 150);
  dom.descCounter.classList.toggle('text-gray-500', len < 150);
}

// =========================================================
// 6. NOTIFICATIONS (toast)
// =========================================================
let notificationTimeout;
function showNotification(message, type = 'error') {
  clearTimeout(notificationTimeout);

  const palette = {
    error:   { bg: 'bg-rose-500',    icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' },
    success: { bg: 'bg-emerald-500', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>' },
    info:    { bg: 'bg-blue-500',    icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' }
  }[type] || { bg: 'bg-gray-700', icon: '' };

  dom.notificationArea.innerHTML = `
    <div class="${palette.bg} text-white px-6 py-3 rounded-full shadow-lg font-medium text-sm flex items-center gap-2 max-w-[90vw]">
      <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">${palette.icon}</svg>
      <span class="truncate">${message}</span>
    </div>`;

  dom.notificationArea.classList.remove('toast-hidden');
  dom.notificationArea.classList.add('toast-visible');

  notificationTimeout = setTimeout(() => {
    dom.notificationArea.classList.remove('toast-visible');
    dom.notificationArea.classList.add('toast-hidden');
  }, 3200);
}

// =========================================================
// 7. API LAYER
// =========================================================
async function apiCall(options = {}) {
  try {
    const fetchConfig = { method: options.method || 'GET', redirect: 'follow' };

    if (options.method === 'POST') {
      fetchConfig.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      fetchConfig.body = JSON.stringify(options.payload);
    }

    const url = options.method === 'POST'
      ? APP_CONFIG.scriptUrl
      : `${APP_CONFIG.scriptUrl}?action=${options.action || 'data'}`;

    const response = await fetch(url, fetchConfig);
    if (!response.ok) throw new Error(`Network error: ${response.status}`);

    const data = await response.json();
    if (data.status === 'error') throw new Error(data.message || 'Server error.');
    return data;
  } catch (error) {
    // Avoid double-toast for silent calls (caller may handle)
    if (!options.silent) showNotification(error.message || "Failed to reach server.", 'error');
    throw error;
  }
}

// =========================================================
// 8. USER GRID (dynamic)
// =========================================================
async function loadUsers() {
  renderUserGridSkeleton();
  try {
    const data = await apiCall({ method: 'GET', action: 'users', silent: true });
    users = (data.data && data.data.users) || [];
    if (users.length === 0) {
      dom.userGrid.innerHTML = `
        <p class="col-span-2 text-center text-gray-500 text-sm py-6">
          No users yet. Use the admin gear to add one.
        </p>`;
    } else {
      renderUserGrid();
    }
  } catch (err) {
    dom.userGrid.innerHTML = `
      <p class="col-span-2 text-center text-rose-400 text-sm py-6">
        Couldn't load users. Check your connection.
      </p>`;
  }
}

function renderUserGridSkeleton() {
  dom.userGrid.innerHTML = Array(4).fill(0).map(() => `
    <div class="bg-gray-800 border border-gray-700/60 rounded-2xl p-4 flex flex-col items-center gap-3 skeleton">
      <div class="w-12 h-12 rounded-full bg-gray-700"></div>
      <div class="h-3 w-16 bg-gray-700 rounded"></div>
    </div>`).join('');
}

function renderUserGrid() {
  dom.userGrid.innerHTML = '';
  users.forEach(user => {
    const c = colorOf(user.color);
    const initial = (user.displayName || user.username).charAt(0).toUpperCase();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `user-btn bg-gray-800 border border-gray-700/60 rounded-2xl p-4 flex flex-col items-center gap-3 hover:bg-gray-700 transition focus:outline-none`;
    btn.dataset.user = user.username;
    btn.innerHTML = `
      <div class="w-12 h-12 rounded-full ${c.bg} ${c.text} flex items-center justify-center text-xl font-bold border ${c.border}">${initial}</div>
      <span class="text-white font-medium">${escapeHtml(user.displayName || user.username)}</span>`;
    btn.addEventListener('click', () => selectUserForLogin(user.username));
    dom.userGrid.appendChild(btn);
  });
}

function selectUserForLogin(username) {
  const userBtns = dom.userGrid.querySelectorAll('.user-btn');
  userBtns.forEach(b => {
    b.classList.remove('ring-2', 'ring-blue-500', 'bg-gray-700');
    b.classList.add('bg-gray-800');
  });
  const btn = dom.userGrid.querySelector(`[data-user="${CSS.escape(username)}"]`);
  if (btn) {
    btn.classList.remove('bg-gray-800');
    btn.classList.add('ring-2', 'ring-blue-500', 'bg-gray-700');
  }
  selectedUserForLogin = username;
  dom.pinContainer.classList.remove('pin-disabled');
  const user = users.find(u => u.username === username);
  dom.pinLabel.textContent = `Enter PIN for ${user ? (user.displayName || user.username) : username}`;
  dom.pinInput.value = '';
  dom.pinInput.focus();
}

// =========================================================
// 9. AUTH (client-side PIN check, preserves auto-submit UX)
// =========================================================
function handlePinInput(e) {
  const user = users.find(u => u.username === selectedUserForLogin);
  if (!user) return;

  const requiredLength = user.pin.length;
  if (e.target.value.length < requiredLength) return;

  const enteredPin = e.target.value;
  if (enteredPin !== user.pin) {
    dom.pinInput.value = '';
    showNotification("Invalid PIN.", 'error');
    return;
  }

  // PIN correct
  dom.pinInput.blur();
  dom.loginSpinner.classList.remove('hidden');

  currentUser = selectedUserForLogin;
  fetchDashboardData()
    .then(() => {
      dom.globalHeader.classList.add('hidden');
      dom.loginView.classList.add('hidden');
      dom.dashboardView.classList.remove('hidden');

      const u = users.find(x => x.username === currentUser) || {};
      const c = colorOf(u.color);
      dom.loggedinUser.textContent = u.displayName || u.username || currentUser;
      dom.userAvatarMini.textContent = (dom.loggedinUser.textContent).charAt(0).toUpperCase();
      dom.userAvatarMini.className =
        `w-8 h-8 rounded-full ${c.bg} ${c.text} flex items-center justify-center font-bold text-sm border ${c.border}`;
    })
    .catch(() => { currentUser = null; })
    .finally(() => {
      dom.loginSpinner.classList.add('hidden');
      dom.pinInput.value = '';
    });
}

function handleLogout() {
  currentUser = null;
  selectedUserForLogin = null;
  currentBalance = 0;
  dom.amountInput.value = '';
  dom.descInput.value = '';
  updateDescCounter();
  dom.historyContainer.innerHTML = '';
  dom.currentBalance.innerHTML = `<span class="text-2xl text-gray-500 font-medium mr-1">EGP</span>0.00`;
  dom.lastRefreshed.textContent = '';
  dom.dashboardView.classList.add('hidden');
  dom.loginView.classList.remove('hidden');
  dom.globalHeader.classList.remove('hidden');
  dom.userGrid.querySelectorAll('.user-btn').forEach(b => {
    b.classList.remove('ring-2', 'ring-blue-500', 'bg-gray-700');
    b.classList.add('bg-gray-800');
  });
  dom.pinContainer.classList.add('pin-disabled');
  dom.pinLabel.textContent = 'Enter PIN';
  dom.pinInput.value = '';
}

// =========================================================
// 10. DASHBOARD DATA FETCH (with skeleton loaders)
// =========================================================
async function fetchDashboardData(opts = {}) {
  // Show skeletons only when list is empty (don't blank out on silent refreshes)
  if (dom.historyContainer.children.length === 0) {
    renderHistorySkeleton();
  }
  try {
    const data = await apiCall({ method: 'GET', action: 'data', silent: !!opts.silent });
    currentBalance = parseFloat(data.data.currentBalance) || 0;
    renderDashboard(currentBalance, data.data.transactions || []);
    updateLastRefreshed();
  } catch (err) {
    // Leave existing rows in place on silent failures
    if (!opts.silent) throw err;
  }
}

function updateLastRefreshed() {
  const now = new Date();
  dom.lastRefreshed.textContent =
    `Updated ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// =========================================================
// 11. TRANSACTION HANDLING
// =========================================================
function handleFormSubmit(e) {
  e.preventDefault();
  // e.submitter is the clicked submit button (or null if Enter was pressed
  // while focused in an input — in which case default to Deposit).
  const type = (e.submitter && e.submitter.dataset.type) || 'IN';
  const btn = type === 'IN' ? dom.btnDeposit : dom.btnWithdraw;
  handleTransaction(type, btn);
}

async function handleTransaction(type, btnElement) {
  const amountVal = parseFloat(dom.amountInput.value);
  const descVal = dom.descInput.value.trim();

  if (isNaN(amountVal) || amountVal <= 0) {
    return showNotification("Enter a valid amount.", 'error');
  }
  if (type === 'OUT' && !descVal) {
    return showNotification("Description is required for withdrawals.", 'error');
  }
  if (type === 'OUT' && amountVal > currentBalance) {
    return showNotification("Insufficient funds.", 'error');
  }

  const finalDesc = descVal || (type === 'IN' ? 'Deposit' : 'Withdrawal');

  const originalHtml = btnElement.innerHTML;
  btnElement.disabled = true;
  btnElement.innerHTML = spinnerSvg;

  try {
    await apiCall({
      method: 'POST',
      payload: {
        action: 'add',
        user: currentUser,
        type,
        amount: amountVal,
        description: finalDesc
      }
    });
    dom.amountInput.value = '';
    dom.descInput.value = '';
    updateDescCounter();
    await fetchDashboardData({ silent: true });

    // Success feedback: toast + balance flash
    const verb = type === 'IN' ? 'Deposited' : 'Withdrew';
    showNotification(`${verb} ${formatCurrency(amountVal)} EGP`, 'success');
    flashBalance();
  } finally {
    btnElement.disabled = false;
    btnElement.innerHTML = originalHtml;
  }
}

function flashBalance() {
  dom.currentBalance.classList.remove('flash-balance');
  // Force reflow so the animation restarts cleanly
  void dom.currentBalance.offsetWidth;
  dom.currentBalance.classList.add('flash-balance');
}

// =========================================================
// 12. DASHBOARD RENDERING
// =========================================================
function renderDashboard(balance, history) {
  dom.currentBalance.innerHTML =
    `<span class="text-2xl text-gray-500 font-medium mr-1">EGP</span>${formatCurrency(balance)}`;
  dom.historyContainer.innerHTML = '';

  if (history.length === 0) {
    renderEmptyState();
    return;
  }

  history.forEach(item => {
    const isVoided = (item.status === 'VOID') || (item.type === 'VOID');
    const isDeposit = item.type === 'IN';

    const amountColor = isVoided
      ? 'text-gray-600 line-through'
      : (isDeposit ? 'text-emerald-400' : 'text-rose-400');
    const dotColor = isVoided
      ? 'bg-gray-700'
      : (isDeposit ? 'bg-emerald-500' : 'bg-rose-500');
    const sign = isDeposit ? '+' : '-';
    const dateStr = formatDate(item.date);
    const voidInfo = isVoided && item.voidedBy
      ? ` &bull; voided by ${escapeHtml(item.voidedBy)}`
      : '';

    const row = document.createElement('div');
    row.className = `py-3.5 border-b border-gray-800/60 flex justify-between items-center group transition-opacity ${isVoided ? 'opacity-40' : ''}`;

    row.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <div class="w-1 h-8 rounded-full ${dotColor} flex-shrink-0"></div>
        <div class="flex flex-col min-w-0">
          <span class="text-white font-medium text-[15px] leading-tight truncate ${isVoided ? 'line-through' : ''}">
            ${escapeHtml(item.description || '')}
            ${isVoided ? '<span class="text-[10px] text-rose-400 ml-1 font-bold tracking-wider">VOID</span>' : ''}
          </span>
          <span class="text-xs text-gray-500 mt-0.5 truncate">
            ${escapeHtml(item.user || '')} &bull; ${dateStr}${voidInfo}
          </span>
        </div>
      </div>
      <div class="flex items-center gap-3 flex-shrink-0 ml-2">
        <span class="text-base font-bold ${amountColor}">${sign}${formatCurrency(item.amount)}</span>
        ${!isVoided ? `
          <button class="void-btn text-gray-600 hover:text-rose-500 transition-colors p-1.5 focus:outline-none" data-id="${escapeAttr(item.id)}" title="Void Transaction">
            <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>` : `<div class="w-7"></div>`}
      </div>`;
    dom.historyContainer.appendChild(row);
  });
}

function renderHistorySkeleton() {
  dom.historyContainer.innerHTML = Array(5).fill(0).map(() => `
    <div class="py-3.5 border-b border-gray-800/60 flex justify-between items-center skeleton">
      <div class="flex items-center gap-3 flex-1">
        <div class="w-1 h-8 rounded-full bg-gray-700"></div>
        <div class="flex flex-col gap-2 flex-1">
          <div class="h-3 w-2/3 bg-gray-700 rounded"></div>
          <div class="h-2.5 w-1/3 bg-gray-700/70 rounded"></div>
        </div>
      </div>
      <div class="h-4 w-20 bg-gray-700 rounded ml-2"></div>
    </div>`).join('');
}

function renderEmptyState() {
  dom.historyContainer.innerHTML = `
    <div class="flex flex-col items-center justify-center py-12 px-6 text-center">
      <svg class="w-16 h-16 text-gray-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M9 17v-2a4 4 0 014-4h0a4 4 0 014 4v2M9 17H7a2 2 0 01-2-2V7a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2M9 17h6"/>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 9h6"/>
      </svg>
      <p class="text-gray-400 font-medium text-sm">No transactions yet</p>
      <p class="text-gray-600 text-xs mt-1">Your deposits and withdrawals will show up here.</p>
    </div>`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// =========================================================
// 13. VOID FLOW (custom confirm modal + soft-delete)
// =========================================================
let pendingVoidId = null;

function handleHistoryClick(e) {
  const voidBtn = e.target.closest('.void-btn');
  if (!voidBtn || voidBtn.disabled) return;
  const id = voidBtn.getAttribute('data-id');
  pendingVoidId = id;
  openConfirm({
    title: 'Void this transaction?',
    message: 'This can\'t be undone. The amount will be removed from the running balance.',
    onConfirm: () => executeVoid(id)
  });
}

async function executeVoid(transactionId) {
  closeConfirm();
  // Optimistic: disable the void button so it can't be double-tapped
  const btn = dom.historyContainer.querySelector(`.void-btn[data-id="${CSS.escape(transactionId)}"]`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = smallSpinnerSvg;
  }
  try {
    await apiCall({
      method: 'POST',
      payload: { action: 'void', transactionId, user: currentUser }
    });
    await fetchDashboardData({ silent: true });
    showNotification('Transaction voided.', 'success');
    flashBalance();
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`;
    }
  }
}

// =========================================================
// 14. CONFIRM MODAL
// =========================================================
let confirmCallback = null;

function openConfirm({ title, message, onConfirm }) {
  dom.confirmTitle.textContent = title;
  dom.confirmMessage.textContent = message;
  confirmCallback = onConfirm;
  dom.confirmModal.classList.remove('modal-hidden');
  dom.confirmModal.classList.add('modal-visible');
  // Defer card transition for smoothness
  requestAnimationFrame(() => {
    dom.confirmCard.classList.remove('modal-card-hidden');
    dom.confirmCard.classList.add('modal-card-visible');
  });
  dom.confirmAccept.focus();
}

function closeConfirm() {
  dom.confirmCard.classList.remove('modal-card-visible');
  dom.confirmCard.classList.add('modal-card-hidden');
  dom.confirmModal.classList.remove('modal-visible');
  dom.confirmModal.classList.add('modal-hidden');
  confirmCallback = null;
  pendingVoidId = null;
}

// =========================================================
// 15. ADMIN MODAL
// =========================================================
function openAdminModal() {
  dom.adminPinInput.value = '';
  if (adminPin) {
    showAdminManageStep();
  } else {
    dom.adminLoginStep.classList.remove('hidden');
    dom.adminManageStep.classList.add('hidden');
    document.getElementById('admin-modal-title').textContent = 'Admin Access';
    setTimeout(() => dom.adminPinInput.focus(), 100);
  }
  dom.adminModal.classList.remove('modal-hidden');
  dom.adminModal.classList.add('modal-visible');
  requestAnimationFrame(() => {
    dom.adminCard.classList.remove('modal-card-hidden');
    dom.adminCard.classList.add('modal-card-visible');
  });
}

function closeAdminModal() {
  dom.adminCard.classList.remove('modal-card-visible');
  dom.adminCard.classList.add('modal-card-hidden');
  dom.adminModal.classList.remove('modal-visible');
  dom.adminModal.classList.add('modal-hidden');
}

async function handleAdminLogin() {
  const pin = dom.adminPinInput.value.trim();
  if (!pin) return showNotification('Enter the admin PIN.', 'error');

  const btn = dom.adminLoginBtn;
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = smallSpinnerSvg;

  try {
    const res = await apiCall({
      method: 'POST',
      payload: { action: 'verifyAdmin', adminPin: pin }
    });
    adminPin = pin;
    // Use the fresh user list returned by the backend so the admin
    // panel always reflects the latest state, even if another admin
    // edited users in another tab.
    if (res.data && Array.isArray(res.data.users)) {
      users = res.data.users;
    }
    showAdminManageStep();
    showNotification('Admin access granted.', 'success');
  } catch (err) {
    dom.adminPinInput.value = '';
    dom.adminPinInput.focus();
    // Error toast already shown by apiCall (not silent)
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

function showAdminManageStep() {
  dom.adminLoginStep.classList.add('hidden');
  dom.adminManageStep.classList.remove('hidden');
  document.getElementById('admin-modal-title').textContent = 'Manage Users';
  renderAdminUserList();
}

function renderAdminUserList() {
  if (users.length === 0) {
    dom.adminUserList.innerHTML = `<p class="text-gray-500 text-sm py-3 text-center">No users yet.</p>`;
    return;
  }
  dom.adminUserList.innerHTML = '';
  users.forEach(u => {
    const c = colorOf(u.color);
    const initial = (u.displayName || u.username).charAt(0).toUpperCase();
    const row = document.createElement('div');
    row.className = 'bg-gray-900 border border-gray-700/60 rounded-xl p-3 flex items-center gap-3';
    row.dataset.username = u.username;
    row.innerHTML = `
      <div class="w-9 h-9 rounded-full ${c.bg} ${c.text} flex items-center justify-center font-bold text-sm border ${c.border} flex-shrink-0">${initial}</div>
      <div class="flex-1 min-w-0">
        <div class="text-white text-sm font-semibold truncate">${escapeHtml(u.displayName || u.username)}</div>
        <div class="text-gray-500 text-xs truncate">@${escapeHtml(u.username)} &bull; PIN: ${'•'.repeat(u.pin.length || 4)} (${u.pin.length || 4} digits)</div>
      </div>
      <button class="admin-change-pin-btn text-xs font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
        Change PIN
      </button>
      <button class="admin-remove-btn text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
        Remove
      </button>`;
    dom.adminUserList.appendChild(row);
  });
}

function handleAdminUserListClick(e) {
  const row = e.target.closest('[data-username]');
  if (!row) return;
  const username = row.dataset.username;

  if (e.target.closest('.admin-remove-btn')) {
    handleRemoveUser(username, row);
  } else if (e.target.closest('.admin-change-pin-btn')) {
    showInlinePinEdit(row, username);
  }
}

function handleAdminUserListKeydown(e) {
  if (e.key !== 'Enter') return;
  const input = e.target.closest('.inline-pin-input');
  if (!input) return;
  e.preventDefault();
  const row = input.closest('[data-username]');
  saveInlinePin(row, input.value.trim());
}

function showInlinePinEdit(row, username) {
  // Build a new container holding input + save + cancel
  const wrapper = document.createElement('div');
  wrapper.className = 'flex items-center gap-2 flex-shrink-0';
  wrapper.innerHTML = `
    <input type="password" inputmode="numeric" placeholder="new PIN"
           class="inline-pin-input w-24 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs outline-none focus:border-blue-500 tracking-widest">
    <button class="inline-save-btn text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-2.5 py-1.5 rounded-lg">Save</button>
    <button class="inline-cancel-btn text-xs font-semibold text-gray-400 hover:text-gray-200 bg-gray-700/50 px-2.5 py-1.5 rounded-lg">Cancel</button>`;

  // Remove existing right-side buttons and any previous wrapper
  Array.from(row.children).forEach(child => {
    if (child.matches('button') || child.matches('.flex.items-center.gap-2')) {
      child.remove();
    }
  });

  row.appendChild(wrapper);
  const input = wrapper.querySelector('input');
  input.focus();

  wrapper.querySelector('.inline-save-btn').addEventListener('click', () => saveInlinePin(row, input.value.trim()));
  wrapper.querySelector('.inline-cancel-btn').addEventListener('click', () => renderAdminUserList());
}

async function saveInlinePin(row, newPin) {
  const username = row.dataset.username;
  if (!/^\d{3,8}$/.test(newPin)) {
    return showNotification('PIN must be 3-8 digits.', 'error');
  }
  try {
    await apiCall({
      method: 'POST',
      payload: { action: 'updatePin', adminPin, username, newPin }
    });
    showNotification(`PIN updated for ${username}.`, 'success');
    await loadUsers();           // refresh cached users (PINs may have changed)
    renderAdminUserList();
  } catch (err) {
    // toast handled by apiCall
  }
}

async function handleRemoveUser(username, row) {
  // Use custom confirm modal
  openConfirm({
    title: `Remove '${username}'?`,
    message: 'Their past transactions will remain in history, but they will no longer be able to log in.',
    onConfirm: async () => {
      closeConfirm();
      try {
        await apiCall({
          method: 'POST',
          payload: { action: 'removeUser', adminPin, username }
        });
        showNotification(`Removed ${username}.`, 'success');
        await loadUsers();
        renderAdminUserList();
      } catch (err) {
        // toast handled
      }
    }
  });
  // Tweak the confirm button color for destructive remove (already rose, OK)
}

async function handleAddUser() {
  const username    = dom.newUsername.value.trim();
  const pin         = dom.newPin.value.trim();
  const displayName = dom.newDisplayName.value.trim();
  const color       = dom.newColor.value;

  if (!username) return showNotification('Username is required.', 'error');
  if (!/^[a-zA-Z0-9_]{2,20}$/.test(username)) {
    return showNotification('Username: 2-20 chars, letters/numbers/_ only.', 'error');
  }
  if (!/^\d{3,8}$/.test(pin)) {
    return showNotification('PIN must be 3-8 digits.', 'error');
  }

  const btn = dom.addUserBtn;
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = smallSpinnerSvg;

  try {
    await apiCall({
      method: 'POST',
      payload: { action: 'addUser', adminPin, username, pin, color, displayName: displayName || username }
    });
    showNotification(`User '${username}' added.`, 'success');
    dom.newUsername.value = '';
    dom.newPin.value = '';
    dom.newDisplayName.value = '';
    dom.newColor.value = 'blue';
    await loadUsers();
    renderAdminUserList();
  } catch (err) {
    // toast handled
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

// =========================================================
// 16. ESCAPE UTILITIES (prevent HTML injection from sheet data)
// =========================================================
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function escapeAttr(str) { return escapeHtml(str); }
