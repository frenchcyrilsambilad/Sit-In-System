// Reservation page logic
const user = JSON.parse(localStorage.getItem('ccs_current_user') || 'null');
if (!user) { window.location.href = 'login.html'; }

let selectedLab      = '';
let selectedTimeSlot = '';
let selectedPC       = null;
let reservedPcsMap   = {};
let pendingCancelId  = null;
let autoRefreshTimer = null;

function switchReservationTab(tab) {
  const isMine = tab === 'mine';
  document.getElementById('tab-new-reservation')?.classList.toggle('active', !isMine);
  document.getElementById('tab-my-reservations')?.classList.toggle('active', isMine);
  document.getElementById('res-panel-new')?.classList.toggle('active', !isMine);
  document.getElementById('res-panel-mine')?.classList.toggle('active', isMine);
  if (isMine) loadMyReservations();
}

// Init
window.addEventListener('DOMContentLoaded', () => {
  if (!user) return;

  // Fill student info
  const fullName = [user.firstname, user.middlename, user.lastname].filter(Boolean).join(' ');
  document.getElementById('res-id').value   = user.idNum  || '';
  document.getElementById('res-name').value = fullName    || '';
  updateSessionDisplay(user.sitin_remaining ?? 30);

  // Default date = tomorrow, min = today
  const today    = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  const fmt      = d => d.toISOString().split('T')[0];
  document.getElementById('res-date').value = fmt(tomorrow);
  document.getElementById('res-date').min   = fmt(today);

  // Trigger grid reload on date change
  document.getElementById('res-date').addEventListener('change', () => {
    selectedPC = null;
    updateSelectedPreview();
    loadPCGrid();
  });

  loadMyReservations();
  startAutoRefresh();
});

// Session display
function updateSessionDisplay(n) {
  const hero = document.getElementById('hero-sessions');
  const form = document.getElementById('form-sessions');
  if (hero) { hero.textContent = n; hero.classList.toggle('low', n <= 5); }
  if (form) { form.textContent = n; form.style.color = n <= 5 ? '#c0392b' : 'var(--purple)'; }
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

// Alert
function showAlert(msg, type = 'error') {
  const el = document.getElementById('res-alert');
  el.textContent = msg;
  el.className   = 'res-alert ' + type;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = 'none'; }, 5000);
}

// Lab selection
function selectLab(lab, el) {
  selectedLab = lab;
  selectedPC  = null;
  updateSelectedPreview();
  document.querySelectorAll('.lab-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('grid-lab-name').textContent = 'Lab ' + lab;
  document.getElementById('instructor-desk-bar').style.display = 'block';
  loadPCGrid();
}

// Time slot selection
function selectTimeSlot(slot, el) {
  selectedTimeSlot = slot;
  selectedPC       = null;
  updateSelectedPreview();
  document.querySelectorAll('.timeslot-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  loadPCGrid();
}

// PC grid
async function loadPCGrid() {
  const lab      = selectedLab;
  const date     = document.getElementById('res-date').value;
  const timeSlot = selectedTimeSlot;
  const grid     = document.getElementById('pc-grid');
  const loading  = document.getElementById('grid-loading');

  if (!lab || !date || !timeSlot) {
    grid.innerHTML = `<div class="res-pc-placeholder"><i class="fa fa-desktop"></i><span>Select a lab, date, and time slot to view PCs</span></div>`;
    setGridStats(false);
    return;
  }

  loading.style.display = 'block';
  grid.style.opacity    = '0.45';

  try {
    const res  = await fetch('api/student.php?action=get_available_pcs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lab, date, time_slot: timeSlot })
    });
    const data = await res.json();

    if (data.success) {
      reservedPcsMap = data.reserved_pcs || {};
      renderPCGrid(data.total_pcs || 40);
      updateGridStats(data.total_pcs || 40);
    } else {
      grid.innerHTML = `<div class="res-pc-placeholder"><i class="fa fa-exclamation-triangle"></i><span>${data.message || 'Failed to load PCs'}</span></div>`;
      setGridStats(false);
    }
  } catch (e) {
    grid.innerHTML = `<div class="res-pc-placeholder"><i class="fa fa-wifi"></i><span>Connection error. Please check your server.</span></div>`;
    setGridStats(false);
  } finally {
    loading.style.display = 'none';
    grid.style.opacity    = '1';
  }
}

function renderPCGrid(total) {
  const grid = document.getElementById('pc-grid');
  let html   = '';

  for (let i = 1; i <= total; i++) {
    const status    = reservedPcsMap[i] || null;
    let cls         = 'available';
    let clickable   = true;
    let titleSuffix = 'Available';

    if (status === 'Reserved') { cls = 'reserved';  clickable = false; titleSuffix = 'Reserved'; }
    else if (status === 'Active') { cls = 'active-pc'; clickable = false; titleSuffix = 'Occupied (Active Sit-in)'; }

    if (selectedPC === i) { cls = 'selected'; clickable = true; }

    html += `<div class="pc-cell ${cls}" 
      ${clickable ? `onclick="selectPC(${i}, this)"` : ''}
      title="PC ${i} - ${titleSuffix}">
      <div class="pc-status-dot"></div>
      <i class="fa fa-desktop"></i>
      <span class="pc-num">PC ${i}</span>
      <span class="pc-status-text">${titleSuffix}</span>
    </div>`;
  }

  grid.innerHTML = html;
}

function updateGridStats(total) {
  const statsWrap = document.getElementById('grid-stats');
  const sub       = document.getElementById('grid-subtitle');
  const reserved  = Object.values(reservedPcsMap).filter(v => v === 'Reserved').length;
  const active    = Object.values(reservedPcsMap).filter(v => v === 'Active').length;
  const avail     = total - reserved - active;

  document.getElementById('stat-avail').textContent    = avail;
  document.getElementById('stat-reserved').textContent  = reserved;
  document.getElementById('stat-active').textContent    = active;
  statsWrap.style.display = 'flex';
  sub.textContent         = `Click a green PC to select it for your reservation`;
}

function setGridStats(show) {
  document.getElementById('grid-stats').style.display = show ? 'flex' : 'none';
  document.getElementById('grid-subtitle').textContent = 'Choose lab, date, and time slot to view PC availability';
}

// Select / deselect a PC
function selectPC(num, el) {
  if (reservedPcsMap[num]) return; // double-guard

  if (selectedPC === num) {
    // Deselect
    selectedPC = null;
    el.classList.remove('selected');
    el.classList.add('available');
    updateSelectedPreview();
    return;
  }

  // Deselect previous
  document.querySelectorAll('.pc-cell.selected').forEach(c => {
    c.classList.remove('selected');
    c.classList.add('available');
  });

  selectedPC = num;
  el.classList.remove('available');
  el.classList.add('selected');
  updateSelectedPreview();
}

function updateSelectedPreview() {
  const preview = document.getElementById('selected-preview');
  const text    = document.getElementById('preview-text');
  if (selectedPC) {
    preview.style.display = 'block';
    const labTxt  = selectedLab ? `Lab ${selectedLab}` : '';
    text.textContent = `PC ${selectedPC} selected${labTxt ? ' - ' + labTxt : ''}`;
  } else {
    preview.style.display = 'none';
  }
}

function clearSelectedPC() {
  if (selectedPC !== null) {
    const prevCell = document.querySelector(`.pc-cell.selected`);
    if (prevCell) { prevCell.classList.remove('selected'); prevCell.classList.add('available'); }
  }
  selectedPC = null;
  updateSelectedPreview();
}

// Reserve
async function handleReserve() {
  const purpose  = document.getElementById('res-purpose').value;
  const date     = document.getElementById('res-date').value;
  const timeSlot = selectedTimeSlot;

  if (!purpose)     { showAlert('Please select a purpose.'); return; }
  if (!selectedLab) { showAlert('Please select a laboratory.'); return; }
  if (!date)        { showAlert('Please select a date.'); return; }
  if (!timeSlot)    { showAlert('Please select a time slot.'); return; }
  if (!selectedPC)  { showAlert('Please click a PC from the grid to select it.'); return; }

  const sessions = parseInt(document.getElementById('form-sessions').textContent || '0');
  if (sessions <= 0) { showAlert('You have no remaining sessions to make a reservation.'); return; }

  const btn = document.getElementById('btn-reserve');
  btn.disabled   = true;
  btn.innerHTML  = '<i class="fa fa-spinner fa-spin"></i> Reserving...';

  try {
    const res  = await fetch('api/student.php?action=reserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idNum: user.idNum, purpose,
        lab: selectedLab, date,
        time_slot: timeSlot, pc_number: selectedPC
      })
    });
    const data = await res.json();

    if (data.success) {
      // Update session counts locally
      user.sitin_remaining = data.remaining;
      localStorage.setItem('ccs_current_user', JSON.stringify(user));
      updateSessionDisplay(data.remaining);

      // Populate confirmation modal
      document.getElementById('modal-title').textContent = 'Reservation Confirmed!';
      document.getElementById('modal-msg').textContent   = 'Your PC has been successfully reserved.';
      document.getElementById('modal-detail-grid').innerHTML = `
        <div class="modal-detail-item">
          <div class="mdi-label"><i class="fa fa-desktop"></i> PC</div>
          <span class="mdi-val">PC ${selectedPC} - Lab ${selectedLab}</span>
        </div>
        <div class="modal-detail-item">
          <div class="mdi-label"><i class="fa fa-calendar"></i> Date</div>
          <span class="mdi-val">${formatDisplayDate(date)}</span>
        </div>
        <div class="modal-detail-item">
          <div class="mdi-label"><i class="fa fa-clock"></i> Time Slot</div>
          <span class="mdi-val">${timeSlot}</span>
        </div>
        <div class="modal-detail-item">
          <div class="mdi-label"><i class="fa fa-bullseye"></i> Purpose</div>
          <span class="mdi-val">${escapeHTML(purpose)}</span>
        </div>
      `;
      document.getElementById('success-modal').classList.add('open');

      // Reset
      selectedPC   = null;
      document.getElementById('res-purpose').value = '';
      updateSelectedPreview();
      loadPCGrid();
      loadMyReservations();
      switchReservationTab('mine');
    } else {
      showAlert(data.message || 'Reservation failed.');
    }
  } catch (e) {
    showAlert('Server connection failed. Please try again.');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = '<i class="fa fa-calendar-check"></i> Reserve This PC';
  }
}

// My reservations
async function loadMyReservations() {
  const tbody = document.getElementById('res-tbody');
  try {
    const res  = await fetch('api/student.php?action=get_my_reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNum: user.idNum })
    });
    const data = await res.json();

    if (data.success && data.reservations.length > 0) {
      const countEl = document.getElementById('res-table-count');
      if (countEl) countEl.textContent = data.reservations.length + ' record' + (data.reservations.length !== 1 ? 's' : '');
      const tabCount = document.getElementById('res-tab-count');
      if (tabCount) tabCount.textContent = data.reservations.length;

      // Update the hero counter for active reservations
      const activeRes = data.reservations.filter(r => r.status === 'Reserved').length;
      const heroCard  = document.getElementById('hero-active-res-card');
      if (heroCard) {
        document.getElementById('hero-active-res').textContent = activeRes;
        heroCard.style.display = activeRes > 0 ? 'flex' : 'none';
      }

      tbody.innerHTML = data.reservations.map(r => {
        const statusCls = escapeHTML((r.status || '').toLowerCase());
        const canCancel = r.status === 'Reserved';
        return `<tr style="animation:fadeSlideIn 0.3s ease both;">
          <td>${escapeHTML(formatDisplayDate(r.date) || '-')}</td>
          <td>Lab ${escapeHTML(r.lab || '-')}</td>
          <td><strong>PC ${escapeHTML(r.pc_number || '-')}</strong></td>
          <td>${escapeHTML(r.purpose || '-')}</td>
          <td style="white-space:nowrap;font-size:0.78rem;">${escapeHTML(r.time_slot || '-')}</td>
          <td><span class="status-pill ${statusCls}">${escapeHTML(r.status || '-')}</span></td>
          <td>${canCancel
            ? `<button class="btn-cancel-res" onclick="openCancelModal(${r.sitId})"><i class="fa fa-xmark"></i> Cancel</button>`
            : '<span style="color:var(--text-muted);font-size:0.78rem;">-</span>'
          }</td>
        </tr>`;
      }).join('');
    } else {
      document.getElementById('res-table-count').textContent = '0 records';
      const tabCount = document.getElementById('res-tab-count');
      if (tabCount) tabCount.textContent = '0';
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7"><i class="fa fa-calendar-xmark" style="margin-right:6px;font-size:1.2rem;"></i>No reservations yet</td></tr>`;
    }
  } catch (e) {
    const tabCount = document.getElementById('res-tab-count');
    if (tabCount) tabCount.textContent = '0';
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Failed to load reservations</td></tr>`;
  }
}

// Cancel flow
function openCancelModal(sitId) {
  pendingCancelId = sitId;
  document.getElementById('cancel-modal').classList.add('open');
}
function closeCancelModal() {
  pendingCancelId = null;
  document.getElementById('cancel-modal').classList.remove('open');
}
async function confirmCancel() {
  if (!pendingCancelId) return;
  const btn  = document.getElementById('confirm-cancel-btn');
  btn.disabled  = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Cancelling...';

  try {
    const res  = await fetch('api/student.php?action=cancel_reservation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNum: user.idNum, sitId: pendingCancelId })
    });
    const data = await res.json();

    closeCancelModal();
    if (data.success) {
      user.sitin_remaining = data.remaining;
      localStorage.setItem('ccs_current_user', JSON.stringify(user));
      updateSessionDisplay(data.remaining);
      showAlert(data.message || 'Reservation cancelled. Session refunded.', 'success');
      loadMyReservations();
      loadPCGrid(); // Refresh grid to free the PC
    } else {
      showAlert(data.message || 'Cancellation failed.');
    }
  } catch (e) {
    closeCancelModal();
    showAlert('Server connection failed.');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = '<i class="fa fa-xmark"></i> Yes, Cancel';
  }
}

// Modal helpers
function closeSuccessModal() {
  document.getElementById('success-modal').classList.remove('open');
}

// Close modals on overlay click
document.getElementById('success-modal').addEventListener('click', function(e) {
  if (e.target === this) closeSuccessModal();
});
document.getElementById('cancel-modal').addEventListener('click', function(e) {
  if (e.target === this) closeCancelModal();
});

// Auto-refresh PC grid every 30s
function startAutoRefresh() {
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    if (selectedLab && selectedTimeSlot && document.getElementById('res-date').value) {
      loadPCGrid();
    }
    loadMyReservations();
  }, 30000);
}

// Helpers
function formatDisplayDate(dateStr) {
  if (!dateStr) return '-';
  try {
    // dateStr might be "YYYY-MM-DD"
    const [y, m, d] = dateStr.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}, ${y}`;
  } catch { return dateStr; }
}
