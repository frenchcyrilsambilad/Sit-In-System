/* ============================================================
   admin.js â€” Admin Dashboard Logic
   Extracted from admin_dashboard.html inline <script>
   ============================================================ */

let adminCsrfToken = sessionStorage.getItem('ccs_admin_csrf') || '';
const nativeFetch = window.fetch.bind(window);
window.fetch = (resource, options = {}) => {
  const url = typeof resource === 'string' ? resource : (resource?.url || '');
  if ((url.includes('api/admin.php') || url.includes('api/lab_software.php')) && adminCsrfToken) {
    options = { ...options };
    options.headers = { ...(options.headers || {}), 'X-CSRF-Token': adminCsrfToken };
  }
  return nativeFetch(resource, options);
};

async function ensureAdminSession() {
  try {
    const res = await nativeFetch('api/admin.php?action=session', { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Admin session required.');
    adminCsrfToken = data.csrf_token || adminCsrfToken;
    if (adminCsrfToken) sessionStorage.setItem('ccs_admin_csrf', adminCsrfToken);
    sessionStorage.setItem('ccs_admin_logged_in', 'true');
    return true;
  } catch (e) {
    sessionStorage.removeItem('ccs_admin_logged_in');
    sessionStorage.removeItem('ccs_admin_csrf');
    window.location.href = 'login.html';
    return false;
  }
}

// â”€â”€ NOTIFICATION MODAL â”€â”€
function showNotify(message, type = 'error', customTitle = '') {
  const modal = document.getElementById('notify-modal');
  const icon = document.getElementById('notify-icon');
  const title = document.getElementById('notify-title');
  const kicker = document.getElementById('notify-kicker');
  const body = document.getElementById('notify-body');
  const btn = document.getElementById('notify-btn');
  const notifyTypes = {
    error: { title: 'Error', icon: 'fa-circle-xmark', kicker: 'Action needed', action: 'Review' },
    warning: { title: 'Warning', icon: 'fa-triangle-exclamation', kicker: 'Please check this first', action: 'Got it' },
    success: { title: 'Success', icon: 'fa-circle-check', kicker: 'Completed successfully', action: 'Done' },
    info: { title: 'Notice', icon: 'fa-circle-info', kicker: 'For your information', action: 'Got it' }
  };
  const safeType = notifyTypes[type] ? type : 'info';

  modal.classList.remove('notify-error', 'notify-warning', 'notify-success', 'notify-info');
  modal.classList.add(`notify-${safeType}`);
  icon.innerHTML = `<i class="fa ${notifyTypes[safeType].icon}"></i>`;
  title.textContent = customTitle || notifyTypes[safeType].title;
  kicker.textContent = notifyTypes[safeType].kicker;
  body.textContent = message;
  btn.textContent = notifyTypes[safeType].action;
  modal.style.display = 'flex';
  setTimeout(() => btn?.focus(), 0);
}

function closeNotify() {
  document.getElementById('notify-modal').style.display = 'none';
}

// Close notify on overlay click
document.getElementById('notify-modal').addEventListener('click', function(e) {
  if (e.target === this) closeNotify();
});

document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  const checkin = document.getElementById('resv-checkin-modal');
  if (checkin && checkin.style.display === 'flex') {
    closeCheckinReservationModal();
    return;
  }
  const notify = document.getElementById('notify-modal');
  if (notify && notify.style.display === 'flex') {
    closeNotify();
    return;
  }
  const search = document.getElementById('search-modal');
  if (search && search.style.display === 'flex') closeSearchModal();
});

// â”€â”€ STATE â”€â”€
let stPage = 1, sitPage = 1, recPage = 1;
let pendingSitinUser = null, pendingDeleteId = null;
let recordQuickFilter = 'done';
let currentRecordRows = [];
let allRecordRows = [];

function applyAdminNavState(collapsed) {
  document.body.classList.toggle('admin-nav-collapsed', collapsed);
  const btn = document.querySelector('.admin-nav-toggle');
  if (btn) {
    btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    btn.innerHTML = collapsed ? '<i class="fa fa-angles-right"></i>' : '<i class="fa fa-angles-left"></i>';
  }
}

function toggleAdminNav() {
  const collapsed = !document.body.classList.contains('admin-nav-collapsed');
  localStorage.setItem('ccs_admin_nav_collapsed', collapsed ? '1' : '0');
  applyAdminNavState(collapsed);
}

applyAdminNavState(localStorage.getItem('ccs_admin_nav_collapsed') === '1');

function setupAdminNavTooltips() {
  document.querySelectorAll('.dash-navbar .nav-links a').forEach(link => {
    const label = link.querySelector('.nav-label')?.textContent?.trim();
    if (label) link.dataset.tip = label;
  });
}

// â”€â”€ LOGOUT: end active sit-ins and deduct sessions â”€â”€
async function adminLogout() {
  try {
    const res = await fetch('api/admin.php?action=get_records', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      const active = data.records.filter(r => r.status.toLowerCase() === 'active');
      if (active.length) {
        if (!confirm(`There are ${active.length} active sit-in(s). Logging out will time-out all of them. Continue?`)) return false;
        await Promise.all(active.map(s => endSitin(s.sitId, true)));
      }
    }
  } catch (e) { console.error('Admin action failed', e); }
  sessionStorage.removeItem('ccs_admin_logged_in');
  sessionStorage.removeItem('ccs_admin_csrf');
  try { await nativeFetch('api/auth.php?action=logout', { method: 'POST' }); } catch (e) { console.error('Admin action failed', e); }
  return true;
}

// â”€â”€ NAV â”€â”€
function showSection(name, el) {
  document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
  const sec = document.getElementById('section-' + name);
  if (sec) {
    sec.style.display = 'flex';
    sec.style.flexDirection = 'column';
  }
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
  
  if (el) {
    el.classList.add('active');
  } else {
    const link = document.querySelector(`.nav-links a[onclick*="showSection('${name}'"]`);
    if(link) link.classList.add('active');
  }

  // Update URL hash so the browser shows the current section
  history.replaceState(null, '', '#' + name);

  if (name === 'students') { stPage = 1; renderStudents(); }
  if (name === 'sitin') { sitPage = 1; renderCurrentSitin(); }
  if (name === 'records') { recPage = 1; renderRecords(); }
  if (name === 'home') { loadStats(); renderAnnouncements(); }
  if (name === 'feedback') loadFeedbacks();
  if (name === 'reports') renderReports();
  if (name === 'reservation') initReservationTab();
  if (name === 'labsoftware') loadLabSoftwareAdmin();
  if (name === 'leaderboard') loadAdminLeaderboard();
  if (name === 'rewards') loadRewardsLeaderboard();
  if (name === 'analytics') loadAnalytics();
}

// â”€â”€ STATS â”€â”€
async function loadStats() {
  try {
    const res = await fetch('api/admin.php?action=get_stats', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      document.getElementById('stat-registered').textContent = data.stats.students;
      document.getElementById('stat-current').textContent = data.stats.active;
      document.getElementById('stat-total').textContent = data.stats.total;
      updateNavBadge('nav-sitin-badge', data.stats.active);
      updateNavBadge('nav-reservation-badge', data.stats.reserved);
      renderCourseChart(data.stats.purposes || {});
    }
  } catch (e) {
    console.error('Failed to load admin stats', e);
    showNotify('Unable to load dashboard stats.', 'error');
  }
}

function updateNavBadge(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const count = Number(value || 0);
  el.textContent = count > 99 ? '99+' : String(count);
  el.style.display = count > 0 ? 'inline-flex' : 'none';
}

async function loadTodayDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const dateEl = document.getElementById('today-dashboard-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  try {
    const [recordsRes, feedbackRes] = await Promise.all([
      fetch('api/admin.php?action=get_records', { method: 'POST' }),
      fetch('api/admin.php?action=get_feedbacks', { method: 'POST' })
    ]);
    const recordsData = await recordsRes.json();
    const feedbackData = await feedbackRes.json();
    if (!recordsData.success) throw new Error(recordsData.message || 'Records failed');
    const records = recordsData.records || [];
    const todayRecords = records.filter(r => recordDateValue(r) === today);
    const active = todayRecords.filter(r => (r.status || '').toLowerCase() === 'active').length;
    const pending = todayRecords.filter(r => (r.status || '').toLowerCase() === 'reserved').length;
    const occupied = todayRecords.filter(r => ['active', 'reserved'].includes((r.status || '').toLowerCase()) && r.pc_number).length;
    const feedbacks = (feedbackData.success ? feedbackData.feedbacks : []).slice(0, 3);

    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    set('today-active', active);
    set('today-pending', pending);
    set('today-available', Math.max(0, 200 - occupied));
    set('today-feedback', feedbacks.length);

    const list = document.getElementById('today-feedback-list');
    if (list) {
      list.innerHTML = feedbacks.length ? feedbacks.map(f => `
        <div class="today-feedback-item">
          <strong>${escapeHtml([f.firstname, f.lastname].filter(Boolean).join(' ') || f.idNum || 'Student')}</strong>
          <span>${escapeHtml(f.message || '')}</span>
        </div>`).join('') : `<div class="today-empty">No recent feedback yet.</div>`;
    }
  } catch (e) {
    console.error('Failed to load today dashboard', e);
  }
}

// â”€â”€ CHART â€” Current Sit-in Purpose Distribution â”€â”€
let _chart = null;
function renderCourseChart(counts) {
  const canvas = document.getElementById('courseChart');
  if (!canvas) return;
  const wrap = canvas.parentElement;

  const labels = Object.keys(counts);
  const data = Object.values(counts);

  if (_chart) { _chart.destroy(); _chart = null; }

  // No active sit-ins â†’ show empty state, hide canvas
  if (!labels.length) {
    canvas.style.display = 'none';
    if (!wrap.querySelector('.chart-empty')) {
      const msg = document.createElement('div');
      msg.className = 'chart-empty';
      msg.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#aaa;font-size:0.92rem;font-weight:600;gap:0.5rem;';
      msg.innerHTML = '<i class="fa fa-chart-pie" style="font-size:2.4rem;opacity:0.3;"></i><span>No active sit-in sessions</span>';
      wrap.appendChild(msg);
    }
    return;
  }

  // Remove empty state if it was shown before
  const emptyEl = wrap.querySelector('.chart-empty');
  if (emptyEl) emptyEl.remove();
  canvas.style.display = '';

  const palette = [
    '#4a1d8f', '#e8a817', '#27ae60', '#e74c3c',
    '#3498db', '#f39c12', '#9b59b6', '#1abc9c',
    '#e67e22', '#2ecc71', '#c0392b', '#2980b9'
  ];
  const colors = labels.map((_, i) => palette[i % palette.length]);

  const ctx = canvas.getContext('2d');
  _chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: '#fff',
        borderWidth: 2,
        hoverOffset: 12
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { family: 'Nunito', size: 12, weight: '700' },
            padding: 12,
            boxWidth: 12,
            generateLabels(chart) {
              const ds = chart.data.datasets[0];
              return chart.data.labels.map((label, i) => ({
                text: `${label} (${ds.data[i]})`,
                fillStyle: ds.backgroundColor[i],
                strokeStyle: '#fff',
                lineWidth: 2,
                index: i
              }));
            }
          }
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total ? Math.round(ctx.parsed / total * 100) : 0;
              return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// â”€â”€ ANALYTICS MODULE â”€â”€
async function loadAnalytics() {
  try {
    syncAnalyticsChartDefaults();
    const res = await fetch('api/admin.php?action=get_stats', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      document.getElementById('analytics-stat-registered').textContent = data.stats.students;
      document.getElementById('analytics-stat-current').textContent = data.stats.active;
      document.getElementById('analytics-stat-total').textContent = data.stats.total;
      renderAnalyticsCourseChart(data.stats.purposes || {});
      renderAnalyticsTimeChart(data.stats.over_time || {});
      renderAnalyticsLabChart(data.stats.labs || {});
    }
  } catch (e) { console.error('Admin action failed', e); }
}

let analyticsChartDefaults = {
  fontFamily: "'Nunito', 'DM Sans', sans-serif",
  color: '#6f5c8f',
  gridColor: '#eee6fb'
};

function syncAnalyticsChartDefaults() {
  const styles = getComputedStyle(document.body);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  analyticsChartDefaults = {
    fontFamily: "'Nunito', 'DM Sans', sans-serif",
    color: styles.getPropertyValue('--admin-muted').trim() || (isDark ? '#b8accd' : '#6f5c8f'),
    gridColor: styles.getPropertyValue('--admin-line').trim() || (isDark ? 'rgba(207, 190, 255, .16)' : '#eee6fb')
  };
}

window.addEventListener('ccs-theme-change', () => {
  syncAnalyticsChartDefaults();
  const analyticsSection = document.getElementById('section-analytics');
  if (analyticsSection && analyticsSection.style.display !== 'none') {
    loadAnalytics();
  }
});

let _analyticsCourseChart = null;
function renderAnalyticsCourseChart(counts) {
  const canvas = document.getElementById('analyticsCourseChart');
  if (!canvas) return;
  const wrap = canvas.parentElement;

  const labels = Object.keys(counts);
  const data = Object.values(counts);

  if (_analyticsCourseChart) { _analyticsCourseChart.destroy(); _analyticsCourseChart = null; }

  if (!labels.length) {
    canvas.style.display = 'none';
    if (!wrap.querySelector('.chart-empty')) {
      const msg = document.createElement('div');
      msg.className = 'chart-empty';
      msg.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#4b5563;font-size:0.85rem;font-weight:600;gap:0.5rem;';
      msg.innerHTML = '<i class="fa fa-chart-pie" style="font-size:2rem;opacity:0.5;"></i><span>No active purposes</span>';
      wrap.appendChild(msg);
    }
    return;
  }

  const emptyEl = wrap.querySelector('.chart-empty');
  if (emptyEl) emptyEl.remove();
  canvas.style.display = '';

  const palette = ['#7c3aed', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6'];
  const colors = labels.map((_, i) => palette[i % palette.length]);

  const ctx = canvas.getContext('2d');
  _analyticsCourseChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: analyticsChartDefaults.color,
            font: { family: analyticsChartDefaults.fontFamily, size: 11, weight: '600' },
            padding: 15,
            usePointStyle: true,
            boxWidth: 8
          }
        },
        tooltip: {
          backgroundColor: '#24104f',
          titleFont: { family: analyticsChartDefaults.fontFamily, size: 13 },
          bodyFont: { family: analyticsChartDefaults.fontFamily, size: 12 },
          padding: 10,
          cornerRadius: 8,
          displayColors: true,
          callbacks: {
            label(ctx) {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total ? Math.round(ctx.parsed / total * 100) : 0;
              return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

let _analyticsTimeChart = null;
function renderAnalyticsTimeChart(counts) {
  const canvas = document.getElementById('analyticsTimeChart');
  if (!canvas) return;
  const wrap = canvas.parentElement;

  const labels = Object.keys(counts);
  const data = Object.values(counts);

  if (_analyticsTimeChart) { _analyticsTimeChart.destroy(); _analyticsTimeChart = null; }

  if (!labels.length) {
    canvas.style.display = 'none';
    if (!wrap.querySelector('.chart-empty')) {
      const msg = document.createElement('div');
      msg.className = 'chart-empty';
      msg.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#4b5563;font-size:0.85rem;font-weight:600;gap:0.5rem;';
      msg.innerHTML = '<i class="fa fa-chart-area" style="font-size:2rem;opacity:0.5;"></i><span>No recent activity</span>';
      wrap.appendChild(msg);
    }
    return;
  }

  const emptyEl = wrap.querySelector('.chart-empty');
  if (emptyEl) emptyEl.remove();
  canvas.style.display = '';

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(79, 70, 229, 0.4)');
  gradient.addColorStop(1, 'rgba(79, 70, 229, 0.0)');

  _analyticsTimeChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Total Sit-ins',
        data,
        borderColor: '#6366f1',
        backgroundColor: gradient,
        borderWidth: 3,
        pointBackgroundColor: '#fff',
        pointBorderColor: '#6366f1',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false, drawBorder: false },
          ticks: { color: analyticsChartDefaults.color, font: { family: analyticsChartDefaults.fontFamily, size: 11 } }
        },
        y: {
          grid: { color: analyticsChartDefaults.gridColor, drawBorder: false, borderDash: [5, 5] },
          ticks: { color: analyticsChartDefaults.color, font: { family: analyticsChartDefaults.fontFamily, size: 11 }, padding: 10, stepSize: 1 }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#24104f',
          titleFont: { family: analyticsChartDefaults.fontFamily, size: 13 },
          bodyFont: { family: analyticsChartDefaults.fontFamily, size: 12 },
          padding: 10,
          cornerRadius: 8,
          displayColors: false
        }
      }
    }
  });
}

let _analyticsLabChart = null;
function renderAnalyticsLabChart(counts) {
  const canvas = document.getElementById('analyticsLabChart');
  if (!canvas) return;
  const wrap = canvas.parentElement;

  const labels = Object.keys(counts);
  const data = Object.values(counts);

  if (_analyticsLabChart) { _analyticsLabChart.destroy(); _analyticsLabChart = null; }

  if (!labels.length) {
    canvas.style.display = 'none';
    if (!wrap.querySelector('.chart-empty')) {
      const msg = document.createElement('div');
      msg.className = 'chart-empty';
      msg.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#4b5563;font-size:0.85rem;font-weight:600;gap:0.5rem;';
      msg.innerHTML = '<i class="fa fa-chart-bar" style="font-size:2rem;opacity:0.5;"></i><span>No active labs</span>';
      wrap.appendChild(msg);
    }
    return;
  }

  const emptyEl = wrap.querySelector('.chart-empty');
  if (emptyEl) emptyEl.remove();
  canvas.style.display = '';

  const ctx = canvas.getContext('2d');
  _analyticsLabChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Active Users',
        data,
        backgroundColor: '#10b981',
        borderRadius: 6,
        barPercentage: 0.6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false, drawBorder: false },
          ticks: { color: analyticsChartDefaults.color, font: { family: analyticsChartDefaults.fontFamily, size: 11 } }
        },
        y: {
          grid: { color: analyticsChartDefaults.gridColor, drawBorder: false, borderDash: [5, 5] },
          ticks: { color: analyticsChartDefaults.color, font: { family: analyticsChartDefaults.fontFamily, size: 11 }, padding: 10, stepSize: 1 }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#24104f',
          titleFont: { family: analyticsChartDefaults.fontFamily, size: 13 },
          bodyFont: { family: analyticsChartDefaults.fontFamily, size: 12 },
          padding: 10,
          cornerRadius: 8,
          displayColors: false
        }
      }
    }
  });
}

// â”€â”€ ANNOUNCEMENTS â”€â”€
let announcePage = 1;
let allAdminAnnouncements = [];

function renderAdminAnnouncementCards(list) {
  const el = document.getElementById('admin-announce-list');
  const countEl = document.getElementById('admin-announce-count');
  if (!list.length) {
    el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;color:#b8a9d9;padding:20px;">
      <i class="fa fa-bell-slash" style="font-size:2rem;"></i>
      <p style="font-size:14px;font-style:italic;text-align:center;margin:0;">No announcements found.</p>
    </div>`;
    return;
  }
  el.innerHTML = list.map((a, i) => `
    <div style="
      background:#fff;
      border:1.5px solid #ede8fb;
      border-left:4px solid #7c3aed;
      border-radius:10px;
      padding:12px 14px;
      animation: fadeSlideIn 0.3s ease both;
      animation-delay: ${i * 0.05}s;
      transition: box-shadow 0.2s, transform 0.2s;
    "
    onmouseover="this.style.boxShadow='0 4px 16px rgba(124,58,237,0.13)';this.style.transform='translateY(-1px)'"
    onmouseout="this.style.boxShadow='none';this.style.transform='translateY(0)'">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;flex-wrap:wrap;gap:4px;">
        <div style="display:flex;align-items:center;gap:7px;">
          <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#4a1d8f);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="fa fa-circle-user" style="color:#fff;font-size:14px;"></i>
          </div>
          <span style="font-weight:700;font-size:13px;color:#2e0f66;">CCS Admin</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:11px;color:#a78bca;background:#f3effd;padding:3px 9px;border-radius:20px;font-weight:600;">
            <i class="fa fa-clock" style="margin-right:3px;"></i>${escapeHtml(a.date || '')}
          </span>
          <button onclick="deleteAnnouncement(${a.id})" title="Delete"
            style="background:none;border:1.5px solid #f5c6c6;color:#e74c3c;border-radius:7px;padding:3px 8px;cursor:pointer;font-size:12px;transition:background 0.2s;"
            onmouseover="this.style.background='#fdecea'" onmouseout="this.style.background='none'">
            <i class="fa fa-trash"></i>
          </button>
        </div>
      </div>
      <p style="margin:0;font-size:13.5px;color:#3d2c6e;line-height:1.6;white-space:pre-wrap;word-break:break-word;">${a.text ? escapeHtml(a.text) : '<em style="color:#bbb;">No content</em>'}</p>
    </div>
  `).join('');
}

function filterAdminAnnouncements(query) {
  const q = query.toLowerCase().trim();
  const filtered = q ? allAdminAnnouncements.filter(a =>
    (a.text || '').toLowerCase().includes(q) || (a.date || '').toLowerCase().includes(q)
  ) : allAdminAnnouncements;
  renderAdminAnnouncementCards(filtered);
}

async function renderAnnouncements() {
  const el = document.getElementById('admin-announce-list');
  try {
    const res = await fetch('api/admin.php?action=get_announcements', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      allAdminAnnouncements = data.announcements || [];
      const countEl = document.getElementById('admin-announce-count');
      if (countEl) countEl.textContent = allAdminAnnouncements.length + ' post' + (allAdminAnnouncements.length !== 1 ? 's' : '');
      const searchVal = document.getElementById('admin-announce-search')?.value || '';
      filterAdminAnnouncements(searchVal);
    }
  } catch (e) { console.error('Admin action failed', e); }
}

async function postAnnouncement() {
  const ta = document.getElementById('new-announcement');
  const text = ta.value.trim();
  const errEl = document.getElementById('announce-error');
  if (!text) {
    errEl.style.display = 'block';
    ta.style.borderColor = '#e74c3c';
    ta.style.boxShadow = '0 0 0 3px rgba(231,76,60,0.15)';
    setTimeout(() => {
      errEl.style.display = 'none';
      ta.style.borderColor = '';
      ta.style.boxShadow = '';
    }, 3000);
    return;
  }
  errEl.style.display = 'none';
  ta.style.borderColor = '';
  ta.style.boxShadow = '';

  try {
    const res = await fetch('api/admin.php?action=add_announcement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('ccs_announcement_ping', String(Date.now()));
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('ccs_announcements');
        channel.postMessage({ type: 'announcement-added', at: Date.now() });
        channel.close();
      }
      ta.value = ''; announcePage = 1; renderAnnouncements();
    } else {
      showNotify('Failed to post: ' + (data.message || 'Unknown error'), 'error');
    }
  } catch (e) {
    showNotify('Network error posting announcement.', 'error');
  }
}

async function deleteAnnouncement(id) {
  if (!confirm("Delete this announcement?")) return;
  try {
    await fetch('api/admin.php?action=delete_announcement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    renderAnnouncements();
  } catch (e) { console.error('Admin action failed', e); }
}

// â•â•â•â•â•â•â•â•â•â• STUDENTS TABLE â•â•â•â•â•â•â•â•â•â•
async function renderStudents() {
  try {
    const res = await fetch('api/admin.php?action=get_students', { method: 'POST' });
    const data = await res.json();
    const all = data.success ? data.students : [];
    const q = (document.getElementById('st-search')?.value || '').toLowerCase();
    const pp = parseInt(document.getElementById('st-per-page')?.value || '10');
    const filt = all.filter(u => !q || u.idNum?.toLowerCase().includes(q) || u.firstname?.toLowerCase().includes(q) || u.lastname?.toLowerCase().includes(q) || u.course?.toLowerCase().includes(q));
    const tot = filt.length, pages = Math.max(1, Math.ceil(tot / pp));
    if (stPage > pages) stPage = pages;
    const s = ((stPage - 1) * pp), paged = filt.slice(s, s + pp);
    const wrap = document.getElementById('students-table-wrap');
    // Update count badge
    const badge = document.getElementById('st-count-badge');
    if (badge) badge.textContent = tot + ' student' + (tot !== 1 ? 's' : '');
    if (!paged.length) {
      const emptyTitle = q ? 'No matching students' : 'No students yet';
      const emptyText = q ? 'Try a different name, ID number, or course.' : 'Add a student to start managing accounts.';
      wrap.innerHTML = `<div class="admin-empty-state">
        <div class="empty-state-icon"><i class="fa fa-users"></i></div>
        <strong>${emptyTitle}</strong>
        <span>${emptyText}</span>
      </div>`;
      document.getElementById('st-pagination').innerHTML = '';
      return;
    }
    wrap.innerHTML = `
      <table class="students-table">
        <thead><tr>
          <th>Student</th>
          <th>ID Number</th>
          <th>Year</th>
          <th>Course</th>
          <th style="text-align:center;">Sessions Left</th>
          <th style="text-align:center;">Actions</th>
        </tr></thead>
        <tbody>${paged.map((u, i) => {
      const initials = ((u.firstname || '?')[0] + (u.lastname || '?')[0]).toUpperCase();
      const hasPfp = u.profilePic && u.profilePic.length > 10;
      const avatarHtml = hasPfp
        ? `<img src="${u.profilePic}" class="stu-avatar" style="object-fit:cover;" />`
        : `<div class="stu-avatar">${initials}</div>`;
      const sess = u.sitin_remaining ?? 30;
      const sessClass = sess >= 20 ? 'high' : sess >= 10 ? 'mid' : 'low';
      const yearLabel = ['', '1st', '2nd', '3rd', '4th'][u.level] || u.level || 'â€”';
      return `
          <tr class="student-row" style="animation-delay:${i * 0.03}s;">
            <td>
              <div class="stu-name-cell">
                ${avatarHtml}
                <div>
                  <div class="stu-name-text">${[u.firstname, u.middlename ? u.middlename.charAt(0) + '.' : '', u.lastname].filter(Boolean).join(' ')}</div>
                  <div class="stu-id-text">${u.email || ''}</div>
                </div>
              </div>
            </td>
            <td><span class="admin-id-chip">${u.idNum}</span></td>
            <td><span class="year-badge">${yearLabel}</span></td>
            <td style="white-space:nowrap;font-size:13px;">${u.course || 'â€”'}</td>
            <td style="text-align:center;"><span class="sess-pill ${sessClass}">${sess}</span></td>
            <td>
              <div class="row-actions">
                <button class="btn-st-edit" title="Edit student" onclick="openEditModal('${u.idNum}', '${encodeURIComponent(JSON.stringify(u))}')"><i class="fa fa-pen"></i> Edit</button>
                <button class="btn-st-delete" title="Delete student" onclick="openDeleteModal('${u.idNum}', '${u.firstname}')"><i class="fa fa-trash"></i> Delete</button>
              </div>
            </td>
          </tr>`;
    }).join('')}</tbody>
      </table>`;
    renderPagination('st-pagination', stPage, pages, tot, s, Math.min(s + pp, tot), p => { stPage = p; renderStudents(); });
  } catch (e) { console.error('Admin action failed', e); }
}

function resetAllSessions() {
  resetSessions();
}

// â”€â”€ LEADERBOARD LOGIC â”€â”€
async function loadAdminLeaderboard() {
  try {
    const res = await fetch('api/leaderboard.php?action=get_admin_leaderboard', { method: 'POST' });
    const data = await res.json();
    const tbody = document.getElementById('admin-leaderboard-body');
    if (!data.success || !data.leaderboard.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 30px;"><i class="fa fa-info-circle"></i> No leaderboard data found.</td></tr>';
      return;
    }
    
    tbody.innerHTML = data.leaderboard.map((u, i) => {
      const rank = i + 1;
      let rankHtml = `<span style="font-weight:900; font-size:1.1rem; color:var(--text-muted);">#${rank}</span>`;
      if (rank === 1) rankHtml = `<span class="rank-icon">ðŸ¥‡</span>`;
      else if (rank === 2) rankHtml = `<span class="rank-icon">ðŸ¥ˆ</span>`;
      else if (rank === 3) rankHtml = `<span class="rank-icon">ðŸ¥‰</span>`;
      
      const tooltip = `Session Points: ${u.session_points}<br>Manual Points: ${u.manual_points}`;
      
      return `
        <tr>
          <td style="text-align:center;">${rankHtml}</td>
          <td>
            <div style="display:flex; align-items:center; gap:10px;">
              <img src="${u.profilePic || 'static/temppfp.jpg'}" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:2px solid #ede8fb;" onerror="this.src='static/temppfp.jpg'" />
              <div>
                <div style="font-weight:700; color:var(--purple-dark); font-size:0.95rem;">${u.firstname} ${u.lastname}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${u.idNum}</div>
              </div>
            </div>
          </td>
          <td style="font-size:0.85rem; font-weight:600;">${u.course || 'â€”'}</td>
          <td style="text-align:center; font-weight:700;">${u.total_sitins}</td>
          <td>
            <div style="font-weight:700; color:#10b981;">${u.total_hours_str}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Longest: ${u.longest_session_str}</div>
          </td>
          <td style="font-weight:600;">${u.avg_session_str}</td>
          <td>
            <div class="tooltip-pts" style="font-weight:900; color:#f59e0b; font-size:1.1rem;">
              ${u.total_points} PTS
              <span class="tooltiptext">${tooltip}</span>
            </div>
            <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">hover for breakdown</div>
          </td>
          <td style="text-align:center;">
            <button class="btn-pts" onclick="openAwardModal('${u.idNum}', '${u.firstname} ${u.lastname}', '${u.course}', '${u.profilePic || 'static/temppfp.jpg'}')">
              + Points
            </button>
          </td>
        </tr>
      `;
    }).join('');
    
  } catch (e) {
    console.error('Leaderboard Error:', e);
    document.getElementById('admin-leaderboard-body').innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:red;">Failed to load leaderboard.</td></tr>';
  }
}

function openAwardModal(idNum, name, course, pic) {
  document.getElementById('award-idnum').value = idNum;
  document.getElementById('award-name').textContent = name;
  document.getElementById('award-course').textContent = course || 'N/A';
  document.getElementById('award-pic').src = pic;
  document.getElementById('award-pts-val').value = '';
  document.getElementById('award-reason').value = '';
  document.getElementById('award-points-modal').style.display = 'flex';
}

function closeAwardModal() {
  document.getElementById('award-points-modal').style.display = 'none';
}

async function submitAwardPoints() {
  const idNum = document.getElementById('award-idnum').value;
  const points = document.getElementById('award-pts-val').value;
  const reason = document.getElementById('award-reason').value.trim();
  
  if (!points || points <= 0 || !reason) {
    showNotify('Please enter valid points and a reason.', 'error');
    return;
  }
  
  try {
    const res = await fetch('api/leaderboard.php?action=add_points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNum, points, reason })
    });
    const data = await res.json();
    if (data.success) {
      showNotify(data.message, 'success');
      closeAwardModal();
      loadAdminLeaderboard();
    } else {
      showNotify(data.message || 'Error awarding points', 'error');
    }
  } catch (e) {
    showNotify('Network error.', 'error');
  }
}

async function resetSessions() {
  if (!confirm('Are you sure you want to reset all student sessions to 30?')) return;
  try {
    const res = await fetch('api/leaderboard.php?action=reset_sessions', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showNotify(data.message, 'success');
      if (document.getElementById('section-students').style.display !== 'none') {
        renderStudents();
      }
    } else {
      showNotify(data.message || 'Error resetting sessions', 'error');
    }
  } catch(e) {
    showNotify('Network error.', 'error');
  }
}

// â”€â”€ EDIT MODAL â”€â”€
function openEditModal(idNum, uStr) {
  const u = JSON.parse(decodeURIComponent(uStr));
  document.getElementById('edit-key').value = idNum;
  document.getElementById('edit-fn').value = u.firstname || '';
  document.getElementById('edit-ln').value = u.lastname || '';
  document.getElementById('edit-mn').value = u.middlename || '';
  document.getElementById('edit-em').value = u.email || '';
  document.getElementById('edit-yr').value = String(u.level || '1');
  document.getElementById('edit-sess').value = u.sitin_remaining ?? 30;
  document.getElementById('edit-course').value = u.course || 'Information Technology';
  document.getElementById('edit-addr').value = u.address || '';
  document.getElementById('edit-modal').style.display = 'flex';
}
function closeEditModal() { document.getElementById('edit-modal').style.display = 'none'; }
async function saveEditStudent() {
  const idNum = document.getElementById('edit-key').value;
  const fn = document.getElementById('edit-fn').value.trim();
  const ln = document.getElementById('edit-ln').value.trim();
  const mn = document.getElementById('edit-mn').value.trim();
  const em = document.getElementById('edit-em').value.trim();
  const lvl = document.getElementById('edit-yr').value;
  const sess = parseInt(document.getElementById('edit-sess').value) || 0;
  const crs = document.getElementById('edit-course').value;
  const addr = document.getElementById('edit-addr').value.trim();
  try {
    await fetch('api/admin.php?action=update_student', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNum, sitin_remaining: sess, course: crs, level: lvl })
    });
    await fetch('api/student.php?action=update_profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNum, firstname: fn, lastname: ln, middlename: mn, email: em, level: lvl, course: crs, address: addr })
    });
    closeEditModal(); renderStudents();
  } catch (e) { console.error('Admin action failed', e); }
}

// â”€â”€ DELETE MODAL â”€â”€
function openDeleteModal(idNum, name) {
  pendingDeleteId = idNum;
  document.getElementById('del-msg').textContent = `Delete "${name}"? This cannot be undone.`;
  document.getElementById('delete-modal').style.display = 'flex';
}
function closeDeleteModal() { document.getElementById('delete-modal').style.display = 'none'; pendingDeleteId = null; }
async function confirmDelete() {
  if (!pendingDeleteId) return;
  try {
    await fetch('api/admin.php?action=delete_student', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNum: pendingDeleteId })
    });
    closeDeleteModal(); renderStudents(); loadStats();
  } catch (e) { console.error('Admin action failed', e); }
}

// â”€â”€ ADD STUDENT MODAL â”€â”€
function openAddStudentModal() {
  document.getElementById('add-fn').value = ''; document.getElementById('add-ln').value = '';
  document.getElementById('add-mn').value = ''; document.getElementById('add-em').value = '';
  document.getElementById('add-id').value = ''; document.getElementById('add-pw').value = '';
  document.getElementById('add-yr').value = '1'; document.getElementById('add-sess').value = '30';
  document.getElementById('add-course').value = 'Information Technology';
  document.getElementById('add-addr').value = '';
  document.getElementById('add-student-error').style.display = 'none';
  document.getElementById('add-student-modal').style.display = 'flex';
}
function closeAddStudentModal() { document.getElementById('add-student-modal').style.display = 'none'; }
async function saveAddStudent() {
  const errEl = document.getElementById('add-student-error');
  errEl.style.display = 'none';
  const firstname = document.getElementById('add-fn').value.trim();
  const lastname = document.getElementById('add-ln').value.trim();
  const middlename = document.getElementById('add-mn').value.trim();
  const email = document.getElementById('add-em').value.trim();
  const idNum = document.getElementById('add-id').value.trim();
  const password = document.getElementById('add-pw').value;
  const level = document.getElementById('add-yr').value;
  const sess = parseInt(document.getElementById('add-sess').value) || 30;
  const course = document.getElementById('add-course').value;
  const address = document.getElementById('add-addr').value.trim();

  if (!firstname || !lastname || !email || !idNum || !password) { errEl.textContent = 'Please fill in all required fields.'; errEl.style.display = 'block'; return; }
  if (!/^\S+@\S+\.\S+$/.test(email)) { errEl.textContent = 'Please enter a valid email.'; errEl.style.display = 'block'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return; }

  try {
    const res = await fetch('api/auth.php?action=register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNum, firstname, lastname, middlename, email, password, level, course, address })
    });
    const data = await res.json();
    if (data.success) {
      await fetch('api/admin.php?action=update_student', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idNum, sitin_remaining: sess, course, level })
      });
      closeAddStudentModal(); renderStudents(); loadStats();
    } else {
      errEl.textContent = data.message; errEl.style.display = 'block';
    }
  } catch (e) { console.error('Admin action failed', e); }
}

// â•â•â•â•â•â•â•â•â•â• SEARCH MODAL â•â•â•â•â•â•â•â•â•â•
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

let searchCache = null;
let searchDebounceTimer = null;
let searchRequestId = 0;

function setSearchCount(text) {
  const count = document.getElementById('search-result-count');
  if (count) count.textContent = text;
}

function searchEmptyHtml(icon, title, text) {
  return `
    <div class="admin-empty search-empty-state">
      <i class="fa ${icon}"></i>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
    </div>`;
}

function openSearchModal() {
  const modal = document.getElementById('search-modal');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  if (!modal || !input || !results) return;
  modal.style.display = 'flex';
  searchCache = null;
  input.value = '';
  setSearchCount('0 results');
  results.innerHTML = searchEmptyHtml('fa-magnifying-glass', 'Search for a student', 'Use an ID number, first name, or last name.');
  setTimeout(() => input.focus(), 100);
}
function closeSearchModal() {
  const modal = document.getElementById('search-modal');
  if (modal) modal.style.display = 'none';
}
document.getElementById('search-modal')?.addEventListener('click', function (e) { if (e.target === this) closeSearchModal(); });

async function legacyRenderSearch() {
  const q = (document.getElementById('search-input')?.value || '').toLowerCase();
  const wrap = document.getElementById('search-results');
  if (!wrap) return;
  if (!q) { wrap.innerHTML = '<p class="admin-empty">Type to search students.</p>'; return; }
  try {
    // Fetch students and active records in parallel
    const [studRes, recRes] = await Promise.all([
      fetch('api/admin.php?action=get_students', { method: 'POST' }),
      fetch('api/admin.php?action=get_records', { method: 'POST' })
    ]);
    const studData = await studRes.json();
    const recData = await recRes.json();
    if (!studData.success) throw new Error(studData.message || 'Failed to load students.');

    // Build set of student IDs with active sit-ins
    const activeIds = new Set();
    if (recData.success && recData.records) {
      recData.records.forEach(r => {
        if (r.status && r.status.toLowerCase() === 'active') activeIds.add(r.idNum);
      });
    }

    const filt = (studData.students || []).filter(u => u.idNum?.toLowerCase().includes(q) || u.firstname?.toLowerCase().includes(q) || u.lastname?.toLowerCase().includes(q));
    if (!filt.length) { wrap.innerHTML = '<p class="admin-empty">No students found.</p>'; return; }
    wrap.innerHTML = `
      <table class="admin-table" style="width:100%;">
        <thead><tr><th>ID Number</th><th>Name</th><th>Course</th><th>Year</th><th>Email</th><th>Sessions</th><th>Status</th></tr></thead>
        <tbody>${filt.map(u => {
          const isActive = activeIds.has(u.idNum);
          const rowStyle = isActive ? 'opacity:0.6;cursor:not-allowed;' : '';
          const studentPayload = escapeAttr(encodeURIComponent(JSON.stringify(u)));
          const idNum = escapeAttr(u.idNum);
          const clickHandler = isActive
            ? `onclick="showNotify('This student already has an active sit-in session. Please time-out the current session first.', 'warning')" title="Already sitting in â€” cannot create another session"`
            : `onclick="openSitinFromSearch('${idNum}', '${studentPayload}')" title="Click to open Sit-in Form"`;
          return `
          <tr class="s-row" ${clickHandler} style="${rowStyle}">
            <td style="white-space:nowrap;font-weight:700;color:#4a1d8f;">${escapeHtml(u.idNum)}</td>
            <td style="white-space:nowrap;min-width:170px;font-weight:600;">${escapeHtml([u.firstname, u.middlename, u.lastname].filter(Boolean).join(' '))}</td>
            <td style="min-width:120px;">${u.course || 'â€”'}</td>
            <td style="text-align:center;">${u.level || 'â€”'}</td>
            <td style="white-space:nowrap;">${u.email || 'â€”'}</td>
            <td style="text-align:center;"><span class="session-pill">${u.sitin_remaining ?? 30}</span></td>
            <td style="text-align:center;">
              ${isActive
                ? '<span style="display:inline-flex;align-items:center;gap:5px;background:#d1fae5;color:#065f46;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:800;"><span style="width:6px;height:6px;border-radius:50%;background:#059669;animation:pulseDot 1.5s ease-in-out infinite;"></span>In Session</span>'
                : '<span style="color:#9ca3af;font-size:11px;font-weight:600;">Available</span>'}
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  } catch (e) {
    console.error('Search failed', e);
    wrap.innerHTML = '<p class="admin-empty">Search is unavailable right now. Please try again.</p>';
  }
}

// â•â•â•â•â•â•â•â•â•â• SIT-IN FORM â•â•â•â•â•â•â•â•â•â•
async function loadSearchData() {
  if (searchCache) return searchCache;
  const [studRes, recRes] = await Promise.all([
    fetch('api/admin.php?action=get_students', { method: 'POST' }),
    fetch('api/admin.php?action=get_records', { method: 'POST' })
  ]);
  const studData = await studRes.json();
  const recData = await recRes.json();
  if (!studData.success) throw new Error(studData.message || 'Failed to load students.');

  const activeIds = new Set();
  if (recData.success && recData.records) {
    recData.records.forEach(r => {
      if (r.status && r.status.toLowerCase() === 'active') activeIds.add(r.idNum);
    });
  }

  searchCache = { students: studData.students || [], activeIds };
  return searchCache;
}

async function renderSearch() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(performSearch, 180);
}

async function performSearch() {
  const q = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
  const wrap = document.getElementById('search-results');
  if (!wrap) return;
  const requestId = ++searchRequestId;

  if (!q) {
    setSearchCount('0 results');
    wrap.innerHTML = searchEmptyHtml('fa-magnifying-glass', 'Search for a student', 'Use an ID number, first name, or last name.');
    return;
  }

  setSearchCount('Searching...');
  wrap.innerHTML = searchEmptyHtml('fa-spinner fa-spin', 'Searching students', 'Checking student records and current sit-ins.');

  try {
    const { students, activeIds } = await loadSearchData();
    if (requestId !== searchRequestId) return;

    const filt = students.filter(u => {
      const name = [u.firstname, u.middlename, u.lastname].filter(Boolean).join(' ').toLowerCase();
      return (u.idNum || '').toLowerCase().includes(q)
        || name.includes(q)
        || (u.course || '').toLowerCase().includes(q);
    }).slice(0, 30);

    setSearchCount(`${filt.length} result${filt.length !== 1 ? 's' : ''}`);
    if (!filt.length) {
      wrap.innerHTML = searchEmptyHtml('fa-user-slash', 'No students found', 'Try another ID number, name, or course.');
      return;
    }

    wrap.innerHTML = `
      <table class="admin-table search-results-table">
        <thead><tr><th>ID Number</th><th>Name</th><th>Course</th><th>Year</th><th>Email</th><th>Sessions</th><th>Status</th></tr></thead>
        <tbody>${filt.map(u => {
          const isActive = activeIds.has(u.idNum);
          const studentPayload = escapeAttr(encodeURIComponent(JSON.stringify(u)));
          const idNum = escapeAttr(u.idNum);
          const fullName = [u.firstname, u.middlename, u.lastname].filter(Boolean).join(' ');
          const clickHandler = isActive
            ? `onclick="showNotify('This student already has an active sit-in session. Please time-out the current session first.', 'warning')" title="Already sitting in - cannot create another session"`
            : `onclick="openSitinFromSearch('${idNum}', '${studentPayload}')" title="Click to open Sit-in Form"`;
          return `
          <tr class="s-row${isActive ? ' is-active-session' : ''}" ${clickHandler}>
            <td data-label="ID Number"><span class="search-id">${escapeHtml(u.idNum)}</span></td>
            <td data-label="Name"><span class="search-name">${escapeHtml(fullName)}</span></td>
            <td data-label="Course">${escapeHtml(u.course || '-')}</td>
            <td data-label="Year">${escapeHtml(u.level || '-')}</td>
            <td data-label="Email">${escapeHtml(u.email || '-')}</td>
            <td data-label="Sessions"><span class="session-pill">${escapeHtml(u.sitin_remaining ?? 30)}</span></td>
            <td data-label="Status">
              ${isActive
                ? '<span class="search-status active"><span></span>In Session</span>'
                : '<span class="search-status available">Available</span>'}
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  } catch (e) {
    console.error('Search failed', e);
    setSearchCount('Unavailable');
    wrap.innerHTML = searchEmptyHtml('fa-triangle-exclamation', 'Search is unavailable', 'Please try again in a moment.');
  }
}

function openSitinFromSearch(idNum, uStr) {
  const u = JSON.parse(decodeURIComponent(uStr));
  closeSearchModal(); openSitinModal(u);
}
function openSitinModal(u) {
  pendingSitinUser = u;
  document.getElementById('sf-idnum').value = u.idNum;
  document.getElementById('sf-name').value = [u.firstname, u.middlename, u.lastname].filter(Boolean).join(' ');
  document.getElementById('sf-purpose').value = '';
  document.getElementById('sf-purpose').selectedIndex = 0;
  document.getElementById('sf-lab').value = '';
  document.getElementById('sf-lab').selectedIndex = 0;
  document.getElementById('sf-session').value = u.sitin_remaining ?? 30;
  document.getElementById('sitin-modal').style.display = 'flex';
}
function closeSitinModal() { document.getElementById('sitin-modal').style.display = 'none'; pendingSitinUser = null; }

async function confirmSitin() {
  if (!pendingSitinUser) return;
  const purpose = document.getElementById('sf-purpose').value.trim();
  const lab = document.getElementById('sf-lab').value.trim();
  if (!purpose) { showNotify('Please select a purpose before proceeding.', 'error'); return; }
  if (!lab) { showNotify('Please select a lab number before proceeding.', 'error'); return; }

  try {
    const res = await fetch('api/student.php?action=sitin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNum: pendingSitinUser.idNum, purpose, lab })
    });
    const data = await res.json();
    if (data.success) {
      showNotify(`Sit-in session created successfully for ${pendingSitinUser.firstname} ${pendingSitinUser.lastname}!`, 'success', 'Sit-in Created');
      loadStats(); 
      renderCurrentSitin();
      closeSitinModal();
      setTimeout(() => showSection('sitin', document.querySelector('.nav-links a:nth-child(4)')), 500);
    } else {
      showNotify(data.message || 'Failed to create sit-in session.', 'error');
    }
  } catch (e) {
    showNotify('Network error while creating sit-in session.', 'error');
  }
}

// â•â•â•â•â•â•â•â•â•â• CURRENT SIT-IN TABLE â•â•â•â•â•â•â•â•â•â•
function formatElapsed(loginStr) {
  if (!loginStr) return '';
  try {
    const now = new Date();
    // Parse time like "09:30 AM"
    const parts = loginStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!parts) return '';
    let h = parseInt(parts[1]), m = parseInt(parts[2]);
    const ampm = parts[3].toUpperCase();
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    const loginTime = new Date(now);
    loginTime.setHours(h, m, 0, 0);
    const diffMs = now - loginTime;
    if (diffMs < 0) return 'just now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    const rm = mins % 60;
    return hrs + 'h ' + rm + 'm';
  } catch (e) { return ''; }
}

async function renderCurrentSitin() {
  try {
    const res = await fetch('api/admin.php?action=get_records', { method: 'POST' });
    const data = await res.json();
    if (!data.success) return;
    const all = data.records.filter(r => r.status && r.status.toLowerCase() === 'active');
    const q = (document.getElementById('sit-search')?.value || '').toLowerCase();
    const pp = parseInt(document.getElementById('sit-per-page')?.value || '10');
    const filt = all.filter(s => !q || s.idNum?.toLowerCase().includes(q) || s.name?.toLowerCase().includes(q) || s.purpose?.toLowerCase().includes(q) || s.lab?.toLowerCase().includes(q));
    const tot = filt.length, pages = Math.max(1, Math.ceil(tot / pp));
    if (sitPage > pages) sitPage = pages;
    const s = (sitPage - 1) * pp, paged = filt.slice(s, s + pp);
    const wrap = document.getElementById('sitin-table-wrap');

    // Update active badge
    const countEl = document.getElementById('sit-active-count');
    if (countEl) countEl.textContent = tot + ' active';

    if (!paged.length) {
      const emptyTitle = q ? 'No matching active sessions' : 'No active sit-ins';
      const emptyText = q ? 'Try a different student, ID number, purpose, or lab.' : 'Active sessions will appear here as soon as students sit in.';
      wrap.innerHTML = `<div class="admin-empty-state sitin-empty-state">
        <div class="empty-state-icon"><i class="fa fa-desktop"></i></div>
        <strong>${emptyTitle}</strong>
        <span>${emptyText}</span>
      </div>`;
      document.getElementById('sit-pagination').innerHTML = '';
      return;
    }
    wrap.innerHTML = `
      <table class="sitin-table">
        <thead><tr>
          <th>Student</th>
          <th>ID Number</th>
          <th>Purpose</th>
          <th style="text-align:center;">Lab</th>
          <th>Time In</th>
          <th style="text-align:center;">Status</th>
          <th style="text-align:center;">Action</th>
        </tr></thead>
        <tbody>${paged.map((x, i) => {
      const nameParts = (x.name || '?').split(' ');
      const initials = (nameParts[0][0] + (nameParts.length > 1 ? nameParts[nameParts.length - 1][0] : '')).toUpperCase();
      const hasPfp = x.profilePic && x.profilePic.length > 10;
      const avatarHtml = hasPfp
        ? `<img src="${x.profilePic}" class="stu-avatar" style="object-fit:cover;" />`
        : `<div class="stu-avatar" style="background:linear-gradient(135deg,#7c3aed,#4a1d8f);">${initials}</div>`;
      const elapsed = formatElapsed(x.login);
      return `
          <tr class="sitin-row" style="animation-delay:${i * 0.03}s;">
            <td>
              <div class="stu-name-cell">
                ${avatarHtml}
                <div>
                  <div class="stu-name-text" style="color:#2e0f66;">${x.name}</div>
                  <div class="stu-id-text">#${x.sitId}</div>
                </div>
              </div>
            </td>
            <td><span class="admin-id-chip">${x.idNum}</span></td>
            <td><span class="purpose-text">${x.purpose}</span></td>
            <td style="text-align:center;"><span class="lab-badge">${x.lab}</span></td>
            <td>
              <div style="font-weight:700;font-size:13px;color:#333;">${x.login || 'â€”'}</div>
              ${elapsed ? '<div class="elapsed-time">' + elapsed + '</div>' : ''}
            </td>
            <td style="text-align:center;"><span class="status-active"><span class="dot"></span>Active</span></td>
            <td>
              <div class="row-actions">
                <button class="btn-timeout-prem" title="Time out this student" onclick="timeoutSitin(${x.sitId})">
                  <i class="fa fa-right-from-bracket"></i> Time-out
                </button>
              </div>
            </td>
          </tr>`;
    }).join('')}</tbody>
      </table>`;
    renderPagination('sit-pagination', sitPage, pages, tot, s, Math.min(s + pp, tot), p => { sitPage = p; renderCurrentSitin(); });
  } catch (e) { console.error('Admin action failed', e); }
}

function timeoutSitin(sitId) { endSitin(sitId, false); }

async function endSitin(sitId, silent) {
  try {
    await fetch('api/admin.php?action=timeout_sitin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sitId })
    });
    if (!silent) { loadStats(); renderCurrentSitin(); }
  } catch (e) { console.error('Admin action failed', e); }
}

// â•â•â•â•â•â•â•â•â•â• RECORDS TABLE â•â•â•â•â•â•â•â•â•â•
async function renderRecordsLegacy() {
  try {
    const res = await fetch('api/admin.php?action=get_records', { method: 'POST' });
    const data = await res.json();
    if (!data.success) return;
    const all = data.records.filter(r => (r.status || '').toLowerCase() === 'done');
    const q = (document.getElementById('rec-search')?.value || '').toLowerCase();
    const pp = parseInt(document.getElementById('rec-per-page')?.value || '10');
    const filt = all.filter(r => !q
      || r.idNum?.toLowerCase().includes(q)
      || r.name?.toLowerCase().includes(q)
      || r.purpose?.toLowerCase().includes(q)
      || r.lab?.toLowerCase().includes(q)
      || r.course?.toLowerCase().includes(q)
      || r.date?.toLowerCase().includes(q));
    const tot = filt.length, pages = Math.max(1, Math.ceil(tot / pp));
    if (recPage > pages) recPage = pages;
    const s = (recPage - 1) * pp, paged = filt.slice(s, s + pp);
    const wrap = document.getElementById('records-table-wrap');

    const badge = document.getElementById('rec-count-badge');
    const tableBadge = document.getElementById('rec-table-count');
    const label = tot + ' record' + (tot !== 1 ? 's' : '');
    if (badge) badge.textContent = label;
    if (tableBadge) tableBadge.textContent = label;

    updateRecordOverview(all);
    if (all.length > 0) {
      document.getElementById('rec-overview').style.display = 'grid';
      document.getElementById('rec-charts').style.display = 'grid';
      renderRecordCharts(all);
    } else {
      document.getElementById('rec-overview').style.display = 'none';
      document.getElementById('rec-charts').style.display = 'none';
    }

    if (!paged.length) {
      wrap.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3rem;gap:10px;color:#d8cef5;">
        <i class="fa fa-table-list" style="font-size:2.5rem;"></i>
        <p style="font-size:14px;font-style:italic;margin:0;color:#b19aeb;">No sit-in records found.</p>
      </div>`;
      document.getElementById('rec-pagination').innerHTML = '';
      return;
    }
    wrap.innerHTML = `
      <table class="records-table">
        <thead><tr>
          <th>Student</th>
          <th>ID Number</th>
          <th>Purpose</th>
          <th style="text-align:center;">Lab</th>
          <th>Time In</th>
          <th>Time Out</th>
          <th>Date</th>
          <th style="text-align:center;">Status</th>
          <th style="text-align:center;">Action</th>
        </tr></thead>
        <tbody>${paged.map((r, i) => {
      const nameParts = (r.name || '?').split(' ');
      const initials = (nameParts[0][0] + (nameParts.length > 1 ? nameParts[nameParts.length - 1][0] : '')).toUpperCase();
      const hasPfp = r.profilePic && r.profilePic.length > 10;
      const avatarHtml = hasPfp
        ? `<img src="${r.profilePic}" class="stu-avatar" style="object-fit:cover;" />`
        : `<div class="stu-avatar" style="background:linear-gradient(135deg,#7c3aed,#4a1d8f);">${initials}</div>`;
      const statusLower = (r.status || '').toLowerCase();
      const statusBadge = statusLower === 'done'
        ? '<span class="status-done"><i class="fa fa-circle-check" style="font-size:10px;"></i>Done</span>'
        : statusLower === 'reserved'
          ? '<span class="status-reserved"><i class="fa fa-calendar-check" style="font-size:10px;"></i>Reserved</span>'
          : `<span style="color:#888;font-weight:700;">${r.status}</span>`;
      return `
          <tr style="animation-delay:${i * 0.03}s;">
            <td>
              <div class="stu-name-cell">
                ${avatarHtml}
                <div>
                  <div class="stu-name-text" style="color:#2e0f66;">${r.name}</div>
                  <div class="stu-id-text">#${r.sitId}</div>
                </div>
              </div>
            </td>
            <td style="font-weight:700;color:#4a1d8f;white-space:nowrap;">${r.idNum}</td>
            <td style="font-size:13px;">${r.purpose}</td>
            <td style="text-align:center;"><span class="lab-badge">${r.lab}</span></td>
            <td style="font-size:13px;font-weight:600;">${r.login || 'â€”'}</td>
            <td style="font-size:13px;font-weight:600;">${r.logout || 'â€”'}</td>
            <td style="font-size:12px;color:#6b7280;">${r.date || 'â€”'}</td>
            <td style="text-align:center;">${statusBadge}</td>
            <td style="text-align:center;">
              <button class="btn-rec-delete" onclick="deleteRecord(${r.sitId})" title="Delete record">
                <i class="fa fa-trash"></i>
              </button>
            </td>
          </tr>`;
    }).join('')}</tbody>
      </table>`;
    renderPagination('rec-pagination', recPage, pages, tot, s, Math.min(s + pp, tot), p => { recPage = p; renderRecords(); });
  } catch (e) { console.error('Admin action failed', e); }
}

async function deleteRecord(sitId) {
  if (!confirm("Delete this sit-in record entirely?")) return;
  try {
    await fetch('api/admin.php?action=delete_record', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sitId })
    });
    renderRecords(); loadStats();
  } catch (e) { console.error('Admin action failed', e); }
}

let recPurposeChartInst = null;
let recLabChartInst = null;
let recCourseChartInst = null;

function renderRecordChartsLegacy(data) {
  const pm = {}, lm = {};
  data.forEach(r => {
    const p = r.purpose || 'Unknown';
    const l = r.lab || 'Unknown';
    pm[p] = (pm[p] || 0) + 1;
    lm[l] = (lm[l] || 0) + 1;
  });

  const pCtx = document.getElementById('recPurposeChart').getContext('2d');
  const lCtx = document.getElementById('recLabChart').getContext('2d');

  if (recPurposeChartInst) recPurposeChartInst.destroy();
  recPurposeChartInst = new Chart(pCtx, {
    type: 'bar',
    data: {
      labels: Object.keys(pm),
      datasets: [{
        label: 'Sessions',
        data: Object.values(pm),
        backgroundColor: ['#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'],
        borderRadius: 6
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  if (recLabChartInst) recLabChartInst.destroy();
  recLabChartInst = new Chart(lCtx, {
    type: 'bar',
    data: {
      labels: Object.keys(lm),
      datasets: [{
        label: 'Sessions',
        data: Object.values(lm),
        backgroundColor: ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'],
        borderRadius: 6
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}

// â•â•â•â•â•â•â•â•â•â• PAGINATION â•â•â•â•â•â•â•â•â•â•
function countRecordValues(data, key, fallback = 'Unknown') {
  return data.reduce((map, row) => {
    const value = row[key] || fallback;
    map[value] = (map[value] || 0) + 1;
    return map;
  }, {});
}

function updateRecordOverview(data) {
  const totalEl = document.getElementById('rec-total-completed');
  const studentsEl = document.getElementById('rec-unique-students');
  const purposeEl = document.getElementById('rec-common-purpose');
  const purposes = countRecordValues(data, 'purpose');
  const topPurpose = Object.entries(purposes).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

  if (totalEl) totalEl.textContent = data.length;
  if (studentsEl) studentsEl.textContent = new Set(data.map(r => r.idNum).filter(Boolean)).size;
  if (purposeEl) purposeEl.textContent = topPurpose;
}

function recordDateValue(record) {
  const raw = record.date || record.login_date || '';
  if (!raw) return '';
  return String(raw).slice(0, 10);
}

function isRecordThisWeek(record) {
  const raw = recordDateValue(record);
  if (!raw) return false;
  const date = new Date(raw + 'T00:00:00');
  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(today.getDate() - today.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
}

function populateRecordLabFilter(records) {
  const select = document.getElementById('rec-lab-filter');
  if (!select) return;
  const current = select.value;
  const labs = [...new Set(records.map(r => r.lab).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  select.innerHTML = `<option value="">All Labs</option>` + labs.map(lab => `<option value="${escapeAttr(lab)}">Lab ${escapeHtml(lab)}</option>`).join('');
  if (labs.includes(current)) select.value = current;
}

function filterRecords(records) {
  const today = new Date().toISOString().slice(0, 10);
  const lab = document.getElementById('rec-lab-filter')?.value || '';
  const q = (document.getElementById('rec-search')?.value || '').toLowerCase();
  return records.filter(r => {
    const status = (r.status || '').toLowerCase();
    if (recordQuickFilter === 'done' && status !== 'done') return false;
    if (recordQuickFilter === 'active' && status !== 'active') return false;
    if (recordQuickFilter === 'reserved' && status !== 'reserved') return false;
    if (recordQuickFilter === 'today' && recordDateValue(r) !== today) return false;
    if (recordQuickFilter === 'week' && !isRecordThisWeek(r)) return false;
    if (lab && String(r.lab) !== String(lab)) return false;
    return !q
      || String(r.idNum || '').toLowerCase().includes(q)
      || String(r.name || '').toLowerCase().includes(q)
      || String(r.purpose || '').toLowerCase().includes(q)
      || String(r.lab || '').toLowerCase().includes(q)
      || String(r.course || '').toLowerCase().includes(q)
      || String(r.status || '').toLowerCase().includes(q)
      || String(r.date || '').toLowerCase().includes(q);
  });
}

function setRecordQuickFilter(filter, btn) {
  recordQuickFilter = filter;
  document.querySelectorAll('.rec-filter-btn').forEach(b => b.classList.toggle('active', b === btn || b.dataset.recFilter === filter));
  recPage = 1;
  renderRecords();
}

function recordExportRows() {
  return currentRecordRows.length ? currentRecordRows : filterRecords(allRecordRows);
}

function exportRecordsCsv() {
  const rows = recordExportRows();
  if (!rows.length) {
    showNotify('No records available to export with the current filters.', 'warning');
    return;
  }
  const headers = ['Sit-in #', 'ID Number', 'Name', 'Purpose', 'Lab', 'PC', 'Login', 'Logout', 'Duration Minutes', 'Status', 'Date'];
  const body = rows.map(r => [
    r.sitId, r.idNum, r.name, r.purpose, r.lab, r.pc_number || '', r.login, r.logout,
    r.duration_minutes || '', r.status, r.date
  ]);
  const csv = [headers, ...body].map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sitin-records-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function printRecordsTable() {
  const rows = recordExportRows();
  if (!rows.length) {
    showNotify('No records available to print with the current filters.', 'warning');
    return;
  }
  const html = `
    <html><head><title>Sit-in Records</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;color:#111827}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #e5e7eb;text-align:left;font-size:12px}th{background:#1b2438;color:#fff}</style>
    </head><body><h2>Sit-in Records</h2><table><thead><tr><th>Sit-in #</th><th>ID</th><th>Name</th><th>Purpose</th><th>Lab</th><th>PC</th><th>Login</th><th>Logout</th><th>Duration</th><th>Status</th><th>Date</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${escapeHtml(r.sitId)}</td><td>${escapeHtml(r.idNum)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.purpose)}</td><td>${escapeHtml(r.lab)}</td><td>${escapeHtml(r.pc_number || '')}</td><td>${escapeHtml(r.login)}</td><td>${escapeHtml(r.logout)}</td><td>${escapeHtml(r.duration_minutes || '')}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.date)}</td></tr>`).join('')}</tbody></table></body></html>`;
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

async function renderRecords() {
  const wrap = document.getElementById('records-table-wrap');
  if (wrap) {
    wrap.innerHTML = `<div class="records-empty-state">
      <i class="fa fa-spinner fa-spin"></i>
      <p>Loading records...</p>
    </div>`;
  }
  try {
    const res = await fetch('api/admin.php?action=get_records', { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Unable to load records.');

    const all = Array.isArray(data.records) ? data.records : [];
    allRecordRows = all;
    populateRecordLabFilter(all);
    const pp = parseInt(document.getElementById('rec-per-page')?.value || '10');
    const filt = filterRecords(all);
    currentRecordRows = filt;
    const tot = filt.length, pages = Math.max(1, Math.ceil(tot / pp));
    if (recPage > pages) recPage = pages;
    const s = (recPage - 1) * pp, paged = filt.slice(s, s + pp);
    if (!wrap) return;

    const label = tot + ' record' + (tot !== 1 ? 's' : '');
    const badge = document.getElementById('rec-count-badge');
    const tableBadge = document.getElementById('rec-table-count');
    if (badge) badge.textContent = label;
    if (tableBadge) tableBadge.textContent = label;

    const completed = all.filter(r => (r.status || '').toLowerCase() === 'done');
    updateRecordOverview(completed);
    if (completed.length > 0) {
      const overview = document.getElementById('rec-overview');
      const charts = document.getElementById('rec-charts');
      if (overview) overview.style.display = 'grid';
      if (charts) charts.style.display = 'grid';
      try { renderRecordCharts(completed); } catch (chartErr) { console.error('Failed to render records charts', chartErr); }
    } else {
      const overview = document.getElementById('rec-overview');
      const charts = document.getElementById('rec-charts');
      if (overview) overview.style.display = 'none';
      if (charts) charts.style.display = 'none';
    }

    if (!paged.length) {
      wrap.innerHTML = `<div class="records-empty-state">
        <i class="fa fa-table-list"></i>
        <p>No sit-in records match the current filters.</p>
      </div>`;
      document.getElementById('rec-pagination').innerHTML = '';
      return;
    }

    wrap.innerHTML = `
      <table class="records-table">
        <thead><tr>
          <th>ID Number</th>
          <th>Name</th>
          <th>Purpose</th>
          <th style="text-align:center;">Lab Room</th>
          <th style="text-align:center;">PC</th>
          <th>Login</th>
          <th>Logout</th>
          <th>Duration</th>
          <th>Status</th>
          <th>Date</th>
          <th style="text-align:center;">Action</th>
        </tr></thead>
        <tbody>${paged.map((r, i) => `
          <tr style="animation-delay:${i * 0.03}s;">
            <td style="font-weight:800;color:#4a1d8f;white-space:nowrap;">${escapeHtml(r.idNum)}</td>
            <td>
              <div class="records-name-cell">
                <strong>${escapeHtml(r.name || 'Unknown Student')}</strong>
                <span>Sit-In #${escapeHtml(r.sitId)}</span>
              </div>
            </td>
            <td><span class="purpose-badge">${escapeHtml(r.purpose || 'Unspecified')}</span></td>
            <td style="text-align:center;"><span class="lab-badge">Lab ${escapeHtml(r.lab || '-')}</span></td>
            <td style="text-align:center;"><span class="pc-badge">${r.pc_number ? 'PC ' + escapeHtml(r.pc_number) : '-'}</span></td>
            <td style="font-size:13px;font-weight:700;">${escapeHtml(r.login || '-')}</td>
            <td style="font-size:13px;font-weight:700;">${escapeHtml(r.logout || '-')}</td>
            <td style="font-size:13px;font-weight:800;">${r.duration_minutes ? escapeHtml(r.duration_minutes) + ' min' : '-'}</td>
            <td><span class="status-chip status-${escapeAttr((r.status || '').toLowerCase())}">${escapeHtml(r.status || '-')}</span></td>
            <td style="font-size:12px;color:#6b7280;white-space:nowrap;">${escapeHtml(r.date || '-')}</td>
            <td style="text-align:center;">
              <button class="btn-rec-delete" onclick="deleteRecord(${r.sitId})" title="Delete record">
                <i class="fa fa-trash"></i>
              </button>
            </td>
          </tr>`).join('')}</tbody>
      </table>`;
    renderPagination('rec-pagination', recPage, pages, tot, s, Math.min(s + pp, tot), p => { recPage = p; renderRecords(); });
  } catch (e) {
    console.error('Failed to render records', e);
    if (wrap) {
      wrap.innerHTML = `<div class="records-empty-state">
        <i class="fa fa-triangle-exclamation"></i>
        <p>Unable to load records right now.</p>
      </div>`;
    }
    showNotify('Unable to load records. Please try again.', 'error');
  }
}

function renderRecordCharts(data) {
  const pm = countRecordValues(data, 'purpose');
  const lm = countRecordValues(data, 'lab');
  const cm = countRecordValues(data, 'course', 'Unassigned');
  const colors = ['#6b3ab5', '#2d5da1', '#f5a623', '#10b981', '#ef4444', '#8b5cf6', '#14b8a6'];
  const chartOptions = () => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '58%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { boxWidth: 10, usePointStyle: true, font: { size: 11, weight: '700' } }
      }
    }
  });

  const pCtx = document.getElementById('recPurposeChart')?.getContext('2d');
  const lCtx = document.getElementById('recLabChart')?.getContext('2d');
  const cCtx = document.getElementById('recCourseChart')?.getContext('2d');
  if (!pCtx || !lCtx || !cCtx) return;

  if (recPurposeChartInst) recPurposeChartInst.destroy();
  recPurposeChartInst = new Chart(pCtx, {
    type: 'doughnut',
    data: { labels: Object.keys(pm), datasets: [{ data: Object.values(pm), backgroundColor: colors, borderColor: '#fff', borderWidth: 3, hoverOffset: 6 }] },
    options: chartOptions()
  });

  if (recLabChartInst) recLabChartInst.destroy();
  recLabChartInst = new Chart(lCtx, {
    type: 'doughnut',
    data: { labels: Object.keys(lm).map(l => `Lab ${l}`), datasets: [{ data: Object.values(lm), backgroundColor: colors, borderColor: '#fff', borderWidth: 3, hoverOffset: 6 }] },
    options: chartOptions()
  });

  if (recCourseChartInst) recCourseChartInst.destroy();
  recCourseChartInst = new Chart(cCtx, {
    type: 'doughnut',
    data: { labels: Object.keys(cm), datasets: [{ data: Object.values(cm), backgroundColor: colors, borderColor: '#fff', borderWidth: 3, hoverOffset: 6 }] },
    options: chartOptions()
  });
}

function renderPagination(elId, current, pages, total, start, end, onPage) {
  const el = document.getElementById(elId);
  let b = `<button ${current === 1 ? 'disabled' : ''} onclick="(${onPage.toString()})(${current - 1})">&lsaquo;</button>`;
  for (let p = 1; p <= pages; p++) b += `<button class="${p === current ? 'active' : ''}" onclick="(${onPage.toString()})(${p})">${p}</button>`;
  b += `<button ${current === pages ? 'disabled' : ''} onclick="(${onPage.toString()})(${current + 1})">&rsaquo;</button>`;
  el.innerHTML = `<span>Showing ${total ? start + 1 : 0} to ${end} of ${total} entries</span><div class="dt-page-btns">${b}</div>`;
}

// â•â•â•â•â•â•â•â•â•â• FEEDBACK â•â•â•â•â•â•â•â•â•â•
let allFeedbacks = [];

async function loadFeedbacks() {
  try {
    const res = await fetch('api/admin.php?action=get_feedbacks', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      allFeedbacks = (data.feedbacks || []).map(normalizeFeedbackRecord);
      resetFeedbackFilterControls();
      renderFeedbacks();
    }
  } catch (e) { console.error('Admin action failed', e); }
}

let feedbackTableInstance = null;
let feedbackFilterRegistered = false;

function renderFeedbacks() {
  updateFeedbackTable(allFeedbacks);
}

function resetFeedbackFilterControls() {
  const search = document.getElementById('fb-custom-search');
  const lab = document.getElementById('fb-lab-filter');
  const rating = document.getElementById('fb-rating-filter');
  if (search) search.value = '';
  if (lab) lab.value = '';
  if (rating) rating.value = '';
  if (feedbackTableInstance) {
    try { feedbackTableInstance.search(''); } catch (e) {}
  }
}

function normalizeFeedbackRecord(row) {
  const fullName = row.name || row.student || row.student_name || '';
  const nameParts = String(fullName).trim().split(/\s+/);
  const firstFromName = nameParts[0] || '';
  const lastFromName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

  return {
    ...row,
    id: row.id ?? row.feedback_id ?? row.feedbackId ?? null,
    sitId: row.sitId ?? row.sit_id ?? null,
    idNum: String(row.idNum ?? row.id_number ?? row.student_id ?? row.idnum ?? ''),
    firstname: String(row.firstname ?? row.first_name ?? firstFromName ?? ''),
    lastname: String(row.lastname ?? row.last_name ?? lastFromName ?? ''),
    course: String(row.course ?? ''),
    level: String(row.level ?? row.year_level ?? ''),
    profilePic: String(row.profilePic ?? row.profile_pic ?? row.avatar ?? ''),
    lab: String(row.lab ?? row.laboratory ?? row.lab_number ?? ''),
    rating: parseInt(row.rating ?? row.stars ?? row.score ?? row.feedback_rating ?? row.student_rating ?? 0, 10) || 0,
    message: String(row.message ?? row.feedback ?? row.comment ?? ''),
    date: String(row.date ?? row.submitted ?? row.submitted_at ?? row.created_at ?? '')
  };
}

function updateFeedbackTable(records) {
  const tableEl = document.getElementById('feedback-datatable');
  if (!tableEl) return;

  const badge = document.getElementById('fb-count-badge');
  if (badge) badge.textContent = records.length;
  updateFeedbackSummary(records);
  populateFeedbackLabFilter(records);

  const canReuseFeedbackTable = feedbackTableInstance
    && feedbackTableInstance.table().node() === tableEl
    && feedbackTableInstance.columns().count() === 7;

  if (canReuseFeedbackTable) {
    feedbackTableInstance.clear();
    feedbackTableInstance.rows.add(records);
    feedbackTableInstance.search('');
    feedbackTableInstance.draw();
    return;
  }

  if (feedbackTableInstance) {
    try { feedbackTableInstance.destroy(); } catch (e) {}
    feedbackTableInstance = null;
  }

  if ($.fn.DataTable.isDataTable(tableEl)) {
    $(tableEl).DataTable().clear().destroy();
  }

  $('#fb-dt-buttons-container').empty();

  feedbackTableInstance = $(tableEl).DataTable({
    data: records,
    pageLength: 10,
    dom: '<"fb-dt-buttons-temp"B>rt<"dt-bottom"ip><"clear">',
    buttons: [
      { extend: 'csv', className: 'feedback-export-btn', text: '<i class="fa fa-file-csv"></i> CSV' },
      { extend: 'excel', className: 'feedback-export-btn', text: '<i class="fa fa-file-excel"></i> Excel' },
      { extend: 'pdf', className: 'feedback-export-btn', text: '<i class="fa fa-file-pdf"></i> PDF' },
      { extend: 'print', className: 'feedback-export-btn', text: '<i class="fa fa-print"></i> Print' }
    ],
    language: {
      emptyTable: "No feedback records found",
      zeroRecords: "No feedback records found"
    },
    initComplete: function() {
      // Move buttons to custom container
      $('.fb-dt-buttons-temp').contents().appendTo('#fb-dt-buttons-container');
      $('.fb-dt-buttons-temp').remove();
    },
    columns: [
      { 
        data: 'idNum',
        render: function(data) { return `<span style="font-weight:700; color:#4a1d8f;">${data || 'â€”'}</span>`; }
      },
      { 
        data: null,
        render: function(data, type, row) { 
          const hasPfp = row.profilePic && row.profilePic.length > 10;
          const initials = ((row.firstname || '?')[0] + (row.lastname || '?')[0]).toUpperCase();
          const avatarHtml = hasPfp
            ? `<img src="${row.profilePic}" class="stu-avatar" style="object-fit:cover; margin-right: 10px;" />`
            : `<div class="stu-avatar" style="background:linear-gradient(135deg,#7c3aed,#4a1d8f); margin-right: 10px;">${initials}</div>`;
            
          return `<div style="display:flex; align-items:center;">
                    ${avatarHtml}
                    <span style="font-weight:600; color:#2e0f66;">${row.firstname} ${row.lastname}</span>
                  </div>`; 
        }
      },
      { 
        data: 'lab',
        render: function(data) { 
          let labStr = String(data || '-');
          const missing = !data || labStr === '-';
          if (!missing && !labStr.toLowerCase().includes('lab')) labStr = 'Lab ' + labStr;
          return `<span class="lab-badge feedback-lab ${missing ? 'is-muted' : ''}">${missing ? 'No Lab' : escapeAdmin(labStr)}</span>`; 
        }
      },
      {
        data: 'rating',
        render: function(data) {
          const rating = Math.max(0, Math.min(5, parseInt(data || 0, 10)));
          if (!rating) return `<span class="feedback-no-rating">No rating</span>`;
          let stars = '';
          for (let i = 1; i <= 5; i++) stars += `<i class="fa fa-star ${i <= rating ? 'filled' : ''}"></i>`;
          return `<div class="feedback-rating"><span>${stars}</span><em>${rating || '-'}/5</em></div>`;
        }
      },
      { 
        data: 'date',
        render: function(data) { return `<span class="feedback-date">${formatFeedbackDate(data)}</span>`; }
      },
      { 
        data: 'message',
        render: function(data) { return `<span style="font-size:13px;color:#4b5563;">${data || 'â€”'}</span>`; }
      },
      {
        data: null,
        orderable: false,
        render: function(data, type, row) {
          const id = row.id || row.sitId || 'null';
          return `<div style="text-align:center;">
                    <button class="btn-rec-delete" onclick="deleteFeedback(${id})" title="Delete Feedback">
                      <i class="fa fa-trash"></i> Delete
                    </button>
                  </div>`;
        }
      }
    ],
    order: [[4, 'desc']] // Sort by date descending
  });

  // Link custom search input
  $('#fb-custom-search').off('keyup.feedback').on('keyup.feedback', function() {
    feedbackTableInstance.search(this.value).draw();
  });
  bindFeedbackFilters();
}

function escapeAdmin(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function formatFeedbackDate(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return escapeAdmin(value);
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function updateFeedbackSummary(records) {
  const avgEl = document.getElementById('fb-average-badge');
  if (!avgEl) return;
  const ratings = records.map(r => parseInt(r.rating || 0, 10)).filter(r => r >= 1 && r <= 5);
  const avg = ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;
  avgEl.textContent = avg ? avg.toFixed(1) : '0.0';
}

function populateFeedbackLabFilter(records) {
  const select = document.getElementById('fb-lab-filter');
  if (!select) return;
  const current = select.value;
  const labs = [...new Set(records.map(r => r.lab).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  select.innerHTML = '<option value="">All Laboratories</option>' + labs.map(lab => {
    const label = String(lab).toLowerCase().includes('lab') ? lab : `Lab ${lab}`;
    return `<option value="${escapeAdmin(lab)}">${escapeAdmin(label)}</option>`;
  }).join('');
  select.value = labs.includes(current) ? current : '';
}

function bindFeedbackFilters() {
  const lab = document.getElementById('fb-lab-filter');
  const rating = document.getElementById('fb-rating-filter');
  const clear = document.getElementById('fb-clear-filters');
  if (!feedbackTableInstance || !lab) return;

  if (!feedbackFilterRegistered) {
    $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
      if (settings.nTable.id !== 'feedback-datatable' || !feedbackTableInstance) return true;
      const activeLab = document.getElementById('fb-lab-filter');
      const activeRating = document.getElementById('fb-rating-filter');
      const row = feedbackTableInstance.row(dataIndex).data() || {};
      const labValue = activeLab ? activeLab.value : '';
      const ratingValue = activeRating ? activeRating.value : '';
      const rowRating = String(parseInt(row.rating || 0, 10) || '');
      return (!labValue || String(row.lab) === labValue) && (!ratingValue || rowRating === ratingValue);
    });
    feedbackFilterRegistered = true;
  }

  if (lab.dataset.bound) return;

  lab.addEventListener('change', () => feedbackTableInstance.draw());
  if (rating) rating.addEventListener('change', () => feedbackTableInstance.draw());
  if (clear) clear.addEventListener('click', () => {
    lab.value = '';
    if (rating) rating.value = '';
    const search = document.getElementById('fb-custom-search');
    if (search) search.value = '';
    feedbackTableInstance.search('').draw();
  });
  lab.dataset.bound = 'true';
}

async function deleteFeedback(id) {
  if (!id) {
    showNotify('Cannot delete this feedback.', 'error');
    return;
  }
  if (!confirm("Are you sure you want to delete this feedback?")) return;
  try {
    await fetch('api/admin.php?action=delete_feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    loadFeedbacks();
  } catch (e) {
    showNotify('Error deleting feedback.', 'error');
  }
}

function printFeedback() {
  document.body.classList.add('print-feedback');
  window.print();
  document.body.classList.remove('print-feedback');
}



// â•â•â•â•â•â•â•â•â•â• REPORTS â•â•â•â•â•â•â•â•â•â•
let reportsTableInstance = null;
let allReportsData = [];

function getReportGeneratedDateTime() {
  const now = new Date();
  return now.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function reportExportOptions() {
  return {
    columns: [0, 1, 2, 3, 4, 5, 6],
    stripHtml: true,
    modifier: {
      search: 'applied',
      order: 'applied',
      page: 'current'
    }
  };
}

function escapeReportHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getReportExportRows() {
  if (!reportsTableInstance) return allReportsData.slice(0, 10);
  return reportsTableInstance
    .rows({ search: 'applied', order: 'applied', page: 'all' })
    .data()
    .toArray();
}

function formatReportLab(value) {
  if (!value) return '';
  const text = String(value);
  return /^lab\s+/i.test(text) ? text : `Lab ${text}`;
}

function buildReportsPrintHtml() {
  const generatedAt = getReportGeneratedDateTime();
  const rows = getReportExportRows();
  const bodyRows = rows.length
    ? rows.map(row => `
        <tr>
          <td>${escapeReportHtml(row.idNum || '')}</td>
          <td>${escapeReportHtml(row.name || '')}</td>
          <td>${escapeReportHtml(row.purpose || '')}</td>
          <td>${escapeReportHtml(formatReportLab(row.lab))}</td>
          <td>${escapeReportHtml(row.login || '')}</td>
          <td>${escapeReportHtml(row.logout || '')}</td>
          <td>${escapeReportHtml(row.date || '')}</td>
        </tr>
      `).join('')
    : '<tr><td class="empty-report-row" colspan="7">No reports found.</td></tr>';

  return `
    <!doctype html>
    <html>
    <head>
    <meta charset="utf-8">
    <title>college-of-computer-studies-reference-report</title>
    <style>
      @page { size: A4 portrait; margin: 0; }
      * { box-sizing: border-box; }
      html,
      body {
        width: 210mm;
        min-height: 297mm;
        margin: 0;
        background: #fff;
        color: #2f3337;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 9.4px;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .report-page {
        width: 210mm;
        min-height: 297mm;
        padding: 4.8mm 8mm 12mm;
        background: #fff;
      }
      .generated-at {
        color: #4b5563;
        font-size: 8.5px;
        line-height: 1;
        margin: 0 0 8px;
      }
      .report-header {
        text-align: center;
        margin-bottom: 15px;
      }
      .system-name {
        color: #3f4650;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.15;
        margin-bottom: 7px;
      }
      .report-title {
        color: #232323;
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 18px;
        line-height: 1.1;
        font-weight: 700;
      }
      .report-table-wrap {
        width: 92%;
        margin: 0 auto;
        overflow: hidden;
        border: 1px solid #e2e5e9;
        border-radius: 10px;
        background: #fff;
        box-shadow: 0 7px 16px rgba(17, 24, 39, 0.08);
      }
      table {
        width: 100% !important;
        table-layout: fixed;
        border-collapse: separate;
        border-spacing: 0;
        font-size: 9px;
      }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      th:nth-child(1), td:nth-child(1) { width: 12%; }
      th:nth-child(2), td:nth-child(2) { width: 22%; }
      th:nth-child(3), td:nth-child(3) { width: 22%; }
      th:nth-child(4), td:nth-child(4) { width: 14%; }
      th:nth-child(5), td:nth-child(5) { width: 10%; }
      th:nth-child(6), td:nth-child(6) { width: 10%; }
      th:nth-child(7), td:nth-child(7) { width: 10%; }
      th {
        background: #f8f9fa !important;
        color: #a4a9b0 !important;
        font-weight: 600;
        text-align: center;
        padding: 6px 8px;
        border-right: 0;
        border-bottom: 1px solid #edf0f3;
        line-height: 1.1;
      }
      td {
        color: #2f3337;
        padding: 5px 8px;
        border-right: 0;
        border-bottom: 1px solid #edf0f3;
        vertical-align: middle;
        line-height: 1.2;
        overflow-wrap: anywhere;
      }
      td:nth-child(1),
      td:nth-child(4),
      td:nth-child(5),
      td:nth-child(6),
      td:nth-child(7) {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      td:nth-child(1),
      td:nth-child(4),
      td:nth-child(5),
      td:nth-child(6),
      td:nth-child(7) { text-align: center; white-space: nowrap; }
      td:nth-child(2),
      td:nth-child(3) { text-align: left; }
      td:last-child { border-right: 0; }
      tbody tr:nth-child(even) td { background: #fcfcfd; }
      tbody tr:last-child td { border-bottom: 0; }
      .empty-report-row {
        height: 40px;
        text-align: center !important;
        color: #8c929b;
      }
      @media screen {
        body {
          background: #2b2b2b;
        }
        .report-page {
          margin: 0 auto;
        }
      }
    </style>
    </head>
    <body>
    <main class="report-page">
      <div class="generated-at">${generatedAt}</div>
      <header class="report-header">
        <div class="system-name">University of Cebu – Main Campus System</div>
        <div class="report-title">College Of Computer Studies Reports</div>
      </header>
      <section class="report-table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID Number</th>
              <th>Name</th>
              <th>Purpose</th>
              <th>Laboratory</th>
              <th>Login</th>
              <th>Logout</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </section>
    </main>
    </body>
    </html>
  `;
}

function openReportsPrintWindow() {
  const win = window.open('', '_blank');
  if (!win) {
    showNotify('Allow pop-ups to generate the report PDF.', 'warning');
    return;
  }

  win.document.open();
  win.document.write(buildReportsPrintHtml());
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
}

function generateReportsPdf() {
  if (typeof html2pdf === 'undefined') {
    showNotify('PDF generator is still loading. Please try again in a moment.', 'warning');
    return;
  }

  const parsedReport = new DOMParser().parseFromString(buildReportsPrintHtml(), 'text/html');
  const reportHost = document.createElement('div');
  reportHost.style.position = 'fixed';
  reportHost.style.left = '-9999px';
  reportHost.style.top = '0';
  reportHost.style.width = '210mm';
  reportHost.style.background = '#ffffff';
  reportHost.appendChild(parsedReport.querySelector('style').cloneNode(true));
  reportHost.appendChild(parsedReport.querySelector('.report-page').cloneNode(true));
  document.body.appendChild(reportHost);

  html2pdf()
    .set({
      margin: 0,
      filename: 'college-of-computer-studies-reference-report.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait'
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    })
    .from(reportHost.querySelector('.report-page'))
    .save()
    .finally(() => {
      reportHost.remove();
    });
}

async function renderReports() {
  try {
    const res = await fetch('api/admin.php?action=get_records', { method: 'POST' });
    const data = await res.json();
    if (!data.success) return;
    
    // Reverse so newest is first
    allReportsData = data.records.slice().reverse();
    updateReportsTable(allReportsData);
  } catch(e) {}
}

function updateReportsTable(records) {
  if (reportsTableInstance) {
    reportsTableInstance.clear();
    reportsTableInstance.rows.add(records);
    reportsTableInstance.draw();
    return;
  }
  
  reportsTableInstance = $('#reports-datatable').DataTable({
    data: records,
    pageLength: 10,
    dom: '<"dt-top"Bf>rt<"dt-bottom"ip><"clear">',
    buttons: [
      { extend: 'csv', className: 'dt-btn-csv', text: '<i class="fa fa-file-csv" style="margin-right:5px;"></i> CSV' },
      { extend: 'excel', className: 'dt-btn-excel', text: '<i class="fa fa-file-excel" style="margin-right:5px;"></i> Excel' },
      {
        text: '<i class="fa fa-file-pdf" style="margin-right:5px;"></i> PDF',
        className: 'dt-btn-pdf',
        action: generateReportsPdf
      },
      {
        text: '<i class="fa fa-print" style="margin-right:5px;"></i> Print',
        className: 'dt-btn-print',
        action: openReportsPrintWindow
      }
    ],
    language: {
      search: "Filter: ",
      searchPlaceholder: "Search records...",
      emptyTable: "No reports found."
    },
    columns: [
      { 
        data: 'idNum',
        render: function(data) { return `<span style="font-weight:700; color:#4a1d8f;">${data || 'â€”'}</span>`; }
      },
      { 
        data: 'name',
        render: function(data) { return `<span style="font-weight:600; color:#2e0f66;">${data || 'â€”'}</span>`; }
      },
      { data: 'purpose', defaultContent: 'â€”' },
      { 
        data: 'lab',
        render: function(data) { return `<div style="text-align:center;"><span class="lab-badge">${data || 'â€”'}</span></div>`; }
      },
      { 
        data: 'login',
        render: function(data) { return `<span style="font-size:13px;font-weight:600;">${data || 'â€”'}</span>`; }
      },
      { 
        data: 'logout',
        render: function(data) { return `<span style="font-size:13px;font-weight:600;">${data || 'â€”'}</span>`; }
      },
      { 
        data: 'date',
        render: function(data) { return `<span style="font-size:12px;color:#6b7280;">${data || 'â€”'}</span>`; }
      }
    ],
    destroy: true,
    ordering: false,
    createdRow: function(row, data, dataIndex) {
      $(row).css('animation', `fadeSlideIn 0.3s ease both`);
      $(row).css('animation-delay', `${(dataIndex % 10) * 0.03}s`);
    }
  });
}

function applyReportFilter() {
  const dateVal = document.getElementById('report-date-filter').value;
  if (!dateVal) {
    updateReportsTable(allReportsData);
    return;
  }
  
  const filtered = allReportsData.filter(r => {
    return r.date && r.date.includes(dateVal);
  });
  updateReportsTable(filtered);
}

function resetReportFilter() {
  document.getElementById('report-date-filter').value = '';
  updateReportsTable(allReportsData);
}

// â•â•â•â•â•â•â•â•â•â• RESERVATION MANAGEMENT â•â•â•â•â•â•â•â•â•â•
let adminSelectedLab = '524';
let resvPage = 1, logPage = 1;
let allReservations = [], allLogData = [];
let resvSystemOpen = true;
let pendingCheckinReservationId = null;
let adminLabClosed = false;

function initReservationTab() {
  const dateEl = document.getElementById('admin-resv-date');
  if (dateEl && !dateEl.value) {
    dateEl.value = new Date().toISOString().split('T')[0];
  }
  loadAdminPCGrid();
  loadPendingRequests();
  loadAllReservations();
  loadLogHistory();
}

// â”€â”€ Tab Switching â”€â”€
function switchResvTab(tab) {
  document.querySelectorAll('.resv-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.resv-tab-content').forEach(c => c.style.display = 'none');
  document.getElementById('tab-' + tab)?.classList.add('active');
  document.getElementById('tab-content-' + tab).style.display = 'flex';
  if (tab === 'pending') loadPendingRequests();
  if (tab === 'requests') loadAllReservations();
  if (tab === 'history') loadLogHistory();
  if (tab === 'status') loadAdminPCGrid();
}

// â”€â”€ Toggle Reservation System â”€â”€
function toggleReservationSystem() {
  resvSystemOpen = !resvSystemOpen;
  const dot = document.getElementById('resv-toggle-dot');
  const label = document.getElementById('resv-toggle-label');
  if (resvSystemOpen) {
    dot.classList.remove('closed');
    label.textContent = 'Reservations OPEN';
  } else {
    dot.classList.add('closed');
    label.textContent = 'Reservations CLOSED';
  }
  showNotify(resvSystemOpen ? 'Reservation system is now OPEN.' : 'Reservation system is now CLOSED.', resvSystemOpen ? 'success' : 'warning');
}

// â”€â”€ Lab Selection â”€â”€
function adminSelectLab(lab, el) {
  adminSelectedLab = lab;
  document.querySelectorAll('.resv-lab-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('admin-grid-lab').textContent = 'Lab ' + lab;
  loadAdminPCGrid();
}

// â”€â”€ Load Admin PC Grid â”€â”€
async function loadAdminPCGrid() {
  const lab = adminSelectedLab;
  const date = document.getElementById('admin-resv-date')?.value || '';
  const timeSlot = document.getElementById('admin-resv-timeslot')?.value || '';
  const grid = document.getElementById('admin-pc-grid');
  if (!grid) return;

  if (!date) {
    grid.innerHTML = '<div class="resv-pc-placeholder"><i class="fa fa-calendar" style="font-size:2.5rem;color:#d1c4e9;"></i><span>Select a date to view PC availability</span></div>';
    return;
  }

  grid.innerHTML = '<div class="resv-pc-placeholder"><i class="fa fa-spinner fa-spin" style="font-size:2rem;color:#7c3aed;"></i><span>Loading...</span></div>';

  try {
    const res = await fetch('api/admin.php?action=get_pc_status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lab, date, time_slot: timeSlot })
    });
    const data = await res.json();
    if (data.success) {
      adminLabClosed = !!data.lab_closed;
      updateAdminLabCloseButton();
      renderAdminPCGrid(data.pcs || {}, data.total_pcs || 40);
    } else {
      grid.innerHTML = '<div class="resv-pc-placeholder"><i class="fa fa-exclamation-triangle" style="font-size:2rem;color:#f59e0b;"></i><span>' + (data.message || 'Failed') + '</span></div>';
    }
  } catch (e) {
    grid.innerHTML = '<div class="resv-pc-placeholder"><i class="fa fa-wifi" style="font-size:2rem;color:#ef4444;"></i><span>Connection error</span></div>';
  }
}

function renderAdminPCGrid(pcMap, total) {
  const grid = document.getElementById('admin-pc-grid');
  let html = '', avail = 0, reserved = 0, active = 0, blocked = 0;
  for (let i = 1; i <= total; i++) {
    const info = pcMap[i] || null;
    let cls = 'available', occupant = '';
    if (info) {
      if (info.status === 'Reserved') { cls = 'reserved'; reserved++; occupant = info.name || info.idNum || ''; }
      else if (info.status === 'Active') { cls = 'active-pc'; active++; occupant = info.name || info.idNum || ''; }
      else if (info.status === 'Unavailable' || info.status === 'LabClosed') { cls = 'blocked'; blocked++; }
    } else { avail++; }
    const occHtml = occupant ? `<span class="pc-occupant" title="${occupant}">${occupant.split(' ')[0]}</span>` : '';
    const detailAction = info ? `showPCDetail(${i}, '${cls}', ${JSON.stringify(info).replace(/'/g, "\\'")})` : '';
    const clickAction = cls === 'available'
      ? `onclick="toggleAdminPCBlocked(${i}, true)"`
      : cls === 'blocked' && info?.status === 'Unavailable'
        ? `onclick="toggleAdminPCBlocked(${i}, false)"`
        : cls === 'blocked'
          ? `onclick="showNotify('Open the lab first before changing individual PCs.', 'warning')"`
          : `onclick="${detailAction}"`;
    
    let titleSuffix = 'Available';
    if (cls === 'reserved') titleSuffix = 'Reserved';
    if (cls === 'active-pc') titleSuffix = 'Active';
    if (cls === 'blocked') titleSuffix = info?.status === 'LabClosed' ? 'Lab Closed' : 'Unavailable';

    html += `<div class="resv-pc-cell ${cls}" ${clickAction} title="PC ${i}${occupant ? ' â€” ' + occupant : ''}">
      <i class="fa fa-desktop"></i>
      <span class="pc-num">PC ${i}</span>
      <span class="pc-status-text">${titleSuffix}</span>
      ${occHtml}
    </div>`;
  }
  grid.innerHTML = html;
  document.getElementById('admin-avail-count').textContent = avail;
  document.getElementById('admin-reserved-count').textContent = reserved;
  document.getElementById('admin-active-count').textContent = active;
  const blockedEl = document.getElementById('admin-blocked-count');
  if (blockedEl) blockedEl.textContent = blocked;
}

function updateAdminLabCloseButton() {
  const btn = document.getElementById('admin-lab-close-btn');
  if (!btn) return;
  btn.innerHTML = adminLabClosed
    ? '<i class="fa fa-lock-open"></i> Open Lab'
    : '<i class="fa fa-lock"></i> Close Selected Lab';
  btn.style.background = adminLabClosed ? '#dcfce7' : '#f5a623';
  btn.style.color = adminLabClosed ? '#14532d' : '#270747';
}

async function toggleAdminLabClosed() {
  const date = document.getElementById('admin-resv-date')?.value || '';
  const timeSlot = document.getElementById('admin-resv-timeslot')?.value || '';
  if (!date) { showNotify('Please select a date first.', 'warning'); return; }
  const closing = !adminLabClosed;
  const scope = timeSlot || 'all time slots';
  if (closing && !confirm(`Close Lab ${adminSelectedLab} on ${date} for ${scope}? Students will not be able to reserve any PC.`)) return;

  try {
    const res = await fetch('api/admin.php?action=set_lab_block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lab: adminSelectedLab, date, time_slot: timeSlot, closed: closing })
    });
    const data = await res.json();
    if (data.success) {
      showNotify(data.message, closing ? 'warning' : 'success');
      loadAdminPCGrid();
    } else {
      showNotify(data.message || 'Failed to update lab availability.', 'error');
    }
  } catch (e) {
    showNotify('Connection error.', 'error');
  }
}

async function toggleAdminPCBlocked(pcNumber, blocked) {
  const date = document.getElementById('admin-resv-date')?.value || '';
  const timeSlot = document.getElementById('admin-resv-timeslot')?.value || '';
  if (!date) { showNotify('Please select a date first.', 'warning'); return; }
  const scope = timeSlot || 'all time slots';
  if (blocked && !confirm(`Mark PC ${pcNumber} in Lab ${adminSelectedLab} unavailable on ${date} for ${scope}?`)) return;

  try {
    const res = await fetch('api/admin.php?action=set_pc_block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lab: adminSelectedLab, date, time_slot: timeSlot, pc_number: pcNumber, blocked })
    });
    const data = await res.json();
    if (data.success) {
      showNotify(data.message, blocked ? 'warning' : 'success');
      loadAdminPCGrid();
    } else {
      showNotify(data.message || 'Failed to update PC availability.', 'error');
    }
  } catch (e) {
    showNotify('Connection error.', 'error');
  }
}

function showPCDetail(pcNum, status, info) {
  const body = document.getElementById('resv-detail-body');
  const footer = document.getElementById('resv-detail-footer');
  const statusBadge = status === 'reserved'
    ? '<span class="status-reserved"><i class="fa fa-calendar-check" style="font-size:10px;"></i>Reserved</span>'
    : '<span class="status-active"><span class="dot"></span>Active</span>';
  body.innerHTML = `
    <div style="text-align:center;margin-bottom:0.8rem;">
      <div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#7c3aed,#4a1d8f);display:flex;align-items:center;justify-content:center;margin:0 auto 0.5rem;">
        <i class="fa fa-desktop" style="color:#fff;font-size:1.4rem;"></i>
      </div>
      <div style="font-family:Raleway,sans-serif;font-weight:800;font-size:1.1rem;color:#2e0f66;">PC ${pcNum}</div>
      <div style="margin-top:4px;">${statusBadge}</div>
    </div>
    <div class="resv-detail-grid">
      <div class="resv-detail-item"><span class="resv-detail-label">Student</span><span class="resv-detail-value">${info.name || 'â€”'}</span></div>
      <div class="resv-detail-item"><span class="resv-detail-label">ID Number</span><span class="resv-detail-value">${info.idNum || 'â€”'}</span></div>
      <div class="resv-detail-item"><span class="resv-detail-label">Time Slot</span><span class="resv-detail-value">${info.time_slot || 'â€”'}</span></div>
      <div class="resv-detail-item"><span class="resv-detail-label">Purpose</span><span class="resv-detail-value">${info.purpose || 'â€”'}</span></div>
    </div>`;
  footer.innerHTML = '<button class="btn-mprem-cancel" onclick="closeResvDetailModal()">Close</button>';
  document.getElementById('resv-detail-modal').style.display = 'flex';
}

function closeResvDetailModal() {
  document.getElementById('resv-detail-modal').style.display = 'none';
}

function showReservationRowDetail(sitId) {
  const r = allReservations.find(item => Number(item.sitId) === Number(sitId))
    || allLogData.find(item => Number(item.sitId) === Number(sitId));
  if (!r) {
    showNotify('Reservation details are not available yet.', 'warning');
    return;
  }

  const sl = (r.status || '').toLowerCase();
  const statusBadge = sl === 'reserved' ? '<span class="status-reserved"><i class="fa fa-calendar-check" style="font-size:10px;"></i>Reserved</span>'
    : sl === 'active' ? '<span class="status-active"><span class="dot"></span>Active</span>'
    : sl === 'done' ? '<span class="status-done"><i class="fa fa-circle-check" style="font-size:10px;"></i>Done</span>'
    : `<span class="resv-action-muted">${escapeHtml(r.status || 'No status')}</span>`;

  const body = document.getElementById('resv-detail-body');
  const footer = document.getElementById('resv-detail-footer');
  body.innerHTML = `
    <div style="text-align:center;margin-bottom:0.9rem;">
      <div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#7c3aed,#4a1d8f);display:flex;align-items:center;justify-content:center;margin:0 auto 0.5rem;">
        <i class="fa fa-calendar-check" style="color:#fff;font-size:1.35rem;"></i>
      </div>
      <div style="font-family:Raleway,sans-serif;font-weight:800;font-size:1.1rem;color:#2e0f66;">${escapeHtml(r.name || 'Reservation')}</div>
      <div style="margin-top:5px;">${statusBadge}</div>
    </div>
    <div class="resv-detail-grid">
      <div class="resv-detail-item"><span class="resv-detail-label">ID Number</span><span class="resv-detail-value">${escapeHtml(r.idNum || '-')}</span></div>
      <div class="resv-detail-item"><span class="resv-detail-label">Lab / PC</span><span class="resv-detail-value">Lab ${escapeHtml(r.lab || '-')} - PC ${escapeHtml(r.pc_number || '-')}</span></div>
      <div class="resv-detail-item"><span class="resv-detail-label">Date</span><span class="resv-detail-value">${escapeHtml(r.date || '-')}</span></div>
      <div class="resv-detail-item"><span class="resv-detail-label">Time Slot</span><span class="resv-detail-value">${escapeHtml(r.time_slot || '-')}</span></div>
      <div class="resv-detail-item"><span class="resv-detail-label">Time In</span><span class="resv-detail-value">${escapeHtml(r.login || '-')}</span></div>
      <div class="resv-detail-item"><span class="resv-detail-label">Time Out</span><span class="resv-detail-value">${escapeHtml(r.logout || '-')}</span></div>
      <div class="resv-detail-item full"><span class="resv-detail-label">Purpose</span><span class="resv-detail-value">${escapeHtml(r.purpose || '-')}</span></div>
    </div>`;

  const actionButtons = sl === 'reserved'
    ? `<button class="resv-checkin-confirm" onclick="closeResvDetailModal();checkinReservation(${Number(r.sitId)})"><i class="fa fa-right-to-bracket"></i> Check In</button>
       <button class="resv-checkin-cancel danger" onclick="closeResvDetailModal();rejectReservation(${Number(r.sitId)})"><i class="fa fa-xmark"></i> Cancel Reservation</button>`
    : sl === 'active'
      ? `<button class="resv-checkin-confirm" onclick="closeResvDetailModal();completeReservationSession(${Number(r.sitId)})"><i class="fa fa-right-from-bracket"></i> End Session</button>`
      : '';
  footer.innerHTML = `${actionButtons}<button class="btn-mprem-cancel" onclick="closeResvDetailModal()">Close</button>`;
  document.getElementById('resv-detail-modal').style.display = 'flex';
}

// â”€â”€ Pending Requests â”€â”€
async function loadPendingRequests() {
  try {
    const res = await fetch('api/admin.php?action=get_pending_reservations', { method: 'POST' });
    const data = await res.json();
    if (!data.success) return;
    const list = data.reservations || [];
    const badge = document.getElementById('pending-count-badge');
    const badge2 = document.getElementById('pending-badge');
    if (badge) { badge.textContent = list.length; badge.style.display = list.length > 0 ? 'inline' : 'none'; }
    if (badge2) badge2.textContent = list.length;
    const wrap = document.getElementById('resv-pending-list');
    if (!wrap) return;
    if (!list.length) {
      wrap.innerHTML = `<div class="resv-empty-state"><i class="fa fa-check-double"></i><strong>No pending requests</strong><span>All reservation requests have been processed.</span></div>`;
      return;
    }
    wrap.innerHTML = list.map((r, i) => {
      const initials = ((r.firstname || '?')[0] + (r.lastname || '?')[0]).toUpperCase();
      const hasPfp = r.profilePic && r.profilePic.length > 10;
      const avatar = hasPfp
        ? `<img src="${r.profilePic}" class="resv-pending-avatar" />`
        : `<div class="resv-pending-avatar">${initials}</div>`;
      return `<div class="resv-pending-card" style="animation-delay:${i * 0.05}s">
        ${avatar}
        <div class="resv-pending-info">
          <div class="resv-pending-name">${escapeHtml(r.firstname || '')} ${escapeHtml(r.lastname || '')} <span style="color:#9ca3af;font-weight:600;font-size:12px;">(${escapeHtml(r.idNum)})</span></div>
          <div class="resv-pending-meta">
            <span><i class="fa fa-laptop"></i>Lab ${escapeHtml(r.lab)}</span>
            <span><i class="fa fa-desktop"></i>PC ${escapeHtml(r.pc_number)}</span>
            <span><i class="fa fa-calendar"></i>${escapeHtml(r.date)}</span>
            <span><i class="fa fa-clock"></i>${escapeHtml(r.time_slot)}</span>
            <span><i class="fa fa-bullseye"></i>${escapeHtml(r.purpose || '-')}</span>
          </div>
        </div>
        <div class="resv-pending-actions">
          <button class="resv-btn-checkin" onclick="checkinReservation(${r.sitId})" title="Check-in"><i class="fa fa-right-to-bracket"></i> Check-in</button>
          <button class="resv-btn-reject" onclick="rejectReservation(${r.sitId})" title="Reject"><i class="fa fa-xmark"></i> Reject</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) { console.error('Admin action failed', e); }
}

function checkinReservation(sitId) {
  pendingCheckinReservationId = sitId;
  const modal = document.getElementById('resv-checkin-modal');
  if (!modal) {
    confirmCheckinReservation();
    return;
  }
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('resv-checkin-confirm-btn')?.focus(), 0);
}

function closeCheckinReservationModal() {
  pendingCheckinReservationId = null;
  const modal = document.getElementById('resv-checkin-modal');
  if (modal) modal.style.display = 'none';
}

document.addEventListener('click', function(e) {
  const modal = document.getElementById('resv-checkin-modal');
  if (modal && modal.style.display === 'flex' && e.target === modal) {
    closeCheckinReservationModal();
  }
});

async function confirmCheckinReservation() {
  const sitId = pendingCheckinReservationId;
  if (!sitId) return;
  const btn = document.getElementById('resv-checkin-confirm-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Checking in';
  }
  try {
    const res = await fetch('api/admin.php?action=checkin_reservation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sitId })
    });
    const data = await res.json();
    if (data.success) {
      closeCheckinReservationModal();
      showNotify(data.message, 'success');
      loadPendingRequests(); loadAllReservations(); loadAdminPCGrid(); loadStats();
    } else { showNotify(data.message || 'Failed.', 'error'); }
  } catch (e) { showNotify('Connection error.', 'error'); }
  finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa fa-check"></i> Check In';
    }
  }
}

async function rejectReservation(sitId) {
  const r = allReservations.find(item => Number(item.sitId) === Number(sitId));
  const message = r
    ? `Cancel reservation for ${r.name || r.idNum || 'this student'} at Lab ${r.lab || '-'}, PC ${r.pc_number || '-'}, ${r.time_slot || 'the selected time slot'}? The session will be refunded to the student.`
    : 'Cancel this reservation? The session will be refunded to the student.';
  if (!confirm(message)) return;
  try {
    const res = await fetch('api/admin.php?action=reject_reservation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sitId })
    });
    const data = await res.json();
    if (data.success) {
      showNotify(data.message, 'success');
      loadPendingRequests(); loadAllReservations(); loadAdminPCGrid(); loadStats();
    } else { showNotify(data.message || 'Failed.', 'error'); }
  } catch (e) { showNotify('Connection error.', 'error'); }
}

async function completeReservationSession(sitId) {
  const r = allReservations.find(item => Number(item.sitId) === Number(sitId));
  const message = r
    ? `End the active session for ${r.name || r.idNum || 'this student'} at Lab ${r.lab || '-'}, PC ${r.pc_number || '-'}?`
    : 'End this active session?';
  if (!confirm(message)) return;
  try {
    await endSitin(sitId, true);
    showNotify('Session ended successfully.', 'success');
    loadAllReservations(); loadAdminPCGrid(); loadStats(); renderCurrentSitin?.();
  } catch (e) {
    showNotify('Connection error.', 'error');
  }
}

// â”€â”€ All Reservations Table â”€â”€
async function loadAllReservations() {
  try {
    const res = await fetch('api/admin.php?action=get_reservations', { method: 'POST' });
    const data = await res.json();
    if (data.success) { allReservations = data.reservations || []; renderAllReservations(); }
    const badge = document.getElementById('resv-count-badge');
    if (badge) badge.textContent = allReservations.length + ' reservation' + (allReservations.length !== 1 ? 's' : '');
  } catch (e) { console.error('Admin action failed', e); }
}

function renderAllReservations() {
  const q = (document.getElementById('resv-all-search')?.value || '').toLowerCase();
  const pp = parseInt(document.getElementById('resv-per-page')?.value || '10');
  const filt = allReservations.filter(r => !q || r.idNum?.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q) || r.purpose?.toLowerCase().includes(q) || r.lab?.toLowerCase().includes(q) || r.date?.includes(q));
  const tot = filt.length, pages = Math.max(1, Math.ceil(tot / pp));
  if (resvPage > pages) resvPage = pages;
  const s = (resvPage - 1) * pp, paged = filt.slice(s, s + pp);
  const wrap = document.getElementById('resv-all-table-wrap');
  if (!wrap) return;
  if (!paged.length) {
    wrap.innerHTML = `<div class="resv-empty-state"><i class="fa fa-calendar-xmark"></i><strong>No reservations found</strong><span>No matching reservations.</span></div>`;
    document.getElementById('resv-all-pagination').innerHTML = '';
    return;
  }
  wrap.innerHTML = `<table class="resv-table"><thead><tr>
    <th>Student</th><th>ID Number</th><th>Lab</th><th>PC</th><th>Date</th><th>Time Slot</th><th>Purpose</th><th style="text-align:center;">Status</th><th style="text-align:center;">Action</th>
  </tr></thead><tbody>${paged.map((r, i) => {
    const sl = (r.status || '').toLowerCase();
    const statusBadge = sl === 'reserved' ? '<span class="status-reserved"><i class="fa fa-calendar-check" style="font-size:10px;"></i>Reserved</span>'
      : sl === 'active' ? '<span class="status-active"><span class="dot"></span>Active</span>'
      : sl === 'done' ? '<span class="status-done"><i class="fa fa-circle-check" style="font-size:10px;"></i>Done</span>'
      : `<span style="color:#888;font-weight:700;">${r.status}</span>`;
    const actions = sl === 'reserved'
      ? `<div class="resv-table-actions">
          <button class="resv-action-primary" onclick="checkinReservation(${r.sitId})" title="Check in student"><i class="fa fa-right-to-bracket"></i><span>Check in</span></button>
          <button class="resv-action-danger" onclick="rejectReservation(${r.sitId})" title="Cancel reservation"><i class="fa fa-xmark"></i><span>Cancel</span></button>
          <button class="resv-action-icon" onclick="showReservationRowDetail(${r.sitId})" title="View reservation details" aria-label="View reservation details"><i class="fa fa-circle-info"></i></button>
        </div>`
      : sl === 'active'
        ? `<div class="resv-table-actions">
            <button class="resv-action-primary subtle" onclick="completeReservationSession(${r.sitId})" title="End active session"><i class="fa fa-right-from-bracket"></i><span>End</span></button>
            <button class="resv-action-icon" onclick="showReservationRowDetail(${r.sitId})" title="View reservation details" aria-label="View reservation details"><i class="fa fa-circle-info"></i></button>
          </div>`
        : sl === 'done'
          ? `<div class="resv-table-actions is-done"><button class="resv-action-secondary" onclick="showReservationRowDetail(${r.sitId})" title="View reservation details"><i class="fa fa-eye"></i><span>View</span></button></div>`
          : `<span class="resv-action-muted">No action</span>`;
    return `<tr style="animation-delay:${i * 0.03}s">
      <td style="font-weight:600;color:#2e0f66;white-space:nowrap;">${escapeHtml(r.name || '-')}</td>
      <td style="font-weight:700;color:#4a1d8f;">${escapeHtml(r.idNum)}</td>
      <td><span class="lab-badge">${escapeHtml(r.lab)}</span></td>
      <td style="font-weight:700;">PC ${escapeHtml(r.pc_number || '-')}</td>
      <td style="font-size:12px;color:#6b7280;">${escapeHtml(r.date || '-')}</td>
      <td style="font-size:12px;font-weight:600;">${escapeHtml(r.time_slot || '-')}</td>
      <td style="font-size:13px;">${escapeHtml(r.purpose || '-')}</td>
      <td style="text-align:center;">${statusBadge}</td>
      <td style="text-align:center;">${actions}</td>
    </tr>`;
  }).join('')}</tbody></table>`;
  renderPagination('resv-all-pagination', resvPage, pages, tot, s, Math.min(s + pp, tot), p => { resvPage = p; renderAllReservations(); });
}

// â”€â”€ Log History â”€â”€
async function loadLogHistory() {
  try {
    const res = await fetch('api/admin.php?action=get_reservation_log', { method: 'POST' });
    const data = await res.json();
    if (data.success) { allLogData = data.log || []; renderLogHistory(); }
  } catch (e) { console.error('Admin action failed', e); }
}

function renderLogHistory() {
  const q = (document.getElementById('resv-log-search')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('resv-log-filter')?.value || '';
  const dateFilter = document.getElementById('resv-log-date')?.value || '';
  const pp = 15;
  let filt = allLogData;
  if (statusFilter) filt = filt.filter(r => r.status === statusFilter);
  if (dateFilter) filt = filt.filter(r => r.date === dateFilter);
  if (q) filt = filt.filter(r => r.idNum?.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q) || r.purpose?.toLowerCase().includes(q) || r.lab?.toLowerCase().includes(q));
  const tot = filt.length, pages = Math.max(1, Math.ceil(tot / pp));
  if (logPage > pages) logPage = pages;
  const s = (logPage - 1) * pp, paged = filt.slice(s, s + pp);
  const wrap = document.getElementById('resv-log-table-wrap');
  if (!wrap) return;
  if (!paged.length) {
    wrap.innerHTML = `<div class="resv-empty-state"><i class="fa fa-clock-rotate-left"></i><strong>No log entries</strong><span>No matching reservation history.</span></div>`;
    document.getElementById('resv-log-pagination').innerHTML = '';
    return;
  }
  wrap.innerHTML = `<table class="resv-table"><thead><tr>
    <th>#</th><th>Student</th><th>ID</th><th>Lab</th><th>PC</th><th>Date</th><th>Time Slot</th><th>Purpose</th><th>Time In</th><th>Time Out</th><th style="text-align:center;">Status</th>
  </tr></thead><tbody>${paged.map((r, i) => {
    const sl = (r.status || '').toLowerCase();
    const statusBadge = sl === 'reserved' ? '<span class="status-reserved"><i class="fa fa-calendar-check" style="font-size:10px;"></i>Reserved</span>'
      : sl === 'active' ? '<span class="status-active"><span class="dot"></span>Active</span>'
      : sl === 'done' ? '<span class="status-done"><i class="fa fa-circle-check" style="font-size:10px;"></i>Done</span>'
      : `<span style="color:#888;font-weight:700;">${r.status || 'â€”'}</span>`;
    return `<tr style="animation-delay:${i * 0.03}s">
      <td style="color:#9ca3af;font-weight:600;">#${escapeHtml(r.sitId)}</td>
      <td style="font-weight:600;color:#2e0f66;">${escapeHtml(r.name || '-')}</td>
      <td style="font-weight:700;color:#4a1d8f;">${escapeHtml(r.idNum)}</td>
      <td><span class="lab-badge">${escapeHtml(r.lab)}</span></td>
      <td style="font-weight:700;">PC ${escapeHtml(r.pc_number || '-')}</td>
      <td style="font-size:12px;color:#6b7280;">${escapeHtml(r.date || '-')}</td>
      <td style="font-size:12px;font-weight:600;">${escapeHtml(r.time_slot || '-')}</td>
      <td style="font-size:13px;">${escapeHtml(r.purpose || '-')}</td>
      <td style="font-size:13px;font-weight:600;">${escapeHtml(r.login || '-')}</td>
      <td style="font-size:13px;font-weight:600;">${escapeHtml(r.logout || '-')}</td>
      <td style="text-align:center;">${statusBadge}</td>
    </tr>`;
  }).join('')}</tbody></table>`;
  renderPagination('resv-log-pagination', logPage, pages, tot, s, Math.min(s + pp, tot), p => { logPage = p; renderLogHistory(); });
}

function resetLogFilters() {
  document.getElementById('resv-log-filter').value = '';
  document.getElementById('resv-log-date').value = '';
  document.getElementById('resv-log-search').value = '';
  logPage = 1;
  renderLogHistory();
}

// Lab Software Management
let labSoftwareAdminData = [];
let labSoftwareLabs = [];
let labSoftwareCategories = ['IDE', 'WEB', 'DEV', 'DB', 'TOOL', 'OS'];
let labSoftwareCategoryFilter = 'ALL';
let labSoftwareEditingId = null;
let labSoftwareSaveInFlight = false;
let labSoftwareCleanupNoticeShown = false;
const labSoftwareMeta = {
  IDE: { icon: 'fa-code', color: '#4f46e5', bg: '#eef2ff' },
  WEB: { icon: 'fa-globe', color: '#2563eb', bg: '#eff6ff' },
  DEV: { icon: 'fa-terminal', color: '#059669', bg: '#ecfdf5' },
  DB: { icon: 'fa-database', color: '#7c3aed', bg: '#f3edff' },
  TOOL: { icon: 'fa-screwdriver-wrench', color: '#d97706', bg: '#fffbeb' },
  OS: { icon: 'fa-window-maximize', color: '#475569', bg: '#f8fafc' }
};

function normalizeLabSoftwareValue(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeLabSoftwareVersionValue(value) {
  return normalizeLabSoftwareValue(value).replace(/^v\s*/, '');
}

function labSoftwareUniqueKey(sw) {
  return [
    String(sw.lab || ''),
    normalizeLabSoftwareValue(sw.name),
    normalizeLabSoftwareVersionValue(sw.version)
  ].join('|');
}

function uniqueLabSoftwareItems(items = []) {
  const byVersion = new Map();
  const emptyByName = new Map();

  items.forEach(sw => {
    const nameKey = `${sw.lab || ''}|${normalizeLabSoftwareValue(sw.name)}`;
    const versionKey = normalizeLabSoftwareVersionValue(sw.version);
    if (!versionKey) {
      if (!emptyByName.has(nameKey)) emptyByName.set(nameKey, sw);
      return;
    }
    const key = labSoftwareUniqueKey(sw);
    if (!byVersion.has(key)) byVersion.set(key, sw);
  });

  const versionedNameKeys = new Set(
    Array.from(byVersion.values()).map(sw => `${sw.lab || ''}|${normalizeLabSoftwareValue(sw.name)}`)
  );
  const emptyItems = Array.from(emptyByName.entries())
    .filter(([nameKey]) => !versionedNameKeys.has(nameKey))
    .map(([, sw]) => sw);

  return [...Array.from(byVersion.values()), ...emptyItems]
    .sort((a, b) => String(a.category || '').localeCompare(String(b.category || '')) || String(a.name || '').localeCompare(String(b.name || '')));
}

function uniqueLabSoftwareData(labs = []) {
  return labs.map(lab => ({
    ...lab,
    software: uniqueLabSoftwareItems((lab.software || []).map(sw => ({ ...sw, lab: sw.lab || lab.lab })))
  }));
}

function findLabSoftwareById(id) {
  const targetId = Number(id);
  for (const lab of labSoftwareAdminData) {
    const item = (lab.software || []).find(sw => Number(sw.id) === targetId);
    if (item) return { ...item, lab: item.lab || lab.lab };
  }
  return null;
}

function labSoftwareSearchText(sw) {
  return normalizeLabSoftwareValue([
    sw.name || '',
    sw.category || '',
    `Lab ${sw.lab || ''}`,
    sw.lab || '',
    sw.version || '',
    sw.version ? `v${sw.version}` : ''
  ].join(' '));
}

function formatLabSoftwareMeta(sw) {
  return `${escapeHtml(sw.category || 'TOOL')} &bull; Lab ${escapeHtml(sw.lab || '')} &bull; ${escapeHtml(formatLabSoftwareVersion(sw.version))}`;
}

function formatLabSoftwareVersion(version) {
  const raw = String(version || '').trim().replace(/\s+/g, ' ');
  if (!raw) return 'No version';
  const normalized = raw.toLowerCase().replace(/^v\s*/, '');
  if (['latest', 'latest version', 'current', 'current version'].includes(normalized)) {
    return 'Latest Version';
  }
  if (/^\d/.test(normalized)) {
    return `v${normalized}`;
  }
  return raw.replace(/^v\s*/i, '');
}

function labSoftwareNotifyResult(data, fallback = 'Software added.') {
  const hasSkipped = Array.isArray(data.skipped_labs) && data.skipped_labs.length > 0;
  showNotify(data.message || fallback, hasSkipped ? 'warning' : 'success');
}

function labSoftwareNotifyFailure(data, fallback = 'Unable to add software.') {
  const duplicate = Array.isArray(data?.duplicates) && data.duplicates.length > 0;
  showNotify(data?.message || fallback, duplicate ? 'warning' : 'error');
}

async function loadLabSoftwareAdmin() {
  try {
    const res = await fetch('api/lab_software.php?action=get_admin', { method: 'POST' });
    const data = await res.json();
    if (!data.success) {
      showNotify(data.message || 'Unable to load lab software.', 'error');
      return;
    }
    labSoftwareAdminData = uniqueLabSoftwareData(data.labs || []);
    labSoftwareLabs = data.all_labs || [];
    labSoftwareCategories = data.categories || labSoftwareCategories;
    if (Number(data.cleaned_duplicates || 0) > 0 && !labSoftwareCleanupNoticeShown) {
      labSoftwareCleanupNoticeShown = true;
      showNotify('Duplicate software records were cleaned up.', 'info');
    }
    renderLabSoftwareFilters();
    renderLabSoftwareFormOptions();
    renderLabSoftwareAdmin();
  } catch (e) {
    showNotify('Connection error loading lab software.', 'error');
  }
}

function renderLabSoftwareFilters() {
  const row = document.getElementById('labsoft-admin-category-row');
  if (!row) return;
  const chips = ['ALL', ...labSoftwareCategories];
  row.innerHTML = chips.map(cat => `
    <button class="labsoft-chip ${labSoftwareCategoryFilter === cat ? 'active' : ''}" onclick="setLabSoftwareCategory('${cat}')">${cat}</button>
  `).join('');
}

function setLabSoftwareCategory(category) {
  labSoftwareCategoryFilter = category;
  renderLabSoftwareFilters();
  renderLabSoftwareAdmin();
}

function renderLabSoftwareFormOptions(allowAll = true) {
  const labSel = document.getElementById('labsoft-form-lab');
  const catSel = document.getElementById('labsoft-form-category');
  const quickLabSel = document.getElementById('labsoft-quick-lab');
  const quickCatSel = document.getElementById('labsoft-quick-category');
  const labOptions = labSoftwareLabs.map(lab => `<option value="${escapeHtml(lab)}">Lab ${escapeHtml(lab)}</option>`).join('');
  const allLabOption = '<option value="ALL">All Labs</option>';
  if (labSel) labSel.innerHTML = labOptions + (allowAll ? allLabOption : '');
  if (catSel) catSel.innerHTML = labSoftwareCategories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
  if (quickLabSel) quickLabSel.innerHTML = labOptions + allLabOption;
  if (quickCatSel) quickCatSel.innerHTML = labSoftwareCategories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
}

function renderLabSoftwareAdmin() {
  const wrap = document.getElementById('labsoft-admin-list');
  if (!wrap) return;
  const q = (document.getElementById('labsoft-admin-search')?.value || '').trim().toLowerCase();

  renderLabSoftwareSummary(q);
  renderLabSoftwareRecent(q);
  renderLabSoftwareOverview();

  wrap.innerHTML = labSoftwareAdminData.map(lab => {
    const filtered = (lab.software || []).filter(sw => {
      const searchItem = { ...sw, lab: sw.lab || lab.lab };
      const matchesSearch = !q || labSoftwareSearchText(searchItem).includes(normalizeLabSoftwareValue(q));
      const matchesCategory = labSoftwareCategoryFilter === 'ALL' || sw.category === labSoftwareCategoryFilter;
      return matchesSearch && matchesCategory;
    });
    const total = (lab.software || []).length;
    const visibleCount = filtered.length;
    const published = !!lab.is_published;
    const body = visibleCount
      ? filtered.map(sw => renderLabSoftwareCard({ ...sw, lab: sw.lab || lab.lab })).join('')
      : `<div class="admin-empty-state" style="grid-column:1/-1;min-height:160px;"><span class="empty-state-icon"><i class="fa fa-box-open"></i></span><strong>No matching software</strong><span>Add software or adjust your filters.</span></div>`;

    return `
      <section class="labsoft-lab-section" id="labsoft-section-${escapeHtml(lab.lab)}">
        <div class="labsoft-lab-head">
          <button type="button" class="labsoft-lab-toggle" onclick="toggleLabSoftwareSection('${escapeHtml(lab.lab)}')" aria-label="Toggle Laboratory ${escapeHtml(lab.lab)} software">
            <span class="labsoft-lab-title">
              <span class="labsoft-lab-icon" aria-hidden="true">
                <i class="fa fa-desktop"></i>
              </span>
              <span class="labsoft-lab-copy">
                <strong>Laboratory ${escapeHtml(lab.lab)}</strong>
                <span>${total} software item${total === 1 ? '' : 's'}${q || labSoftwareCategoryFilter !== 'ALL' ? `, ${visibleCount} shown` : ''}</span>
              </span>
            </span>
          </button>
          <div class="labsoft-lab-actions">
            <button class="labsoft-publish ${published ? '' : 'hidden'}" onclick="toggleLabSoftwarePublish('${escapeHtml(lab.lab)}', ${published ? 0 : 1})">
              <i class="fa ${published ? 'fa-eye' : 'fa-eye-slash'}"></i> ${published ? 'Published' : 'Hidden'}
            </button>
            <button type="button" class="labsoft-collapse-btn" onclick="toggleLabSoftwareSection('${escapeHtml(lab.lab)}')" aria-label="Collapse Laboratory ${escapeHtml(lab.lab)}">
              <i class="fa fa-chevron-down"></i>
            </button>
          </div>
        </div>
        <div class="labsoft-lab-body">${body}</div>
      </section>
    `;
  }).join('');
}

function getLabSoftwareFilteredItems(q = '') {
  return labSoftwareAdminData.flatMap(lab => (lab.software || []).map(sw => ({ ...sw, lab: lab.lab, is_published: !!lab.is_published })))
    .filter(sw => {
      const matchesSearch = !q || labSoftwareSearchText(sw).includes(normalizeLabSoftwareValue(q));
      const matchesCategory = labSoftwareCategoryFilter === 'ALL' || sw.category === labSoftwareCategoryFilter;
      return matchesSearch && matchesCategory;
    });
}

function renderLabSoftwareSummary(q = '') {
  const el = document.getElementById('labsoft-status-summary');
  if (!el) return;
  const total = labSoftwareAdminData.reduce((sum, lab) => sum + (lab.software || []).length, 0);
  const published = labSoftwareAdminData.filter(lab => lab.is_published).length;
  const filtered = getLabSoftwareFilteredItems(q).length;
  el.textContent = q || labSoftwareCategoryFilter !== 'ALL'
    ? `${filtered} matching item${filtered === 1 ? '' : 's'} across ${labSoftwareAdminData.length} labs`
    : `${total} software item${total === 1 ? '' : 's'} | ${published} published lab${published === 1 ? '' : 's'}`;
}

function renderLabSoftwareRecent(q = '') {
  const wrap = document.getElementById('labsoft-recent-list');
  if (!wrap) return;
  const items = getLabSoftwareFilteredItems(q);
  if (!items.length) {
    wrap.innerHTML = '<div class="labsoft-mini-empty">No software matches the current search.</div>';
    return;
  }
  wrap.innerHTML = items.map(sw => {
    const meta = labSoftwareMeta[sw.category] || labSoftwareMeta.TOOL;
    return `
      <article class="labsoft-recent-item">
        <span class="labsoft-card-icon" style="background:${meta.bg};color:${meta.color};"><i class="fa ${meta.icon}"></i></span>
        <div class="labsoft-recent-info">
          <strong>${escapeHtml(sw.name)}</strong>
          <span>${formatLabSoftwareMeta(sw)}</span>
        </div>
        <div class="labsoft-row-actions">
          <button class="labsoft-action-btn" onclick="viewLabSoftwareDetails(${Number(sw.id)})" title="View details"><i class="fa fa-circle-info"></i></button>
          <button class="labsoft-action-btn" onclick="openLabSoftwareForm(${Number(sw.id)})" title="Edit software"><i class="fa fa-pen"></i></button>
          <button class="labsoft-delete-btn" onclick="deleteLabSoftware(${Number(sw.id)})" title="Delete software"><i class="fa fa-trash"></i></button>
        </div>
      </article>
    `;
  }).join('');
}

function renderLabSoftwareOverview() {
  const wrap = document.getElementById('labsoft-overview-grid');
  if (!wrap) return;
  wrap.innerHTML = labSoftwareAdminData.map(lab => {
    const total = (lab.software || []).length;
    return `
      <button type="button" class="labsoft-overview-card" onclick="scrollToLabSoftwareSection('${escapeHtml(lab.lab)}')">
        <span class="labsoft-overview-copy">
          <strong>Lab ${escapeHtml(lab.lab)}</strong>
          <b>${total}</b>
          <span>Software</span>
        </span>
        <span class="labsoft-overview-icon"><i class="fa fa-desktop"></i></span>
      </button>
    `;
  }).join('');
}

function renderLabSoftwareCard(sw) {
  const meta = labSoftwareMeta[sw.category] || labSoftwareMeta.TOOL;
  const item = { ...sw, lab: sw.lab || '' };
  return `
    <article class="labsoft-card">
      <span class="labsoft-card-icon" style="background:${meta.bg};color:${meta.color};"><i class="fa ${meta.icon}"></i></span>
      <div class="labsoft-card-info">
        <strong>${escapeHtml(sw.name)}</strong>
        <span>${formatLabSoftwareMeta(item)}</span>
      </div>
      <div class="labsoft-row-actions">
        <button class="labsoft-action-btn" onclick="viewLabSoftwareDetails(${Number(sw.id)})" title="View details"><i class="fa fa-circle-info"></i></button>
        <button class="labsoft-action-btn" onclick="openLabSoftwareForm(${Number(sw.id)})" title="Edit software"><i class="fa fa-pen"></i></button>
        <button class="labsoft-delete-btn" onclick="deleteLabSoftware(${Number(sw.id)})" title="Delete software"><i class="fa fa-trash"></i></button>
      </div>
    </article>
  `;
}

function toggleLabSoftwareSection(lab) {
  document.getElementById('labsoft-section-' + lab)?.classList.toggle('collapsed');
}

function scrollToLabSoftwareSection(lab) {
  const section = document.getElementById('labsoft-section-' + lab);
  if (!section) return;
  section.classList.remove('collapsed');
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateLabSoftwareDropState(file = null) {
  const dropzone = document.getElementById('labsoft-dropzone');
  const title = document.getElementById('labsoft-drop-title');
  const subtitle = document.getElementById('labsoft-drop-subtitle');
  const chip = document.getElementById('labsoft-file-chip');
  if (!dropzone || !title || !subtitle || !chip) return;

  dropzone.classList.toggle('has-file', !!file);
  if (!file) {
    title.textContent = 'Drag & drop installer or document here';
    subtitle.textContent = 'or click to browse your files';
    chip.innerHTML = '<i class="fa fa-file-circle-check"></i> No file selected';
    chip.classList.remove('has-file');
    return;
  }

  const sizeMb = file.size ? ` ${(file.size / (1024 * 1024)).toFixed(1)} MB` : '';
  title.textContent = 'File ready to register';
  subtitle.textContent = 'Review the details below, then choose the lab and category.';
  chip.innerHTML = `<i class="fa fa-file-circle-check"></i> ${escapeHtml(file.name)}${sizeMb}`;
  chip.classList.add('has-file');
}

function applyLabSoftwareFile(file) {
  if (!file) return;
  const allowed = ['zip', 'exe', 'msi', 'apk', 'pdf', 'doc', 'docx'];
  const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
  if (!allowed.includes(ext)) {
    showNotify('Unsupported file type. Use ZIP, EXE, MSI, APK, PDF, DOC, or DOCX.', 'error');
    updateLabSoftwareDropState(null);
    return;
  }

  const nameInput = document.getElementById('labsoft-quick-name');
  if (nameInput && !nameInput.value.trim()) {
    nameInput.value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  }
  updateLabSoftwareDropState(file);
}

function handleLabSoftwareFilePick(event) {
  const file = event.target.files?.[0];
  applyLabSoftwareFile(file);
}

function handleLabSoftwareDragOver(event) {
  event.preventDefault();
  document.getElementById('labsoft-dropzone')?.classList.add('dragging');
}

function handleLabSoftwareDragLeave(event) {
  event.preventDefault();
  document.getElementById('labsoft-dropzone')?.classList.remove('dragging');
}

function handleLabSoftwareDrop(event) {
  event.preventDefault();
  const dropzone = document.getElementById('labsoft-dropzone');
  const fileInput = document.getElementById('labsoft-file-input');
  dropzone?.classList.remove('dragging');

  const files = event.dataTransfer?.files;
  if (!files || !files.length) return;
  try {
    if (fileInput) fileInput.files = files;
  } catch (e) {
    if (fileInput) fileInput.value = '';
  }
  applyLabSoftwareFile(files[0]);
}

function resetLabSoftwareQuickForm() {
  const fileInput = document.getElementById('labsoft-file-input');
  const nameInput = document.getElementById('labsoft-quick-name');
  const versionInput = document.getElementById('labsoft-quick-version');
  const labSelect = document.getElementById('labsoft-quick-lab');
  const categorySelect = document.getElementById('labsoft-quick-category');
  if (fileInput) fileInput.value = '';
  if (nameInput) nameInput.value = '';
  if (versionInput) versionInput.value = '';
  if (labSelect) labSelect.selectedIndex = 0;
  if (categorySelect) categorySelect.selectedIndex = 0;
  updateLabSoftwareDropState(null);
  nameInput?.focus();
}

async function saveLabSoftwareQuick() {
  if (labSoftwareSaveInFlight) return;
  const payload = {
    lab: document.getElementById('labsoft-quick-lab')?.value || '',
    category: document.getElementById('labsoft-quick-category')?.value || '',
    name: document.getElementById('labsoft-quick-name')?.value.trim() || '',
    version: document.getElementById('labsoft-quick-version')?.value.trim() || ''
  };
  if (!payload.name) {
    showNotify('Software name is required.', 'error');
    document.getElementById('labsoft-quick-name')?.focus();
    return;
  }
  labSoftwareSaveInFlight = true;
  try {
    const res = await fetch('api/lab_software.php?action=add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      labSoftwareNotifyResult(data, 'Software added.');
      resetLabSoftwareQuickForm();
      loadLabSoftwareAdmin();
    } else {
      labSoftwareNotifyFailure(data, 'Unable to add software.');
    }
  } catch (e) {
    showNotify('Connection error.', 'error');
  } finally {
    labSoftwareSaveInFlight = false;
  }
}

function openLabSoftwareForm(id = null) {
  const item = id ? findLabSoftwareById(id) : null;
  labSoftwareEditingId = item ? Number(item.id) : null;
  renderLabSoftwareFormOptions(!labSoftwareEditingId);
  const modal = document.getElementById('labsoft-modal');
  const title = modal?.querySelector('.modal-prem-title');
  const saveBtn = modal?.querySelector('.btn-mprem-save');
  const labField = document.getElementById('labsoft-form-lab');
  const categoryField = document.getElementById('labsoft-form-category');
  const nameField = document.getElementById('labsoft-form-name');
  const versionField = document.getElementById('labsoft-form-version');

  if (title) title.innerHTML = labSoftwareEditingId
    ? '<i class="fa fa-pen" style="margin-right:8px;"></i>Edit Lab Software'
    : '<i class="fa fa-plus" style="margin-right:8px;"></i>Add Lab Software';
  if (saveBtn) saveBtn.innerHTML = labSoftwareEditingId
    ? '<i class="fa fa-floppy-disk" style="margin-right:5px;"></i>Update'
    : '<i class="fa fa-floppy-disk" style="margin-right:5px;"></i>Save';
  if (labField) labField.value = item?.lab || labField.value || labSoftwareLabs[0] || '';
  if (categoryField) categoryField.value = item?.category || categoryField.value || labSoftwareCategories[0] || 'TOOL';
  if (nameField) nameField.value = item?.name || '';
  if (versionField) versionField.value = item?.version || '';
  document.getElementById('labsoft-modal').style.display = 'flex';
  document.getElementById('labsoft-form-name').focus();
}

function closeLabSoftwareForm() {
  labSoftwareEditingId = null;
  document.getElementById('labsoft-modal').style.display = 'none';
}

function formatLabSoftwareDate(value) {
  if (!value) return 'Not available';
  const parsed = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function ensureLabSoftwareDetailsModal() {
  let modal = document.getElementById('labsoft-details-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'labsoft-details-modal';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal-prem-box labsoft-details-box">
      <div class="modal-prem-header">
        <div class="modal-prem-title"><i class="fa fa-circle-info" style="margin-right:8px;"></i>Software Details</div>
        <button class="close-modal-btn" onclick="closeLabSoftwareDetails()" style="color:#fff;"><i class="fa fa-xmark"></i></button>
      </div>
      <div class="modal-prem-body" id="labsoft-details-body"></div>
      <div class="modal-prem-footer">
        <button class="btn-mprem-cancel" onclick="closeLabSoftwareDetails()">Close</button>
      </div>
    </div>
  `;
  modal.addEventListener('click', event => {
    if (event.target === modal) closeLabSoftwareDetails();
  });
  document.body.appendChild(modal);
  return modal;
}

function viewLabSoftwareDetails(id) {
  const item = findLabSoftwareById(id);
  if (!item) {
    showNotify('Software item was not found.', 'error');
    return;
  }
  const modal = ensureLabSoftwareDetailsModal();
  const body = document.getElementById('labsoft-details-body');
  const details = [
    ['Software name', item.name || '-'],
    ['Category', item.category || 'TOOL'],
    ['Version', formatLabSoftwareVersion(item.version)],
    ['Laboratory', `Lab ${item.lab || '-'}`],
    ['Date added', formatLabSoftwareDate(item.created_at)],
    ['Uploaded file', item.file_name || item.uploaded_file || 'No uploaded file stored']
  ];
  if (body) {
    body.innerHTML = `
      <div class="labsoft-detail-summary">
        <strong>${escapeHtml(item.name || 'Software')}</strong>
        <span>${formatLabSoftwareMeta(item)}</span>
      </div>
      <div class="labsoft-detail-grid">
        ${details.map(([label, value]) => `
          <div class="labsoft-detail-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </div>
        `).join('')}
      </div>
    `;
  }
  modal.style.display = 'flex';
}

function closeLabSoftwareDetails() {
  const modal = document.getElementById('labsoft-details-modal');
  if (modal) modal.style.display = 'none';
}

async function saveLabSoftware() {
  if (labSoftwareSaveInFlight) return;
  const payload = {
    lab: document.getElementById('labsoft-form-lab').value,
    category: document.getElementById('labsoft-form-category').value,
    name: document.getElementById('labsoft-form-name').value.trim(),
    version: document.getElementById('labsoft-form-version').value.trim()
  };
  if (!payload.name) {
    showNotify('Software name is required.', 'error');
    return;
  }
  labSoftwareSaveInFlight = true;
  try {
    const action = labSoftwareEditingId ? 'update' : 'add';
    if (labSoftwareEditingId) payload.id = labSoftwareEditingId;
    const res = await fetch(`api/lab_software.php?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      labSoftwareNotifyResult(data, labSoftwareEditingId ? 'Software updated.' : 'Software added.');
      closeLabSoftwareForm();
      loadLabSoftwareAdmin();
    } else {
      labSoftwareNotifyFailure(data, labSoftwareEditingId ? 'Unable to update software.' : 'Unable to add software.');
    }
  } catch (e) {
    showNotify('Connection error.', 'error');
  } finally {
    labSoftwareSaveInFlight = false;
  }
}

async function deleteLabSoftware(id) {
  if (!confirm('Delete this software from the lab catalog?')) return;
  try {
    const res = await fetch('api/lab_software.php?action=delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) {
      showNotify(data.message || 'Software removed.', 'success');
      loadLabSoftwareAdmin();
    } else {
      showNotify(data.message || 'Unable to delete software.', 'error');
    }
  } catch (e) {
    showNotify('Connection error.', 'error');
  }
}

async function toggleLabSoftwarePublish(lab, isPublished) {
  try {
    const res = await fetch('api/lab_software.php?action=toggle_publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lab, is_published: isPublished })
    });
    const data = await res.json();
    if (data.success) {
      showNotify(data.message, 'success');
      loadLabSoftwareAdmin();
    } else {
      showNotify(data.message || 'Unable to update publish setting.', 'error');
    }
  } catch (e) {
    showNotify('Connection error.', 'error');
  }
}


// Modern Analytics dashboard
let analyticsSource = { records: [], reservations: [], feedbacks: [], students: [] };
let analyticsCharts = {};

function analyticsDestroyCharts() {
  Object.values(analyticsCharts).forEach(chart => { try { chart.destroy(); } catch (e) { console.error('Admin action failed', e); } });
  analyticsCharts = {};
}

function analyticsDateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function analyticsRecordDate(row) {
  const parsed = analyticsDateValue(row.date);
  return parsed ? parsed.toISOString().slice(0, 10) : '';
}

function analyticsTimeMinutes(value) {
  if (!value || value === '-' || value === 'â€”') return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function analyticsSessionMinutes(row) {
  if (row.duration_minutes) return Number(row.duration_minutes);
  const start = analyticsTimeMinutes(row.login);
  const end = analyticsTimeMinutes(row.logout);
  if (start === null || end === null) return null;
  const diff = end >= start ? end - start : (end + 1440) - start;
  return diff > 0 && diff < 1440 ? diff : null;
}

function analyticsCount(rows, getter) {
  return rows.reduce((map, row) => {
    const key = getter(row) || 'Unassigned';
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
}

function analyticsFiltered() {
  const from = document.getElementById('analytics-from')?.value || '';
  const to = document.getElementById('analytics-to')?.value || '';
  const lab = document.getElementById('analytics-lab')?.value || '';
  const fromTime = from ? new Date(from + 'T00:00:00').getTime() : null;
  const toTime = to ? new Date(to + 'T23:59:59').getTime() : null;
  const match = row => {
    const date = analyticsRecordDate(row);
    const time = date ? new Date(date + 'T12:00:00').getTime() : null;
    if (fromTime && time && time < fromTime) return false;
    if (toTime && time && time > toTime) return false;
    if (lab && String(row.lab || '') !== lab) return false;
    return true;
  };
  return {
    records: analyticsSource.records.filter(match),
    reservations: analyticsSource.reservations.filter(match),
    feedbacks: analyticsSource.feedbacks.filter(match)
  };
}

function analyticsSetText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function analyticsPalette() {
  return ['#6b3ab5', '#2d5da1', '#f5a623', '#10b981', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899'];
}

function analyticsThemeValues() {
  syncAnalyticsChartDefaults();
  const styles = getComputedStyle(document.body);
  return {
    text: analyticsChartDefaults.color,
    grid: analyticsChartDefaults.gridColor,
    tooltip: styles.getPropertyValue('--admin-primary').trim() || '#24104f'
  };
}

function analyticsChart(id, type, labels, data, options = {}) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const wrap = canvas.parentElement;
  wrap.querySelector('.analytics-empty')?.remove();
  if (!labels.length || data.every(v => Number(v) === 0)) {
    canvas.style.display = 'none';
    const empty = document.createElement('div');
    empty.className = 'analytics-empty';
    empty.innerHTML = '<i class="fa fa-chart-simple"></i><span>No data for this filter</span>';
    wrap.appendChild(empty);
    return;
  }
  canvas.style.display = '';
  const ctx = canvas.getContext('2d');
  const palette = analyticsPalette();
  const isRound = ['pie', 'doughnut'].includes(type);
  const theme = analyticsThemeValues();
  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: isRound, position: 'bottom', labels: { color: theme.text, usePointStyle: true, boxWidth: 9, font: { family: 'Nunito', weight: '800', size: 11 } } },
      tooltip: { backgroundColor: theme.tooltip, cornerRadius: 8, padding: 10 }
    },
    scales: isRound ? {} : {
      x: { grid: { display: false }, ticks: { color: theme.text, font: { family: 'Nunito', weight: '800' } } },
      y: { beginAtZero: true, grid: { color: theme.grid }, ticks: { precision: 0, color: theme.text, font: { family: 'Nunito', weight: '800' } } }
    }
  };
  analyticsCharts[id] = new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [{
        data,
        label: options.label || 'Sessions',
        borderColor: options.borderColor || '#6366f1',
        backgroundColor: options.backgroundColor || (isRound ? labels.map((_, i) => palette[i % palette.length]) : '#5b8def'),
        borderWidth: options.borderWidth ?? (isRound ? 2 : 3),
        borderRadius: options.borderRadius ?? 8,
        fill: options.fill || false,
        tension: options.tension ?? 0.35,
        barPercentage: options.barPercentage ?? 0.65
      }]
    },
    options: { ...baseOptions, ...options.chartOptions }
  });
}

async function loadAnalytics() {
  try {
    syncAnalyticsChartDefaults();
    const [recordsRes, reservationsRes, feedbackRes, studentsRes] = await Promise.all([
      fetch('api/admin.php?action=get_records', { method: 'POST' }),
      fetch('api/admin.php?action=get_reservations', { method: 'POST' }),
      fetch('api/admin.php?action=get_feedbacks', { method: 'POST' }),
      fetch('api/admin.php?action=get_students', { method: 'POST' })
    ]);
    const [recordsData, reservationsData, feedbackData, studentsData] = await Promise.all([
      recordsRes.json(), reservationsRes.json(), feedbackRes.json(), studentsRes.json()
    ]);
    analyticsSource = {
      records: recordsData.records || [],
      reservations: reservationsData.reservations || [],
      feedbacks: feedbackData.feedbacks || [],
      students: studentsData.students || []
    };
    populateAnalyticsLabs();
    renderAnalyticsDashboard();
  } catch (e) {
    console.error('Analytics failed to load', e);
  }
}

function populateAnalyticsLabs() {
  const select = document.getElementById('analytics-lab');
  if (!select) return;
  const labs = [...new Set(analyticsSource.records.map(r => r.lab).filter(Boolean))].sort();
  const current = select.value;
  select.innerHTML = '<option value="">All Labs</option>' + labs.map(lab => `<option value="${escapeHtml(lab)}">Lab ${escapeHtml(lab)}</option>`).join('');
  select.value = labs.includes(current) ? current : '';
}

function applyAnalyticsFilters() { renderAnalyticsDashboard(); }

function resetAnalyticsFilters() {
  ['analytics-from', 'analytics-to', 'analytics-lab'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderAnalyticsDashboard();
}

function renderAnalyticsDashboard() {
  const { records, reservations, feedbacks } = analyticsFiltered();
  const completed = records.filter(r => (r.status || '').toLowerCase() === 'done');
  const students = new Set(records.map(r => r.idNum).filter(Boolean));
  const durations = completed.map(analyticsSessionMinutes).filter(v => v !== null);
  const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const approved = reservations.filter(r => ['reserved', 'active', 'done'].includes((r.status || '').toLowerCase())).length;

  analyticsSetText('analytics-stat-total', records.length);
  analyticsSetText('analytics-stat-students', students.size);
  analyticsSetText('analytics-stat-average', avg);
  analyticsSetText('analytics-stat-reservations', reservations.length);
  analyticsSetText('analytics-stat-approved', approved + ' approved');
  analyticsSetText('analytics-stat-feedback', feedbacks.length);

  analyticsDestroyCharts();
  renderAnalyticsCharts(records, completed, reservations);
  renderAnalyticsInsights(records);
  renderAnalyticsHeatmap(records);
  renderAnalyticsPCHeatmap(records);
  renderAnalyticsTopStudents(records);
  renderMonthlyLeaderboard(records);
  renderAdminAlerts(records, reservations);
}

function renderAnalyticsCharts(records, completed, reservations) {
  const daily = analyticsCount(completed, r => analyticsRecordDate(r));
  const dailyLabels = Object.keys(daily).sort();
  analyticsChart('analyticsDailyChart', 'line', dailyLabels, dailyLabels.map(k => daily[k]), {
    label: 'Completed Sessions',
    backgroundColor: 'rgba(99,102,241,.14)',
    fill: true,
    chartOptions: { plugins: { legend: { display: false } } }
  });

  const purpose = analyticsCount(records, r => r.purpose);
  analyticsChart('analyticsPurposeChart', 'pie', Object.keys(purpose), Object.values(purpose));

  const lab = analyticsCount(records, r => 'Lab ' + (r.lab || 'Unassigned'));
  analyticsChart('analyticsLabRoomChart', 'bar', Object.keys(lab), Object.values(lab), {
    backgroundColor: analyticsPalette(),
    chartOptions: { indexAxis: 'y', plugins: { legend: { display: false } } }
  });

  const course = analyticsCount(records, r => r.course || 'Unassigned');
  analyticsChart('analyticsCourseBreakdownChart', 'doughnut', Object.keys(course), Object.values(course), {
    chartOptions: { cutout: '58%' }
  });

  const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
  const hourCounts = Object.fromEntries(hours.map(h => [h, 0]));
  records.forEach(r => {
    const mins = analyticsTimeMinutes(r.login);
    if (mins !== null) hourCounts[`${String(Math.floor(mins / 60)).padStart(2, '0')}:00`]++;
  });
  analyticsChart('analyticsPeakHoursChart', 'bar', hours, hours.map(h => hourCounts[h]), {
    backgroundColor: '#f5a623',
    chartOptions: { plugins: { legend: { display: false } } }
  });

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekday = Object.fromEntries(days.map(d => [d, 0]));
  records.forEach(r => {
    const date = analyticsDateValue(analyticsRecordDate(r));
    if (date) weekday[days[(date.getDay() + 6) % 7]]++;
  });
  analyticsChart('analyticsWeekdayChart', 'bar', days, days.map(d => weekday[d]), {
    backgroundColor: '#6ea1ef',
    chartOptions: { plugins: { legend: { display: false } } }
  });

  const resvStatus = analyticsCount(reservations, r => r.status || 'Unknown');
  analyticsChart('analyticsReservationChart', 'doughnut', Object.keys(resvStatus), Object.values(resvStatus), {
    chartOptions: { cutout: '58%' }
  });
}

function renderAnalyticsHeatmap(records) {
  const wrap = document.getElementById('analytics-heatmap');
  if (!wrap) return;
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = Array.from({ length: 14 }, (_, i) => i + 7);
  const map = {};
  records.forEach(r => {
    const date = analyticsDateValue(analyticsRecordDate(r));
    const mins = analyticsTimeMinutes(r.login);
    if (!date || mins === null) return;
    const day = days[(date.getDay() + 6) % 7];
    const hour = Math.floor(mins / 60);
    map[`${day}-${hour}`] = (map[`${day}-${hour}`] || 0) + 1;
  });
  const max = Math.max(1, ...Object.values(map));
  wrap.innerHTML = `<div></div>${days.map(d => `<strong>${d}</strong>`).join('')}` +
    hours.map(hour => `<span>${hour}:00</span>${days.map(day => {
      const count = map[`${day}-${hour}`] || 0;
      const level = count ? Math.max(1, Math.ceil((count / max) * 6)) : 0;
      return `<b class="heat-${level}" title="${day} ${hour}:00 - ${count} sessions">${count || ''}</b>`;
    }).join('')}`).join('');
}

function renderAnalyticsTopStudents(records) {
  const wrap = document.getElementById('analytics-top-students');
  if (!wrap) return;
  const grouped = {};
  records.forEach(r => {
    const id = r.idNum || 'Unknown';
    if (!grouped[id]) grouped[id] = { id, name: r.name || 'Unknown Student', course: r.course || 'Unassigned', pic: r.profilePic || '', count: 0 };
    if (!grouped[id].pic && r.profilePic) grouped[id].pic = r.profilePic;
    grouped[id].count++;
  });
  const top = Object.values(grouped).sort((a, b) => b.count - a.count).slice(0, 5);
  if (!top.length) {
    wrap.innerHTML = '<div class="analytics-empty-block"><i class="fa fa-user-slash"></i><strong>No students yet</strong><span>Records will appear here once sessions match the filter.</span></div>';
    return;
  }
  wrap.innerHTML = top.map((student, idx) => {
    const initials = student.name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'ST';
    const avatar = student.pic && String(student.pic).length > 10
      ? `<img class="avatar-img" src="${escapeAttr(student.pic)}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';" /><span class="avatar avatar-fallback" style="display:none;">${escapeHtml(initials)}</span>`
      : `<span class="avatar">${escapeHtml(initials)}</span>`;
    return `<div class="analytics-student-row">
      <span class="rank">${idx + 1}</span>
      ${avatar}
      <strong>${escapeHtml(student.name)}</strong>
      <small>${escapeHtml(student.course)}</small>
      <b>${student.count} session${student.count !== 1 ? 's' : ''}</b>
    </div>`;
  }).join('');
}

function renderAnalyticsInsights(records) {
  const topEntry = obj => Object.entries(obj).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
  analyticsSetText('analytics-insight-lab', topEntry(analyticsCount(records, r => r.lab ? 'Lab ' + r.lab : 'Unassigned')));
  analyticsSetText('analytics-insight-purpose', topEntry(analyticsCount(records, r => r.purpose)));
  const hours = {};
  records.forEach(r => {
    const mins = analyticsTimeMinutes(r.login);
    if (mins !== null) {
      const hour = `${String(Math.floor(mins / 60)).padStart(2, '0')}:00`;
      hours[hour] = (hours[hour] || 0) + 1;
    }
  });
  analyticsSetText('analytics-insight-hour', topEntry(hours));
}

function renderAnalyticsPCHeatmap(records) {
  const wrap = document.getElementById('analytics-pc-heatmap');
  if (!wrap) return;
  const labs = [...new Set(records.map(r => r.lab).filter(Boolean))].sort();
  if (!labs.length) {
    wrap.innerHTML = '<div class="analytics-empty-block"><i class="fa fa-desktop"></i><strong>No PC activity</strong><span>PC reservations and active sit-ins will appear here.</span></div>';
    return;
  }
  wrap.innerHTML = labs.map(lab => {
    const occupied = {};
    records.filter(r => String(r.lab) === String(lab) && r.pc_number && ['reserved', 'active'].includes((r.status || '').toLowerCase()))
      .forEach(r => { occupied[r.pc_number] = (r.status || '').toLowerCase(); });
    const used = Object.keys(occupied).length;
    return `<div class="analytics-pc-lab">
      <div class="analytics-pc-lab-head"><strong>Lab ${escapeHtml(lab)}</strong><span>${used}/40 occupied</span></div>
      <div class="analytics-pc-grid">${Array.from({ length: 40 }, (_, i) => {
        const pc = i + 1;
        const status = occupied[pc] || '';
        return `<i class="${status}" title="Lab ${escapeHtml(lab)} PC ${pc}${status ? ' - ' + status : ' - available'}"></i>`;
      }).join('')}</div>
    </div>`;
  }).join('');
}

function renderMonthlyLeaderboard(records) {
  const wrap = document.getElementById('analytics-monthly-leaderboard');
  if (!wrap) return;
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthly = records.filter(r => analyticsRecordDate(r).startsWith(monthKey));
  renderLeaderboardRows(wrap, monthly, 'No sessions this month');
}

function renderLeaderboardRows(wrap, records, emptyTitle) {
  const grouped = {};
  records.forEach(r => {
    const id = r.idNum || 'Unknown';
    if (!grouped[id]) grouped[id] = { id, name: r.name || 'Unknown Student', course: r.course || 'Unassigned', pic: r.profilePic || '', count: 0 };
    if (!grouped[id].pic && r.profilePic) grouped[id].pic = r.profilePic;
    grouped[id].count++;
  });
  const top = Object.values(grouped).sort((a, b) => b.count - a.count).slice(0, 5);
  if (!top.length) {
    wrap.innerHTML = `<div class="analytics-empty-block"><i class="fa fa-trophy"></i><strong>${emptyTitle}</strong><span>Monthly rankings update automatically from sit-in records.</span></div>`;
    return;
  }
  wrap.innerHTML = top.map((student, idx) => {
    const initials = student.name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'ST';
    const avatar = student.pic && String(student.pic).length > 10
      ? `<img class="avatar-img" src="${escapeAttr(student.pic)}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';" /><span class="avatar avatar-fallback" style="display:none;">${escapeHtml(initials)}</span>`
      : `<span class="avatar">${escapeHtml(initials)}</span>`;
    return `<div class="analytics-student-row">
      <span class="rank">${idx + 1}</span>
      ${avatar}
      <strong>${escapeHtml(student.name)}</strong>
      <small>${escapeHtml(student.course)}</small>
      <b>${student.count} session${student.count !== 1 ? 's' : ''}</b>
    </div>`;
  }).join('');
}

function renderAdminAlerts(records, reservations) {
  const wrap = document.getElementById('analytics-admin-alerts');
  if (!wrap) return;
  const pending = reservations.filter(r => (r.status || '').toLowerCase() === 'reserved').length;
  const longActive = records.filter(r => (r.status || '').toLowerCase() === 'active' && (analyticsTimeMinutes(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) ?? 0) - (analyticsTimeMinutes(r.login) ?? 0) >= 120).length;
  const alerts = [];
  if (pending) alerts.push(`<div class="analytics-alert"><i class="fa fa-calendar-check"></i>${pending} pending reservation${pending !== 1 ? 's' : ''} need review.</div>`);
  if (longActive) alerts.push(`<div class="analytics-alert"><i class="fa fa-hourglass-half"></i>${longActive} active sit-in${longActive !== 1 ? 's are' : ' is'} running over 2 hours.</div>`);
  wrap.innerHTML = alerts.join('');
}

function generateMonthlyAnalyticsReport() {
  const { records, reservations, feedbacks } = analyticsFiltered();
  const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
  const lab = document.getElementById('analytics-insight-lab')?.textContent || '-';
  const purpose = document.getElementById('analytics-insight-purpose')?.textContent || '-';
  const peak = document.getElementById('analytics-insight-hour')?.textContent || '-';
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>Monthly Analytics Report</title>
    <style>body{font-family:Arial,sans-serif;padding:28px;color:#20113f}h1{margin:0 0 6px}table{width:100%;border-collapse:collapse;margin-top:18px}td,th{border:1px solid #ddd;padding:9px;text-align:left}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.card{border:1px solid #ddd;border-radius:10px;padding:14px}.num{font-size:28px;font-weight:800}</style>
    </head><body><h1>CCS Sit-In Monthly Analytics</h1><p>${month}</p>
    <div class="cards"><div class="card"><span>Total Sessions</span><div class="num">${records.length}</div></div><div class="card"><span>Reservations</span><div class="num">${reservations.length}</div></div><div class="card"><span>Feedback</span><div class="num">${feedbacks.length}</div></div></div>
    <table><tr><th>Insight</th><th>Value</th></tr><tr><td>Most Used Lab</td><td>${escapeHtml(lab)}</td></tr><tr><td>Most Used Purpose</td><td>${escapeHtml(purpose)}</td></tr><tr><td>Peak Hour</td><td>${escapeHtml(peak)}</td></tr></table>
    <script>window.onload=()=>window.print();<\/script></body></html>`);
  win.document.close();
}

window.addEventListener('DOMContentLoaded', async () => { 
  if (!(await ensureAdminSession())) return;
  setupAdminNavTooltips();
  const sections = ['home', 'students', 'sitin', 'records', 'reports', 'feedback', 'reservation', 'labsoftware', 'leaderboard', 'analytics', 'rewards'];
  await Promise.all(sections.map(async (name) => {
    try {
      const res = await fetch(`admin_dashboard_${name}.html?v=50`);
      if (res.ok) {
        document.getElementById(`section-${name}`).innerHTML = await res.text();
      }
    } catch (e) {
      console.error(`Failed to load section ${name}`, e);
    }
  }));
  
  // Read active tab from URL hash (e.g. #students, #sitin)
  const hash = window.location.hash.replace('#', '');
  const validTabs = ['home', 'students', 'sitin', 'records', 'reports', 'feedback', 'reservation', 'labsoftware', 'leaderboard', 'analytics', 'rewards'];
  const initialTab = validTabs.includes(hash) ? hash : 'home';
  showSection(initialTab);
  if (initialTab !== 'home') loadStats();
});

// â”€â”€ REWARDS LOGIC â”€â”€
async function loadRewardsLeaderboard() {
  try {
    const res = await fetch('api/leaderboard.php?action=get_admin_leaderboard', { method: 'POST' });
    const data = await res.json();
    const tbody = document.getElementById('rewards-leaderboard-body');
    if (!tbody) return;
    if (!data.success || !data.leaderboard.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 30px;"><i class="fa fa-info-circle"></i> No leaderboard data found.</td></tr>';
      return;
    }
    
    tbody.innerHTML = data.leaderboard.map((u, i) => {
      const rank = i + 1;
      let rankHtml = `<span style="font-weight:900; font-size:1.1rem; color:var(--text-muted);">#${rank}</span>`;
      if (rank === 1) rankHtml = `<span class="rank-icon">ðŸ¥‡</span>`;
      else if (rank === 2) rankHtml = `<span class="rank-icon">ðŸ¥ˆ</span>`;
      else if (rank === 3) rankHtml = `<span class="rank-icon">ðŸ¥‰</span>`;
      
      const tooltip = `Session Points: ${u.session_points}<br>Manual Points: ${u.manual_points}`;
      
      return `
        <tr>
          <td style="text-align:center;">${rankHtml}</td>
          <td>
            <div style="display:flex; align-items:center; gap:10px;">
              <img src="${u.profilePic || 'static/temppfp.jpg'}" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:2px solid #ede8fb;" onerror="this.src='static/temppfp.jpg'" />
              <div>
                <div style="font-weight:700; color:var(--purple-dark); font-size:0.95rem;">${u.firstname} ${u.lastname}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${u.idNum}</div>
              </div>
            </div>
          </td>
          <td style="font-size:0.85rem; font-weight:600;">${u.course || 'â€”'}</td>
          <td style="text-align:center; font-weight:700;">${u.total_sitins}</td>
          <td>
            <div style="font-weight:700; color:#10b981;">${u.total_hours_str}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Longest: ${u.longest_session_str}</div>
          </td>
          <td style="font-weight:600;">${u.avg_session_str}</td>
          <td>
            <div class="tooltip-pts" style="font-weight:900; color:#f59e0b; font-size:1.1rem;">
              ${u.total_points} PTS
              <span class="tooltiptext">${tooltip}</span>
            </div>
            <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">hover for breakdown</div>
          </td>
          <td style="text-align:center;">
            <button class="btn-pts" onclick="fillRewardForm('${u.idNum}', '${u.firstname} ${u.lastname}', '${u.course}', '${u.profilePic || 'static/temppfp.jpg'}')">
              + Points
            </button>
          </td>
        </tr>
      `;
    }).join('');
    
  } catch (e) {
    console.error('Leaderboard Error:', e);
    const tbody = document.getElementById('rewards-leaderboard-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:red;">Failed to load leaderboard.</td></tr>';
  }
}

let searchTimeout;
async function searchRewardStudent() {
  const q = document.getElementById('reward-idnum').value.trim().toLowerCase();
  const dropdown = document.getElementById('reward-student-dropdown');
  const preview = document.getElementById('reward-student-preview');
  
  if (q.length < 2) {
    dropdown.style.display = 'none';
    preview.style.display = 'none';
    return;
  }
  
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    try {
      const res = await fetch('api/admin.php?action=get_students', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const filt = data.students.filter(u => u.idNum.toLowerCase().includes(q) || (u.firstname + ' ' + u.lastname).toLowerCase().includes(q));
        if (filt.length) {
          dropdown.innerHTML = filt.map(u => `
            <div class="reward-student-option" onclick="selectRewardStudent('${u.idNum}', '${u.firstname} ${u.lastname}', '${u.course}', '${u.profilePic || 'static/temppfp.jpg'}')">
              <img src="${u.profilePic || 'static/temppfp.jpg'}" style="width:25px; height:25px; border-radius:50%; object-fit:cover;" onerror="this.src='static/temppfp.jpg'" />
              <div>
                <div style="font-weight:600; font-size:0.85rem;">${u.idNum} - ${u.firstname} ${u.lastname}</div>
              </div>
            </div>
          `).join('');
          dropdown.style.display = 'block';
        } else {
          dropdown.innerHTML = '<div style="padding:10px; color:var(--text-muted); font-size:0.85rem;">No students found</div>';
          dropdown.style.display = 'block';
        }
      }
    } catch (e) { console.error('Admin action failed', e); }
  }, 300);
}

function selectRewardStudent(idNum, name, course, pic) {
  document.getElementById('reward-idnum').value = idNum;
  document.getElementById('reward-student-dropdown').style.display = 'none';
  fillRewardForm(idNum, name, course, pic);
}

function fillRewardForm(idNum, name, course, pic) {
  document.getElementById('reward-idnum').value = idNum;
  document.getElementById('reward-preview-name').textContent = name;
  document.getElementById('reward-preview-course').textContent = course || 'â€”';
  document.getElementById('reward-preview-pic').src = pic;
  document.getElementById('reward-student-preview').style.display = 'flex';
  document.getElementById('reward-pts-val').focus();
}

async function submitDirectRewardPoints() {
  const idNum = document.getElementById('reward-idnum').value;
  const points = document.getElementById('reward-pts-val').value;
  const reason = document.getElementById('reward-reason').value.trim();
  
  if (!idNum) {
    showNotify('Please enter or select a student ID.', 'error');
    return;
  }
  if (!points || points <= 0 || !reason) {
    showNotify('Please enter valid points and a reason.', 'error');
    return;
  }
  
  try {
    const res = await fetch('api/leaderboard.php?action=add_points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNum, points, reason })
    });
    const data = await res.json();
    if (data.success) {
      showNotify(data.message, 'success');
      document.getElementById('reward-idnum').value = '';
      document.getElementById('reward-pts-val').value = '';
      document.getElementById('reward-reason').value = '';
      document.getElementById('reward-student-preview').style.display = 'none';
      loadRewardsLeaderboard();
      // Also refresh the main leaderboard if it's visible, but we are in rewards tab right now
      if (typeof loadAdminLeaderboard === 'function') loadAdminLeaderboard();
    } else {
      showNotify(data.message || 'Error awarding points', 'error');
    }
  } catch (e) {
    showNotify('Network error.', 'error');
  }
}

// Modern leaderboard/rewards rendering overrides.
function leaderText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function leaderArg(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function renderLeaderRows(rows, mode) {
  return rows.map((u, i) => {
    const rank = i + 1;
    const rankClass = rank <= 3 ? 'leader-rank top' : 'leader-rank';
    const name = `${u.firstname || ''} ${u.lastname || ''}`.trim();
    const pic = u.profilePic || 'static/temppfp.jpg';
    const action = mode === 'reward'
      ? `fillRewardForm('${leaderArg(u.idNum)}', '${leaderArg(name)}', '${leaderArg(u.course || '')}', '${leaderArg(pic)}')`
      : `openAwardModal('${leaderArg(u.idNum)}', '${leaderArg(name)}', '${leaderArg(u.course || '')}', '${leaderArg(pic)}')`;
    const actionLabel = mode === 'reward' ? 'Use' : 'Award';

    return `
      <tr>
        <td><span class="${rankClass}">#${rank}</span></td>
        <td>
          <div class="leader-student">
            <img src="${leaderText(pic)}" onerror="this.src='static/temppfp.jpg'" alt="" />
            <div>
              <div class="leader-name">${leaderText(name)}</div>
              <div class="leader-id">${leaderText(u.idNum)}</div>
            </div>
          </div>
        </td>
        <td>${leaderText(u.course || '-')}</td>
        <td>${leaderText(u.total_sitins || 0)}</td>
        <td>
          <div>${leaderText(u.total_hours_str || '0h')}</div>
          <div class="leader-sub">Longest: ${leaderText(u.longest_session_str || '-')}</div>
        </td>
        <td>${leaderText(u.avg_session_str || '-')}</td>
        <td>
          <span class="leader-xp">${leaderText(u.total_points || 0)} XP</span>
          <div class="leader-breakdown">${leaderText(u.session_points || 0)} session + ${leaderText(u.manual_points || 0)} reward</div>
        </td>
        <td style="text-align:right;">
          <button class="btn-pts" onclick="${action}"><i class="fa fa-plus"></i> ${actionLabel}</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function loadAdminLeaderboard() {
  try {
    const res = await fetch('api/leaderboard.php?action=get_admin_leaderboard', { method: 'POST' });
    const data = await res.json();
    const tbody = document.getElementById('admin-leaderboard-body');
    if (!tbody) return;

    if (!data.success || !data.leaderboard.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="leader-empty"><i class="fa fa-info-circle"></i> No leaderboard data found.</td></tr>';
      return;
    }

    tbody.innerHTML = renderLeaderRows(data.leaderboard, 'admin');
  } catch (e) {
    console.error('Leaderboard Error:', e);
    const tbody = document.getElementById('admin-leaderboard-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="leader-empty" style="color:#b91c1c;">Failed to load leaderboard.</td></tr>';
  }
}

async function loadRewardsLeaderboard() {
  try {
    const res = await fetch('api/leaderboard.php?action=get_admin_leaderboard', { method: 'POST' });
    const data = await res.json();
    const tbody = document.getElementById('rewards-leaderboard-body');
    if (!tbody) return;

    if (!data.success || !data.leaderboard.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="leader-empty"><i class="fa fa-info-circle"></i> No leaderboard data found.</td></tr>';
      return;
    }

    tbody.innerHTML = renderLeaderRows(data.leaderboard, 'reward');
  } catch (e) {
    console.error('Leaderboard Error:', e);
    const tbody = document.getElementById('rewards-leaderboard-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="leader-empty" style="color:#b91c1c;">Failed to load leaderboard.</td></tr>';
  }
}

