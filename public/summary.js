const user = JSON.parse(localStorage.getItem('ccs_current_user') || 'null');
if (!user) { window.location.href = 'login.html'; }

let allSessions = [];
let filtered = [];
let currentPage = 1;
let sortCol = 'date';
let sortDir = -1;

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function dash(value) {
  return value || '-';
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

async function loadSummary() {
  try {
    const res = await fetch('api/student.php?action=get_summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNum: user.idNum })
    });
    const data = await res.json();

    if (!data.success) {
      renderLoadError();
      return;
    }

    const summary = data.summary || {};
    setText('stat-hours', `${summary.total_hours || 0}h`);
    setText('stat-sessions', summary.total_sessions || 0);
    setText('stat-avg', `${summary.avg_duration_min || 0}m`);
    setText('stat-longest', `${summary.longest_session_min || 0}m`);

    allSessions = (data.sessions || []).map(record => ({
      ...record,
      duration: getDuration(record)
    }));
    filtered = [...allSessions];
    currentPage = 1;
    renderTable();
  } catch (err) {
    console.error('Failed to load summary:', err);
    renderLoadError();
  }
}

function getDuration(record) {
  if (record.status !== 'Done' || !record.login || !record.logout || record.login === '-' || record.logout === '-') {
    return '-';
  }

  const loginTs = new Date(`${record.date} ${record.login}`).getTime();
  const logoutTs = new Date(`${record.date} ${record.logout}`).getTime();
  if (!Number.isFinite(loginTs) || !Number.isFinite(logoutTs) || logoutTs <= loginTs) {
    return '-';
  }

  const mins = Math.round((logoutTs - loginTs) / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

function renderLoadError() {
  document.getElementById('summary-tbody').innerHTML =
    '<tr><td colspan="8" class="table-empty" style="color:#b91c1c;">Failed to load data. Check server connection.</td></tr>';
  setText('summary-count', 'Unavailable');
}

function renderTable() {
  const perPage = parseInt(document.getElementById('entries-select').value, 10);
  const total = filtered.length;
  const totalPages = Math.ceil(total / perPage) || 1;
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * perPage;
  const pageData = filtered.slice(start, start + perPage);
  const tbody = document.getElementById('summary-tbody');

  if (!pageData.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty"><i class="fa fa-inbox"></i> No sessions found.</td></tr>';
  } else {
    tbody.innerHTML = pageData.map(record => {
      const statusClass = getStatusClass(record.status);
      const pcDisplay = record.pc_number ? `PC ${record.pc_number}` : dash(record.time_slot);
      return `<tr>
        <td>${escapeHTML(dash(record.date))}</td>
        <td>${escapeHTML(dash(record.login))}</td>
        <td>${escapeHTML(dash(record.logout))}</td>
        <td>${escapeHTML(dash(record.duration))}</td>
        <td>${escapeHTML(dash(record.lab))}</td>
        <td>${escapeHTML(pcDisplay)}</td>
        <td>${escapeHTML(dash(record.purpose))}</td>
        <td><span class="badge ${statusClass}">${escapeHTML(dash(record.status))}</span></td>
      </tr>`;
    }).join('');
  }

  setText('summary-count', `${total} record${total === 1 ? '' : 's'}`);
  const endIdx = Math.min(start + perPage, total);
  setText('table-info', total ? `Showing ${start + 1} to ${endIdx} of ${total} entries` : 'No entries');
  renderPagination(totalPages);
}

function getStatusClass(status) {
  if (status === 'Done') return 'badge-done';
  if (status === 'Active') return 'badge-active';
  return 'badge-reserved';
}

function renderPagination(totalPages) {
  const pagDiv = document.getElementById('pagination');
  let html = `<button class="page-btn" onclick="goPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}><i class="fa fa-chevron-left"></i></button>`;

  for (let i = 1; i <= totalPages; i++) {
    if (totalPages <= 7 || Math.abs(i - currentPage) <= 2 || i === 1 || i === totalPages) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goPage(${i})">${i}</button>`;
    } else if (Math.abs(i - currentPage) === 3) {
      html += '<span class="page-gap">...</span>';
    }
  }

  html += `<button class="page-btn" onclick="goPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}><i class="fa fa-chevron-right"></i></button>`;
  pagDiv.innerHTML = html;
}

function goPage(page) {
  const perPage = parseInt(document.getElementById('entries-select').value, 10);
  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderTable();
}

function applySearch(query) {
  const q = query.toLowerCase().trim();
  filtered = q
    ? allSessions.filter(record => Object.values(record).some(value => String(value).toLowerCase().includes(q)))
    : [...allSessions];
  currentPage = 1;
  renderTable();
}

function sortByColumn(col) {
  if (sortCol === col) {
    sortDir = -sortDir;
  } else {
    sortCol = col;
    sortDir = 1;
  }

  filtered.sort((a, b) => {
    const av = String(a[col] || '').toLowerCase();
    const bv = String(b[col] || '').toLowerCase();
    return av < bv ? -sortDir : av > bv ? sortDir : 0;
  });
  currentPage = 1;
  renderTable();
}

function exportCSV() {
  if (!allSessions.length) return;

  const headers = ['Date', 'Time In', 'Time Out', 'Duration', 'Lab', 'PC / Reservation', 'Purpose', 'Status'];
  const rows = allSessions.map(record => [
    record.date || '',
    record.login || '',
    record.logout || '',
    record.duration || '',
    record.lab || '',
    record.pc_number ? `PC ${record.pc_number}` : (record.time_slot || ''),
    record.purpose || '',
    record.status || ''
  ]);

  let csv = `${headers.join(',')}\n`;
  rows.forEach(row => {
    csv += `${row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sit_in_summary_${user.idNum}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

document.getElementById('summary-search').addEventListener('input', event => {
  applySearch(event.target.value);
});

document.getElementById('entries-select').addEventListener('change', () => {
  currentPage = 1;
  renderTable();
});

document.querySelectorAll('.summary-table thead th[data-col]').forEach(th => {
  th.addEventListener('click', () => sortByColumn(th.dataset.col));
});

window.addEventListener('DOMContentLoaded', loadSummary);
