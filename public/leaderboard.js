const user = JSON.parse(localStorage.getItem('ccs_current_user') || 'null');
if (!user) { window.location.href = 'login.html'; }

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function imageSrc(value) {
  return escapeHTML(value || 'static/temppfp.jpg');
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

async function loadLeaderboard() {
  try {
    const res = await fetch('api/leaderboard.php?action=get_admin_leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNum: user ? user.idNum : null })
    });
    const data = await res.json();

    if (!data.success || !Array.isArray(data.leaderboard)) {
      renderEmpty();
      return;
    }

    renderStats(data.leaderboard);
    renderPodium(data.leaderboard.slice(0, 3));
    renderTable(data.leaderboard);
    renderMyRank(data.current_rank, data.current_stats);
  } catch (err) {
    console.error('Failed to load leaderboard:', err);
    document.getElementById('lb-tbody').innerHTML =
      '<tr><td colspan="5" class="table-empty" style="color:#b91c1c;">Failed to load leaderboard.</td></tr>';
    document.getElementById('podium').innerHTML =
      '<div class="lb-empty-state" style="color:#b91c1c;">Failed to load top students.</div>';
    setText('lb-table-meta', 'Unavailable');
  }
}

function renderEmpty() {
  renderStats([]);
  document.getElementById('podium').innerHTML =
    '<div class="lb-empty-state">No ranked students yet.</div>';
  document.getElementById('lb-tbody').innerHTML =
    '<tr><td colspan="5" class="table-empty">No leaderboard data available yet.</td></tr>';
  setText('lb-table-meta', '0 students');
  renderMyRank(null, null);
}

function renderStats(lb) {
  const ranked = lb.filter(s => Number(s.total_points || 0) > 0 || Number(s.total_sitins || 0) > 0);
  const totalXp = lb.reduce((sum, s) => sum + Number(s.total_points || 0), 0);
  const totalMins = lb.reduce((sum, s) => sum + Number(s.total_duration_mins || 0), 0);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  setText('stat-ranked', formatNumber(ranked.length));
  setText('stat-xp', formatNumber(totalXp));
  setText('stat-hours', hours > 0 ? `${hours}h ${mins}m` : `${mins}m`);
  setText('lb-table-meta', `${lb.length} student${lb.length === 1 ? '' : 's'}`);
}

function renderPodium(top3) {
  const podium = document.getElementById('podium');
  if (!top3.length) {
    podium.innerHTML = '<div class="lb-empty-state">No rankings yet. Complete sit-in sessions to get started.</div>';
    return;
  }

  const order = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
  const medals = top3.length >= 3 ? ['silver', 'gold', 'bronze'] : (top3.length === 2 ? ['silver', 'gold'] : ['gold']);
  const rankLabels = top3.length >= 3 ? [2, 1, 3] : (top3.length === 2 ? [2, 1] : [1]);

  podium.innerHTML = order.map((student, i) => {
    const name = [student.firstname, student.lastname].filter(Boolean).join(' ') || 'Student';
    const medal = medals[i] || '';
    const rank = rankLabels[i] || i + 1;

    return `<article class="podium-card ${medal}">
      <div class="podium-rank">#${rank}</div>
      <img src="${imageSrc(student.profilePic)}" alt="" class="podium-avatar" onerror="this.src='static/temppfp.jpg'" />
      <div class="podium-name">${escapeHTML(name)}</div>
      <div class="podium-course">${escapeHTML(student.course || '-')}</div>
      <div class="podium-rating">${formatNumber(student.total_points)} XP</div>
      <div class="podium-meta">${formatNumber(student.total_sitins)} sessions | ${escapeHTML(student.total_hours_str || '0h')}</div>
    </article>`;
  }).join('');
}

function renderTable(lb) {
  const tbody = document.getElementById('lb-tbody');
  if (!lb.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No data available.</td></tr>';
    return;
  }

  tbody.innerHTML = lb.map((student, i) => {
    const rank = i + 1;
    const name = [student.firstname, student.lastname].filter(Boolean).join(' ') || 'Student';
    const rankClass = rank <= 3 ? 'lb-rank-badge top' : 'lb-rank-badge';

    return `<tr>
      <td><span class="${rankClass}">#${rank}</span></td>
      <td>
        <div class="lb-user">
          <img src="${imageSrc(student.profilePic)}" alt="" onerror="this.src='static/temppfp.jpg'" />
          <div>
            <div class="lb-user-name">${escapeHTML(name)}</div>
            <div class="lb-user-course">${escapeHTML(student.course || '-')}</div>
          </div>
        </div>
      </td>
      <td><span class="lb-rating-num">${formatNumber(student.total_points)} XP</span></td>
      <td>${formatNumber(student.total_sitins)}</td>
      <td>${escapeHTML(student.total_hours_str || '0h')}</td>
    </tr>`;
  }).join('');
}

function renderMyRank(rank, stats) {
  const container = document.getElementById('my-rank-content');

  if (!rank || !stats) {
    container.innerHTML = `
      <div class="my-rank-num" style="font-size:2.25rem !important;color:#6f5c8f !important;">-</div>
      <div class="my-rank-label">Unranked</div>
      <div class="my-points">0 <span style="font-size:1rem;">XP</span></div>
      <div class="my-rank-tip"><i class="fa fa-circle-info"></i> Complete sit-in sessions and earn XP to appear on the board.</div>
    `;
    return;
  }

  const pic = stats.profilePic || (user ? user.profilePic : 'static/temppfp.jpg');
  container.innerHTML = `
    <img src="${imageSrc(pic)}" alt="Avatar" class="my-rank-avatar" onerror="this.src='static/temppfp.jpg'" />
    <div class="my-rank-num">#${escapeHTML(rank)}</div>
    <div class="my-rank-label">Your current rank</div>
    <div class="my-points">${formatNumber(stats.total_points)} <span style="font-size:1rem;">XP</span></div>
    <div class="my-rank-tip"><i class="fa fa-info-circle"></i> Complete sessions, stay productive, and collect admin rewards to climb the board.</div>
  `;
}

window.addEventListener('DOMContentLoaded', loadLeaderboard);
