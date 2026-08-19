/**
 * HTML dashboard Message Logs (token-protected).
 * @param {string} token
 * @param {number} hoursLeft
 */
function generateDashboardHTML(token, hoursLeft) {
  const safeToken = String(token).replace(/[<>"'&]/g, '');
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Message Logs</title>
  <style>
    :root {
      --bg: #0f1419;
      --panel: #1a2332;
      --panel2: #243044;
      --border: #2f3b4d;
      --text: #e7e9ea;
      --muted: #8b98a5;
      --accent: #1d9bf0;
      --green: #00ba7c;
      --orange: #ff7a00;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
    header {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
      padding: 16px 20px; border-bottom: 1px solid var(--border); background: var(--panel);
      position: sticky; top: 0; z-index: 20;
    }
    header h1 { margin: 0; font-size: 1.25rem; font-weight: 600; }
    .meta { color: var(--muted); font-size: 0.875rem; }
    .layout { display: grid; grid-template-columns: 280px 1fr; min-height: calc(100vh - 64px); }
    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; }
      .sidebar { max-height: 220px; border-right: none; border-bottom: 1px solid var(--border); }
      .detail-panel { width: 100%; max-width: 100%; }
    }
    .sidebar { background: var(--panel); border-right: 1px solid var(--border); overflow-y: auto; padding: 12px; }
    .search, .date-input {
      width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--bg); color: var(--text); font: inherit;
    }
    .search { margin-bottom: 10px; }
    .group-item {
      display: block; width: 100%; text-align: left; padding: 10px 12px; margin-bottom: 4px;
      border: none; border-radius: 8px; background: transparent; color: var(--text); cursor: pointer; font: inherit;
    }
    .group-item:hover { background: var(--panel2); }
    .group-item.active { background: var(--accent); color: #fff; }
    .group-item .count { opacity: 0.75; font-size: 0.8rem; }
    .main { padding: 16px 20px 40px; overflow-y: auto; min-width: 0; }
    .feed-toolbar {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px;
    }
    .feed-toolbar h2 { margin: 0; font-size: 1.1rem; flex: 1 1 200px; }
    .toolbar-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .btn {
      background: var(--panel2); color: var(--text); border: 1px solid var(--border);
      border-radius: 8px; padding: 8px 14px; cursor: pointer; font: inherit; white-space: nowrap;
    }
    .btn:hover { border-color: var(--accent); }
    .btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    .btn-primary:hover { filter: brightness(1.08); }
    .date-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .date-row label { font-size: 0.8rem; color: var(--muted); }
    .date-input { width: auto; min-width: 130px; padding: 7px 10px; font-size: 0.85rem; }
    .msg {
      background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
      padding: 14px 16px; margin-bottom: 10px;
    }
    .msg-head { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: baseline; margin-bottom: 6px; }
    .msg-name { font-weight: 600; }
    .msg-user { color: var(--accent); font-size: 0.9rem; }
    .msg-time { color: var(--muted); font-size: 0.8rem; margin-left: auto; }
    .msg-body { white-space: pre-wrap; word-break: break-word; line-height: 1.45; margin: 8px 0; }
    .msg-media { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
    .msg-media img, .msg-media video { max-width: min(360px, 100%); max-height: 280px; border-radius: 8px; border: 1px solid var(--border); }
    .msg-media audio { width: min(360px, 100%); }
    .msg-media a.doc {
      color: var(--accent); text-decoration: none; padding: 8px 12px;
      border: 1px solid var(--border); border-radius: 8px; background: var(--panel2);
    }
    .pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 20px; }
    .pager button { background: var(--panel2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px 14px; cursor: pointer; font: inherit; }
    .pager button:disabled { opacity: 0.4; cursor: not-allowed; }
    .empty, .loading { color: var(--muted); padding: 40px 0; text-align: center; }
    .detail-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 100;
      opacity: 0; visibility: hidden; transition: opacity 0.2s;
    }
    .detail-overlay.open { opacity: 1; visibility: visible; }
    .detail-panel {
      position: fixed; top: 0; right: 0; width: min(480px, 100%); height: 100%;
      background: var(--panel); border-left: 1px solid var(--border); z-index: 101;
      transform: translateX(100%); transition: transform 0.25s ease;
      display: flex; flex-direction: column; overflow: hidden;
    }
    .detail-panel.open { transform: translateX(0); }
    .detail-head {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 16px 18px; border-bottom: 1px solid var(--border); flex-shrink: 0;
    }
    .detail-head h3 { margin: 0; font-size: 1.05rem; }
    .detail-body { overflow-y: auto; padding: 16px 18px 32px; flex: 1; }
    .stat-grid {
      display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 18px;
    }
    .stat-card {
      background: var(--panel2); border: 1px solid var(--border); border-radius: 10px; padding: 12px;
    }
    .stat-card .label { font-size: 0.75rem; color: var(--muted); margin-bottom: 4px; }
    .stat-card .value { font-size: 1rem; font-weight: 600; word-break: break-word; }
    .stat-card.highlight .value { color: var(--green); }
    .section-title {
      font-size: 0.85rem; font-weight: 600; color: var(--muted); text-transform: uppercase;
      letter-spacing: 0.04em; margin: 18px 0 10px;
    }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .data-table th, .data-table td {
      border-bottom: 1px solid var(--border); padding: 8px 6px; text-align: left; vertical-align: top;
    }
    .data-table th { color: var(--muted); font-weight: 500; }
    .data-table a { color: var(--accent); text-decoration: none; }
    .filter-bar {
      background: var(--panel2); border: 1px solid var(--border); border-radius: 10px;
      padding: 12px; margin-bottom: 16px;
    }
    .filter-bar .date-row { margin-top: 8px; }
    .badge {
      display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.72rem;
      background: var(--bg); border: 1px solid var(--border); color: var(--muted);
    }
  </style>
</head>
<body>
  <header>
    <h1>📋 Message Logs</h1>
    <div class="meta">Token còn khoảng <strong id="hoursLeft">${hoursLeft}</strong> giờ</div>
  </header>
  <div class="layout">
    <aside class="sidebar">
      <input class="search" id="groupSearch" type="search" placeholder="Tìm nhóm..." autocomplete="off">
      <div id="groupList"><div class="loading">Đang tải nhóm...</div></div>
    </aside>
    <section class="main">
      <div class="feed-toolbar">
        <h2 id="feedTitle">Chọn một nhóm</h2>
        <div class="toolbar-actions">
          <div class="date-row">
            <label>Tin từ</label>
            <input type="date" class="date-input" id="msgStartDate">
            <label>đến</label>
            <input type="date" class="date-input" id="msgEndDate">
            <button type="button" class="btn" id="msgFilterBtn">Lọc tin</button>
          </div>
          <button type="button" class="btn btn-primary" id="detailBtn" disabled>📊 Chi tiết</button>
        </div>
      </div>
      <div id="feed"><div class="empty">Chọn nhóm bên trái để xem tin nhắn</div></div>
      <div class="pager" id="pager" style="display:none">
        <button type="button" id="prevBtn">← Trước</button>
        <span class="meta" id="pageInfo"></span>
        <button type="button" id="nextBtn">Sau →</button>
      </div>
    </section>
  </div>

  <div class="detail-overlay" id="detailOverlay"></div>
  <aside class="detail-panel" id="detailPanel" aria-hidden="true">
    <div class="detail-head">
      <h3 id="detailTitle">Chi tiết nhóm</h3>
      <button type="button" class="btn" id="detailClose">✕</button>
    </div>
    <div class="detail-body" id="detailBody">
      <div class="filter-bar">
        <div class="meta">Lọc thống kê & giao dịch theo ngày</div>
        <div class="date-row">
          <input type="date" class="date-input" id="detailStartDate">
          <span class="meta">→</span>
          <input type="date" class="date-input" id="detailEndDate">
          <button type="button" class="btn btn-primary" id="detailFilterBtn">Áp dụng</button>
          <button type="button" class="btn" id="detailClearFilter">Xóa lọc</button>
        </div>
      </div>
      <div id="detailContent"><div class="loading">Chọn nhóm và bấm Chi tiết</div></div>
    </div>
  </aside>

  <script>
    const TOKEN = ${JSON.stringify(safeToken)};
    let groups = [];
    let activeChatId = null;
    let page = 1;
    let totalPages = 1;
    let msgStartDate = '';
    let msgEndDate = '';
    let detailStartDate = '';
    let detailEndDate = '';

    function mediaUrl(fileId) {
      if (!fileId) return '';
      return '/media/' + encodeURIComponent(fileId) + '?token=' + encodeURIComponent(TOKEN);
    }
    function escapeHtml(s) {
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function formatTime(iso) {
      try { return new Date(iso).toLocaleString('vi-VN', { hour12: false }); } catch (e) { return ''; }
    }
    function fmtNum(n) {
      const v = Number(n);
      if (isNaN(v)) return '0';
      return v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
    }
    function fmtRate(n, suffix) {
      const v = Number(n);
      if (isNaN(v) || v === 0) return '—';
      return v.toLocaleString('vi-VN', { maximumFractionDigits: 4 }) + (suffix || '');
    }

    async function loadGroups() {
      const res = await fetch('/api/messagelogs/groups?token=' + encodeURIComponent(TOKEN));
      if (!res.ok) {
        document.getElementById('groupList').innerHTML = '<div class="empty">Không tải được nhóm</div>';
        return;
      }
      const data = await res.json();
      groups = data.groups || [];
      renderGroups();
      if (groups.length) selectGroup(groups[0].chatId);
    }

    function renderGroups(filter) {
      const q = (filter || '').trim().toLowerCase();
      const list = groups.filter(g => !q || (g.groupName || '').toLowerCase().includes(q) || String(g.chatId).includes(q));
      const el = document.getElementById('groupList');
      if (!list.length) { el.innerHTML = '<div class="empty">Không có nhóm</div>'; return; }
      el.innerHTML = list.map(g => {
        const active = g.chatId === activeChatId ? ' active' : '';
        const rateHint = g.hasBotData
          ? ' · Rate ' + fmtRate(g.rate, '%') + ' · TG ' + fmtRate(g.exchangeRate)
          : '';
        return '<button type="button" class="group-item' + active + '" data-id="' + escapeHtml(g.chatId) + '">' +
          '<div>' + escapeHtml(g.groupName || g.chatId) + '</div>' +
          '<div class="count">' + g.count + ' tin · ' + escapeHtml(g.chatType || '') + rateHint + '</div></button>';
      }).join('');
      el.querySelectorAll('.group-item').forEach(btn => {
        btn.addEventListener('click', () => selectGroup(btn.getAttribute('data-id')));
      });
    }

    async function selectGroup(chatId) {
      activeChatId = chatId;
      page = 1;
      document.getElementById('detailBtn').disabled = false;
      renderGroups(document.getElementById('groupSearch').value);
      const g = groups.find(x => x.chatId === chatId);
      document.getElementById('feedTitle').textContent =
        (g ? (g.groupName || chatId) : chatId) + (g ? ' · ' + g.count + ' tin' : '');
      await loadMessages();
    }

    async function loadMessages() {
      if (!activeChatId) return;
      const feed = document.getElementById('feed');
      feed.innerHTML = '<div class="loading">Đang tải tin nhắn...</div>';
      let url = '/api/messagelogs?token=' + encodeURIComponent(TOKEN) +
        '&chatId=' + encodeURIComponent(activeChatId) + '&page=' + page + '&limit=30';
      if (msgStartDate) url += '&startDate=' + encodeURIComponent(msgStartDate);
      if (msgEndDate) url += '&endDate=' + encodeURIComponent(msgEndDate);
      const res = await fetch(url);
      if (!res.ok) { feed.innerHTML = '<div class="empty">Không tải được tin nhắn</div>'; return; }
      const data = await res.json();
      totalPages = data.totalPages || 1;
      document.getElementById('pager').style.display = totalPages > 1 ? 'flex' : 'none';
      document.getElementById('pageInfo').textContent = 'Trang ' + page + '/' + totalPages;
      document.getElementById('prevBtn').disabled = page <= 1;
      document.getElementById('nextBtn').disabled = page >= totalPages;
      const msgs = data.messages || [];
      if (!msgs.length) { feed.innerHTML = '<div class="empty">Không có tin nhắn trong khoảng đã chọn</div>'; return; }
      feed.innerHTML = msgs.map(m => {
        let media = '';
        if (m.photoFileId || m.photoUrl) {
          const src = m.photoFileId ? mediaUrl(m.photoFileId) : m.photoUrl;
          media += '<a href="' + escapeHtml(src) + '" target="_blank" rel="noopener"><img src="' + escapeHtml(src) + '" alt="photo" loading="lazy"></a>';
        }
        if (m.videoFileId || m.videoUrl) {
          const src = m.videoFileId ? mediaUrl(m.videoFileId) : m.videoUrl;
          media += '<video controls preload="metadata" src="' + escapeHtml(src) + '"></video>';
        }
        if (m.voiceFileId || m.voiceUrl) {
          const src = m.voiceFileId ? mediaUrl(m.voiceFileId) : m.voiceUrl;
          media += '<audio controls preload="metadata" src="' + escapeHtml(src) + '"></audio>';
        }
        if (m.documentFileId || m.documentUrl) {
          const src = m.documentFileId ? mediaUrl(m.documentFileId) : m.documentUrl;
          media += '<a class="doc" href="' + escapeHtml(src) + '" target="_blank" rel="noopener">📄 Tài liệu</a>';
        }
        const user = m.username ? '@' + escapeHtml(m.username) : '';
        return '<article class="msg"><div class="msg-head">' +
          '<span class="msg-name">' + escapeHtml(m.senderName || 'Unknown') + '</span>' +
          (user ? '<span class="msg-user">' + user + '</span>' : '') +
          '<span class="msg-time">' + escapeHtml(formatTime(m.timestamp)) + '</span></div>' +
          (m.content ? '<div class="msg-body">' + escapeHtml(m.content) + '</div>' : '') +
          (media ? '<div class="msg-media">' + media + '</div>' : '') + '</article>';
      }).join('');
    }

    function openDetailPanel() {
      document.getElementById('detailOverlay').classList.add('open');
      document.getElementById('detailPanel').classList.add('open');
      document.getElementById('detailPanel').setAttribute('aria-hidden', 'false');
    }
    function closeDetailPanel() {
      document.getElementById('detailOverlay').classList.remove('open');
      document.getElementById('detailPanel').classList.remove('open');
      document.getElementById('detailPanel').setAttribute('aria-hidden', 'true');
    }

    function renderDetailContent(data) {
      if (!data.registered) {
        document.getElementById('detailContent').innerHTML =
          '<div class="stat-grid">' +
          statCard('Chat ID', escapeHtml(data.chatId)) +
          statCard('Tin nhắn log', fmtNum(data.messageLogCount)) +
          '</div>' +
          '<p class="meta" style="margin-top:12px">' + escapeHtml(data.hint || 'Nhóm chưa có dữ liệu kế toán.') + '</p>';
        return;
      }

      const g = data.group || {};
      const s = data.summary || {};
      const p = data.periodTotals || {};
      const hasFilter = data.filters && (data.filters.startDate || data.filters.endDate);
      const periodLabel = hasFilter ? ' (kỳ lọc)' : '';
      const trs = data.transactionRateStats || {};

      let html = '<div class="section-title">Tỷ giá hiện tại (DB nhóm)</div><div class="stat-grid">' +
        statCard('Rate', fmtRate(g.rate, '%')) +
        statCard('Tỷ giá', fmtRate(g.exchangeRate)) +
        statCard('WRate', fmtRate(g.wrate, '%')) +
        statCard('WTỷ giá', fmtRate(g.wexchangeRate)) +
        statCard('Loại tiền', escapeHtml(g.currency || 'USDT')) +
        statCard('Định dạng số', escapeHtml(g.numberFormat || 'comma')) +
        '</div>';

      html += '<div class="section-title">Thống kê tỷ giá giao dịch (DB)</div><div class="stat-grid">' +
        statCard('Rate TB', fmtRate(trs.avgRate, '%')) +
        statCard('Rate min/max', fmtRate(trs.minRate, '%') + ' / ' + fmtRate(trs.maxRate, '%')) +
        statCard('Tỷ giá TB', fmtRate(trs.avgExchangeRate)) +
        statCard('TG min/max', fmtRate(trs.minExchangeRate) + ' / ' + fmtRate(trs.maxExchangeRate)) +
        statCard('Số lệnh +/-', fmtNum(trs.count || 0)) +
        '</div>';

      html += '<div class="section-title">Tài chính tổng (DB nhóm)</div><div class="stat-grid">' +
        statCard('Tổng VND', fmtNum(g.totalVND)) +
        statCard('Nạp VND', fmtNum(g.totalVNDPlus)) +
        statCard('Rút VND', fmtNum(g.totalVNDMinus)) +
        statCard('Tổng USDT', fmtNum(g.totalUSDT), true) +
        statCard('Đã trả USDT', fmtNum(s.totalPaid)) +
        statCard('Còn lại USDT', fmtNum(s.remaining), true) +
        '</div>';

      if (hasFilter) {
        html += '<div class="section-title">Tổng kỳ lọc' + periodLabel + '</div>' +
          '<div class="stat-grid">' +
          statCard('VND kỳ', fmtNum(p.totalVND)) +
          statCard('USDT kỳ', fmtNum(p.totalUSDT), true) +
          statCard('Trả kỳ', fmtNum(p.totalPaid)) +
          statCard('Còn kỳ', fmtNum(p.remaining)) +
          '</div>';
      }

      html += '<div class="section-title">Lịch sử thay đổi tỷ giá (' + (data.rateHistory || []).length + ')</div>' +
        '<table class="data-table"><thead><tr><th>Thời gian</th><th>Loại</th><th>Rate</th><th>Tỷ giá</th><th>Người</th></tr></thead><tbody>';
      (data.rateHistory || []).forEach(r => {
        html += '<tr><td class="meta">' + escapeHtml(formatTime(r.timestamp)) + '</td>' +
          '<td>' + escapeHtml(r.typeLabel || r.type) + '</td>' +
          '<td>' + fmtRate(r.rate, '%') + '</td>' +
          '<td>' + fmtRate(r.exchangeRate) + '</td>' +
          '<td>' + escapeHtml(r.senderName || '—') + '</td></tr>';
      });
      if (!(data.rateHistory || []).length) {
        html += '<tr><td colspan="5" class="meta">Chưa có lịch sử /d, /d1, /d2 trong DB</td></tr>';
      }
      html += '</tbody></table>';

      html += '<div class="section-title">Thống kê loại giao dịch</div><table class="data-table"><thead><tr>' +
        '<th>Loại</th><th>Số lệnh</th><th>VND</th><th>USDT</th></tr></thead><tbody>';
      const types = data.statsByType || {};
      const typeNames = {
        deposit: 'Nạp (+)', withdraw: 'Rút (-)', payment: 'Thanh toán (%)',
        clear: 'Start/Clear', setRate: 'Set Rate', setExchangeRate: 'Set Tỷ giá', setWRate: 'Set WRate'
      };
      Object.keys(types).sort().forEach(t => {
        const row = types[t];
        html += '<tr><td>' + escapeHtml(typeNames[t] || t) + '</td><td>' + row.count + '</td>' +
          '<td>' + fmtNum(row.totalAmount) + '</td><td>' + fmtNum(row.totalUsdt) + '</td></tr>';
      });
      if (!Object.keys(types).length) html += '<tr><td colspan="4" class="meta">Chưa có giao dịch</td></tr>';
      html += '</tbody></table>';

      if ((data.cards || []).length) {
        html += '<div class="section-title">Thẻ / mã thẻ (' + data.cards.length + ')</div>' +
          '<table class="data-table"><thead><tr><th>Mã</th><th>Tổng</th><th>Đã trả</th><th>Còn</th><th>Limit</th></tr></thead><tbody>';
        data.cards.forEach(c => {
          html += '<tr><td>' + escapeHtml(c.cardCode) + '</td><td>' + fmtNum(c.total) + '</td>' +
            '<td>' + fmtNum(c.paid) + '</td><td>' + fmtNum(c.remaining) + '</td><td>' + fmtNum(c.limit) + '</td></tr>';
        });
        html += '</tbody></table>';
      }

      html += '<div class="section-title">Thành viên Telegram (' + (data.members || []).length + ')</div>' +
        '<table class="data-table"><thead><tr><th>Tên</th><th>Vai trò</th></tr></thead><tbody>';
      (data.members || []).forEach(m => {
        const link = m.telegramLink ? '<a href="' + escapeHtml(m.telegramLink) + '" target="_blank" rel="noopener">' + escapeHtml(m.fullName) + '</a>' : escapeHtml(m.fullName);
        html += '<tr><td>' + link + '</td><td><span class="badge">' + escapeHtml(m.statusText) + '</span></td></tr>';
      });
      if (!(data.members || []).length) html += '<tr><td colspan="2" class="meta">Không lấy được (bot cần quyền admin)</td></tr>';
      html += '</tbody></table>';

      html += '<div class="section-title">Operators bot (' + (data.operators || []).length + ')</div>' +
        '<table class="data-table"><thead><tr><th>Username</th><th>Thêm</th></tr></thead><tbody>';
      (data.operators || []).forEach(op => {
        const link = op.telegramLink ? '<a href="' + escapeHtml(op.telegramLink) + '" target="_blank" rel="noopener">@' + escapeHtml(op.username) + '</a>' : escapeHtml(op.username || '-');
        html += '<tr><td>' + link + '</td><td class="meta">' + escapeHtml(formatTime(op.dateAdded)) + '</td></tr>';
      });
      if (!(data.operators || []).length) html += '<tr><td colspan="2" class="meta">Chưa có operator</td></tr>';
      html += '</tbody></table>';

      html += '<div class="section-title">Tổng kết theo ngày</div><table class="data-table"><thead><tr>' +
        '<th>Ngày</th><th>Nạp VND</th><th>Rút</th><th>USDT</th><th>Trả</th><th>Rate TB</th><th>TG TB</th><th>Lệnh</th></tr></thead><tbody>';
      (data.dailySummary || []).slice(0, 31).forEach(d => {
        html += '<tr><td>' + escapeHtml(d.date) + '</td>' +
          '<td>' + fmtNum(d.deposits && d.deposits.amount) + '</td>' +
          '<td>' + fmtNum(d.withdraws && d.withdraws.amount) + '</td>' +
          '<td>' + fmtNum(d.totalUSDT) + '</td>' +
          '<td>' + fmtNum(d.totalPaid) + '</td>' +
          '<td>' + fmtRate(d.avgRate, '%') + '</td>' +
          '<td>' + fmtRate(d.avgExchangeRate) + '</td>' +
          '<td>' + (d.transactionCount || 0) + '</td></tr>';
      });
      if (!(data.dailySummary || []).length) html += '<tr><td colspan="8" class="meta">Không có dữ liệu</td></tr>';
      html += '</tbody></table>';

      if ((data.startHistory || []).length) {
        html += '<div class="section-title">Lịch sử Start (Clear)</div><table class="data-table"><thead><tr><th>Ngày</th><th>Người</th></tr></thead><tbody>';
        data.startHistory.forEach(h => {
          html += '<tr><td>' + escapeHtml(h.date) + '</td><td>' + escapeHtml(h.senderName) + '</td></tr>';
        });
        html += '</tbody></table>';
      }

      html += '<p class="meta" style="margin-top:16px">Chat ID: ' + escapeHtml(data.chatId) +
        ' · Giao dịch: ' + fmtNum(data.transactionCount) +
        ' · Tin log: ' + fmtNum(data.messageLogCount) +
        ' · Thành viên: ' + fmtNum(data.memberCount) +
        (g.lastClearDate ? ' · Clear gần nhất: ' + formatTime(g.lastClearDate) : '') + '</p>';

      document.getElementById('detailContent').innerHTML = html;
    }

    function statCard(label, value, highlight) {
      return '<div class="stat-card' + (highlight ? ' highlight' : '') + '"><div class="label">' + label +
        '</div><div class="value">' + value + '</div></div>';
    }

    async function loadGroupDetails() {
      if (!activeChatId) return;
      document.getElementById('detailContent').innerHTML = '<div class="loading">Đang tải...</div>';
      let url = '/api/messagelogs/groups/' + encodeURIComponent(activeChatId) + '/details?token=' + encodeURIComponent(TOKEN);
      if (detailStartDate) url += '&startDate=' + encodeURIComponent(detailStartDate);
      if (detailEndDate) url += '&endDate=' + encodeURIComponent(detailEndDate);
      const res = await fetch(url);
      if (!res.ok) {
        let msg = 'Không tải được chi tiết nhóm (HTTP ' + res.status + ')';
        try {
          const err = await res.json();
          if (err.error) msg = err.error;
        } catch (e) { /* ignore */ }
        document.getElementById('detailContent').innerHTML = '<div class="empty">' + escapeHtml(msg) + '</div>';
        return;
      }
      const data = await res.json();
      document.getElementById('detailTitle').textContent = 'Chi tiết · ' + (data.groupTitle || activeChatId);
      renderDetailContent(data);
    }

    document.getElementById('groupSearch').addEventListener('input', e => renderGroups(e.target.value));
    document.getElementById('prevBtn').addEventListener('click', () => { if (page > 1) { page -= 1; loadMessages(); } });
    document.getElementById('nextBtn').addEventListener('click', () => { if (page < totalPages) { page += 1; loadMessages(); } });
    document.getElementById('msgFilterBtn').addEventListener('click', () => {
      msgStartDate = document.getElementById('msgStartDate').value;
      msgEndDate = document.getElementById('msgEndDate').value;
      page = 1;
      loadMessages();
    });
    document.getElementById('detailBtn').addEventListener('click', () => {
      openDetailPanel();
      loadGroupDetails();
    });
    document.getElementById('detailClose').addEventListener('click', closeDetailPanel);
    document.getElementById('detailOverlay').addEventListener('click', closeDetailPanel);
    document.getElementById('detailFilterBtn').addEventListener('click', () => {
      detailStartDate = document.getElementById('detailStartDate').value;
      detailEndDate = document.getElementById('detailEndDate').value;
      loadGroupDetails();
    });
    document.getElementById('detailClearFilter').addEventListener('click', () => {
      detailStartDate = detailEndDate = '';
      document.getElementById('detailStartDate').value = '';
      document.getElementById('detailEndDate').value = '';
      loadGroupDetails();
    });

    loadGroups();
  </script>
</body>
</html>`;
}

module.exports = { generateDashboardHTML };
