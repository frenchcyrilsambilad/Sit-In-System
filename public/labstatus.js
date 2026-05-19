const user = JSON.parse(localStorage.getItem('ccs_current_user') || 'null');
if (!user) { window.location.href = 'login.html'; }

let labsData = [];
let selectedLab = '';
let softwareLabs = [];
let softwareCategories = ['IDE', 'WEB', 'DEV', 'DB', 'TOOL', 'OS'];
let selectedSoftwareLab = 'ALL';
let selectedSoftwareCategory = 'ALL';

const softwareMeta = {
  IDE: { icon: 'fa-code', color: '#4f46e5', bg: '#eef2ff' },
  WEB: { icon: 'fa-globe', color: '#2563eb', bg: '#eff6ff' },
  DEV: { icon: 'fa-terminal', color: '#059669', bg: '#ecfdf5' },
  DB: { icon: 'fa-database', color: '#7c3aed', bg: '#f3edff' },
  TOOL: { icon: 'fa-screwdriver-wrench', color: '#d97706', bg: '#fffbeb' },
  OS: { icon: 'fa-window-maximize', color: '#475569', bg: '#f8fafc' }
};

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

async function refreshLabStatus() {
  const btn = document.getElementById('btn-refresh');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Refreshing';
  }

  try {
    const res = await fetch('api/student.php?action=get_lab_status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();

    if (data.success) {
      labsData = data.labs || [];
      if (!selectedLab && labsData.length) selectedLab = labsData[0].lab;
      renderOverviewTotals();
      renderLabTabs();
      renderSelectedLab();
      setText('last-updated', `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    } else {
      renderLabError();
    }
  } catch (err) {
    console.error('Failed to load lab status:', err);
    renderLabError();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa fa-rotate-right"></i> Refresh';
    }
  }
}

function renderLabError() {
  document.getElementById('lab-tabs').innerHTML = '<button class="lab-list-loading"><i class="fa fa-triangle-exclamation"></i> Unable to load labs</button>';
  document.getElementById('pc-grid').innerHTML = '<div class="map-empty"><i class="fa fa-triangle-exclamation"></i> Lab status unavailable.</div>';
  setText('last-updated', 'Update failed');
}

function renderOverviewTotals() {
  const totals = labsData.reduce((acc, lab) => {
    acc.available += Number(lab.available || 0);
    acc.active += Number(lab.active || 0);
    acc.reserved += Number(lab.reserved || 0);
    return acc;
  }, { available: 0, active: 0, reserved: 0 });

  setText('total-available', totals.available);
  setText('total-active', totals.active);
  setText('total-reserved', totals.reserved);
  setText('total-labs', labsData.length);
}

function renderLabTabs() {
  const container = document.getElementById('lab-tabs');
  if (!labsData.length) {
    container.innerHTML = '<button class="lab-list-loading">No labs found</button>';
    return;
  }

  container.innerHTML = labsData.map(lab => {
    const active = lab.lab === selectedLab;
    const pct = lab.total_pcs ? Math.round((lab.available / lab.total_pcs) * 100) : 0;
    return `<button class="lab-tab ${active ? 'active' : ''}" onclick="selectLab('${escapeHTML(lab.lab)}')">
      <span class="lab-tab-icon"><i class="fa fa-desktop"></i></span>
      <span>
        <span class="lab-tab-name">Lab ${escapeHTML(lab.lab)}</span>
        <span class="lab-tab-meta">${pct}% available</span>
      </span>
      <span class="lab-tab-free">${Number(lab.available || 0)}</span>
    </button>`;
  }).join('');
}

function selectLab(lab) {
  selectedLab = lab;
  renderLabTabs();
  renderSelectedLab();
}

function renderSelectedLab() {
  const lab = labsData.find(item => item.lab === selectedLab);
  if (!lab) return;

  const total = Number(lab.total_pcs || 0);
  const available = Number(lab.available || 0);
  const pct = total ? Math.round((available / total) * 100) : 0;

  setText('grid-lab-name', `Lab ${lab.lab}`);
  setText('ov-available', available);
  setText('ov-active', lab.active || 0);
  setText('ov-reserved', lab.reserved || 0);
  setText('capacity-label', `${pct}% available`);
  setText('capacity-detail', `${available} of ${total} PCs ready`);
  document.getElementById('capacity-fill').style.width = `${pct}%`;

  renderPcGrid(lab);
}

function renderPcGrid(lab) {
  const grid = document.getElementById('pc-grid');
  const total = Number(lab.total_pcs || 0);
  if (!total) {
    grid.innerHTML = '<div class="map-empty">No PC map available for this lab.</div>';
    return;
  }

  let html = '';
  for (let pcNum = 1; pcNum <= total; pcNum++) {
    const pc = lab.pcs ? lab.pcs[pcNum] : null;
    let cls = 'pc-available';
    let icon = 'fa-desktop';
    let tooltip = `PC ${pcNum} - Available`;

    if (pc && pc.status === 'Active') {
      cls = 'pc-active';
      icon = 'fa-user-clock';
      tooltip = `PC ${pcNum} - Active: ${pc.name || pc.idNum || 'Student'}`;
    } else if (pc && pc.status === 'Reserved') {
      cls = 'pc-reserved';
      icon = 'fa-calendar-check';
      tooltip = `PC ${pcNum} - Reserved: ${pc.name || pc.idNum || 'Student'}`;
    }

    html += `<div class="pc-cell ${cls}" data-tooltip="${escapeHTML(tooltip)}">
      <i class="fa ${icon}"></i>
      <span>PC ${pcNum}</span>
    </div>`;
  }
  grid.innerHTML = html;
}

async function loadSoftwareCatalog() {
  try {
    const res = await fetch('api/lab_software.php?action=get_public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();

    if (data.success) {
      softwareLabs = data.labs || [];
      softwareCategories = data.categories || softwareCategories;
      renderSoftwareFilters();
      renderSoftwareCatalog();
    } else {
      renderSoftwareError();
    }
  } catch (err) {
    console.error('Failed to load software catalog:', err);
    renderSoftwareError();
  }
}

function renderSoftwareError() {
  document.getElementById('software-grid').innerHTML =
    '<div class="software-empty"><i class="fa fa-triangle-exclamation"></i><strong>Software catalog unavailable</strong><span>Please try again later.</span></div>';
  setText('software-count', 'Unavailable');
}

function renderSoftwareFilters() {
  const labWrap = document.getElementById('software-lab-pills');
  const catWrap = document.getElementById('software-category-pills');
  const labs = ['ALL', ...softwareLabs.map(lab => lab.lab)];

  labWrap.innerHTML = labs.map(lab => `
    <button class="software-pill ${selectedSoftwareLab === lab ? 'active' : ''}" onclick="setSoftwareLab('${escapeHTML(lab)}')">${lab === 'ALL' ? 'All labs' : 'Lab ' + escapeHTML(lab)}</button>
  `).join('');

  catWrap.innerHTML = ['ALL', ...softwareCategories].map(cat => `
    <button class="software-pill ${selectedSoftwareCategory === cat ? 'active' : ''}" onclick="setSoftwareCategory('${escapeHTML(cat)}')">${escapeHTML(cat)}</button>
  `).join('');
}

function setSoftwareLab(lab) {
  selectedSoftwareLab = lab;
  renderSoftwareFilters();
  renderSoftwareCatalog();
}

function setSoftwareCategory(category) {
  selectedSoftwareCategory = category;
  renderSoftwareFilters();
  renderSoftwareCatalog();
}

function renderSoftwareCatalog() {
  const grid = document.getElementById('software-grid');
  const query = (document.getElementById('software-search')?.value || '').trim().toLowerCase();
  const items = softwareLabs.flatMap(lab => (lab.software || []).map(sw => ({ ...sw, lab: lab.lab })));
  const filtered = items.filter(sw => {
    const haystack = `${sw.lab} ${sw.name || ''} ${sw.version || ''} ${sw.category || ''}`.toLowerCase();
    return (!query || haystack.includes(query))
      && (selectedSoftwareLab === 'ALL' || sw.lab === selectedSoftwareLab)
      && (selectedSoftwareCategory === 'ALL' || sw.category === selectedSoftwareCategory);
  });

  setText('software-count', `${filtered.length} item${filtered.length === 1 ? '' : 's'}`);

  if (!filtered.length) {
    grid.innerHTML = '<div class="software-empty"><i class="fa fa-box-open"></i><strong>No software found</strong><span>Try another lab, category, or search term.</span></div>';
    return;
  }

  grid.innerHTML = filtered.map(sw => {
    const meta = softwareMeta[sw.category] || softwareMeta.TOOL;
    return `<article class="software-card">
      <div class="sw-icon-box" style="background:${meta.bg};color:${meta.color};"><i class="fa ${meta.icon}"></i></div>
      <div>
        <div class="sw-title">${escapeHTML(sw.name)}</div>
        <div class="sw-desc">Lab ${escapeHTML(sw.lab)}${sw.version ? ' | Version ' + escapeHTML(sw.version) : ''}</div>
        <span class="sw-category" style="background:${meta.bg};color:${meta.color};">${escapeHTML(sw.category)}</span>
      </div>
    </article>`;
  }).join('');
}

document.getElementById('software-search').addEventListener('input', renderSoftwareCatalog);

window.addEventListener('DOMContentLoaded', () => {
  refreshLabStatus();
  loadSoftwareCatalog();
  setInterval(refreshLabStatus, 30000);
});
