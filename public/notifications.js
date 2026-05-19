/* ============================================================
   notifications.js — Shared Notification System
   Handles bell badge, dropdown, announcement popup modal,
   and sit-in status alerts (active session / session timed out)
   for all student pages (dashboard, editprofile, history, reservation)
   ============================================================ */

(function () {
  let allAnnouncements = [];
  let seenIds = JSON.parse(localStorage.getItem('seen_announcements') || '[]');
  let lastKnownId = parseInt(localStorage.getItem('last_known_announcement') || '0');

  // Sit-in status tracking
  let lastKnownActiveSitId  = parseInt(localStorage.getItem('sn_active_sitId')  || '0');
  let lastKnownDoneSitId    = parseInt(localStorage.getItem('sn_done_sitId')    || '0');
  let seenSitinAlerts       = JSON.parse(localStorage.getItem('sn_seen_alerts') || '[]');

  // Notification queue for the bell dropdown (sit-in alerts)
  let sitinAlerts = JSON.parse(localStorage.getItem('sn_alerts') || '[]');

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function truncateText(value, max = 72) {
    const text = String(value ?? '').trim();
    return text.length > max ? text.slice(0, max - 3) + '...' : text;
  }

  /* ════════════════════════════════════════════════
     SHARED STYLES (injected once)
  ════════════════════════════════════════════════ */
  function injectSharedStyles() {
    if (document.getElementById('sn-shared-styles')) return;
    const style = document.createElement('style');
    style.id = 'sn-shared-styles';
    style.textContent = `
      /* ── Announcement popup ── */
      @keyframes annPopIn {
        from { transform: scale(0.9) translateY(16px); opacity: 0; }
        to   { transform: scale(1)   translateY(0);    opacity: 1; }
      }
      .announce-popup-overlay {
        display: none; position: fixed; inset: 0;
        background: rgba(30, 22, 53, 0.52);
        backdrop-filter: blur(3px); z-index: 9999;
        align-items: center; justify-content: center;
      }
      .announce-popup-box {
        background: #fff; border-radius: 18px;
        width: min(92vw, 420px);
        box-shadow: 0 20px 60px rgba(74, 29, 143, 0.25);
        overflow: hidden; animation: annPopIn 0.25s ease;
      }
      .announce-popup-header {
        background: linear-gradient(135deg, #7c3aed, #4a1d8f);
        padding: 1.2rem 1.5rem; display: flex; align-items: center; gap: 12px;
      }
      .announce-popup-icon {
        width: 42px; height: 42px; border-radius: 50%;
        background: rgba(255,255,255,0.15);
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }
      .announce-popup-icon i  { color: #fff; font-size: 17px; }
      .announce-popup-title-text { color: #fff; font-weight: 800; font-size: 1.05rem; font-family: Raleway, sans-serif; }
      .announce-popup-date { color: rgba(255,255,255,0.6); font-size: 0.75rem; font-weight: 600; margin-top: 2px; }
      .announce-popup-body { padding: 1.3rem 1.5rem; }
      .announce-popup-body p { margin: 0; font-size: 0.95rem; color: #333; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
      .announce-popup-footer { padding: 0.6rem 1.5rem 1.2rem; display: flex; justify-content: flex-end; }
      .announce-popup-btn {
        padding: 10px 32px; border: none; border-radius: 9px;
        font-size: 0.9rem; font-weight: 700; cursor: pointer;
        font-family: Nunito, sans-serif; color: #fff;
        background: linear-gradient(135deg, #7c3aed, #4a1d8f);
        box-shadow: 0 4px 12px rgba(124,58,237,0.25); transition: opacity 0.2s;
      }
      .announce-popup-btn:hover { opacity: 0.88; }

      @keyframes annGlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .announce-popup-overlay {
        padding: 18px;
        background: rgba(23, 4, 61, 0.56);
        backdrop-filter: blur(6px);
      }
      .announce-popup-box {
        position: relative;
        width: min(92vw, 500px);
        max-height: min(86vh, 620px);
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        border: 0;
        border-radius: 14px;
        background: #fff;
        box-shadow: 0 20px 58px rgba(24, 7, 54, 0.28);
        animation: annPopIn 0.22s ease;
      }
      .announce-popup-header {
        position: relative;
        overflow: hidden;
        align-items: center;
        gap: 16px;
        min-height: 128px;
        margin: 0;
        padding: 22px 26px;
        border-radius: 14px 14px 0 0;
        background:
          radial-gradient(circle at right top, rgba(245,166,35,.22), transparent 42%),
          linear-gradient(135deg, #341070 0%, #4c1d95 100%);
      }
      .announce-popup-header::after {
        content: "";
        position: absolute;
        width: 132px;
        height: 132px;
        right: -58px;
        top: -58px;
        border-radius: 50%;
        background: rgba(180,103,255,.16);
        border: 1px solid rgba(255,255,255,.16);
        opacity: 1;
      }
      .announce-popup-icon {
        position: relative;
        z-index: 1;
        width: 50px;
        height: 50px;
        border-radius: 14px;
        background: rgba(255,255,255,0.13);
        color: #ffe29a;
      }
      .announce-popup-icon i { color: #ffe29a; font-size: 21px; }
      .announce-popup-heading {
        position: relative;
        z-index: 1;
        min-width: 0;
      }
      .announce-popup-kicker {
        display: inline-flex;
        align-items: center;
        min-height: 22px;
        margin-bottom: 8px;
        padding: 0 10px;
        border-radius: 999px;
        background: #ffe477;
        color: #341070;
        font-size: 10px;
        font-weight: 900;
        letter-spacing: .05em;
        text-transform: uppercase;
      }
      .announce-popup-title-text {
        color: #fff !important;
        font-family: Nunito, sans-serif;
        font-size: clamp(1.35rem, 3vw, 1.7rem);
        font-weight: 950;
        line-height: 1.08;
        text-shadow: 0 1px 1px rgba(0,0,0,.12);
      }
      .announce-popup-date {
        margin-top: 7px;
        color: rgba(255,255,255,0.78);
        font-size: .84rem;
        font-weight: 800;
      }
      .announce-popup-body {
        overflow: auto;
        padding: 18px 26px 10px;
      }
      .announce-popup-body p {
        color: #35205c;
        font-size: 1.42rem;
        font-weight: 950;
        line-height: 1.3;
      }
      .announce-popup-footer {
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 0 26px;
        padding: 12px 0 18px;
        border-top: 1px solid #eadffb;
      }
      .announce-popup-footnote {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        color: #766591;
        font-size: .82rem;
        font-weight: 750;
      }
      .announce-popup-footnote i {
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: #f2eaff;
        color: #6d28d9;
        font-size: 14px;
      }
      .announce-popup-btn {
        min-width: 128px;
        min-height: 42px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 14px;
        padding: 0 18px;
        border-radius: 11px;
        background: linear-gradient(135deg, #7c3aed, #4c1d95);
        box-shadow: 0 16px 32px rgba(76,29,149,0.28);
        font-size: .92rem;
        font-weight: 950;
        transition: transform 0.16s ease, background 0.16s ease;
      }
      .announce-popup-btn i { font-size: 1.1rem; }
      .announce-popup-btn:hover {
        background: linear-gradient(135deg, #8b5cf6, #4c1d95);
        opacity: 1;
        transform: translateY(-1px);
      }
      .announce-popup-btn:focus-visible {
        outline: 3px solid rgba(245,166,35,.45);
        outline-offset: 3px;
      }
      @media (max-width: 760px) {
        .announce-popup-box {
          width: min(92vw, 520px);
          border-radius: 14px;
        }
        .announce-popup-header {
          min-height: 0;
          margin: 0;
          padding: 20px 22px;
          border-radius: 14px 14px 0 0;
        }
        .announce-popup-icon {
          width: 52px;
          height: 52px;
          border-radius: 14px;
        }
        .announce-popup-icon i { font-size: 21px; }
        .announce-popup-title-text {
          font-size: clamp(1.35rem, 6vw, 2rem);
          line-height: 1.12;
        }
        .announce-popup-date {
          margin-top: 8px;
          font-size: .9rem;
          line-height: 1.35;
        }
        .announce-popup-body {
          padding: 18px 22px 10px;
        }
        .announce-popup-body p {
          font-size: 1.1rem;
        }
        .announce-popup-footer {
          align-items: stretch;
          flex-direction: column;
          margin: 0 22px;
          padding: 12px 0 18px;
        }
        .announce-popup-btn {
          width: 100%;
          min-width: 0;
          min-height: 48px;
          font-size: .95rem;
        }
      }
      @media (max-width: 520px) {
        .announce-popup-header {
          gap: 12px;
          padding: 18px;
        }
        .announce-popup-icon {
          width: 46px;
          height: 46px;
          border-radius: 12px;
        }
        .announce-popup-kicker {
          min-height: 22px;
          margin-bottom: 8px;
          font-size: 10px;
        }
        .announce-popup-title-text {
          font-size: 1.28rem;
        }
        .announce-popup-date {
          font-size: .82rem;
        }
        .announce-popup-body { padding: 16px 18px 8px; }
        .announce-popup-body p {
          font-size: 1rem;
        }
        .announce-popup-footer {
          align-items: stretch;
          flex-direction: column;
          margin: 0 18px;
          padding: 12px 0 16px;
        }
        .announce-popup-btn { width: 100%; }
      }

      /* ── Sit-in toast notification ── */
      @keyframes snToastIn  { from { transform: translateX(110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes snToastOut { from { opacity: 1; } to { opacity: 0; transform: translateX(110%); } }
      #sn-toast-stack {
        position: fixed; bottom: 24px; right: 24px; z-index: 10000;
        display: flex; flex-direction: column; gap: 12px; align-items: flex-end;
        pointer-events: none;
      }
      .sn-toast {
        pointer-events: all;
        width: min(88vw, 360px); border-radius: 14px; overflow: hidden;
        box-shadow: 0 12px 40px rgba(0,0,0,0.18);
        animation: snToastIn 0.38s cubic-bezier(0.22,1,0.36,1) both;
        display: flex; flex-direction: column;
        font-family: Nunito, sans-serif;
      }
      .sn-toast.hiding { animation: snToastOut 0.3s ease forwards; }
      .sn-toast-header {
        display: flex; align-items: center; gap: 10px;
        padding: 12px 14px 10px;
        border-bottom: 1px solid rgba(255,255,255,0.15);
      }
      .sn-toast-icon {
        width: 36px; height: 36px; border-radius: 50%;
        background: rgba(255,255,255,0.2);
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }
      .sn-toast-icon i { font-size: 15px; color: #fff; }
      .sn-toast-title { font-weight: 800; font-size: 0.92rem; color: #fff; }
      .sn-toast-sub   { font-size: 0.72rem; color: rgba(255,255,255,0.75); margin-top: 1px; }
      .sn-toast-body  { padding: 10px 14px 12px; font-size: 0.85rem; line-height: 1.55; }
      .sn-toast-footer { padding: 0 14px 12px; display: flex; justify-content: flex-end; }
      .sn-toast-close {
        border: none; border-radius: 8px; padding: 6px 18px; cursor: pointer;
        font-size: 0.8rem; font-weight: 700; font-family: Nunito, sans-serif;
        background: rgba(255,255,255,0.22); color: #fff; transition: background 0.2s;
      }
      .sn-toast-close:hover { background: rgba(255,255,255,0.35); }

      /* ── Active session style (purple/indigo) ── */
      .sn-toast.sn-active .sn-toast-header { background: linear-gradient(135deg, #6d28d9, #4338ca); }
      .sn-toast.sn-active .sn-toast-body   { background: #f5f3ff; color: #3730a3; }
      .sn-toast.sn-active .sn-toast-footer { background: #f5f3ff; }

      /* ── Done/timeout style (emerald/teal) ── */
      .sn-toast.sn-done .sn-toast-header { background: linear-gradient(135deg, #059669, #0d9488); }
      .sn-toast.sn-done .sn-toast-body   { background: #ecfdf5; color: #065f46; }
      .sn-toast.sn-done .sn-toast-footer { background: #ecfdf5; }

      /* ── Sit-in notification items inside bell dropdown ── */
      .sn-notif-item {
        display: flex; gap: 10px; padding: 10px 12px;
        border-bottom: 1px solid #ede8fb; cursor: default;
        transition: background 0.15s;
      }
      .sn-notif-item:hover { background: #f8f6ff; }
      .sn-notif-dot {
        width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 5px;
      }
      .sn-notif-dot.active { background: #7c3aed; }
      .sn-notif-dot.done   { background: #059669; }
      .sn-notif-text { font-size: 12px; color: #3d2c6e; line-height: 1.5; }
      .sn-notif-time { font-size: 10px; color: #a78bca; margin-top: 2px; }

      .student-shell .dropdown { position: relative; }
      .student-shell #bell-link {
        position: relative;
        border: 1px solid transparent;
      }
      .student-shell #bell-link[aria-expanded="true"],
      .student-shell #bell-link:hover {
        background: rgba(255,255,255,0.12);
        border-color: rgba(255,255,255,0.14);
      }
      .student-shell #bell-badge {
        min-width: 16px;
        height: 16px;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 0 5px !important;
        border: 2px solid #341070;
        background: #ff4d3d !important;
        color: #fff !important;
        font-size: 10px !important;
        line-height: 1 !important;
      }
      .student-shell .dropdown-menu {
        display: none;
        position: absolute;
        top: calc(100% + 10px);
        right: 0;
        width: min(360px, calc(100vw - 24px));
        max-height: 440px;
        overflow: hidden;
        padding: 0;
        border: 1px solid #ded2f4;
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 18px 44px rgba(35, 9, 78, 0.22);
        z-index: 2000;
      }
      .student-shell .dropdown.open .dropdown-menu,
      .student-shell .dropdown-menu.open {
        display: block !important;
      }
      .sn-menu-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        background: #341070;
        color: #fff;
      }
      .sn-menu-title { font-size: 13px; font-weight: 900; }
      .sn-menu-count {
        padding: 3px 8px;
        border-radius: 999px;
        background: rgba(255,255,255,.18);
        font-size: 11px;
        font-weight: 900;
      }
      .sn-menu-list {
        max-height: 320px;
        overflow-y: auto;
        background: #fff;
      }
      .sn-menu-empty {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 18px 16px;
        color: #6f5c8f;
        font-size: 13px;
        font-weight: 700;
      }
      .sn-ann-item,
      .sn-notif-item {
        display: flex;
        gap: 10px;
        padding: 12px 14px;
        border-bottom: 1px solid #f0eaf9;
        background: #fff;
        color: #2e0f66;
        text-decoration: none;
      }
      .sn-ann-item:hover,
      .sn-notif-item:hover { background: #fbf8ff; }
      .sn-ann-item.unread,
      .sn-notif-item.unread { background: #f7f2ff; }
      .sn-item-icon {
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        border-radius: 9px;
        background: #ede7fb;
        color: #6d28d9;
      }
      .sn-item-title {
        color: #21064f;
        font-size: 12px;
        font-weight: 900;
        line-height: 1.3;
      }
      .sn-item-body {
        margin-top: 2px;
        color: #584371;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.45;
      }
      .sn-item-time {
        margin-top: 4px;
        color: #9b83bf;
        font-size: 10px;
        font-weight: 800;
      }
      .sn-menu-action {
        display: block;
        padding: 11px 14px;
        border-top: 1px solid #eee5fb;
        background: #fff;
        color: #4c1d95;
        text-align: center;
        font-size: 12px;
        font-weight: 900;
        text-decoration: none;
      }
      .sn-menu-action:hover { background: #faf7ff; color: #341070; }

      /* Announcement modal - senior redesign */
      .announce-popup-overlay {
        padding: 18px;
        background: rgba(23, 4, 61, .58);
        backdrop-filter: blur(6px);
      }
      .announce-popup-box {
        width: min(92vw, 480px);
        max-height: min(86vh, 620px);
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        overflow: hidden;
        border: 0;
        border-radius: 16px;
        background: #fff;
        box-shadow: 0 24px 70px rgba(22, 5, 49, .32);
      }
      .announce-popup-header {
        min-height: auto;
        margin: 0;
        padding: 18px 20px;
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) 32px;
        gap: 12px;
        align-items: center;
        border-radius: 0;
        background: linear-gradient(135deg, #341070 0%, #5522a0 100%);
      }
      .announce-popup-header::after {
        width: 132px;
        height: 132px;
        right: -52px;
        top: -58px;
        background: rgba(188, 124, 255, .16);
      }
      .announce-popup-icon {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: rgba(255,255,255,.13);
      }
      .announce-popup-icon i {
        color: #ffe477;
        font-size: 18px;
      }
      .announce-popup-heading {
        display: grid;
        gap: 5px;
      }
      .announce-popup-kicker {
        width: fit-content;
        min-height: 20px;
        margin: 0;
        padding: 0 9px;
        background: #ffe477;
        color: #341070;
        font-size: 10px;
        font-weight: 950;
        letter-spacing: .04em;
      }
      .announce-popup-title-text {
        color: #fff !important;
        font-family: Nunito, sans-serif;
        font-size: 18px;
        font-weight: 950;
        line-height: 1.08;
        text-shadow: none;
      }
      .announce-popup-date {
        margin: 0;
        color: rgba(255,255,255,.78);
        font-size: 12px;
        font-weight: 850;
        line-height: 1.25;
      }
      .announce-popup-close {
        position: relative;
        z-index: 1;
        width: 32px;
        height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 9px;
        background: rgba(255,255,255,.1);
        color: #fff;
        cursor: pointer;
      }
      .announce-popup-close:hover {
        background: rgba(255,255,255,.18);
      }
      .announce-popup-body {
        overflow: auto;
        padding: 22px 24px 18px;
        background: #fff;
      }
      .announce-popup-body p {
        margin: 0;
        color: #24104f;
        font-size: 18px;
        font-weight: 900;
        line-height: 1.45;
      }
      .announce-popup-footer {
        min-height: 68px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        margin: 0;
        padding: 14px 20px;
        border-top: 1px solid #eee6fb;
        background: #fbf9ff;
      }
      .announce-popup-footnote {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        min-width: 0;
        color: #766591;
        font-size: 12px;
        font-weight: 800;
      }
      .announce-popup-footnote i {
        width: 26px;
        height: 26px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        border-radius: 50%;
        background: #f0e8ff;
        color: #6d28d9;
        font-size: 12px;
      }
      .announce-popup-btn {
        min-width: 112px;
        min-height: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 0 16px;
        border: 0;
        border-radius: 10px;
        background: #341070;
        color: #fff;
        box-shadow: 0 10px 22px rgba(52,16,112,.2);
        font-family: Nunito, sans-serif;
        font-size: 13px;
        font-weight: 950;
        cursor: pointer;
      }
      .announce-popup-btn:hover {
        background: #4c1d95;
        transform: translateY(-1px);
      }
      .announce-popup-btn i {
        font-size: 13px;
      }
      @media (max-width: 560px) {
        .announce-popup-box {
          width: min(94vw, 420px);
          border-radius: 14px;
        }
        .announce-popup-header {
          grid-template-columns: 40px minmax(0, 1fr) 30px;
          gap: 10px;
          padding: 16px;
        }
        .announce-popup-icon {
          width: 40px;
          height: 40px;
        }
        .announce-popup-title-text {
          font-size: 16px;
        }
        .announce-popup-body {
          padding: 18px 18px 14px;
        }
        .announce-popup-body p {
          font-size: 16px;
        }
        .announce-popup-footer {
          grid-template-columns: 1fr;
          padding: 14px 18px 18px;
        }
        .announce-popup-btn {
          width: 100%;
        }
      }

      /* Final premium announcement modal */
      .announce-popup-overlay {
        padding: 20px;
        background:
          radial-gradient(circle at top, rgba(124,58,237,.16), transparent 34%),
          rgba(24, 10, 48, .56);
        backdrop-filter: blur(8px);
      }
      .announce-popup-box {
        width: min(92vw, 500px);
        max-height: min(86vh, 640px);
        padding: 0 !important;
        border-radius: 20px;
        background: #fff;
        overflow: hidden;
        box-shadow:
          0 22px 58px rgba(22,5,49,.22),
          0 1px 0 rgba(255,255,255,.85) inset;
      }
      /* Important: The header must be flush to the modal edges, like padding: 0; header width: 100%; overflow: hidden; border-radius only on top corners */
      .announce-popup-header {
        width: 100%;
        box-sizing: border-box;
        min-height: 124px;
        grid-template-columns: 48px minmax(0, 1fr) 34px;
        gap: 14px;
        margin: 0 !important;
        padding: 22px 24px;
        border-radius: 20px 20px 0 0 !important;
        background:
          radial-gradient(circle at 92% 12%, rgba(190,132,255,.28), transparent 34%),
          linear-gradient(135deg, #321064 0%, #54219a 62%, #6d28d9 100%);
      }
      .announce-popup-header::after {
        width: 148px;
        height: 148px;
        right: -62px;
        top: -66px;
        border-color: rgba(255,255,255,.18);
        background: rgba(255,255,255,.08);
      }
      .announce-popup-icon {
        width: 48px;
        height: 48px;
        border-radius: 14px;
        background: rgba(255,255,255,.14);
        box-shadow: 0 10px 22px rgba(19, 6, 44, .16);
      }
      .announce-popup-icon i {
        color: #ffe477;
        font-size: 20px;
      }
      .announce-popup-heading {
        gap: 6px;
      }
      .announce-popup-kicker {
        min-height: 22px;
        padding: 0 10px;
        border-radius: 999px;
        background: #ffe477;
        color: #341070;
        font-size: 10px;
        letter-spacing: .05em;
      }
      .announce-popup-title-text {
        color: #fff !important;
        font-size: clamp(1.32rem, 2.6vw, 1.68rem);
        font-weight: 950;
        letter-spacing: 0;
      }
      .announce-popup-date {
        color: rgba(255,255,255,.82);
        font-size: .82rem;
        font-weight: 850;
      }
      .announce-popup-close {
        width: 34px;
        height: 34px;
        border-radius: 999px;
        background: rgba(255,255,255,.1);
        color: rgba(255,255,255,.82);
        font-size: 14px;
        transition: background .16s ease, color .16s ease, transform .16s ease;
      }
      .announce-popup-close:hover {
        background: rgba(255,255,255,.18);
        color: #fff;
        transform: translateY(-1px);
      }
      .announce-popup-body {
        padding: 22px 24px 18px;
        background: #fff;
      }
      .announce-popup-message-label {
        margin-bottom: 9px;
        color: #7b679b;
        font-size: 11px;
        font-weight: 950;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .announce-popup-body p {
        margin: 0;
        padding: 16px 18px;
        border: 1px solid #eadffc;
        border-radius: 16px;
        background: linear-gradient(180deg, #fbf8ff 0%, #f5efff 100%);
        color: #24104f;
        box-shadow: 0 10px 24px rgba(88, 43, 145, .07) inset;
        font-size: 1.06rem;
        font-weight: 850;
        line-height: 1.5;
      }
      .announce-popup-footer {
        min-height: 68px;
        margin: 0;
        padding: 14px 20px 18px;
        border-top: 1px solid #eee7fb;
        background: linear-gradient(180deg, #fff 0%, #fbf9ff 100%);
      }
      .announce-popup-footnote {
        color: #67547f;
        font-size: .84rem;
        font-weight: 800;
      }
      .announce-popup-footnote i {
        width: 30px;
        height: 30px;
        background: #f3edff;
        color: #6d28d9;
        font-size: 13px;
      }
      .announce-popup-btn {
        min-width: 132px;
        min-height: 44px;
        border-radius: 12px;
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 48%, #54219a 100%);
        box-shadow: 0 12px 24px rgba(109,40,217,.22);
        font-size: .92rem;
      }
      .announce-popup-btn:hover {
        background: linear-gradient(135deg, #9671f8 0%, #7440df 48%, #5b26a5 100%);
      }
      @media (max-width: 560px) {
        .announce-popup-overlay {
          padding: 14px;
        }
        .announce-popup-box {
          width: min(94vw, 420px);
          padding: 0 !important;
          border-radius: 18px;
        }
        .announce-popup-header {
          width: 100%;
          min-height: 116px;
          grid-template-columns: 44px minmax(0, 1fr) 32px;
          gap: 12px;
          padding: 20px 18px;
          border-radius: 18px 18px 0 0 !important;
        }
        .announce-popup-icon {
          width: 44px;
          height: 44px;
          border-radius: 14px;
        }
        .announce-popup-title-text {
          font-size: 1.18rem;
        }
        .announce-popup-date {
          font-size: .78rem;
        }
        .announce-popup-close {
          width: 32px;
          height: 32px;
        }
        .announce-popup-body {
          padding: 20px 18px 16px;
        }
        .announce-popup-body p {
          padding: 14px 15px;
          font-size: 1rem;
        }
        .announce-popup-footer {
          grid-template-columns: 1fr;
          padding: 14px 18px 18px;
        }
        .announce-popup-btn {
          width: 100%;
          min-height: 46px;
        }
      }

      @media (max-width: 860px) {
        .student-shell .dropdown-menu {
          position: static;
          width: 100%;
          max-height: none;
          margin-top: 6px;
          box-shadow: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ════════════════════════════════════════════════
     ANNOUNCEMENT POPUP MODAL
  ════════════════════════════════════════════════ */
  function injectModal() {
    if (document.getElementById('announce-popup-overlay')) return;
    injectSharedStyles();

    const modal = document.createElement('div');
    modal.id = 'announce-popup-overlay';
    modal.className = 'announce-popup-overlay';
    modal.innerHTML = `
      <div class="announce-popup-box" role="dialog" aria-modal="true" aria-labelledby="announce-popup-title">
        <div class="announce-popup-header">
          <div class="announce-popup-icon"><i class="fa fa-bullhorn"></i></div>
          <div class="announce-popup-heading">
            <div class="announce-popup-kicker">CCS ADMIN</div>
            <div class="announce-popup-title-text" id="announce-popup-title">New Announcement</div>
            <div class="announce-popup-date" id="announce-popup-date">from CCS Admin</div>
          </div>
          <button type="button" class="announce-popup-close" id="announce-popup-close" aria-label="Close announcement">
            <i class="fa fa-xmark"></i>
          </button>
        </div>
        <div class="announce-popup-body">
          <div class="announce-popup-message-label">Message</div>
          <p id="announce-popup-text"></p>
        </div>
        <div class="announce-popup-footer">
          <span class="announce-popup-footnote"><i class="fa fa-circle-info"></i> New portal announcement</span>
          <button class="announce-popup-btn" id="announce-popup-ok"><i class="fa fa-check"></i> Got it</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
    document.getElementById('announce-popup-ok').addEventListener('click', () => { modal.style.display = 'none'; });
    document.getElementById('announce-popup-close').addEventListener('click', () => { modal.style.display = 'none'; });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.style.display === 'flex') modal.style.display = 'none';
    });
  }

  function showAnnouncementPopup(announcement) {
    injectModal();
    document.getElementById('announce-popup-text').textContent = announcement.text || '';
    document.getElementById('announce-popup-date').textContent =
      announcement.date ? 'CCS Admin \u00b7 ' + announcement.date : 'from CCS Admin';
    const modal = document.getElementById('announce-popup-overlay');
    modal.style.display = 'flex';
  }

  /* ════════════════════════════════════════════════
     TOAST STACK (sit-in alerts)
  ════════════════════════════════════════════════ */
  function ensureToastStack() {
    if (!document.getElementById('sn-toast-stack')) {
      injectSharedStyles();
      const stack = document.createElement('div');
      stack.id = 'sn-toast-stack';
      document.body.appendChild(stack);
    }
  }

  function showSitinToast({ type, title, subtitle, body }) {
    ensureToastStack();
    const stack = document.getElementById('sn-toast-stack');

    const toast = document.createElement('div');
    toast.className = `sn-toast sn-${type}`;
    toast.innerHTML = `
      <div class="sn-toast-header">
        <div class="sn-toast-icon">
          <i class="fa ${type === 'active' ? 'fa-laptop' : 'fa-check-circle'}"></i>
        </div>
        <div>
          <div class="sn-toast-title">${title}</div>
          <div class="sn-toast-sub">${subtitle || ''}</div>
        </div>
      </div>
      <div class="sn-toast-body">${body}</div>
      <div class="sn-toast-footer">
        <button class="sn-toast-close">Dismiss</button>
      </div>
    `;
    stack.appendChild(toast);

    const dismiss = () => {
      toast.classList.add('hiding');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };
    toast.querySelector('.sn-toast-close').addEventListener('click', dismiss);

    // Auto-dismiss after 8s
    setTimeout(dismiss, 8000);
  }

  /* ════════════════════════════════════════════════
     BELL BADGE + DROPDOWN
  ════════════════════════════════════════════════ */
  function updateBellMenu() {
    // Count unread announcements
    let unreadAnn = 0;
    allAnnouncements.forEach(a => {
      if (!seenIds.includes(String(a.id))) unreadAnn++;
    });

    // Count unread sit-in alerts
    let unreadSitin = sitinAlerts.filter(a => !seenSitinAlerts.includes(a.id)).length;

    const totalUnread = unreadAnn + unreadSitin;
    const badge = document.getElementById('bell-badge');
    if (badge) {
      if (totalUnread > 0) {
        badge.style.display = 'inline-flex';
        badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
      } else {
        badge.style.display = 'none';
      }
    }

    let menuItems = '';

    // Sit-in alerts (most recent 3, newest first)
    const recentAlerts = sitinAlerts.slice(0, 3);
    recentAlerts.forEach(a => {
      const isNew = !seenSitinAlerts.includes(a.id);
      const icon = a.type === 'active' ? 'fa-laptop' : 'fa-circle-check';
      menuItems += `
        <div class="sn-notif-item ${isNew ? 'unread' : ''}" onclick="window._sitinAlertRead('${escapeHTML(a.id)}')">
          <div class="sn-item-icon"><i class="fa ${icon}"></i></div>
          <div>
            <div class="sn-item-title">${escapeHTML(a.title)}</div>
            <div class="sn-item-body">${escapeHTML(a.body)}</div>
            <div class="sn-item-time">${escapeHTML(a.time || '')}</div>
          </div>
        </div>`;
    });

    // Announcements (top 3)
    const top3 = allAnnouncements.slice(0, 3);
    top3.forEach(a => {
      const isNew = !seenIds.includes(String(a.id));
      menuItems += `
        <a href="#" class="sn-ann-item ${isNew ? 'unread' : ''}" onclick="window._notifMarkRead('${escapeHTML(a.id)}');return false;">
          <div class="sn-item-icon"><i class="fa fa-bullhorn"></i></div>
          <div>
            <div class="sn-item-title">Announcement</div>
            <div class="sn-item-body">${escapeHTML(truncateText(a.text, 86))}</div>
            <div class="sn-item-time">${escapeHTML(a.date || '')}</div>
          </div>
        </a>`;
    });

    if (!menuItems) {
      menuItems = `
        <div class="sn-menu-empty">
          <i class="fa fa-bell-slash"></i>
          <span>No notifications yet.</span>
        </div>`;
    }

    const menuHtml = `
      <div class="sn-menu-head">
        <span class="sn-menu-title">Notifications</span>
        <span class="sn-menu-count">${totalUnread} unread</span>
      </div>
      <div class="sn-menu-list">${menuItems}</div>
      ${totalUnread > 0 ? '<a href="#" class="sn-menu-action" onclick="window._notifMarkAllRead();return false;">Mark all as read</a>' : ''}
    `;

    const menu = document.getElementById('notification-menu');
    if (menu) menu.innerHTML = menuHtml;
  }

  /* ── Mark helpers ── */
  window._notifMarkRead = function (id) {
    if (!seenIds.includes(String(id))) {
      seenIds.push(String(id));
      localStorage.setItem('seen_announcements', JSON.stringify(seenIds));
    }
    updateBellMenu();
  };

  window._notifMarkAllRead = function () {
    allAnnouncements.forEach(a => {
      if (!seenIds.includes(String(a.id))) seenIds.push(String(a.id));
    });
    localStorage.setItem('seen_announcements', JSON.stringify(seenIds));
    sitinAlerts.forEach(a => {
      if (!seenSitinAlerts.includes(a.id)) seenSitinAlerts.push(a.id);
    });
    localStorage.setItem('sn_seen_alerts', JSON.stringify(seenSitinAlerts));
    updateBellMenu();
  };

  window._sitinAlertRead = function (id) {
    if (!seenSitinAlerts.includes(id)) {
      seenSitinAlerts.push(id);
      localStorage.setItem('sn_seen_alerts', JSON.stringify(seenSitinAlerts));
    }
    updateBellMenu();
  };

  window.markAllNotificationsRead = window._notifMarkAllRead;

  /* ════════════════════════════════════════════════
     ANNOUNCEMENTS
  ════════════════════════════════════════════════ */
  function processAnnouncements(announcements) {
    allAnnouncements = announcements;
    if (announcements.length > 0) {
      const latestId = parseInt(announcements[0].id);
      if (latestId > lastKnownId) {
        if (lastKnownId !== 0) showAnnouncementPopup(announcements[0]);
        lastKnownId = latestId;
        localStorage.setItem('last_known_announcement', String(lastKnownId));
      }
    }
    updateBellMenu();
    window.dispatchEvent(new CustomEvent('announcements-loaded', { detail: { announcements } }));
  }

  function fetchAnnouncements() {
    fetch('api/admin.php?action=get_announcements', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    })
      .then(r => r.json())
      .then(data => { if (data.success && data.announcements) processAnnouncements(data.announcements); })
      .catch(() => {});
  }

  /* ════════════════════════════════════════════════
     SIT-IN STATUS POLLING
  ════════════════════════════════════════════════ */
  function addSitinAlert(alert) {
    // Prepend (newest first), cap at 10
    sitinAlerts.unshift(alert);
    if (sitinAlerts.length > 10) sitinAlerts = sitinAlerts.slice(0, 10);
    localStorage.setItem('sn_alerts', JSON.stringify(sitinAlerts));
  }

  function pollSitinStatus() {
    const user = JSON.parse(localStorage.getItem('ccs_current_user') || 'null');
    if (!user || !user.idNum) return;

    fetch('api/student.php?action=get_sitin_status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idNum: user.idNum })
    })
    .then(r => r.json())
    .then(data => {
      if (!data.success) return;

      const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      /* ── Case 1: Student has an active sit-in ── */
      if (data.active) {
        const activeSitId = parseInt(data.active.sitId);
        if (activeSitId !== lastKnownActiveSitId) {
          lastKnownActiveSitId = activeSitId;
          localStorage.setItem('sn_active_sitId', String(activeSitId));

          const alertId = 'active-' + activeSitId;
          if (!seenSitinAlerts.includes(alertId)) {
            const bodyText = `You are currently sitting in at <strong>${data.active.lab}</strong> for <strong>${data.active.purpose}</strong>. Time in: ${data.active.login}.`;
            addSitinAlert({
              id: alertId, type: 'active',
              title: 'Sit-In Session Active',
              body: `Lab: ${data.active.lab} - ${data.active.purpose}`,
              time: now
            });
            showSitinToast({
              type: 'active',
              title: 'You Are Now Sitting In!',
              subtitle: `Lab ${data.active.lab} - ${data.active.date}`,
              body: bodyText
            });
            updateBellMenu();
          }
        }
      } else {
        // No active session — reset tracker so we notify next time
        if (lastKnownActiveSitId !== 0) {
          lastKnownActiveSitId = 0;
          localStorage.setItem('sn_active_sitId', '0');
        }
      }

      /* ── Case 2: Most recent session just became Done ── */
      if (data.lastDone) {
        const doneSitId = parseInt(data.lastDone.sitId);
        if (doneSitId > lastKnownDoneSitId) {
          lastKnownDoneSitId = doneSitId;
          localStorage.setItem('sn_done_sitId', String(doneSitId));

          const alertId = 'done-' + doneSitId;
          const bodyText = `Your sit-in session at <strong>${data.lastDone.lab}</strong> has ended. Time out: ${data.lastDone.logout || now}.`;
          addSitinAlert({
            id: alertId, type: 'done',
            title: 'Session Completed',
            body: `Lab: ${data.lastDone.lab} - Out: ${data.lastDone.logout || now}`,
            time: now
          });
          showSitinToast({
            type: 'done',
            title: 'Sit-In Session Ended',
            subtitle: `Lab ${data.lastDone.lab} - ${data.lastDone.date}`,
            body: bodyText
          });
          updateBellMenu();
        }
      }
    })
    .catch(() => {});
  }

  function setupNotificationDropdown() {
    const bell = document.getElementById('bell-link');
    const menu = document.getElementById('notification-menu');
    if (!bell || !menu) return;
    if (bell.dataset.notificationBound === 'true') return;
    bell.dataset.notificationBound = 'true';

    const dropdown = bell.closest('.dropdown');
    if (!dropdown) return;

    bell.setAttribute('aria-haspopup', 'true');
    bell.setAttribute('aria-expanded', 'false');

    bell.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isOpen = dropdown.classList.toggle('open');
      menu.classList.toggle('open', isOpen);
      bell.setAttribute('aria-expanded', String(isOpen));
    });

    menu.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    document.addEventListener('click', () => {
      dropdown.classList.remove('open');
      menu.classList.remove('open');
      bell.setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        dropdown.classList.remove('open');
        menu.classList.remove('open');
        bell.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ════════════════════════════════════════════════
     INITIALIZE
  ════════════════════════════════════════════════ */
  window.addEventListener('DOMContentLoaded', () => {
    injectSharedStyles();
    setupNotificationDropdown();
    fetchAnnouncements();
    pollSitinStatus();
    setInterval(fetchAnnouncements, 3000);
    setInterval(pollSitinStatus, 8000); // Poll every 8 seconds
  });

  window.addEventListener('student-navbar-enhanced', () => {
    setupNotificationDropdown();
    updateBellMenu();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fetchAnnouncements();
  });

  window.addEventListener('focus', fetchAnnouncements);

  window.addEventListener('storage', (event) => {
    if (event.key === 'ccs_announcement_ping') fetchAnnouncements();
  });

  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel('ccs_announcements');
    channel.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'announcement-added') fetchAnnouncements();
    });
  }
})();
