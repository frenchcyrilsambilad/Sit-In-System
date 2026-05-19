/* ============================================================
   CCS Sit-in Monitoring System — script.js
   Shared helpers for auth pages (login, registration)
   ============================================================ */

/* Theme */
const CCS_THEME_KEY = 'ccs_theme';
let ccsThemeClickBound = false;

function getSavedTheme() {
  return localStorage.getItem(CCS_THEME_KEY) === 'dark' ? 'dark' : 'light';
}

function ensureThemeStylesheet() {
  if (document.getElementById('ccs-theme-styles')) return;
  const link = document.createElement('link');
  link.id = 'ccs-theme-styles';
  link.rel = 'stylesheet';
  link.href = 'theme.css?v=4';
  document.head.appendChild(link);
}

function updateThemeToggleButtons(theme) {
  document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
    const isDark = theme === 'dark';
    btn.innerHTML = `<i class="fa ${isDark ? 'fa-sun' : 'fa-moon'}" aria-hidden="true"></i>`;
    btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', String(isDark));
  });
}

function applyTheme(theme) {
  const safeTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', safeTheme);
  document.body?.classList.toggle('dark-mode', safeTheme === 'dark');
  updateThemeToggleButtons(safeTheme);
  return safeTheme;
}

function setTheme(theme) {
  const safeTheme = theme === 'dark' ? 'dark' : 'light';
  localStorage.setItem(CCS_THEME_KEY, safeTheme);
  applyTheme(safeTheme);
  window.dispatchEvent(new CustomEvent('ccs-theme-change', { detail: { theme: safeTheme } }));
  return safeTheme;
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || getSavedTheme();
  return setTheme(current === 'dark' ? 'light' : 'dark');
}

function bindThemeToggleClicks() {
  if (ccsThemeClickBound) return;
  ccsThemeClickBound = true;
  document.addEventListener('click', event => {
    const btn = event.target.closest?.('[data-theme-toggle]');
    if (!btn) return;
    event.preventDefault();
    toggleTheme();
  });
}

function createThemeToggleButton(extraClass = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `theme-toggle-btn${extraClass ? ` ${extraClass}` : ''}`;
  btn.dataset.themeToggle = 'true';
  return btn;
}

function setupThemeToggle() {
  ensureThemeStylesheet();
  bindThemeToggleClicks();

  const studentActions = document.querySelector('.student-nav-actions');
  if (studentActions && !studentActions.querySelector('[data-theme-toggle]')) {
    studentActions.prepend(createThemeToggleButton());
  }

  document.querySelectorAll('.dash-navbar .nav-links').forEach(list => {
    if (list.closest('.dash-navbar')?.querySelector('[data-theme-toggle]')) return;
    const item = document.createElement('li');
    item.className = 'theme-toggle-item';
    item.appendChild(createThemeToggleButton());
    const logout = list.querySelector('.btn-logout-nav')?.closest('li');
    list.insertBefore(item, logout || list.firstChild);
  });

  document.querySelectorAll('.navbar').forEach(nav => {
    if (nav.querySelector('[data-theme-toggle]')) return;
    const navbarNav = nav.querySelector('.navbar-nav');
    if (navbarNav) {
      const item = document.createElement('li');
      item.className = 'nav-item theme-toggle-item';
      item.appendChild(createThemeToggleButton());
      navbarNav.appendChild(item);
    }
  });

  applyTheme(getSavedTheme());
  document.body?.classList.add('theme-ready');
}

ensureThemeStylesheet();
applyTheme(getSavedTheme());
bindThemeToggleClicks();
document.addEventListener('DOMContentLoaded', setupThemeToggle);

/* ── HELPERS ── */
function setCurrentUser(user) {
  localStorage.setItem('ccs_current_user', JSON.stringify(user));
}
function getCurrentUser() {
  return JSON.parse(localStorage.getItem('ccs_current_user') || 'null');
}
function escapeAttr(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}
function enhanceStudentNavbar() {
  const nav = document.querySelector('.student-shell .dash-navbar, .student-home-page .dash-navbar');
  if (!nav || nav.dataset.enhanced === 'true') return;

  const user = getCurrentUser() || {};
  const currentPage = (window.location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();
  const fullName = [user.firstname, user.lastname].filter(Boolean).join(' ').trim() || 'Student';
  const firstName = user.firstname || fullName.split(' ')[0] || 'Student';
  const initials = [user.firstname, user.lastname]
    .filter(Boolean)
    .map(part => String(part).trim().charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'ST';
  const remaining = Number.isFinite(Number(user.sitin_remaining)) ? Number(user.sitin_remaining) : null;
  const profileImage = user.profilePic
    ? `<img src="${escapeAttr(user.profilePic)}" alt="" class="student-nav-avatar-img">`
    : `<span>${escapeAttr(initials)}</span>`;

  const links = [
    ['dashboard.html', 'fa-house', 'Home'],
    ['reservation.html', 'fa-calendar-check', 'Reservation'],
    ['labstatus.html', 'fa-desktop', 'Lab Status'],
    ['history.html', 'fa-clock-rotate-left', 'History'],
    ['leaderboard.html', 'fa-trophy', 'Leaderboard'],
    ['summary.html', 'fa-chart-simple', 'My Summary']
  ];

  nav.dataset.enhanced = 'true';
  nav.setAttribute('aria-label', 'Student navigation');
  nav.innerHTML = `
    <a class="student-nav-brand" href="dashboard.html" aria-label="CCS Sit-in Portal home">
      <img src="static/ccslogo.png" alt="" class="student-nav-logo">
      <span>
        <strong>CCS Sit-in Portal</strong>
        <small>Student</small>
      </span>
    </a>
    <button class="nav-hamburger" id="nav-hamburger" type="button" aria-label="Open navigation" aria-controls="nav-links" aria-expanded="false">
      <i class="fa fa-bars"></i>
    </button>
    <ul class="nav-links student-nav-links" id="nav-links">
      ${links.map(([href, icon, label]) => {
        const active = currentPage === href;
        return `<li><a href="${href}"${active ? ' class="active" aria-current="page"' : ''}><i class="fa ${icon}"></i> <span class="nav-label">${label}</span></a></li>`;
      }).join('')}
    </ul>
    <div class="student-nav-actions">
      <button type="button" class="theme-toggle-btn" data-theme-toggle aria-label="Switch theme" title="Switch theme"></button>
      ${remaining === null ? '' : `
        <div class="student-session-chip" title="Remaining sit-in sessions">
          <i class="fa fa-circle-check"></i>
          <span>${remaining} left</span>
        </div>`}
      <div class="dropdown student-notification">
        <button type="button" id="bell-link" class="student-icon-btn" aria-label="Open notifications">
          <i class="fa fa-bell"></i>
          <span id="bell-badge" class="student-bell-badge">0</span>
        </button>
        <div class="dropdown-menu" id="notification-menu">
          <a href="#">No new notifications</a>
        </div>
      </div>
      <div class="dropdown student-profile-menu">
        <button type="button" class="student-profile-trigger" id="student-profile-trigger" aria-haspopup="true" aria-expanded="false">
          <span class="student-nav-avatar">${profileImage}</span>
          <span class="student-profile-copy">
            <strong>${escapeAttr(firstName)}</strong>
            <small>${escapeAttr(user.idNum || 'Student')}</small>
          </span>
          <i class="fa fa-chevron-down"></i>
        </button>
        <div class="student-profile-dropdown" id="student-profile-menu">
          <div class="student-profile-card">
            <span class="student-nav-avatar large">${profileImage}</span>
            <strong>${escapeAttr(fullName)}</strong>
            <small>${escapeAttr(user.course || user.idNum || 'Student account')}</small>
          </div>
          <a href="editprofile.html"${currentPage === 'editprofile.html' ? ' aria-current="page"' : ''}><i class="fa fa-pen-to-square"></i> Edit Profile</a>
          <a href="login.html" class="btn-logout-nav" onclick="localStorage.removeItem('ccs_current_user')"><i class="fa fa-right-from-bracket"></i> Log out</a>
        </div>
      </div>
    </div>
  `;
  window.dispatchEvent(new CustomEvent('student-navbar-enhanced'));
}
enhanceStudentNavbar();
function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.classList.remove('success');
}
function showSuccess(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.classList.add('success');
}
function hideAlert(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

/* ── TOGGLE PASSWORD VISIBILITY ── */
function togglePass(inputId, iconEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const icon = iconEl.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  } else {
    input.type = 'password';
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  }
}

/* ── REGISTRATION ── */
async function handleRegister() {
  hideAlert('reg-error');
  hideAlert('reg-success');

  const lastname = document.getElementById('reg-lastname')?.value.trim();
  const firstname = document.getElementById('reg-firstname')?.value.trim();
  const middlename = document.getElementById('reg-middlename')?.value.trim();
  const idNum = document.getElementById('reg-id')?.value.trim();
  const email = document.getElementById('reg-email')?.value.trim();
  const course = document.getElementById('reg-course')?.value;
  const level = document.getElementById('reg-level')?.value;
  const address = document.getElementById('reg-address')?.value.trim();
  const pass = document.getElementById('reg-pass')?.value;
  const pass2 = document.getElementById('reg-pass2')?.value;

  /* Validation */
  if (!lastname || !firstname || !idNum || !email || !pass || !pass2 || !address) {
    showError('reg-error', 'Please fill in all required fields.');
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    showError('reg-error', 'Please enter a valid email address.');
    return;
  }
  if (pass.length < 6) {
    showError('reg-error', 'Password must be at least 6 characters.');
    return;
  }
  if (pass !== pass2) {
    showError('reg-error', 'Passwords do not match.');
    return;
  }

  try {
    const res = await fetch('api/auth.php?action=register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNum, firstname, lastname, middlename, email, password: pass, level, course, address })
    });
    const data = await res.json();
    if (data.success) {
      showSuccess('reg-success', data.message + ' Redirecting...');
      setTimeout(() => { window.location.href = 'login.html'; }, 1800);
    } else {
      showError('reg-error', data.message || 'Registration failed.');
    }
  } catch (err) {
    showError('reg-error', 'Server connection failed.');
  }
}

/* ── LOGIN ── */
async function handleLogin() {
  hideAlert('login-error');

  const idNum = document.getElementById('login-id')?.value.trim();
  const pass = document.getElementById('login-pass')?.value;

  if (!idNum || !pass) {
    showError('login-error', 'Please enter your ID Number and password.');
    return;
  }

  try {
    const res = await fetch('api/auth.php?action=login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: idNum, password: pass })
    });
    const data = await res.json();

    if (data.success) {
      const remember = document.getElementById('remember-me')?.checked;
      if (remember) {
        localStorage.setItem('ccs_remember_id', idNum);
      } else {
        localStorage.removeItem('ccs_remember_id');
      }

      // Check role directly from the database response
      if (data.role === 'admin') {
        sessionStorage.setItem('ccs_admin_logged_in', 'true');
        if (data.csrf_token) sessionStorage.setItem('ccs_admin_csrf', data.csrf_token);
        window.location.href = 'admin_dashboard.html';
      } else {
        // We still save the non-sensitive profile state to localStorage purely for the UI to use
        setCurrentUser(data.user);
        sessionStorage.setItem('just_logged_in', 'true');
        window.location.href = 'dashboard.html';
      }
    } else {
      showError('login-error', data.message || 'Invalid credentials!');
    }
  } catch (err) {
    showError('login-error', 'Server connection failed.');
  }
}

/* ── PRE-FILL REMEMBERED ID ON LOGIN PAGE ── */
window.addEventListener('DOMContentLoaded', () => {
  const rememberedId = localStorage.getItem('ccs_remember_id');
  const loginInput = document.getElementById('login-id');
  const rememberBox = document.getElementById('remember-me');

  if (rememberedId && loginInput) {
    loginInput.value = rememberedId;
    if (rememberBox) rememberBox.checked = true;
  }

  /* ── HAMBURGER MENU TOGGLE ── */
  const hamburger = document.getElementById('nav-hamburger');
  const navLinks = document.getElementById('nav-links');
  const profileTrigger = document.getElementById('student-profile-trigger');
  const profileMenu = document.getElementById('student-profile-menu');

  if (profileTrigger && profileMenu) {
    profileTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = profileMenu.classList.toggle('open');
      profileTrigger.setAttribute('aria-expanded', String(isOpen));
    });

    profileMenu.addEventListener('click', (e) => e.stopPropagation());
  }

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navLinks.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', String(isOpen));
      hamburger.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
      hamburger.innerHTML = isOpen
        ? '<i class="fa fa-xmark"></i>'
        : '<i class="fa fa-bars"></i>';
    });

    // Close menu when clicking a link
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        if (link.id === 'bell-link' || link.closest('#notification-menu')) return;
        navLinks.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.setAttribute('aria-label', 'Open navigation');
        hamburger.innerHTML = '<i class="fa fa-bars"></i>';
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!navLinks.contains(e.target) && !hamburger.contains(e.target)) {
        navLinks.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.setAttribute('aria-label', 'Open navigation');
        hamburger.innerHTML = '<i class="fa fa-bars"></i>';
      }
    });
  }

  document.addEventListener('click', () => {
    if (profileTrigger && profileMenu) {
      profileMenu.classList.remove('open');
      profileTrigger.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (profileTrigger && profileMenu) {
      profileMenu.classList.remove('open');
      profileTrigger.setAttribute('aria-expanded', 'false');
    }
    if (hamburger && navLinks) {
      navLinks.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.setAttribute('aria-label', 'Open navigation');
      hamburger.innerHTML = '<i class="fa fa-bars"></i>';
    }
  });
});
