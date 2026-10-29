/**
 * SECOND BRAIN — Apps Script backend (Web App API)
 * Gắn với Google Sheet: "Second Brain DB — Dữ liệu thật (Xtruongmkter)"
 *
 * CÁCH DEPLOY (chỉ làm 1 lần):
 *  1) Mở Google Sheet -> menu Extensions (Tiện ích mở rộng) -> Apps Script
 *  2) Xoá hết code mẫu, dán toàn bộ file này vào
 *  3) Bấm Save (biểu tượng đĩa)
 *  4) Bấm Deploy -> New deployment -> chọn loại "Web app"
 *       - Execute as: Me (chính anh)
 *       - Who has access: Anyone  (để app gọi được)
 *  5) Deploy -> Authorize access -> chọn tài khoản -> Advanced -> Allow
 *  6) Copy "Web app URL" (kết thúc bằng /exec) rồi gửi cho Claude
 *
 * BẢO MẬT: đổi TOKEN bên dưới thành chuỗi bí mật của riêng anh.
 */

var TOKEN = 'xtruong-2026';   // << đổi thành mật khẩu bí mật của anh

function doGet(e)  { return handle_(e, 'GET'); }
function doPost(e) { return handle_(e, 'POST'); }

function handle_(e, method) {
  var out = { ok: false };
  var callback = (e && e.parameter && e.parameter.callback) || '';
  try {
    var req = {};
    if (e && e.parameter) for (var k in e.parameter) req[k] = e.parameter[k];
    if (method === 'POST' && e && e.postData && e.postData.contents) {
      try { var b = JSON.parse(e.postData.contents); for (var k2 in b) req[k2] = b[k2]; } catch (_) {}
    }

    if (TOKEN && req.token !== TOKEN) { out.error = 'bad token'; return json_(out, callback); }

    var action = req.action || 'read';
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'ping') {
      out.ok = true; out.pong = true; out.time = new Date().toISOString();
    } else if (action === 'readAll') {
      out.ok = true; out.data = {};
      ss.getSheets().forEach(function (sh) {
        var n = sh.getName(); if (n.charAt(0) !== '_') out.data[n] = readSheet_(sh);
      });
    } else if (action === 'read') {
      var sh = ss.getSheetByName(req.collection);
      out.ok = true; out.collection = req.collection; out.rows = sh ? readSheet_(sh) : [];
    } else if (action === 'replace' || action === 'upsert') {
      var shw = getOrCreate_(ss, req.collection);
      var rows = req.rows || [];
      if (action === 'replace') writeReplace_(shw, rows); else upsert_(shw, rows);
      out.ok = true; out.collection = req.collection; out.count = rows.length;
    } else if (action === 'delete') {
      var shd = ss.getSheetByName(req.collection);
      if (shd) deleteIds_(shd, req.ids || []);
      out.ok = true;
    } else {
      out.error = 'unknown action: ' + action;
    }
  } catch (err) {
    out.ok = false; out.error = String(err);
  }
  return json_(out, callback);
}

function json_(obj, callback) {
  var s = JSON.stringify(obj);
  if (callback) return ContentService.createTextOutput(callback + '(' + s + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}

function readSheet_(sh) {
  var rng = sh.getDataRange().getValues();
  if (rng.length < 2) return [];
  var head = rng[0], rows = [];
  for (var i = 1; i < rng.length; i++) {
    var r = rng[i], o = {}, empty = true;
    for (var c = 0; c < head.length; c++) {
      var key = head[c]; if (key === '') continue;
      var v = r[c]; if (v !== '' && v !== null) empty = false;
      o[key] = v;
    }
    if (!empty) rows.push(o);
  }
  return rows;
}

function getOrCreate_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function headerMap_(sh) {
  var lastCol = sh.getLastColumn();
  var head = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var map = {}; for (var i = 0; i < head.length; i++) if (head[i] !== '') map[head[i]] = i + 1;
  return { head: head, map: map };
}

function collectKeys_(rows) {
  var keys = ['id'], seen = { id: true };
  rows.forEach(function (o) { for (var k in o) if (!seen[k]) { seen[k] = true; keys.push(k); } });
  return keys;
}

function rowFromObj_(obj, head) {
  return head.map(function (k) {
    var v = obj[k];
    return (v == null) ? '' : (typeof v === 'object' ? JSON.stringify(v) : v);
  });
}

function writeReplace_(sh, rows) {
  sh.clear();
  var head = collectKeys_(rows);
  sh.getRange(1, 1, 1, head.length).setValues([head]);
  sh.setFrozenRows(1);
  if (rows.length) {
    var data = rows.map(function (o) { return rowFromObj_(o, head); });
    sh.getRange(2, 1, data.length, head.length).setValues(data);
  }
}

function ensureColumns_(sh, keys) {
  var hm = headerMap_(sh), head = hm.head.slice(), changed = false;
  if (head.indexOf('id') < 0) { head.unshift('id'); changed = true; }
  keys.forEach(function (k) { if (head.indexOf(k) < 0) { head.push(k); changed = true; } });
  if (changed) {
    sh.getRange(1, 1, 1, head.length).setValues([head]);
    sh.setFrozenRows(1);
  }
  return headerMap_(sh);
}

function upsert_(sh, rows) {
  if (!rows.length) return;
  var hm = ensureColumns_(sh, collectKeys_(rows));
  var head = hm.head, idCol = hm.map['id'], last = sh.getLastRow(), idx = {};
  if (last >= 2 && idCol) {
    var ids = sh.getRange(2, idCol, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) idx[ids[i][0]] = i + 2;
  }
  rows.forEach(function (o) {
    var r = rowFromObj_(o, head), id = o.id;
    if (id != null && idx[id]) sh.getRange(idx[id], 1, 1, head.length).setValues([r]);
    else { sh.appendRow(r); if (id != null) idx[id] = sh.getLastRow(); }
  });
}

function deleteIds_(sh, ids) {
  var hm = headerMap_(sh), idCol = hm.map['id']; if (!idCol) return;
  var last = sh.getLastRow(); if (last < 2) return;
  var vals = sh.getRange(2, idCol, last - 1, 1).getValues(), toDel = [];
  for (var i = 0; i < vals.length; i++) if (ids.indexOf(vals[i][0]) >= 0) toDel.push(i + 2);
  toDel.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
}
