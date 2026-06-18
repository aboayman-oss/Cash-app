/**
 * Shared Cash Safe — Frontend Logic (v2 — Premium UI/UX)
 *
 * Backend: Google Apps Script (Code.gs) — UNCHANGED
 * Host: GitHub Pages (static)
 *
 * All state remains server-side. The frontend only holds:
 *  - the users list (incl. PINs, for client-side auto-submit UX)
 *  - the current dashboard snapshot (balance + transactions)
 *
 * v2 changes are PURELY UI/UX — no API contracts, no behavior changes:
 *  - PIN dot indicators + numeric keypad
 *  - Count-up balance animation, shimmer sweep on refresh
 *  - Today's net delta on the balance card
 *  - Date-grouped history (Today / Yesterday / This Week / Earlier) with sticky headers
 *  - Spring selection on login grid, stagger entrance animations
 *  - Quick-amount chips, EGP prefix on amount input
 *  - Description autocomplete (session-only memory)
 *  - Haptic feedback (where supported)
 *  - Glassmorphic modals with focus trap + ESC close
 *  - Reduced-motion + safe-area support
 */

// =========================================================
// 1. CONFIG & STATE
// =========================================================
const APP_CONFIG = {
  scriptUrl: 'https://script.google.com/macros/s/AKfycbz9q1WjOBA4csr-opiXVDJVEN2Ny4h63cNn_9KaHGB4PalUy-wBE0IzPUn9MxUrnUeY/exec'
};

// Tailwind color classes for each user avatar + hex for swatch grid.
const COLOR_MAP = {
  blue:    { text: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    ring: 'ring-blue-500',    solid: 'bg-blue-600',    hex: '#3B82F6' },
  indigo:  { text: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/30',  ring: 'ring-indigo-500',  solid: 'bg-indigo-600',  hex: '#6366F1' },
  emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', ring: 'ring-emerald-500', solid: 'bg-emerald-600', hex: '#10B981' },
  amber:   { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   ring: 'ring-amber-500',   solid: 'bg-amber-600',   hex: '#F59E0B' },
  rose:    { text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    ring: 'ring-rose-500',    solid: 'bg-rose-600',    hex: '#F43F5E' },
  purple:  { text: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/30',  ring: 'ring-purple-500',  solid: 'bg-purple-600',  hex: '#A855F7' },
  cyan:    { text: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30',    ring: 'ring-cyan-500',    solid: 'bg-cyan-600',    hex: '#06B6D4' },
  pink:    { text: 'text-pink-400',    bg: 'bg-pink-500/10',    border: 'border-pink-500/30',    ring: 'ring-pink-500',    solid: 'bg-pink-600',    hex: '#EC4899' }
};
const DEFAULT_COLOR = 'blue';

let users = [];                    // [{username, pin, color, displayName}]
let selectedUserForLogin = null;
let currentUser = null;
let currentBalance = 0;
let previousBalance = null;        // for count-up animation + delta
let adminPin = null;               // cached after admin login (session only)

const prefersReducedMotion =
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// =========================================================
// 2. BOOTSTRAP
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
  cacheDom();
  bindEvents();
  buildPinKeypad();
  buildColorSwatches();
  renderPinDots(0);               // show empty dots on first paint
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
    pinDots:         document.getElementById('pin-dots'),
    pinKeypad:       document.getElementById('pin-keypad'),
    loginSpinner:    document.getElementById('login-spinner'),

    amountInput:     document.getElementById('amount-input'),
    descInput:       document.getElementById('desc-input'),
    descCounter:     document.getElementById('desc-counter'),
    descSuggestions: document.getElementById('desc-suggestions'),
    transactionForm: document.getElementById('transaction-form'),
    btnDeposit:      document.getElementById('btn-deposit'),
    btnWithdraw:     document.getElementById('btn-withdraw'),
    quickAmounts:    document.getElementById('quick-amounts'),

    logoutBtn:       document.getElementById('logout-btn'),
    refreshBtn:      document.getElementById('refresh-btn'),
    currentBalance:  document.getElementById('current-balance'),
    balanceAmount:   document.querySelector('.balance-amount'),
    balanceCard:     document.getElementById('balance-card'),
    balanceDelta:    document.getElementById('balance-delta'),
    historyContainer:document.getElementById('history-container'),
    historyWrap:     document.getElementById('history-wrap'),
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
    newColorGrid:    document.getElementById('new-color-grid'),
    addUserBtn:      document.getElementById('add-user-btn')
  };
}

// =========================================================
// 4. EVENT BINDINGS
// =========================================================
function bindEvents() {
  // PIN auto-submit + dot updates
  dom.pinInput.addEventListener('input', handlePinInput);

  // Tap on PIN dots focuses the hidden input
  dom.pinDots.addEventListener('click', () => dom.pinInput.focus());

  // Transaction form (Enter-to-submit + button clicks)
  dom.transactionForm.addEventListener('submit', handleFormSubmit);

  // Description char counter + suggestions
  dom.descInput.addEventListener('input', updateDescCounter);
  dom.descInput.addEventListener('change', rememberDescription);

  // Quick amount chips
  dom.quickAmounts.addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-amt');
    if (!btn) return;
    const amt = parseFloat(btn.dataset.amount);
    const current = parseFloat(dom.amountInput.value) || 0;
    dom.amountInput.value = (current + amt).toFixed(2).replace(/\.00$/, '');
    vibrate(8);
    dom.amountInput.focus();
  });

  // Logout / refresh
  dom.logoutBtn.addEventListener('click', handleLogout);
  dom.refreshBtn.addEventListener('click', () => {
    vibrate(8);
    fetchDashboardData({ silent: true });
  });

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

  // History list (event delegation for void buttons + swipe)
  dom.historyContainer.addEventListener('click', handleHistoryClick);
  dom.historyContainer.addEventListener('touchstart', handleHistoryTouchStart, { passive: true });
  dom.historyContainer.addEventListener('touchmove',  handleHistoryTouchMove,  { passive: false });
  dom.historyContainer.addEventListener('touchend',   handleHistoryTouchEnd);

  // Admin user list (event delegation)
  dom.adminUserList.addEventListener('click', handleAdminUserListClick);
  dom.adminUserList.addEventListener('keydown', handleAdminUserListKeydown);

  // ESC to close modals
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!dom.confirmModal.classList.contains('modal-hidden')) {
      closeConfirm();
    } else if (!dom.adminModal.classList.contains('modal-hidden')) {
      closeAdminModal();
    }
  });

  // Focus trap inside open modals
  document.addEventListener('keydown', handleFocusTrap);

  // Auto-refresh when tab becomes visible again
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentUser) {
      fetchDashboardData({ silent: true });
    }
  });

  // Pull-to-refresh on history area (mobile)
  setupPullToRefresh();
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

function vibrate(pattern) {
  if (prefersReducedMotion) return;
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (_) {}
  }
}

function updateDescCounter() {
  const len = dom.descInput.value.length;
  dom.descCounter.textContent = `${len}/150`;
  dom.descCounter.classList.toggle('text-rose-400', len >= 150);
  dom.descCounter.classList.toggle('text-gray-500', len < 150);
}

// Session-only memory of descriptions for autocomplete
function rememberDescription() {
  const v = dom.descInput.value.trim();
  if (!v) return;
  try {
    const arr = JSON.parse(sessionStorage.getItem('desc-history') || '[]');
    const next = [v, ...arr.filter(x => x !== v)].slice(0, 12);
    sessionStorage.setItem('desc-history', JSON.stringify(next));
    refreshDescSuggestions();
  } catch (_) {}
}
function refreshDescSuggestions() {
  try {
    const arr = JSON.parse(sessionStorage.getItem('desc-history') || '[]');
    dom.descSuggestions.innerHTML =
      arr.map(s => `<option value="${escapeAttr(s)}">`).join('');
  } catch (_) {}
}

// =========================================================
// 6. NOTIFICATIONS (toast)
// =========================================================
let notificationTimeout;
function showNotification(message, type = 'error') {
  clearTimeout(notificationTimeout);

  const palette = {
    error:   { bg: 'bg-rose-500/95 border-rose-400/30',    icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' },
    success: { bg: 'bg-emerald-500/95 border-emerald-400/30', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>' },
    info:    { bg: 'bg-accent/95 border-accent-400/30',    icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>' }
  }[type] || { bg: 'bg-ink-700 border-white/10', icon: '' };

  dom.notificationArea.innerHTML = `
    <div class="${palette.bg} border text-white px-5 py-3 rounded-2xl shadow-card font-medium text-sm flex items-center gap-2.5 max-w-[90vw]">
      <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">${palette.icon}</svg>
      <span class="truncate">${message}</span>
    </div>`;

  dom.notificationArea.classList.remove('toast-hidden');
  dom.notificationArea.classList.add('toast-visible');

  if (type === 'success') vibrate([10, 30, 10]);
  else if (type === 'error') vibrate([30, 40, 30]);

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
    <div class="bg-ink-850 border border-white/5 rounded-2xl p-5 flex flex-col items-center gap-3 skeleton">
      <div class="w-14 h-14 rounded-full bg-ink-700"></div>
      <div class="h-3 w-16 bg-ink-700 rounded"></div>
    </div>`).join('');
}

function renderUserGrid() {
  dom.userGrid.innerHTML = '';
  users.forEach(user => {
    const c = colorOf(user.color);
    const initial = (user.displayName || user.username).charAt(0).toUpperCase();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `user-btn press relative bg-ink-850 border border-white/5 rounded-2xl p-5 flex flex-col items-center gap-3 hover:bg-ink-800 hover:border-white/10 transition focus-ring`;
    btn.dataset.user = user.username;
    btn.innerHTML = `
      <div class="user-avatar w-14 h-14 rounded-full ${c.bg} ${c.text} flex items-center justify-center text-2xl font-bold border-2 ${c.border} transition-all">${initial}</div>
      <span class="text-white font-semibold text-sm">${escapeHtml(user.displayName || user.username)}</span>
      <div class="check-badge absolute top-2 right-2 w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center opacity-0 scale-0 transition-all">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
      </div>`;
    btn.addEventListener('click', () => selectUserForLogin(user.username));
    dom.userGrid.appendChild(btn);
  });
}

function selectUserForLogin(username) {
  const userBtns = dom.userGrid.querySelectorAll('.user-btn');
  userBtns.forEach(b => {
    b.classList.remove('ring-2', 'ring-accent', 'bg-ink-800', 'border-white/10');
    b.classList.add('bg-ink-850', 'border-white/5');
    const avatar = b.querySelector('.user-avatar');
    if (avatar) avatar.classList.remove('pop');
    const badge = b.querySelector('.check-badge');
    if (badge) { badge.classList.add('opacity-0', 'scale-0'); badge.classList.remove('opacity-100', 'scale-100'); }
  });
  const btn = dom.userGrid.querySelector(`[data-user="${CSS.escape(username)}"]`);
  if (btn) {
    btn.classList.remove('bg-ink-850', 'border-white/5');
    btn.classList.add('ring-2', 'ring-accent', 'bg-ink-800', 'border-white/10');
    const avatar = btn.querySelector('.user-avatar');
    if (avatar) {
      avatar.classList.remove('pop');
      void avatar.offsetWidth;
      avatar.classList.add('pop');
    }
    const badge = btn.querySelector('.check-badge');
    if (badge) { badge.classList.remove('opacity-0', 'scale-0'); badge.classList.add('opacity-100', 'scale-100'); }
  }
  selectedUserForLogin = username;
  dom.pinContainer.classList.remove('pin-disabled');
  const user = users.find(u => u.username === username);
  dom.pinLabel.textContent = `Enter PIN for ${user ? (user.displayName || user.username) : username}`;
  dom.pinInput.value = '';
  renderPinDots(0);
  // Delay focus slightly so the click ripple doesn't fight with the keyboard
  setTimeout(() => dom.pinInput.focus(), 80);
}

// =========================================================
// 9. PIN PAD (dots + keypad)
// =========================================================
function buildPinKeypad() {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  dom.pinKeypad.innerHTML = keys.map(k => {
    if (k === '') return `<div></div>`;
    if (k === '⌫') {
      return `<button type="button" data-key="back" aria-label="Delete digit"
        class="press key-btn h-14 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xl font-semibold flex items-center justify-center transition-colors focus-ring">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l4-4h11a2 2 0 012 2v4a2 2 0 01-2 2H7l-4-4z"/></svg>
      </button>`;
    }
    return `<button type="button" data-key="${k}" class="press key-btn h-14 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xl font-semibold flex items-center justify-center transition-colors focus-ring">${k}</button>`;
  }).join('');

  dom.pinKeypad.addEventListener('click', (e) => {
    const btn = e.target.closest('.key-btn');
    if (!btn) return;
    const key = btn.dataset.key;
    if (key === 'back') {
      dom.pinInput.value = dom.pinInput.value.slice(0, -1);
    } else {
      dom.pinInput.value += key;
    }
    vibrate(8);
    dom.pinInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function renderPinDots(filledCount) {
  // Default to 4 dots; expand to user's PIN length once a user is selected
  const user = users.find(u => u.username === selectedUserForLogin);
  const length = user ? (user.pin.length || 4) : 4;
  const filled = Math.min(filledCount, length);
  let html = '';
  for (let i = 0; i < length; i++) {
    const isFilled = i < filled;
    html += `<span class="pin-dot w-3.5 h-3.5 rounded-full transition-all duration-200 ${isFilled ? 'bg-accent scale-110' : 'bg-white/15'}"></span>`;
  }
  dom.pinDots.innerHTML = html;
}

function shakePinDots() {
  dom.pinDots.classList.remove('shake');
  void dom.pinDots.offsetWidth;
  dom.pinDots.classList.add('shake');
}

// =========================================================
// 10. AUTH (client-side PIN check, preserves auto-submit UX)
// =========================================================
function handlePinInput(e) {
  const user = users.find(u => u.username === selectedUserForLogin);
  if (!user) return;

  const value = e.target.value;
  renderPinDots(value.length);

  const requiredLength = user.pin.length;
  if (value.length < requiredLength) return;

  const enteredPin = value;
  if (enteredPin !== user.pin) {
    dom.pinInput.value = '';
    renderPinDots(0);
    shakePinDots();
    vibrate([40, 50, 40]);
    showNotification("Invalid PIN.", 'error');
    return;
  }

  // PIN correct
  dom.pinInput.blur();
  dom.loginSpinner.classList.remove('hidden');
  vibrate(15);

  currentUser = selectedUserForLogin;
  fetchDashboardData()
    .then(() => {
      dom.globalHeader.classList.add('hidden');
      dom.loginView.classList.add('hidden');
      dom.dashboardView.classList.remove('hidden');
      dom.dashboardView.classList.remove('view-enter');
      void dom.dashboardView.offsetWidth;
      dom.dashboardView.classList.add('view-enter');

      const u = users.find(x => x.username === currentUser) || {};
      const c = colorOf(u.color);
      dom.loggedinUser.textContent = u.displayName || u.username || currentUser;
      dom.userAvatarMini.textContent = (dom.loggedinUser.textContent).charAt(0).toUpperCase();
      dom.userAvatarMini.className =
        `w-9 h-9 rounded-xl ${c.bg} ${c.text} flex items-center justify-center font-bold text-sm border ${c.border}`;

      refreshDescSuggestions();
    })
    .catch(() => { currentUser = null; })
    .finally(() => {
      dom.loginSpinner.classList.add('hidden');
      dom.pinInput.value = '';
      renderPinDots(0);
    });
}

function handleLogout() {
  currentUser = null;
  selectedUserForLogin = null;
  previousBalance = null;
  currentBalance = 0;
  dom.amountInput.value = '';
  dom.descInput.value = '';
  updateDescCounter();
  dom.historyContainer.innerHTML = '';
  dom.balanceAmount.textContent = '0.00';
  dom.balanceDelta.classList.add('hidden');
  dom.balanceDelta.textContent = '';
  dom.lastRefreshed.textContent = '';
  dom.dashboardView.classList.add('hidden');
  dom.loginView.classList.remove('hidden');
  dom.loginView.classList.remove('view-enter');
  void dom.loginView.offsetWidth;
  dom.loginView.classList.add('view-enter');
  dom.globalHeader.classList.remove('hidden');
  dom.userGrid.querySelectorAll('.user-btn').forEach(b => {
    b.classList.remove('ring-2', 'ring-accent', 'bg-ink-800', 'border-white/10');
    b.classList.add('bg-ink-850', 'border-white/5');
    const badge = b.querySelector('.check-badge');
    if (badge) { badge.classList.add('opacity-0', 'scale-0'); badge.classList.remove('opacity-100', 'scale-100'); }
  });
  dom.pinContainer.classList.add('pin-disabled');
  dom.pinLabel.textContent = 'Enter PIN';
  dom.pinInput.value = '';
  renderPinDots(0);
}

// =========================================================
// 11. DASHBOARD DATA FETCH (with skeleton loaders)
// =========================================================
async function fetchDashboardData(opts = {}) {
  if (dom.historyContainer.children.length === 0) {
    renderHistorySkeleton();
  }
  try {
    const data = await apiCall({ method: 'GET', action: 'data', silent: !!opts.silent });
    const newBalance = parseFloat(data.data.currentBalance) || 0;
    previousBalance = currentBalance;
    currentBalance = newBalance;
    renderDashboard(newBalance, data.data.transactions || []);
    updateLastRefreshed();
  } catch (err) {
    if (!opts.silent) throw err;
  }
}

function updateLastRefreshed() {
  const now = new Date();
  dom.lastRefreshed.textContent =
    `Updated ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// =========================================================
// 12. TRANSACTION HANDLING
// =========================================================
function handleFormSubmit(e) {
  e.preventDefault();
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
  void dom.currentBalance.offsetWidth;
  dom.currentBalance.classList.add('flash-balance');

  // Shimmer sweep on the balance card
  dom.balanceCard.classList.remove('sweeping');
  void dom.balanceCard.offsetWidth;
  dom.balanceCard.classList.add('sweeping');
  setTimeout(() => dom.balanceCard.classList.remove('sweeping'), 1000);
}

// =========================================================
// 13. DASHBOARD RENDERING
// =========================================================
function renderDashboard(balance, history) {
  // Count-up animation on the balance
  animateCountUp(dom.balanceAmount, previousBalance ?? 0, balance, 600);

  // Today's net delta
  const todayNet = computeTodayNet(history);
  if (todayNet !== 0) {
    dom.balanceDelta.classList.remove('hidden');
    const sign = todayNet > 0 ? '+' : '−';
    const cls = todayNet > 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10';
    dom.balanceDelta.className = `text-[11px] font-semibold tabular px-2 py-0.5 rounded-full ${cls}`;
    dom.balanceDelta.textContent = `${sign}${formatCurrency(Math.abs(todayNet))} today`;
  } else {
    dom.balanceDelta.classList.add('hidden');
    dom.balanceDelta.textContent = '';
  }

  dom.historyContainer.innerHTML = '';

  if (history.length === 0) {
    renderEmptyState();
    return;
  }

  // Group by date label
  const groups = groupHistoryByDate(history);
  const fragment = document.createDocumentFragment();

  groups.forEach(group => {
    const groupWrap = document.createElement('div');
    groupWrap.className = 'history-group';

    const header = document.createElement('div');
    header.className = 'sticky top-0 z-10 py-2 -mx-1 px-1 bg-ink-950/85 backdrop-blur-md';
    header.innerHTML = `<span class="text-[11px] font-bold tracking-[0.2em] text-gray-500 uppercase">${group.label}</span>`;
    groupWrap.appendChild(header);

    const list = document.createElement('div');
    list.className = 'stagger';
    group.items.forEach(item => list.appendChild(buildHistoryRow(item)));
    groupWrap.appendChild(list);

    fragment.appendChild(groupWrap);
  });

  dom.historyContainer.appendChild(fragment);
}

function buildHistoryRow(item) {
  const isVoided = (item.status === 'VOID') || (item.type === 'VOID');
  const isDeposit = item.type === 'IN';

  const amountColor = isVoided
    ? 'text-gray-600 line-through'
    : (isDeposit ? 'text-emerald-400' : 'text-rose-400');
  const sign = isDeposit ? '+' : '−';
  const dateStr = formatDate(item.date);
  const voidInfo = isVoided && item.voidedBy
    ? ` &bull; voided by ${escapeHtml(item.voidedBy)}`
    : '';

  // Actor avatar (mini)
  const actorUser = users.find(u => u.username === item.user);
  const actorInitial = (item.user || '?').charAt(0).toUpperCase();
  const c = actorUser ? colorOf(actorUser.color) : colorOf(DEFAULT_COLOR);

  // Outer wrap holds the swipe-reveal background; inner row translates on swipe.
  const wrap = document.createElement('div');
  wrap.className = 'history-row-wrap relative overflow-hidden';

  if (!isVoided) {
    const bg = document.createElement('div');
    bg.className = 'absolute inset-0 flex items-center justify-end pr-3 pointer-events-none';
    bg.style.background = 'linear-gradient(90deg, transparent 50%, rgba(244,63,94,0.22) 100%)';
    bg.innerHTML = `
      <div class="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center shadow-glow-rose">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      </div>`;
    wrap.appendChild(bg);
  }

  const row = document.createElement('div');
  row.className = `history-row relative z-10 bg-ink-950 py-3.5 border-b border-white/5 flex justify-between items-center group ${isVoided ? 'opacity-40' : ''}`;
  row.dataset.id = item.id;
  row.dataset.voided = isVoided ? '1' : '0';

  row.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <div class="w-9 h-9 rounded-xl ${c.bg} ${c.text} flex items-center justify-center text-sm font-bold border ${c.border} flex-shrink-0">${actorInitial}</div>
        <div class="flex flex-col min-w-0">
          <span class="text-white font-semibold text-[15px] leading-tight truncate ${isVoided ? 'line-through' : ''}">
            ${escapeHtml(item.description || '')}
            ${isVoided ? '<span class="text-[10px] text-rose-400 ml-1 font-bold tracking-wider">VOID</span>' : ''}
          </span>
          <span class="text-xs text-gray-500 mt-0.5 truncate">
            ${escapeHtml(item.user || '')} &bull; ${dateStr}${voidInfo}
          </span>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0 ml-2">
        <span class="text-base font-bold ${amountColor} tabular">${sign}${formatCurrency(item.amount)}</span>
        ${!isVoided ? `
          <button class="void-btn press text-gray-600 hover:text-rose-400 transition-colors p-1.5 rounded-lg focus-ring" data-id="${escapeAttr(item.id)}" title="Void Transaction" aria-label="Void transaction">
            <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>` : `<div class="w-7"></div>`}
      </div>`;

  wrap.appendChild(row);
  return wrap;
}

function renderHistorySkeleton() {
  dom.historyContainer.innerHTML = `
    <div class="stagger">
      ${Array(5).fill(0).map(() => `
        <div class="py-3.5 border-b border-white/5 flex justify-between items-center skeleton">
          <div class="flex items-center gap-3 flex-1">
            <div class="w-9 h-9 rounded-xl bg-ink-700"></div>
            <div class="flex flex-col gap-2 flex-1">
              <div class="h-3 w-2/3 bg-ink-700 rounded"></div>
              <div class="h-2.5 w-1/3 bg-ink-700/70 rounded"></div>
            </div>
          </div>
          <div class="h-4 w-20 bg-ink-700 rounded ml-2"></div>
        </div>`).join('')}
    </div>`;
}

function renderEmptyState() {
  dom.historyContainer.innerHTML = `
    <div class="flex flex-col items-center justify-center py-14 px-6 text-center">
      <div class="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
        <svg class="w-9 h-9 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M9 17v-2a4 4 0 014-4h0a4 4 0 014 4v2M9 17H7a2 2 0 01-2-2V7a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2M9 17h6"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 9h6"/>
        </svg>
      </div>
      <p class="text-gray-300 font-semibold text-sm">No transactions yet</p>
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

// Group transactions into date buckets with friendly labels
function groupHistoryByDate(history) {
  const today    = startOfDay(new Date());
  const yesterday= new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo  = new Date(today); weekAgo.setDate(today.getDate() - 7);

  const groups = [
    { key: 'today',     label: 'Today',      items: [] },
    { key: 'yesterday', label: 'Yesterday',  items: [] },
    { key: 'week',      label: 'This Week',  items: [] },
    { key: 'earlier',   label: 'Earlier',    items: [] }
  ];

  history.forEach(item => {
    const d = new Date(item.date);
    if (isNaN(d.getTime())) { groups[3].items.push(item); return; }
    const day = startOfDay(d);
    if (day.getTime() === today.getTime())      groups[0].items.push(item);
    else if (day.getTime() === yesterday.getTime()) groups[1].items.push(item);
    else if (day.getTime() >= weekAgo.getTime())    groups[2].items.push(item);
    else                                             groups[3].items.push(item);
  });

  return groups.filter(g => g.items.length > 0);
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function computeTodayNet(history) {
  const today = startOfDay(new Date());
  let net = 0;
  history.forEach(item => {
    if (item.status === 'VOID' || item.type === 'VOID') return;
    const d = new Date(item.date);
    if (isNaN(d.getTime())) return;
    if (startOfDay(d).getTime() !== today.getTime()) return;
    net += (item.type === 'IN' ? 1 : -1) * (parseFloat(item.amount) || 0);
  });
  return net;
}

function animateCountUp(el, from, to, duration) {
  if (prefersReducedMotion || from === to) {
    el.textContent = formatCurrency(to);
    return;
  }
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    const val = from + (to - from) * eased;
    el.textContent = formatCurrency(val);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = formatCurrency(to);
  }
  requestAnimationFrame(tick);
}

// =========================================================
// 14. SWIPE-TO-VOID (mobile)
// =========================================================
let swipeState = null;

function handleHistoryTouchStart(e) {
  const row = e.target.closest('.history-row');
  if (!row || row.dataset.voided === '1') return;
  const touch = e.touches[0];
  swipeState = {
    row,
    startX: touch.clientX,
    startY: touch.clientY,
    deltaX: 0,
    active: false
  };
}

function handleHistoryTouchMove(e) {
  if (!swipeState) return;
  const touch = e.touches[0];
  const dx = touch.clientX - swipeState.startX;
  const dy = touch.clientY - swipeState.startY;
  // Horizontal-dominant gesture?
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
    swipeState.active = true;
  }
  if (!swipeState.active) return;
  e.preventDefault();
  const clamped = Math.min(0, Math.max(-100, dx));
  swipeState.deltaX = clamped;
  swipeState.row.style.transform = `translateX(${clamped}px)`;
}

function handleHistoryTouchEnd() {
  if (!swipeState) return;
  const { row, deltaX, active } = swipeState;
  if (active && deltaX < -60) {
    // Trigger void
    row.style.transform = '';
    const id = row.dataset.id;
    openConfirm({
      title: 'Void this transaction?',
      message: 'This can\'t be undone. The amount will be removed from the running balance.',
      onConfirm: () => executeVoid(id)
    });
  } else {
    row.style.transform = '';
  }
  swipeState = null;
}

// =========================================================
// 15. PULL-TO-REFRESH (mobile, on history area)
// =========================================================
function setupPullToRefresh() {
  let ptrStart = null;
  let ptrPulling = false;

  const indicator = document.createElement('div');
  indicator.className = 'ptr-indicator';
  indicator.innerHTML = `<svg class="w-4 h-4 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>`;
  dom.historyWrap.style.position = 'relative';
  dom.historyWrap.appendChild(indicator);

  window.addEventListener('touchstart', (e) => {
    if (window.scrollY > 5 || !currentUser) return;
    ptrStart = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (ptrStart === null) return;
    const dy = e.touches[0].clientY - ptrStart;
    if (dy > 60 && window.scrollY <= 0) {
      ptrPulling = true;
      dom.historyWrap.classList.add('ptr-active');
    }
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (ptrPulling) {
      dom.historyWrap.classList.remove('ptr-active');
      fetchDashboardData({ silent: true });
      vibrate(15);
    }
    ptrStart = null;
    ptrPulling = false;
  });
}

// =========================================================
// 16. VOID FLOW (custom confirm modal + soft-delete)
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
// 17. CONFIRM MODAL
// =========================================================
let confirmCallback = null;

function openConfirm({ title, message, onConfirm }) {
  dom.confirmTitle.textContent = title;
  dom.confirmMessage.textContent = message;
  confirmCallback = onConfirm;
  dom.confirmModal.classList.remove('modal-hidden');
  dom.confirmModal.classList.add('modal-visible');
  requestAnimationFrame(() => {
    dom.confirmCard.classList.remove('modal-card-hidden');
    dom.confirmCard.classList.add('modal-card-visible');
  });
  setTimeout(() => dom.confirmAccept.focus(), 50);
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
// 18. ADMIN MODAL
// =========================================================
function openAdminModal() {
  dom.adminPinInput.value = '';
  if (adminPin) {
    showAdminManageStep();
  } else {
    dom.adminLoginStep.classList.remove('hidden');
    dom.adminManageStep.classList.add('hidden');
    document.querySelector('#admin-modal-title span').textContent = 'Admin Access';
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
    if (res.data && Array.isArray(res.data.users)) {
      users = res.data.users;
    }
    showAdminManageStep();
    showNotification('Admin access granted.', 'success');
  } catch (err) {
    dom.adminPinInput.value = '';
    dom.adminPinInput.focus();
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

function showAdminManageStep() {
  dom.adminLoginStep.classList.add('hidden');
  dom.adminManageStep.classList.remove('hidden');
  document.querySelector('#admin-modal-title span').textContent = 'Manage Users';
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
    row.className = 'bg-ink-900 border border-white/5 rounded-2xl p-3 flex flex-col gap-2.5';
    row.dataset.username = u.username;
    row.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl ${c.bg} ${c.text} flex items-center justify-center font-bold text-sm border ${c.border} flex-shrink-0">${initial}</div>
        <div class="flex-1 min-w-0">
          <div class="text-white text-sm font-semibold truncate">${escapeHtml(u.displayName || u.username)}</div>
          <div class="text-gray-500 text-xs">@${escapeHtml(u.username)} &bull; PIN ${'•'.repeat(u.pin.length || 4)} (${u.pin.length || 4})</div>
        </div>
      </div>
      <div class="flex gap-2 justify-end">
        <button class="press admin-change-pin-btn text-xs font-semibold text-accent-400 hover:text-accent-100 bg-accent/10 hover:bg-accent/20 px-3 py-2 rounded-xl transition-colors focus-ring">
          Change PIN
        </button>
        <button class="press admin-remove-btn text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-2 rounded-xl transition-colors focus-ring">
          Remove
        </button>
      </div>`;
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
  // Find the actions row (second child = the div with the buttons) and replace its contents
  const actionsRow = row.querySelector('.flex.gap-2.justify-end');
  if (!actionsRow) return;

  actionsRow.className = 'flex items-center gap-2 justify-end';
  actionsRow.innerHTML = `
    <input type="password" inputmode="numeric" placeholder="new PIN"
           class="inline-pin-input w-28 bg-ink-900 border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-accent tracking-widest">
    <button class="press inline-save-btn text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-3 py-2 rounded-xl">Save</button>
    <button class="press inline-cancel-btn text-xs font-semibold text-gray-400 hover:text-gray-200 bg-white/5 px-3 py-2 rounded-xl">Cancel</button>`;

  const input = actionsRow.querySelector('input');
  input.focus();

  actionsRow.querySelector('.inline-save-btn').addEventListener('click', () => saveInlinePin(row, input.value.trim()));
  actionsRow.querySelector('.inline-cancel-btn').addEventListener('click', () => renderAdminUserList());
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
    await loadUsers();
    renderAdminUserList();
  } catch (err) {
    // toast handled by apiCall
  }
}

async function handleRemoveUser(username, row) {
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
    setSelectedColor('blue');
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
// 19. COLOR SWATCH GRID (admin: add user)
// =========================================================
function buildColorSwatches() {
  const grid = dom.newColorGrid;
  grid.innerHTML = Object.entries(COLOR_MAP).map(([name, c]) => `
    <button type="button" data-color="${name}"
            class="press swatch-btn relative h-9 w-9 rounded-full border-2 transition-all focus-ring"
            style="background: ${c.hex}33; border-color: ${c.hex}80;"
            aria-label="Pick ${name} color">
      <span class="absolute inset-1.5 rounded-full" style="background: ${c.hex};"></span>
    </button>
  `).join('');

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.swatch-btn');
    if (!btn) return;
    setSelectedColor(btn.dataset.color);
    vibrate(8);
  });

  setSelectedColor('blue');
}

function setSelectedColor(name) {
  dom.newColor.value = name;
  dom.newColorGrid.querySelectorAll('.swatch-btn').forEach(b => {
    const isActive = b.dataset.color === name;
    b.classList.toggle('ring-2', isActive);
    b.classList.toggle('ring-offset-2', isActive);
    b.classList.toggle('ring-offset-ink-850', isActive);
    b.style.transform = isActive ? 'scale(1.1)' : 'scale(1)';
  });
}

// =========================================================
// 20. FOCUS TRAP (for modals)
// =========================================================
function handleFocusTrap(e) {
  if (e.key !== 'Tab') return;
  const openModal = document.querySelector('.modal-visible');
  if (!openModal) return;
  const focusables = openModal.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last  = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// =========================================================
// 21. ESCAPE UTILITIES (prevent HTML injection from sheet data)
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
