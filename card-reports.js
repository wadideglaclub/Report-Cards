
(function () {
  var REQ_KEY = "wadi_degla_requests_final";
  var BRANCH_KEY = "wadi_degla_branches";
  var MANUAL_KEY = "wadi_degla_manual_card_reports";
  var DEFAULT_BRANCHES = ["أكتوبر 1", "أكتوبر 2", "شيراتون", "المعادي", "النخيل", "اللوتس", "أسيوط", "المنيا", "دمياط", "إسكندرية", "طنطا", "المنصورة"];
  var MONTH_NAMES = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

  /* ======================= إرسال الطلبات لصفحة تقارير التبادل ======================= */
  /* ضع هنا دومين صفحة التقارير (اللي عليها /api/sync) — مثال: https://cards-mu.vercel.app/api/sync */
  var SYNC_URL = "https://cards-mu.vercel.app/api/sync";
  var SYNC_PIN = ""; /* لو ضفت SYNC_PIN في Vercel اكتب نفس القيمة هنا */

  (function setupRequestSync() {
    if (!SYNC_URL) { try { console.warn("[card-reports] SYNC_URL فاضي — الطلبات مش هتتبعت لصفحة التقارير"); } catch (e) {} return; }
    var timer = null, lastSent = null;
    function push() {
      var v = null;
      try { v = localStorage.getItem(REQ_KEY); } catch (e) {}
      if (v == null || v === lastSent) return;
      var body = {}; body[REQ_KEY] = v;
      fetch(SYNC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-pin": SYNC_PIN },
        body: JSON.stringify(body),
        keepalive: true
      }).then(function (r) { if (r.ok) lastSent = v; }).catch(function () {});
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(push, 700); }
    try {
      var origSet = Storage.prototype.setItem, origRem = Storage.prototype.removeItem;
      Storage.prototype.setItem = function (k) {
        var r = origSet.apply(this, arguments);
        if (this === window.localStorage && k === REQ_KEY) schedule();
        return r;
      };
      Storage.prototype.removeItem = function (k) {
        var r = origRem.apply(this, arguments);
        if (this === window.localStorage && k === REQ_KEY) schedule();
        return r;
      };
    } catch (e) {}
    setTimeout(push, 2000);                               /* دفعة كاملة عند فتح الصفحة */
    setInterval(push, 30000);                             /* أمان: لو فيه تغيير فات */
    document.addEventListener("visibilitychange", function () { if (document.hidden) push(); });
  })();

  function getRole() {
    try { return (sessionStorage.getItem("wd_role") || localStorage.getItem("wd_role") || "admin").toLowerCase(); }
    catch (e) { return "admin"; }
  }

  function readList(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || "null");
      if (Array.isArray(v)) return v;
    } catch (e) {}
    return (fallback || []).slice();
  }

  function writeList(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
      if (window.__wdFlush) window.__wdFlush();
    } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function toast(msg, type) {
    var el = document.createElement("div");
    el.style.cssText = "position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:9999;max-width:92%;background:" +
      (type === "error" ? "#dc2626" : "#0F0F0F") +
      ";color:#fff;border-radius:999px;padding:12px 20px;font-family:'Tajawal',sans-serif;font-weight:700;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.3);direction:rtl;text-align:center";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () {
      el.style.transition = "opacity .4s";
      el.style.opacity = "0";
      setTimeout(function () { el.remove(); }, 400);
    }, 2800);
  }

  /* ----------------------- Date parsing (ar-EG locale, Arabic-Indic digits) ----------------------- */
  function toLatinDigits(s) {
    return String(s).replace(/[\u0660-\u0669]/g, function (ch) { return String(ch.charCodeAt(0) - 0x0660); });
  }
  function parseWdDate(str) {
    if (!str) return null;
    var t = toLatinDigits(str);
    var m = t.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4})/);
    if (!m) return null;
    return { day: parseInt(m[1], 10), month: parseInt(m[2], 10), year: parseInt(m[3], 10) };
  }

  /* ----------------------- Data aggregation ----------------------- */
  function ensureCell(map, branch, year, month) {
    if (!branch) return { requested: 0, sent: 0 };
    map[branch] = map[branch] || {};
    map[branch][year] = map[branch][year] || {};
    map[branch][year][month] = map[branch][year][month] || { requested: 0, sent: 0 };
    return map[branch][year][month];
  }

  function buildAutoMap() {
    var requests = readList(REQ_KEY, []);
    var map = {};
    requests.forEach(function (r) {
      var d = parseWdDate(r.date);
      if (!d) return;
      if (r.fromBranch) ensureCell(map, r.fromBranch, d.year, d.month).requested++;
      if (r.toBranch) ensureCell(map, r.toBranch, d.year, d.month).sent++;
    });
    return map;
  }

  function getAutoCell(autoMap, branch, year, month) {
    return (autoMap[branch] && autoMap[branch][year] && autoMap[branch][year][month]) || { requested: 0, sent: 0 };
  }

  function buildMap() {
    var map = buildAutoMap();
    var manual = readList(MANUAL_KEY, []);
    manual.forEach(function (m) {
      if (!m.branch || !m.year || !m.month) return;
      var cell = ensureCell(map, m.branch, m.year, m.month);
      cell.requested += Number(m.requested) || 0;
      cell.sent += Number(m.sent) || 0;
    });
    return map;
  }

  function getBranchNames(map) {
    var known = readList(BRANCH_KEY, DEFAULT_BRANCHES);
    var extra = Object.keys(map).filter(function (b) { return known.indexOf(b) === -1; });
    return known.concat(extra.sort());
  }

  function getYears(map) {
    var years = {};
    Object.keys(map).forEach(function (b) {
      Object.keys(map[b]).forEach(function (y) { years[y] = true; });
    });
    var list = Object.keys(years).map(Number).sort(function (a, b) { return a - b; });
    if (!list.length) list.push(new Date().getFullYear());
    return list;
  }

  /* ----------------------- Chart (inline SVG, no external deps) ----------------------- */
  function buildBarChart(categories, seriesList) {
    var W = 760, H = 320, padL = 44, padR = 14, padT = 18, padB = 46;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var maxVal = 1;
    seriesList.forEach(function (s) { s.values.forEach(function (v) { if (v > maxVal) maxVal = v; }); });
    var niceMax = Math.ceil(maxVal / 5) * 5 || 5;
    var n = Math.max(categories.length, 1);
    var groupW = plotW / n;
    var gap = 3;
    var barW = Math.max(5, (groupW - gap * (seriesList.length + 1)) / seriesList.length);

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;font-family:Tajawal,Arial,sans-serif">';
    var steps = 5;
    for (var i = 0; i <= steps; i++) {
      var val = Math.round(niceMax * i / steps);
      var y = padT + plotH - (plotH * i / steps);
      svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="#eee" stroke-width="1"/>';
      svg += '<text x="' + (padL - 7) + '" y="' + (y + 3) + '" font-size="9" fill="#71717a" text-anchor="end">' + val + '</text>';
    }
    categories.forEach(function (cat, ci) {
      var gx = padL + ci * groupW;
      seriesList.forEach(function (s, si) {
        var v = s.values[ci] || 0;
        var bh = plotH * (v / niceMax);
        var bx = gx + gap + si * (barW + gap);
        var by = padT + plotH - bh;
        svg += '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + s.color + '" rx="2"/>';
        if (v > 0) svg += '<text x="' + (bx + barW / 2).toFixed(1) + '" y="' + (by - 3).toFixed(1) + '" font-size="8" text-anchor="middle" fill="#0F0F0F" font-weight="700">' + v + '</text>';
      });
      svg += '<text x="' + (gx + groupW / 2).toFixed(1) + '" y="' + (H - padB + 15).toFixed(1) + '" font-size="9" text-anchor="middle" fill="#3f3f46">' + esc(cat) + '</text>';
    });
    svg += '<line x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) + '" stroke="#0F0F0F" stroke-width="1.4"/>';
    var ly = H - 16;
    seriesList.forEach(function (s, i) {
      var ex = padL + i * 150;
      svg += '<rect x="' + ex + '" y="' + (ly - 9) + '" width="11" height="11" rx="3" fill="' + s.color + '"/>';
      svg += '<text x="' + (ex + 15) + '" y="' + ly + '" font-size="10" fill="#0F0F0F" font-weight="700">' + esc(s.name) + '</text>';
    });
    svg += '</svg>';
    return svg;
  }

  function buildTableHTML(headers, rows, footer) {
    var html = '<div style="overflow-x:auto;border:1px solid #e4e4e7;border-radius:14px"><table style="width:100%;border-collapse:collapse;font-size:12.5px">';
    html += '<thead><tr style="background:#0F0F0F;color:#fff">';
    headers.forEach(function (h) { html += '<th style="padding:10px 10px;text-align:center;font-weight:800;white-space:nowrap">' + esc(h) + '</th>'; });
    html += '</tr></thead><tbody>';
    rows.forEach(function (r, idx) {
      html += '<tr style="background:' + (idx % 2 === 0 ? '#fff' : '#F8F8F5') + '">';
      r.forEach(function (c) { html += '<td style="padding:8px 10px;text-align:center;font-weight:600">' + esc(c) + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody>';
    if (footer) {
      html += '<tfoot><tr style="background:#FFF8CC;font-weight:900;border-top:2px solid #FFD700">';
      footer.forEach(function (c) { html += '<td style="padding:10px 10px;text-align:center">' + esc(c) + '</td>'; });
      html += '</tr></tfoot>';
    }
    html += '</table></div>';
    return html;
  }

  function buildBranchTableWithEdit(rows, footer) {
    var html = '<div style="overflow-x:auto;border:1px solid #e4e4e7;border-radius:14px"><table style="width:100%;border-collapse:collapse;font-size:12.5px">';
    html += '<thead><tr style="background:#0F0F0F;color:#fff">';
    ["الفرع", "طلبنا منه", "أرسلنا له", "الإجمالي", ""].forEach(function (h) {
      html += '<th style="padding:10px 10px;text-align:center;font-weight:800;white-space:nowrap">' + esc(h) + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows.forEach(function (r, idx) {
      html += '<tr style="background:' + (idx % 2 === 0 ? '#fff' : '#F8F8F5') + '">';
      html += '<td style="padding:8px 10px;text-align:center;font-weight:800">' + esc(r[0]) + '</td>';
      html += '<td style="padding:8px 10px;text-align:center;font-weight:600">' + esc(r[1]) + '</td>';
      html += '<td style="padding:8px 10px;text-align:center;font-weight:600">' + esc(r[2]) + '</td>';
      html += '<td style="padding:8px 10px;text-align:center;font-weight:600">' + esc(r[3]) + '</td>';
      html += '<td style="padding:6px 8px;text-align:center"><button data-edit-branch="' + esc(r[0]) + '" style="height:28px;padding:0 10px;border-radius:8px;background:#0F0F0F;color:#FFD700;border:0;font-weight:800;font-size:11px;cursor:pointer">✏️</button></td>';
      html += '</tr>';
    });
    html += '</tbody>';
    if (footer) {
      html += '<tfoot><tr style="background:#FFF8CC;font-weight:900;border-top:2px solid #FFD700">';
      footer.forEach(function (c) { html += '<td style="padding:10px 10px;text-align:center">' + esc(c) + '</td>'; });
      html += '<td></td></tr></tfoot>';
    }
    html += '</table></div>';
    return html;
  }

  function buildMonthlyTableWithEdit(rows2, footer) {
    var html = '<div style="overflow-x:auto;border:1px solid #e4e4e7;border-radius:14px"><table style="width:100%;border-collapse:collapse;font-size:12.5px">';
    html += '<thead><tr style="background:#0F0F0F;color:#fff">';
    ["الشهر", "طلبنا منه", "أرسلنا له", "الإجمالي", ""].forEach(function (h) {
      html += '<th style="padding:10px 10px;text-align:center;font-weight:800;white-space:nowrap">' + esc(h) + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows2.forEach(function (r, idx) {
      html += '<tr style="background:' + (idx % 2 === 0 ? '#fff' : '#F8F8F5') + '">';
      html += '<td style="padding:8px 10px;text-align:center;font-weight:700">' + esc(r[0]) + '</td>';
      html += '<td style="padding:8px 10px;text-align:center;font-weight:600">' + esc(r[1]) + '</td>';
      html += '<td style="padding:8px 10px;text-align:center;font-weight:600">' + esc(r[2]) + '</td>';
      html += '<td style="padding:8px 10px;text-align:center;font-weight:600">' + esc(r[3]) + '</td>';
      html += '<td style="padding:6px 8px;text-align:center"><button data-edit-month="' + (idx + 1) + '" style="height:28px;padding:0 10px;border-radius:8px;background:#0F0F0F;color:#FFD700;border:0;font-weight:800;font-size:11px;cursor:pointer">✏️</button></td>';
      html += '</tr>';
    });
    html += '</tbody>';
    if (footer) {
      html += '<tfoot><tr style="background:#FFF8CC;font-weight:900;border-top:2px solid #FFD700">';
      footer.forEach(function (c) { html += '<td style="padding:10px 10px;text-align:center">' + esc(c) + '</td>'; });
      html += '<td></td></tr></tfoot>';
    }
    html += '</table></div>';
    return html;
  }

  /* ----------------------- Panel state ----------------------- */
  var panelOpen = false;
  var state = { branch: "all", year: null };

  function closePanel() {
    var ov = document.getElementById("wd-reports-overlay");
    if (ov) ov.remove();
    panelOpen = false;
  }

  function renderAll() {
    var map = buildMap();
    var branches = getBranchNames(map);
    var years = getYears(map);

    var branchSel = document.getElementById("wd-rep-branch");
    var yearSel = document.getElementById("wd-rep-year");
    if (branchSel) {
      var curB = branchSel.value || state.branch;
      branchSel.innerHTML = '<option value="all">كل الفروع</option>' + branches.map(function (b) { return '<option value="' + esc(b) + '">' + esc(b) + '</option>'; }).join("");
      branchSel.value = branches.indexOf(curB) !== -1 || curB === "all" ? curB : "all";
      state.branch = branchSel.value;
    }
    if (yearSel) {
      var curY = state.year || years[years.length - 1];
      yearSel.innerHTML = years.map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join("");
      yearSel.value = years.indexOf(Number(curY)) !== -1 ? curY : years[years.length - 1];
      state.year = Number(yearSel.value);
    }

    var chartHost = document.getElementById("wd-reports-chart");
    var tableHost = document.getElementById("wd-reports-table");
    if (!chartHost || !tableHost) return;

    var branch = state.branch, year = state.year;

    if (branch === "all") {
      var reqVals = [], sentVals = [], rows = [], totalReq = 0, totalSent = 0;
      branches.forEach(function (b) {
        var yearData = (map[b] && map[b][year]) || {};
        var r = 0, s = 0;
        Object.keys(yearData).forEach(function (mo) { r += yearData[mo].requested; s += yearData[mo].sent; });
        reqVals.push(r); sentVals.push(s);
        rows.push([b, r, s, r + s]);
        totalReq += r; totalSent += s;
      });
      chartHost.innerHTML = buildBarChart(branches, [
        { name: "طلبنا منه", color: "#0F0F0F", values: reqVals },
        { name: "أرسلنا له", color: "#FFD700", values: sentVals }
      ]);
      tableHost.innerHTML = buildBranchTableWithEdit(rows, ["الإجمالي الكلي " + year, totalReq, totalSent, totalReq + totalSent]);
      tableHost.querySelectorAll("[data-edit-branch]").forEach(function (btn) {
        btn.onclick = function () {
          openAddForm({ branch: btn.getAttribute("data-edit-branch"), year: year });
        };
      });
    } else {
      var reqVals2 = [], sentVals2 = [], rows2 = [], totalReq2 = 0, totalSent2 = 0;
      for (var mo = 1; mo <= 12; mo++) {
        var cell = (map[branch] && map[branch][year] && map[branch][year][mo]) || { requested: 0, sent: 0 };
        reqVals2.push(cell.requested); sentVals2.push(cell.sent);
        rows2.push([MONTH_NAMES[mo - 1], cell.requested, cell.sent, cell.requested + cell.sent]);
        totalReq2 += cell.requested; totalSent2 += cell.sent;
      }
      chartHost.innerHTML = buildBarChart(MONTH_NAMES, [
        { name: "طلبنا منه", color: "#0F0F0F", values: reqVals2 },
        { name: "أرسلنا له", color: "#FFD700", values: sentVals2 }
      ]);
      tableHost.innerHTML = buildMonthlyTableWithEdit(rows2, ["الإجمالي السنوي " + year, totalReq2, totalSent2, totalReq2 + totalSent2]);
      tableHost.querySelectorAll("[data-edit-month]").forEach(function (btn) {
        btn.onclick = function () {
          var mo = parseInt(btn.getAttribute("data-edit-month"), 10);
          openAddForm({ branch: branch, year: year, month: mo });
        };
      });
    }

    renderManualList();
  }

  /* ----------------------- Add / Edit manual report entry ----------------------- */
  function findManualEntry(branch, year, month) {
    var manual = readList(MANUAL_KEY, []);
    for (var i = 0; i < manual.length; i++) {
      var m = manual[i];
      if (m.branch === branch && Number(m.year) === Number(year) && Number(m.month) === Number(month)) return m;
    }
    return null;
  }

  function openAddForm(prefillLoc) {
    if (document.getElementById("wd-reports-add-overlay")) return;
    var map = buildMap();
    var branches = getBranchNames(map);
    var curYear = (prefillLoc && prefillLoc.year) || state.year || new Date().getFullYear();
    var curBranch = (prefillLoc && prefillLoc.branch) || (state.branch !== "all" ? state.branch : branches[0]);
    var curMonth = (prefillLoc && prefillLoc.month) || new Date().getMonth() + 1;

    var ov = document.createElement("div");
    ov.id = "wd-reports-add-overlay";
    ov.dir = "rtl";
    ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:220;display:flex;align-items:center;justify-content:center;padding:16px;font-family:'Tajawal',sans-serif";
    ov.onclick = function (e) { if (e.target === ov) ov.remove(); };

    var card = document.createElement("div");
    card.style.cssText = "background:#fff;border-radius:22px;max-width:420px;width:100%;padding:20px;max-height:90vh;overflow:auto";

    card.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
        '<div style="font-weight:900;font-size:16px">✏️ تعديل أرقام شهر</div>' +
        '<button id="wd-add-close" style="background:#F8F8F5;border:1px solid #e4e4e7;border-radius:10px;width:34px;height:34px;font-size:14px;cursor:pointer">✕</button>' +
      '</div>' +
      '<div style="font-size:11.5px;color:#71717a;margin-bottom:14px;line-height:1.6">اكتب الرقم اللي عايزه يظهر فعليًا لطلبنا/أرسلنا في الشهر ده، والنظام هيحسب فرق التسوية تلقائيًا.</div>' +
      '<label style="font-size:12px;font-weight:800;display:block;margin-bottom:6px">الفرع</label>' +
      '<select id="wd-add-branch" style="width:100%;height:44px;border-radius:12px;border:1px solid #e4e4e7;background:#F8F8F5;padding:0 10px;font-size:14px;margin-bottom:12px">' +
        branches.map(function (b) { return '<option value="' + esc(b) + '">' + esc(b) + '</option>'; }).join("") +
      '</select>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">' +
        '<div><label style="font-size:12px;font-weight:800;display:block;margin-bottom:6px">السنة</label>' +
        '<input id="wd-add-year" type="number" value="' + curYear + '" style="width:100%;height:44px;border-radius:12px;border:1px solid #e4e4e7;background:#F8F8F5;padding:0 10px;font-size:14px"></div>' +
        '<div><label style="font-size:12px;font-weight:800;display:block;margin-bottom:6px">الشهر</label>' +
        '<select id="wd-add-month" style="width:100%;height:44px;border-radius:12px;border:1px solid #e4e4e7;background:#F8F8F5;padding:0 10px;font-size:14px">' +
          MONTH_NAMES.map(function (mn, i) { return '<option value="' + (i + 1) + '">' + mn + '</option>'; }).join("") +
        '</select></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:6px">' +
        '<div><label style="font-size:12px;font-weight:800;display:block;margin-bottom:6px">طلبنا منه (الرقم النهائي)</label>' +
        '<input id="wd-add-req" type="number" min="0" value="0" style="width:100%;height:44px;border-radius:12px;border:1px solid #e4e4e7;background:#F8F8F5;padding:0 10px;font-size:14px"></div>' +
        '<div><label style="font-size:12px;font-weight:800;display:block;margin-bottom:6px">أرسلنا له (الرقم النهائي)</label>' +
        '<input id="wd-add-sent" type="number" min="0" value="0" style="width:100%;height:44px;border-radius:12px;border:1px solid #e4e4e7;background:#F8F8F5;padding:0 10px;font-size:14px"></div>' +
      '</div>' +
      '<div id="wd-add-hint" style="font-size:11px;color:#a1a1aa;margin-bottom:14px"></div>' +
      '<label style="font-size:12px;font-weight:800;display:block;margin-bottom:6px">ملاحظة (اختياري)</label>' +
      '<input id="wd-add-note" type="text" placeholder="مثال: تسوية بيانات شهر سابق" style="width:100%;height:44px;border-radius:12px;border:1px solid #e4e4e7;background:#F8F8F5;padding:0 10px;font-size:14px;margin-bottom:16px">' +
      '<button id="wd-add-save" style="width:100%;height:48px;background:#FFD700;color:#0F0F0F;border:0;border-radius:14px;font-weight:900;font-size:15px;cursor:pointer">حفظ</button>';

    ov.appendChild(card);
    document.body.appendChild(ov);

    var branchEl = card.querySelector("#wd-add-branch");
    var yearEl = card.querySelector("#wd-add-year");
    var monthEl = card.querySelector("#wd-add-month");
    var reqEl = card.querySelector("#wd-add-req");
    var sentEl = card.querySelector("#wd-add-sent");
    var noteEl = card.querySelector("#wd-add-note");
    var hintEl = card.querySelector("#wd-add-hint");

    branchEl.value = curBranch;
    yearEl.value = curYear;
    monthEl.value = curMonth;

    function refillFromCurrentTotal() {
      var autoMap = buildAutoMap();
      var b = branchEl.value, y = parseInt(yearEl.value, 10) || curYear, mo = parseInt(monthEl.value, 10) || curMonth;
      var auto = getAutoCell(autoMap, b, y, mo);
      var existing = findManualEntry(b, y, mo);
      var curReq = auto.requested + (existing ? (Number(existing.requested) || 0) : 0);
      var curSent = auto.sent + (existing ? (Number(existing.sent) || 0) : 0);
      reqEl.value = Math.max(curReq, 0);
      sentEl.value = Math.max(curSent, 0);
      noteEl.value = existing ? (existing.note || "") : "";
      hintEl.textContent = "الرقم الحالي من الطلبات المسجلة: طلبنا " + auto.requested + " · أرسلنا " + auto.sent +
        (existing ? " (ومعدَّل يدويًا حاليًا)" : "");
    }

    refillFromCurrentTotal();
    branchEl.onchange = refillFromCurrentTotal;
    yearEl.onchange = refillFromCurrentTotal;
    monthEl.onchange = refillFromCurrentTotal;

    card.querySelector("#wd-add-close").onclick = function () { ov.remove(); };
    card.querySelector("#wd-add-save").onclick = function () {
      var branch = branchEl.value;
      var year = parseInt(yearEl.value, 10);
      var month = parseInt(monthEl.value, 10);
      var wantedReq = parseInt(reqEl.value, 10) || 0;
      var wantedSent = parseInt(sentEl.value, 10) || 0;
      var note = noteEl.value.trim();
      if (!branch || !year || !month) { toast("يرجى ملء البيانات المطلوبة", "error"); return; }
      if (wantedReq < 0 || wantedSent < 0) { toast("الأرقام لازم تكون صفر أو أكبر", "error"); return; }

      var autoMap = buildAutoMap();
      var auto = getAutoCell(autoMap, branch, year, month);
      var deltaReq = wantedReq - auto.requested;
      var deltaSent = wantedSent - auto.sent;
      var existing = findManualEntry(branch, year, month);

      var manual = readList(MANUAL_KEY, []);
      if (deltaReq === 0 && deltaSent === 0) {
        // matches the real auto count exactly -> no adjustment needed; remove any old one
        if (existing) {
          manual = manual.filter(function (m) { return m.id !== existing.id; });
          writeList(MANUAL_KEY, manual);
        }
        toast("✅ تم الحفظ (الرقم مطابق لبيانات الطلبات الفعلية، بدون الحاجة لتسوية)");
      } else if (existing) {
        manual = manual.map(function (m) {
          if (m.id === existing.id) {
            return {
              id: m.id, branch: branch, year: year, month: month,
              requested: deltaReq, sent: deltaSent, note: note,
              addedAt: m.addedAt, editedAt: new Date().toLocaleString("ar-EG")
            };
          }
          return m;
        });
        writeList(MANUAL_KEY, manual);
        toast("✅ تم تعديل الأرقام بنجاح");
      } else {
        manual.push({
          id: "RPT-" + Date.now().toString().slice(-7),
          branch: branch, year: year, month: month,
          requested: deltaReq, sent: deltaSent, note: note,
          addedAt: new Date().toLocaleString("ar-EG")
        });
        writeList(MANUAL_KEY, manual);
        toast("✅ تم حفظ الأرقام بنجاح");
      }
      ov.remove();
      state.branch = branch; state.year = year;
      renderAll();
    };
  }

  function deleteManualEntry(entry) {
    if (!window.confirm("تأكيد حذف التقرير اليدوي: " + entry.branch + " - " + MONTH_NAMES[entry.month - 1] + " " + entry.year + "؟")) return;
    var manual = readList(MANUAL_KEY, []).filter(function (m) { return m.id !== entry.id; });
    writeList(MANUAL_KEY, manual);
    toast("🗑️ تم حذف التقرير اليدوي");
    renderAll();
  }

  function renderManualList() {
    var host = document.getElementById("wd-reports-manual");
    if (!host) return;
    var manual = readList(MANUAL_KEY, []);
    if (!manual.length) {
      host.innerHTML = '';
      return;
    }
    manual = manual.slice().sort(function (a, b) {
      return (b.year - a.year) || (b.month - a.month) || String(a.branch).localeCompare(String(b.branch));
    });
    var autoMap = buildAutoMap();
    var html = '<div style="font-weight:900;font-size:14px;margin:18px 0 10px">📝 تسويات يدوية على أرقام الشهور</div>';
    html += '<div style="display:flex;flex-direction:column;gap:8px">';
    manual.forEach(function (m) {
      var auto = getAutoCell(autoMap, m.branch, m.year, m.month);
      var finalReq = auto.requested + (Number(m.requested) || 0);
      var finalSent = auto.sent + (Number(m.sent) || 0);
      var signFmt = function (n) { return (n > 0 ? "+" : "") + n; };
      html +=
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:#F8F8F5;border:1px solid #e4e4e7;border-radius:14px;padding:10px 14px;flex-wrap:wrap">' +
          '<div style="font-size:12.5px;font-weight:700;line-height:1.6">' +
            esc(m.branch) + ' — ' + MONTH_NAMES[m.month - 1] + ' ' + m.year +
            '<span style="color:#71717a;font-weight:600"> · الرقم النهائي: طلبنا ' + finalReq + ' · أرسلنا ' + finalSent +
            ' (تسوية ' + signFmt(m.requested || 0) + ' / ' + signFmt(m.sent || 0) + ')' +
            (m.note ? ' · ' + esc(m.note) : '') + '</span>' +
          '</div>' +
          '<div style="display:flex;gap:6px">' +
            '<button data-edit="' + esc(m.id) + '" style="height:32px;padding:0 12px;border-radius:9px;background:#0F0F0F;color:#FFD700;border:0;font-weight:800;font-size:12px;cursor:pointer">✏️ تعديل</button>' +
            '<button data-del="' + esc(m.id) + '" style="height:32px;padding:0 12px;border-radius:9px;background:#fff;color:#dc2626;border:1.5px solid #dc2626;font-weight:800;font-size:12px;cursor:pointer">🗑️ حذف</button>' +
          '</div>' +
        '</div>';
    });
    html += '</div>';
    host.innerHTML = html;

    host.querySelectorAll("[data-edit]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-edit");
        var entry = manual.filter(function (m) { return m.id === id; })[0];
        if (entry) openAddForm(entry);
      };
    });
    host.querySelectorAll("[data-del]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-del");
        var entry = manual.filter(function (m) { return m.id === id; })[0];
        if (entry) deleteManualEntry(entry);
      };
    });
  }

  /* ----------------------- PDF export (print-to-PDF, full Arabic support) ----------------------- */
  function exportPDF() {
    var branchLabel = state.branch === "all" ? "كل الفروع" : state.branch;
    var title = "تقرير الكارنيهات — " + branchLabel + " — سنة " + state.year;
    var chartHtml = (document.getElementById("wd-reports-chart") || {}).innerHTML || "";
    var tableHtml = (document.getElementById("wd-reports-table") || {}).innerHTML || "";

    var win = window.open("", "_blank");
    if (!win) { toast("يرجى السماح بالنوافذ المنبثقة لتحميل PDF", "error"); return; }

    win.document.write(
      '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' + esc(title) + '</title>' +
      '<style>' +
      'body{font-family:Tajawal,Arial,sans-serif;padding:28px;color:#0F0F0F;margin:0}' +
      'h1{font-size:18px;margin:0 0 4px}' +
      '.sub{color:#71717a;font-size:12px;margin-bottom:20px}' +
      'table{width:100%;border-collapse:collapse;font-size:12px;margin-top:18px}' +
      'th,td{border:1px solid #ddd;padding:8px;text-align:center}' +
      'th{background:#0F0F0F !important;color:#fff !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      'tfoot td{background:#FFF8CC !important;font-weight:900;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '@page{size:A4;margin:14mm}' +
      '</style></head><body>' +
      '<h1>📊 ' + esc(title) + '</h1>' +
      '<div class="sub">تم إنشاء التقرير بتاريخ ' + esc(new Date().toLocaleDateString("ar-EG")) + '</div>' +
      chartHtml + tableHtml +
      '</body></html>'
    );
    win.document.close();
    setTimeout(function () { win.focus(); win.print(); }, 450);
  }

  /* ----------------------- Main panel ----------------------- */
  function openPanel() {
    if (panelOpen) return;
    panelOpen = true;

    var ov = document.createElement("div");
    ov.id = "wd-reports-overlay";
    ov.dir = "rtl";
    ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;font-family:'Tajawal',sans-serif";
    ov.onclick = function (e) { if (e.target === ov) closePanel(); };

    var card = document.createElement("div");
    card.style.cssText = "background:#fff;border-radius:24px;max-width:860px;width:100%;max-height:92vh;overflow:auto;padding:20px";

    card.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
        '<div style="font-weight:900;font-size:18px">📊 تقارير الكارنيهات</div>' +
        '<button id="wd-rep-close" style="background:#F8F8F5;border:1px solid #e4e4e7;border-radius:10px;width:36px;height:36px;font-size:15px;cursor:pointer">✕</button>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px">' +
        '<select id="wd-rep-branch" style="flex:1;min-width:160px;height:44px;border-radius:12px;border:1px solid #e4e4e7;background:#F8F8F5;padding:0 10px;font-size:13px;font-weight:700"></select>' +
        '<select id="wd-rep-year" style="width:110px;height:44px;border-radius:12px;border:1px solid #e4e4e7;background:#F8F8F5;padding:0 10px;font-size:13px;font-weight:700"></select>' +
        '<button id="wd-rep-add" style="height:44px;padding:0 16px;border-radius:12px;background:#0F0F0F;color:#FFD700;border:0;font-weight:800;font-size:13px;cursor:pointer;white-space:nowrap">➕ إضافة تقرير</button>' +
        '<button id="wd-rep-pdf" style="height:44px;padding:0 16px;border-radius:12px;background:#FFD700;color:#0F0F0F;border:0;font-weight:800;font-size:13px;cursor:pointer;white-space:nowrap">📄 تحميل PDF</button>' +
      '</div>' +
      '<p style="font-size:11.5px;color:#71717a;margin:0 0 14px;line-height:1.7">📥 طلبنا منه = عدد الطلبات اللي الفرع ده كان المصدر فيها | 📤 أرسلنا له = عدد الطلبات اللي الفرع ده كان الوجهة فيها</p>' +
      '<div id="wd-reports-chart" style="background:#F8F8F5;border-radius:16px;padding:12px;margin-bottom:16px"></div>' +
      '<div id="wd-reports-table"></div>' +
      '<div id="wd-reports-manual"></div>';

    ov.appendChild(card);
    document.body.appendChild(ov);

    card.querySelector("#wd-rep-close").onclick = closePanel;
    card.querySelector("#wd-rep-add").onclick = function () { openAddForm(); };
    card.querySelector("#wd-rep-pdf").onclick = exportPDF;
    card.querySelector("#wd-rep-branch").onchange = function () { state.branch = this.value; renderAll(); };
    card.querySelector("#wd-rep-year").onchange = function () { state.year = Number(this.value); renderAll(); };

    renderAll();
  }

  /* ----------------------- Inject nav button (admin only, next to "الفروع") ----------------------- */
  function injectButton() {
    if (document.getElementById("wd-reports-btn")) return;
    var buttons = document.querySelectorAll("nav button");
    var target = null;
    for (var i = 0; i < buttons.length; i++) {
      if ((buttons[i].textContent || "").indexOf("الفروع") !== -1) { target = buttons[i]; break; }
    }
    if (!target) return;
    var btn = document.createElement("button");
    btn.id = "wd-reports-btn";
    btn.className = target.className;
    btn.innerHTML = "📊 تقارير الكارنيهات";
    btn.onclick = openPanel;
    target.parentNode.insertBefore(btn, target.nextSibling);
  }

  function start() {
    if (getRole() === "staff") return; // admin-only section
    injectButton();
    new MutationObserver(injectButton).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
