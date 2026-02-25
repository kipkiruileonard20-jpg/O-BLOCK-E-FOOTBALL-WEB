/* ═══════════════════════════════════════════════════════════════
   O BLOCK E FOOTBALL — ESPORTS ARENA
   script.js — Full Firebase Integration + App Logic
   ═══════════════════════════════════════════════════════════════

   SETUP INSTRUCTIONS:
   1. Create a Firebase project at https://console.firebase.google.com
   2. Enable Authentication → Email/Password
   3. Enable Realtime Database (start in test mode, then apply rules below)
   4. Register an admin user via Firebase Console or the Auth panel
   5. Copy your Firebase config into the FIREBASE CONFIG section below
   ═══════════════════════════════════════════════════════════════ */

// ══════════════════════════════════════════════════════════════
// FIREBASE CONFIG — REPLACE WITH YOUR OWN VALUES
// ══════════════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL:       "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// ══════════════════════════════════════════════════════════════
// FIREBASE INITIALIZATION
// ══════════════════════════════════════════════════════════════
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.database();

// Database references
const playersRef = db.ref('players');

// ══════════════════════════════════════════════════════════════
// APP STATE
// ══════════════════════════════════════════════════════════════
let currentUser     = null; // Firebase auth user object
let isAdmin         = false; // Is the current user an admin?
let allPlayers      = {};   // Local cache of all player records
let pendingDeleteId = null; // ID of player pending deletion

// OPTIONAL: Set your admin email here for extra UID-based check.
// For Firebase Rules, the admin UID check is the authoritative gate.
const ADMIN_EMAIL = "admin@oblockefootball.com"; // ← CHANGE THIS

// ══════════════════════════════════════════════════════════════
// LANDING PAGE — PARTICLES
// ══════════════════════════════════════════════════════════════
(function initParticles() {
  const container = document.getElementById('particles');
  if (!container) return;

  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const x = Math.random() * 100;
    const dur = 6 + Math.random() * 12;
    const delay = Math.random() * 15;
    const size = 1 + Math.random() * 3;
    const drift = (Math.random() - 0.5) * 200;

    p.style.cssText = `
      left: ${x}%;
      width: ${size}px;
      height: ${size}px;
      animation-duration: ${dur}s;
      animation-delay: -${delay}s;
      --drift: ${drift}px;
      opacity: ${0.3 + Math.random() * 0.7};
    `;
    container.appendChild(p);
  }
})();

// ══════════════════════════════════════════════════════════════
// LANDING PAGE — LIVE STATS PREVIEW
// Pulls live data even on the landing page for the stat counters
// ══════════════════════════════════════════════════════════════
function initLandingStats() {
  playersRef.on('value', (snapshot) => {
    const data = snapshot.val() || {};
    const players = Object.values(data);

    const totalPlayers = players.length;
    const totalMatches = players.reduce((s, p) => s + (p.matches || 0), 0) / 2; // each match counted for 2 players
    const totalGoals   = players.reduce((s, p) => s + (p.goals || 0), 0);

    animateCounter('stat-players', Math.round(totalPlayers));
    animateCounter('stat-matches', Math.round(totalMatches));
    animateCounter('stat-goals',   totalGoals);
  });
}

function animateCounter(elementId, target) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const duration = 1000;
  const startTime = performance.now();

  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (target - start) * ease);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ══════════════════════════════════════════════════════════════
// ENTER ARENA
// ══════════════════════════════════════════════════════════════
function enterArena() {
  const landing = document.getElementById('landing-page');
  const app     = document.getElementById('main-app');

  landing.classList.add('fade-out');

  // Start background music on user gesture (required by browsers)
  startBackgroundMusic();

  setTimeout(() => {
    landing.style.display = 'none';
    app.classList.remove('hidden');
    // Scroll to top of main app
    window.scrollTo(0, 0);
  }, 800);
}

// ══════════════════════════════════════════════════════════════
// AUTH — FIREBASE AUTHENTICATION LISTENER
// ══════════════════════════════════════════════════════════════
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    isAdmin = (user.email === ADMIN_EMAIL);

    // UI: show logged in state
    document.getElementById('user-email-display').textContent = user.email;
    document.getElementById('user-email-display').classList.remove('hidden');
    document.getElementById('btn-login-nav').classList.add('hidden');
    document.getElementById('btn-logout-nav').classList.remove('hidden');

    // Show admin panel if admin
    if (isAdmin) {
      document.getElementById('admin-login-prompt').classList.add('hidden');
      document.getElementById('admin-match-panel').classList.remove('hidden');
      document.getElementById('col-delete-header').textContent = 'DELETE';
    }

    closeAuthModal();
    showToast('✔ Logged in as ' + user.email, 'success');
    sfx.login();
  } else {
    currentUser = null;
    isAdmin = false;

    // UI: show logged out state
    document.getElementById('user-email-display').classList.add('hidden');
    document.getElementById('btn-login-nav').classList.remove('hidden');
    document.getElementById('btn-logout-nav').classList.add('hidden');

    // Show admin login prompt
    document.getElementById('admin-login-prompt').classList.remove('hidden');
    document.getElementById('admin-match-panel').classList.add('hidden');
    document.getElementById('col-delete-header').textContent = '';

    // Re-render leaderboard to hide delete buttons
    renderLeaderboard(allPlayers);
  }
});

// ══════════════════════════════════════════════════════════════
// AUTH MODAL
// ══════════════════════════════════════════════════════════════
function openAuthModal() {
  document.getElementById('auth-modal').classList.remove('hidden');
  document.getElementById('auth-email').focus();
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
  document.getElementById('auth-error').classList.add('hidden');
  document.getElementById('auth-error').textContent = '';
}

function closeModalOnOverlay(event) {
  if (event.target === document.getElementById('auth-modal')) {
    closeAuthModal();
  }
}

function togglePassword() {
  const pw = document.getElementById('auth-password');
  pw.type = pw.type === 'password' ? 'text' : 'password';
}

// ── LOGIN ────────────────────────────────────────────────────
async function loginAdmin() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errDiv   = document.getElementById('auth-error');
  const btn      = document.getElementById('btn-login-submit');

  if (!email || !password) {
    showAuthError('Please enter both email and password.');
    return;
  }

  btn.textContent = '⏳ AUTHENTICATING...';
  btn.disabled = true;

  try {
    await auth.signInWithEmailAndPassword(email, password);
    // onAuthStateChanged handles the rest
  } catch (err) {
    console.error('Login error:', err);
    let msg = 'Authentication failed. Please check your credentials.';
    if (err.code === 'auth/user-not-found')    msg = 'No account found with this email.';
    if (err.code === 'auth/wrong-password')    msg = 'Incorrect password. Try again.';
    if (err.code === 'auth/invalid-email')     msg = 'Invalid email format.';
    if (err.code === 'auth/too-many-requests') msg = 'Too many attempts. Please try later.';
    if (err.code === 'auth/invalid-credential') msg = 'Invalid credentials. Check email and password.';
    showAuthError(msg);
  } finally {
    btn.textContent = '🔐 AUTHENTICATE';
    btn.disabled = false;
  }
}

function showAuthError(msg) {
  const errDiv = document.getElementById('auth-error');
  errDiv.textContent = '⚠ ' + msg;
  errDiv.className = 'form-msg form-msg-error';
  errDiv.classList.remove('hidden');
}

// ── LOGOUT ───────────────────────────────────────────────────
async function logoutUser() {
  try {
    await auth.signOut();
    showToast('👋 Logged out successfully.', 'info');
  } catch (err) {
    console.error('Logout error:', err);
  }
}

// ══════════════════════════════════════════════════════════════
// PLAYER REGISTRATION
// ══════════════════════════════════════════════════════════════
async function registerPlayer() {
  const nameInput = document.getElementById('player-name-input');
  const msgDiv    = document.getElementById('register-msg');
  const name      = nameInput.value.trim();

  // Validate
  if (!name) {
    showFormMsg(msgDiv, '⚠ Please enter your full name.', 'error');
    return;
  }

  if (name.length < 2) {
    showFormMsg(msgDiv, '⚠ Name must be at least 2 characters.', 'error');
    return;
  }

  // Check for duplicate name (case-insensitive)
  const normalizedNew = name.toLowerCase();
  for (const player of Object.values(allPlayers)) {
    if (player.name && player.name.toLowerCase() === normalizedNew) {
      showFormMsg(msgDiv, '⚠ A player with this name already exists.', 'error');
      return;
    }
  }

  const btn = document.getElementById('btn-register');
  btn.textContent = '⏳ REGISTERING...';
  btn.disabled = true;

  try {
    // Push new player to Firebase
    await playersRef.push({
      name:           name,
      goals:          0,
      matches:        0,
      goalDifference: 0,
      points:         0,
      createdAt:      Date.now()
    });

    nameInput.value = '';
    showFormMsg(msgDiv, `✔ ${name} has joined the arena!`, 'success');
    showToast(`⚽ ${name} registered!`, 'success');
    sfx.register();

    // Auto-clear message
    setTimeout(() => msgDiv.classList.add('hidden'), 4000);
  } catch (err) {
    console.error('Registration error:', err);
    showFormMsg(msgDiv, '⚠ Registration failed. Check your connection.', 'error');
  } finally {
    btn.textContent = '⚡ REGISTER PLAYER';
    btn.disabled = false;
  }
}

// Allow pressing Enter to register
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('player-name-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') registerPlayer();
    });
  }
});

// ══════════════════════════════════════════════════════════════
// LIVE LEADERBOARD — REAL-TIME LISTENER
// ══════════════════════════════════════════════════════════════
function initLeaderboard() {
  playersRef.on('value', (snapshot) => {
    const data = snapshot.val() || {};
    allPlayers = data;
    renderLeaderboard(data);
    updateAdminDropdowns(data);
  }, (err) => {
    console.error('Leaderboard error:', err);
    document.getElementById('leaderboard-body').innerHTML = `
      <tr><td colspan="7">
        <div class="empty-state">
          <span class="empty-state-icon">⚠️</span>
          Failed to load data. Check your Firebase config.
        </div>
      </td></tr>
    `;
  });
}

// Sort players: Goals → Goal Difference → Points
function sortPlayers(playersObj) {
  return Object.entries(playersObj)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => {
      if ((b.goals || 0) !== (a.goals || 0)) return (b.goals || 0) - (a.goals || 0);
      if ((b.goalDifference || 0) !== (a.goalDifference || 0)) return (b.goalDifference || 0) - (a.goalDifference || 0);
      return (b.points || 0) - (a.points || 0);
    });
}

function renderLeaderboard(data) {
  const tbody = document.getElementById('leaderboard-body');
  const sorted = sortPlayers(data);

  if (sorted.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="7">
        <div class="empty-state">
          <span class="empty-state-icon">⚽</span>
          NO PLAYERS YET — BE THE FIRST TO JOIN THE ARENA
        </div>
      </td></tr>
    `;
    return;
  }

  const rows = sorted.map((player, index) => {
    const rank = index + 1;
    const rankClass = rank <= 3 ? `row-rank-${rank}` : '';
    const medal = rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
    const initials = getInitials(player.name || 'N/A');
    const gd = player.goalDifference || 0;
    const gdClass = gd > 0 ? 'gd-positive' : gd < 0 ? 'gd-negative' : '';
    const gdDisplay = gd > 0 ? `+${gd}` : `${gd}`;

    const deleteBtn = isAdmin
      ? `<td class="col-actions">
           <button class="btn-delete-row" onclick="initiateDelete('${player.id}', '${escapeHtml(player.name)}')">
             🗑️ DEL
           </button>
         </td>`
      : `<td></td>`;

    return `
      <tr class="${rankClass}" data-player-id="${player.id}">
        <td class="col-rank">
          <div class="rank-cell rank-${rank}">
            ${medal ? `<span class="rank-medal">${medal}</span>` : ''}
            <span class="rank-num">${rank}</span>
          </div>
        </td>
        <td class="col-player">
          <div class="player-cell">
            <div class="player-avatar">${initials}</div>
            <span class="player-name">${escapeHtml(player.name || 'Unknown')}</span>
          </div>
        </td>
        <td class="col-stat stat-cell">${player.matches || 0}</td>
        <td class="col-stat stat-cell goals-cell">${player.goals || 0}</td>
        <td class="col-stat stat-cell ${gdClass}">${gdDisplay}</td>
        <td class="col-stat stat-cell pts-cell">${player.points || 0}</td>
        ${deleteBtn}
      </tr>
    `;
  });

  tbody.innerHTML = rows.join('');
}

// ══════════════════════════════════════════════════════════════
// ADMIN — POPULATE PLAYER DROPDOWNS
// ══════════════════════════════════════════════════════════════
function updateAdminDropdowns(data) {
  const sorted = sortPlayers(data);
  const options = sorted.map(p =>
    `<option value="${p.id}">${escapeHtml(p.name)}</option>`
  ).join('');

  const selectA = document.getElementById('player-a-select');
  const selectB = document.getElementById('player-b-select');

  const currentA = selectA.value;
  const currentB = selectB.value;

  selectA.innerHTML = '<option value="">— Select Player —</option>' + options;
  selectB.innerHTML = '<option value="">— Select Player —</option>' + options;

  // Restore selections if still valid
  if (currentA && data[currentA]) selectA.value = currentA;
  if (currentB && data[currentB]) selectB.value = currentB;
}

// ══════════════════════════════════════════════════════════════
// ADMIN — SUBMIT MATCH RESULT
// ══════════════════════════════════════════════════════════════
async function submitMatchResult() {
  if (!isAdmin) {
    showToast('⚠ Admin access required.', 'error');
    return;
  }

  const playerAId = document.getElementById('player-a-select').value;
  const playerBId = document.getElementById('player-b-select').value;
  const goalsA    = parseInt(document.getElementById('goals-a-input').value) || 0;
  const goalsB    = parseInt(document.getElementById('goals-b-input').value) || 0;
  const msgDiv    = document.getElementById('match-msg');

  // Validate
  if (!playerAId || !playerBId) {
    showFormMsg(msgDiv, '⚠ Please select both players.', 'error');
    return;
  }

  if (playerAId === playerBId) {
    showFormMsg(msgDiv, '⚠ Player A and Player B must be different.', 'error');
    return;
  }

  if (goalsA < 0 || goalsB < 0) {
    showFormMsg(msgDiv, '⚠ Goals cannot be negative.', 'error');
    return;
  }

  if (goalsA > 99 || goalsB > 99) {
    showFormMsg(msgDiv, '⚠ Maximum 99 goals per player per match.', 'error');
    return;
  }

  const playerA = allPlayers[playerAId];
  const playerB = allPlayers[playerBId];

  if (!playerA || !playerB) {
    showFormMsg(msgDiv, '⚠ Invalid player selection.', 'error');
    return;
  }

  // Calculate points
  let ptsA = 0, ptsB = 0;
  if (goalsA > goalsB)       { ptsA = 3; ptsB = 0; } // A wins
  else if (goalsB > goalsA)  { ptsA = 0; ptsB = 3; } // B wins
  else                       { ptsA = 1; ptsB = 1; } // Draw

  // Calculate updated values
  const updatedA = {
    matches:        (playerA.matches || 0) + 1,
    goals:          (playerA.goals || 0) + goalsA,
    goalDifference: (playerA.goalDifference || 0) + (goalsA - goalsB),
    points:         (playerA.points || 0) + ptsA
  };

  const updatedB = {
    matches:        (playerB.matches || 0) + 1,
    goals:          (playerB.goals || 0) + goalsB,
    goalDifference: (playerB.goalDifference || 0) + (goalsB - goalsA),
    points:         (playerB.points || 0) + ptsB
  };

  const btn = document.querySelector('#admin-match-panel .btn-primary');
  if (btn) { btn.textContent = '⏳ SAVING...'; btn.disabled = true; }

  try {
    // Atomic multi-path update
    const updates = {};
    updates[`/players/${playerAId}/matches`]        = updatedA.matches;
    updates[`/players/${playerAId}/goals`]          = updatedA.goals;
    updates[`/players/${playerAId}/goalDifference`] = updatedA.goalDifference;
    updates[`/players/${playerAId}/points`]         = updatedA.points;
    updates[`/players/${playerBId}/matches`]        = updatedB.matches;
    updates[`/players/${playerBId}/goals`]          = updatedB.goals;
    updates[`/players/${playerBId}/goalDifference`] = updatedB.goalDifference;
    updates[`/players/${playerBId}/points`]         = updatedB.points;

    await db.ref().update(updates);

    // Build result message
    let resultLabel = goalsA > goalsB
      ? `${playerA.name} WON`
      : goalsB > goalsA
      ? `${playerB.name} WON`
      : 'DRAW';

    showFormMsg(msgDiv, `✔ ${playerA.name} ${goalsA} : ${goalsB} ${playerB.name} — ${resultLabel}`, 'success');
    showToast(`⚽ Match saved: ${playerA.name} ${goalsA}–${goalsB} ${playerB.name}`, 'success');
    sfx.matchSubmit();
    // Play goal sfx if goals were scored
    if (goalsA > 0 || goalsB > 0) setTimeout(() => sfx.goal(), 300);

    // Highlight updated rows
    setTimeout(() => {
      highlightRow(playerAId);
      highlightRow(playerBId);
    }, 100);

    // Reset form
    document.getElementById('goals-a-input').value = '0';
    document.getElementById('goals-b-input').value = '0';
    document.getElementById('player-a-select').value = '';
    document.getElementById('player-b-select').value = '';

    setTimeout(() => msgDiv.classList.add('hidden'), 5000);
  } catch (err) {
    console.error('Match update error:', err);
    showFormMsg(msgDiv, '⚠ Failed to save match. Check permissions.', 'error');
  } finally {
    if (btn) { btn.textContent = '⚡ SUBMIT RESULT'; btn.disabled = false; }
  }
}

// ══════════════════════════════════════════════════════════════
// ADMIN — DELETE PLAYER
// ══════════════════════════════════════════════════════════════
function initiateDelete(playerId, playerName) {
  if (!isAdmin) return;
  pendingDeleteId = playerId;
  document.getElementById('confirm-msg-text').textContent =
    `Remove "${playerName}" from the arena? This cannot be undone.`;
  document.getElementById('confirm-modal').classList.remove('hidden');
}

function closeConfirmModal() {
  pendingDeleteId = null;
  document.getElementById('confirm-modal').classList.add('hidden');
}

function closeConfirmOnOverlay(event) {
  if (event.target === document.getElementById('confirm-modal')) {
    closeConfirmModal();
  }
}

async function confirmDelete() {
  if (!pendingDeleteId || !isAdmin) return;

  const playerId   = pendingDeleteId;
  const playerName = allPlayers[playerId]?.name || 'Player';

  const btn = document.getElementById('btn-confirm-delete');
  btn.textContent = '⏳ DELETING...';
  btn.disabled = true;

  try {
    await db.ref(`players/${playerId}`).remove();
    sfx.delete();
    showToast(`🗑️ ${playerName} removed from the arena.`, 'info');
    closeConfirmModal();
  } catch (err) {
    console.error('Delete error:', err);
    showToast('⚠ Failed to delete player. Check permissions.', 'error');
  } finally {
    btn.textContent = '🗑️ DELETE';
    btn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════

// Get initials from a name
function getInitials(name) {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}

// Escape HTML to prevent XSS
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

// Show a form message
function showFormMsg(el, text, type) {
  el.textContent = text;
  el.className = `form-msg form-msg-${type}`;
  el.classList.remove('hidden');
}

// Highlight a leaderboard row after update
function highlightRow(playerId) {
  const row = document.querySelector(`tr[data-player-id="${playerId}"]`);
  if (row) {
    row.classList.add('row-updated');
    setTimeout(() => row.classList.remove('row-updated'), 2000);
  }
}

// Show toast notification
let toastTimer = null;
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 400);
  }, 3500);
}

// ══════════════════════════════════════════════════════════════
// TICKER UPDATE — DYNAMIC
// ══════════════════════════════════════════════════════════════
function updateTicker(players) {
  const sorted = sortPlayers(players);
  if (sorted.length === 0) return;

  const top = sorted[0];
  const ticker = `⚡ LIVE SCORES UPDATING IN REAL TIME &nbsp;&nbsp;&nbsp; 🏆 LEADING: ${escapeHtml(top.name)} — ${top.goals || 0} GOALS &nbsp;&nbsp;&nbsp; 🔥 O BLOCK E FOOTBALL ARENA &nbsp;&nbsp;&nbsp; ⚽ ${sorted.length} PLAYERS COMPETING &nbsp;&nbsp;&nbsp;`;

  const el = document.getElementById('ticker-text');
  if (el) el.innerHTML = ticker;
}

// ══════════════════════════════════════════════════════════════
// AUDIO ENGINE
// Background music + Web Audio API sound effects
// ══════════════════════════════════════════════════════════════

/* ── Configuration ─────────────────────────────────────────── */
// Change this filename if your MP3 has a different name.
// Place your MP3 at:  music/background.mp3
const MUSIC_TRACK_NAME = "O BLOCK E FOOTBALL — ARENA THEME";

/* ── State ─────────────────────────────────────────────────── */
let audioCtx       = null;   // Web Audio API context (lazy-init)
let musicIsPlaying = false;
let musicIsMuted   = false;
let playerExpanded = true;
let progressTimer  = null;

/* ── DOM refs ──────────────────────────────────────────────── */
const bgMusic        = () => document.getElementById('bg-music');
const mpProgressFill = () => document.getElementById('mp-progress-fill');
const mpProgressThumb= () => document.getElementById('mp-progress-thumb');
const mpTimeCurrent  = () => document.getElementById('mp-time-current');
const mpTimeTotal    = () => document.getElementById('mp-time-total');
const mpPlayIcon     = () => document.getElementById('mp-play-icon');
const mpDisc         = () => document.getElementById('mp-disc');
const mpViz          = () => document.getElementById('mp-visualizer');
const mpPillBars     = () => document.getElementById('mp-pill-bars');
const mpPanel        = () => document.getElementById('mp-panel');
const mpChevron      = () => document.getElementById('mp-chevron');

/* ── Initialize Web Audio Context (lazy) ──────────────────── */
function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

/* ════════════════════════════════════════════════════════════
   SOUND EFFECTS — Pure Web Audio API synthesis
   No extra files needed. Sounds generated in real time.
   ════════════════════════════════════════════════════════════ */
const sfx = {

  // Short blip for button interactions
  click() {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } catch(e) {}
  },

  // Ascending chime — player registered
  register() {
    try {
      const ctx = getAudioCtx();
      const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
      notes.forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'triangle';
        const t = ctx.currentTime + i * 0.12;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.start(t);
        osc.stop(t + 0.28);
      });
    } catch(e) {}
  },

  // Dramatic crowd-roar style — GOAL scored
  goal() {
    try {
      const ctx = getAudioCtx();

      // Whistling lead
      [880, 1047, 1319, 1568].forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        const t = ctx.currentTime + i * 0.08;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.05, t + 0.15);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.22, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t);
        osc.stop(t + 0.4);
      });

      // Bass thud
      const bass = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bass.connect(bassGain); bassGain.connect(ctx.destination);
      bass.type = 'sine';
      bass.frequency.setValueAtTime(120, ctx.currentTime);
      bass.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.4);
      bassGain.gain.setValueAtTime(0.35, ctx.currentTime);
      bassGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      bass.start(ctx.currentTime);
      bass.stop(ctx.currentTime + 0.55);

      // Crowd noise (white noise burst)
      const bufSize = ctx.sampleRate * 0.5;
      const buffer  = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data    = buffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.06;
      const noise  = ctx.createBufferSource();
      const nGain  = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      noise.buffer = buffer;
      filter.type = 'bandpass';
      filter.frequency.value = 1200;
      filter.Q.value = 0.5;
      noise.connect(filter); filter.connect(nGain); nGain.connect(ctx.destination);
      nGain.gain.setValueAtTime(1, ctx.currentTime + 0.1);
      nGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      noise.start(ctx.currentTime + 0.1);
    } catch(e) {}
  },

  // Login / success sound
  login() {
    try {
      const ctx = getAudioCtx();
      const notes = [523, 659, 784]; // C E G major chord
      notes.forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        const t = ctx.currentTime + i * 0.07;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.start(t);
        osc.stop(t + 0.45);
      });
    } catch(e) {}
  },

  // Descending sweep — delete action
  delete() {
    try {
      const ctx = getAudioCtx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(500, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.38);
    } catch(e) {}
  },

  // Match submitted — power-up sound
  matchSubmit() {
    try {
      const ctx = getAudioCtx();
      // Arpeggio + synth hit
      [261, 329, 392, 523, 659, 784].forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = i < 3 ? 'square' : 'triangle';
        const t = ctx.currentTime + i * 0.06;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.1, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.22);
      });
    } catch(e) {}
  }
};

/* ════════════════════════════════════════════════════════════
   BACKGROUND MUSIC PLAYER
   ════════════════════════════════════════════════════════════ */

// Called from enterArena() — auto-starts music
function startBackgroundMusic() {
  const music = bgMusic();
  if (!music) return;

  music.volume = (parseInt(document.getElementById('mp-volume')?.value || 60)) / 100;

  // Show music player widget
  const player = document.getElementById('music-player');
  if (player) player.classList.remove('hidden');

  // Set track name
  const nameEl = document.getElementById('mp-track-name');
  if (nameEl) nameEl.textContent = MUSIC_TRACK_NAME;

  // Try to play
  const playPromise = music.play();
  if (playPromise !== undefined) {
    playPromise.then(() => {
      setPlayingState(true);
    }).catch(() => {
      // Browser autoplay blocked — player shows as paused, user clicks to play
      setPlayingState(false);
    });
  }

  // Bind progress tracking
  music.addEventListener('timeupdate', updateProgress);
  music.addEventListener('loadedmetadata', () => {
    if (mpTimeTotal()) mpTimeTotal().textContent = formatTime(music.duration);
  });

  // Bind progress bar click
  const bar = document.querySelector('.mp-progress-bar');
  if (bar) {
    bar.addEventListener('click', (e) => {
      const rect = bar.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      music.currentTime = ratio * (music.duration || 0);
      sfx.click();
    });
  }
}

function setPlayingState(playing) {
  musicIsPlaying = playing;

  const playIcon = mpPlayIcon();
  if (playIcon) playIcon.textContent = playing ? '⏸' : '▶';

  const disc = mpDisc();
  if (disc) {
    playing ? disc.classList.add('spinning') : disc.classList.remove('spinning');
  }

  const viz = mpViz();
  if (viz) {
    playing ? viz.classList.add('playing') : viz.classList.remove('playing');
  }

  const pillBars = mpPillBars();
  if (pillBars) {
    playing ? pillBars.classList.add('playing') : pillBars.classList.remove('playing');
  }
}

function togglePlay() {
  sfx.click();
  const music = bgMusic();
  if (!music) return;

  if (musicIsPlaying) {
    music.pause();
    setPlayingState(false);
  } else {
    music.play().then(() => setPlayingState(true)).catch(() => {});
  }
}

function toggleMute() {
  sfx.click();
  const music = bgMusic();
  if (!music) return;

  musicIsMuted = !musicIsMuted;
  music.muted = musicIsMuted;

  const btn = document.getElementById('mp-btn-mute');
  if (btn) btn.textContent = musicIsMuted ? '🔇' : '🔊';
}

function setVolume(val) {
  const music = bgMusic();
  if (music) music.volume = val / 100;
  // Update slider gradient fill
  const slider = document.getElementById('mp-volume');
  if (slider) {
    slider.style.background = `linear-gradient(to right, var(--neon-blue) ${val}%, rgba(255,255,255,0.1) ${val}%)`;
  }
}

function updateProgress() {
  const music = bgMusic();
  if (!music || !music.duration) return;

  const pct = (music.currentTime / music.duration) * 100;

  const fill = mpProgressFill();
  if (fill) fill.style.width = pct + '%';

  const thumb = mpProgressThumb();
  if (thumb) thumb.style.left = pct + '%';

  const cur = mpTimeCurrent();
  if (cur) cur.textContent = formatTime(music.currentTime);

  const tot = mpTimeTotal();
  if (tot && music.duration) tot.textContent = formatTime(music.duration);
}

function formatTime(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function toggleMusicPlayer() {
  sfx.click();
  playerExpanded = !playerExpanded;
  const panel   = mpPanel();
  const chevron = mpChevron();
  if (panel)   panel.classList.toggle('collapsed', !playerExpanded);
  if (chevron) chevron.classList.toggle('collapsed', !playerExpanded);
}

/* ── Wire sfx to existing app actions ──────────────────────── */
// We wrap key functions to add sound effects after Firebase logic runs.

// Intercept button clicks globally for subtle click sfx
document.addEventListener('click', (e) => {
  const el = e.target.closest('button, .btn-enter, .btn-nav');
  if (el && !el.classList.contains('mp-btn') && !el.id?.startsWith('mp-')) {
    sfx.click();
  }
}, true);

// ══════════════════════════════════════════════════════════════
// INIT — START EVERYTHING
// ══════════════════════════════════════════════════════════════
(function init() {
  // Init volume slider gradient
  setTimeout(() => setVolume(60), 100);
  // Start landing stats listener
  initLandingStats();

  // Start live leaderboard
  initLeaderboard();

  // Watch for player data to update ticker
  playersRef.on('value', (snapshot) => {
    const data = snapshot.val() || {};
    updateTicker(data);
  });
})();

/* ═══════════════════════════════════════════════════════════════════════════
   FIREBASE REALTIME DATABASE SECURITY RULES
   Copy these into your Firebase Console → Realtime Database → Rules

   {
     "rules": {
       "players": {
         ".read": true,
         ".write": "auth != null && auth.token.email === 'admin@oblockefootball.com'",
         "$playerId": {
           ".write": "auth != null && auth.token.email === 'admin@oblockefootball.com'"
         }
       }
     }
   }

   For stronger UID-based security (recommended for production):
   {
     "rules": {
       "players": {
         ".read": true,
         ".write": "auth != null && auth.uid === 'YOUR_ADMIN_UID_HERE'"
       }
     }
   }

   To find your admin UID:
   → Firebase Console → Authentication → Users → copy the UID column

   ═══════════════════════════════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════════════════════════════
   AUDIO ENGINE — MUSIC PLAYER + SOUND EFFECTS
   ═══════════════════════════════════════════════════════════════════════════

   HOW TO ADD YOUR OWN MUSIC:
   1. Create a folder called "music" in your project root
   2. Drop your MP3 file in: music/background.mp3
   3. Change MUSIC_TRACK_NAME below to match your song title
   4. Done! The player will auto-play when the user enters the arena.

   ═══════════════════════════════════════════════════════════════════════════ */

// ── CONFIG ──────────────────────────────────────────────────────────────────
const MUSIC_TRACK_NAME = "O BLOCK E FOOTBALL — ARENA THEME"; // ← Change to your song name
const MUSIC_DEFAULT_VOLUME = 0.6; // 0.0 to 1.0

// ── STATE ───────────────────────────────────────────────────────────────────
let musicReady    = false; // true once audio has loaded enough to play
let musicPlaying  = false;
let musicMuted    = false;
let playerExpanded = true;
let progressInterval = null;

// Web Audio API context (for sound effects — lazily created on first interaction)
let audioCtx = null;

// ── DOM REFS ─────────────────────────────────────────────────────────────────
const bgMusic       = () => document.getElementById('bg-music');
const mpPlayer      = () => document.getElementById('music-player');
const mpPanel       = () => document.getElementById('mp-panel');
const mpPillBars    = () => document.getElementById('mp-pill-bars');
const mpChevron     = () => document.getElementById('mp-chevron');
const mpDisc        = () => document.getElementById('mp-disc');
const mpPlayIcon    = () => document.getElementById('mp-play-icon');
const mpMuteIcon    = () => document.getElementById('mp-mute-icon');
const mpProgressFill  = () => document.getElementById('mp-progress-fill');
const mpProgressThumb = () => document.getElementById('mp-progress-thumb');
const mpTimeCurrent   = () => document.getElementById('mp-time-current');
const mpTimeTotal     = () => document.getElementById('mp-time-total');
const mpViz           = () => document.getElementById('mp-visualizer');
const mpTrackName     = () => document.getElementById('mp-track-name');


// ══════════════════════════════════════════════════════════════════════════════
// INIT MUSIC PLAYER — called from enterArena()
// ══════════════════════════════════════════════════════════════════════════════
function initMusicPlayer() {
  const music  = bgMusic();
  const player = mpPlayer();

  // Set track name from config
  if (mpTrackName()) mpTrackName().textContent = MUSIC_TRACK_NAME;

  // Set initial volume
  music.volume = MUSIC_DEFAULT_VOLUME;
  document.getElementById('mp-volume').value = MUSIC_DEFAULT_VOLUME * 100;

  // Show player with slide-in animation
  player.classList.remove('hidden');
  requestAnimationFrame(() => player.classList.add('slide-in'));

  // Listen for when audio has loaded enough to play
  music.addEventListener('canplay', () => { musicReady = true; }, { once: true });

  // Update total duration once metadata loads
  music.addEventListener('loadedmetadata', () => {
    if (mpTimeTotal()) mpTimeTotal().textContent = formatTime(music.duration);
  });

  // Handle case where file can't be found
  music.addEventListener('error', () => {
    console.warn('🎵 Music file not found. Place your MP3 at: music/background.mp3');
    if (mpTrackName()) mpTrackName().textContent = '⚠ No music file found';
    if (mpPillBars()) mpPillBars().classList.add('paused');
  });

  // Auto-play (browsers require user gesture — Enter Arena click counts!)
  startMusic();

  // Start progress updater
  startProgressUpdater();
}


// ══════════════════════════════════════════════════════════════════════════════
// PLAY / PAUSE
// ══════════════════════════════════════════════════════════════════════════════
function startMusic() {
  const music = bgMusic();

  music.play().then(() => {
    musicPlaying = true;
    updatePlayState(true);
  }).catch((err) => {
    // Auto-play blocked — user must click play manually
    console.warn('Auto-play blocked by browser. User must click play.', err);
    musicPlaying = false;
    updatePlayState(false);
  });
}

function togglePlay() {
  const music = bgMusic();
  playSfx('click');

  if (musicPlaying) {
    music.pause();
    musicPlaying = false;
    updatePlayState(false);
  } else {
    music.play().then(() => {
      musicPlaying = true;
      updatePlayState(true);
    }).catch(console.warn);
  }
}

function updatePlayState(playing) {
  const icon    = mpPlayIcon();
  const disc    = mpDisc();
  const bars    = mpPillBars();
  const viz     = mpViz();

  if (icon) icon.textContent = playing ? '⏸' : '▶';

  if (disc) {
    if (playing) disc.classList.remove('paused');
    else         disc.classList.add('paused');
  }

  if (bars) {
    if (playing) bars.classList.remove('paused');
    else         bars.classList.add('paused');
  }

  if (viz) {
    if (playing) viz.classList.remove('paused');
    else         viz.classList.add('paused');
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// MUTE
// ══════════════════════════════════════════════════════════════════════════════
function toggleMute() {
  const music = bgMusic();
  musicMuted = !musicMuted;
  music.muted = musicMuted;
  playSfx('click');

  const icon = mpMuteIcon();
  if (icon) icon.textContent = musicMuted ? '🔇' : '🔊';
}


// ══════════════════════════════════════════════════════════════════════════════
// VOLUME
// ══════════════════════════════════════════════════════════════════════════════
function setVolume(value) {
  const music = bgMusic();
  const vol   = value / 100;
  music.volume = vol;

  // Update mute icon based on volume level
  const icon = mpMuteIcon();
  if (icon) {
    if (vol === 0)      icon.textContent = '🔇';
    else if (vol < 0.4) icon.textContent = '🔈';
    else                icon.textContent = '🔊';
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// SEEK — click on progress bar to jump
// ══════════════════════════════════════════════════════════════════════════════
function seekMusic(event) {
  const music = bgMusic();
  if (!music.duration) return;

  const bar   = document.getElementById('mp-progress-bar');
  const rect  = bar.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const ratio  = Math.max(0, Math.min(1, clickX / rect.width));
  music.currentTime = ratio * music.duration;
  playSfx('click');
}


// ══════════════════════════════════════════════════════════════════════════════
// PROGRESS BAR UPDATER
// ══════════════════════════════════════════════════════════════════════════════
function startProgressUpdater() {
  progressInterval = setInterval(() => {
    const music = bgMusic();
    if (!music || !music.duration) return;

    const pct = (music.currentTime / music.duration) * 100;

    const fill  = mpProgressFill();
    const thumb = mpProgressThumb();
    const cur   = mpTimeCurrent();

    if (fill)  fill.style.width = pct + '%';
    if (thumb) thumb.style.left = pct + '%';
    if (cur)   cur.textContent  = formatTime(music.currentTime);
  }, 500);
}


// ══════════════════════════════════════════════════════════════════════════════
// EXPAND / COLLAPSE PLAYER PANEL
// ══════════════════════════════════════════════════════════════════════════════
function toggleMusicPlayer() {
  const player = mpPlayer();
  playerExpanded = !playerExpanded;

  if (playerExpanded) {
    player.classList.remove('collapsed');
  } else {
    player.classList.add('collapsed');
  }

  playSfx('click');
}


// ══════════════════════════════════════════════════════════════════════════════
// FORMAT TIME — seconds → m:ss
// ══════════════════════════════════════════════════════════════════════════════
function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}


// ══════════════════════════════════════════════════════════════════════════════
// WEB AUDIO API — SOUND EFFECTS ENGINE
// All SFX are synthesized in-browser — no extra files needed!
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Initialize or reuse the AudioContext.
 * Must be called from a user gesture (already satisfied by button clicks).
 */
function getAudioCtx() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not supported in this browser.');
      return null;
    }
  }
  // Resume if suspended (some browsers suspend on init)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Master SFX dispatcher.
 * sfxType: 'click' | 'register' | 'goal' | 'delete' | 'login' | 'error'
 */
function playSfx(sfxType) {
  const ctx = getAudioCtx();
  if (!ctx) return;

  switch (sfxType) {
    case 'click':    sfxClick(ctx);    break;
    case 'register': sfxRegister(ctx); break;
    case 'goal':     sfxGoal(ctx);     break;
    case 'delete':   sfxDelete(ctx);   break;
    case 'login':    sfxLogin(ctx);    break;
    case 'error':    sfxError(ctx);    break;
    default: break;
  }
}

/* ── Individual SFX ── */

/** Short UI click tick */
function sfxClick(ctx) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(900, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.06);
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.1);
}

/** Upward chime — player registered */
function sfxRegister(ctx) {
  const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    const t = ctx.currentTime + i * 0.12;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);

    osc.start(t);
    osc.stop(t + 0.4);
  });
}

/** Triumphant goal fanfare — match submitted */
function sfxGoal(ctx) {
  // Kick drum
  const kick  = ctx.createOscillator();
  const kGain = ctx.createGain();
  kick.connect(kGain);
  kGain.connect(ctx.destination);
  kick.type = 'sine';
  kick.frequency.setValueAtTime(180, ctx.currentTime);
  kick.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.3);
  kGain.gain.setValueAtTime(0.5, ctx.currentTime);
  kGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
  kick.start(ctx.currentTime);
  kick.stop(ctx.currentTime + 0.4);

  // Ascending melody
  const melody = [523, 659, 784, 880, 1047];
  melody.forEach((freq, i) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'triangle';
    const t = ctx.currentTime + 0.1 + i * 0.1;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.15, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);

    osc.start(t);
    osc.stop(t + 0.35);
  });

  // High shimmer
  const shimmer  = ctx.createOscillator();
  const sGain    = ctx.createGain();
  shimmer.connect(sGain);
  sGain.connect(ctx.destination);
  shimmer.type = 'square';
  shimmer.frequency.setValueAtTime(2093, ctx.currentTime + 0.5);
  sGain.gain.setValueAtTime(0, ctx.currentTime + 0.5);
  sGain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.53);
  sGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
  shimmer.start(ctx.currentTime + 0.5);
  shimmer.stop(ctx.currentTime + 1.0);
}

/** Descending warning — delete action */
function sfxDelete(ctx) {
  const notes = [400, 300, 200];
  notes.forEach((freq, i) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sawtooth';
    const t = ctx.currentTime + i * 0.15;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);

    osc.start(t);
    osc.stop(t + 0.25);
  });
}

/** Two-tone access granted — login success */
function sfxLogin(ctx) {
  const notes = [440, 660];
  notes.forEach((freq, i) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    const t = ctx.currentTime + i * 0.18;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);

    osc.start(t);
    osc.stop(t + 0.35);
  });
}

/** Buzzer — error / validation failure */
function sfxError(ctx) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'square';
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  osc.frequency.setValueAtTime(180, ctx.currentTime + 0.1);
  osc.frequency.setValueAtTime(220, ctx.currentTime + 0.2);

  gain.gain.setValueAtTime(0.06, ctx.currentTime);
  gain.gain.setValueAtTime(0.06, ctx.currentTime + 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.4);
}


/* ═══════════════════════════════════════════════════════════════════════════
   HOOK SFX INTO EXISTING APP FUNCTIONS
   (Patch key functions to emit sounds at the right moments)
   ═══════════════════════════════════════════════════════════════════════════ */

// Wrap openAuthModal to play click SFX
const _origOpenAuthModal = openAuthModal;
window.openAuthModal = function() {
  playSfx('click');
  _origOpenAuthModal();
};

// Wrap closeAuthModal
const _origCloseAuthModal = closeAuthModal;
window.closeAuthModal = function() {
  playSfx('click');
  _origCloseAuthModal();
};

// Wrap closeConfirmModal
const _origCloseConfirmModal = closeConfirmModal;
window.closeConfirmModal = function() {
  playSfx('click');
  _origCloseConfirmModal();
};

// Wrap logoutUser
const _origLogoutUser = logoutUser;
window.logoutUser = async function() {
  playSfx('click');
  await _origLogoutUser();
};

// Wrap initiateDelete — play delete warning SFX when confirm modal opens
const _origInitiateDelete = initiateDelete;
window.initiateDelete = function(id, name) {
  playSfx('delete');
  _origInitiateDelete(id, name);
};

// Wrap confirmDelete — additional delete SFX on confirm
const _origConfirmDelete = confirmDelete;
window.confirmDelete = async function() {
  playSfx('delete');
  await _origConfirmDelete();
};

// Extend auth state change to play login SFX
const _origOnStateChange = auth.onAuthStateChanged.bind(auth);
auth.onAuthStateChanged((user) => {
  // SFX is only meaningful on state transitions, not initial load
  // (handled by wrapping loginAdmin below)
});

// Wrap loginAdmin to play success SFX
const _origLoginAdmin = loginAdmin;
window.loginAdmin = async function() {
  await _origLoginAdmin();
  // Note: sfxLogin fires via onAuthStateChanged after successful sign-in
};

// Hook the Firebase auth state to fire login SFX
// We use a flag to avoid playing on page load
let authInitialized = false;
auth.onAuthStateChanged((user) => {
  if (!authInitialized) { authInitialized = true; return; }
  if (user) playSfx('login');
});

// Wrap registerPlayer to play register SFX on success
const _origRegisterPlayer = registerPlayer;
window.registerPlayer = async function() {
  await _origRegisterPlayer();
  // SFX fires if the register message shows success
  setTimeout(() => {
    const msg = document.getElementById('register-msg');
    if (msg && !msg.classList.contains('hidden') && msg.classList.contains('form-msg-success')) {
      playSfx('register');
    } else if (msg && !msg.classList.contains('hidden') && msg.classList.contains('form-msg-error')) {
      playSfx('error');
    }
  }, 100);
};

// Wrap submitMatchResult to play goal SFX on success
const _origSubmitMatchResult = submitMatchResult;
window.submitMatchResult = async function() {
  await _origSubmitMatchResult();
  setTimeout(() => {
    const msg = document.getElementById('match-msg');
    if (msg && !msg.classList.contains('hidden') && msg.classList.contains('form-msg-success')) {
      playSfx('goal');
    } else if (msg && !msg.classList.contains('hidden') && msg.classList.contains('form-msg-error')) {
      playSfx('error');
    }
  }, 100);
};

// Add click SFX to Enter Arena button
const _origEnterArena = enterArena;
window.enterArena = function() {
  playSfx('login'); // Cinematic "access granted" feel
  _origEnterArena();
  setTimeout(() => initMusicPlayer(), 600); // Start music after transition
};
