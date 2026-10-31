/**
 * CERISH CRM — Apps Script backend (Web App API)
 * Gắn với một Google Sheet trống, ví dụ: "CERISH CRM DB"
 *
 * CÁCH DEPLOY (giống Second Brain, chỉ làm 1 lần):
 *  1) Tạo Google Sheet mới (trống) -> Extensions (Tiện ích mở rộng) -> Apps Script
 *  2) Xóa code mẫu, dán toàn bộ file này vào -> Save
 *  3) Deploy -> New deployment -> chọn "Web app"
 *       - Execute as: Me (chính anh)
 *       - Who has access: Anyone
 *  4) Authorize access -> chọn tài khoản -> Advanced -> Allow
 *  5) Copy "Web app URL" (kết thúc bằng /exec) gửi cho Claude để gắn vào web
 *
 * Tài khoản quản trị khởi tạo: admin@cerish.local / Cerish@2026Demo!
 * (tự tạo ở lần gọi đầu tiên — đổi mật khẩu ngay trong app)
 *
 * BẢO MẬT: đăng nhập được kiểm tra Ở ĐÂY (server), mật khẩu chỉ lưu
 * dạng mã băm SHA-256 + salt trong tab `users`. Phiên đăng nhập hết
 * hạn sau 6 giờ.
 */

var TABS = {
  users: ['id','email','name','role','active','salt','password_hash','created_at'],
  partners: ['id','name','type','platform','handle','phone','email','followers','stage','commission','owner','notes','activity_mode','live_groups','video_groups','created_at','updated_at'],
  bookings: ['id','partner_id','contact_date','campaign','campaign_id','product','booking_fee','commission','deal_type','deal_details','deadline','video_date','live_date','video_url','booking_note','status','owner','notes','content_type','video_status','live_status','created_at','updated_at'],
  products: ['id','name','sku','category','launch_date','booking_owner','status','notes','created_at','updated_at'],
  campaigns: ['id','name','product','sku','product_id','target_koc','target_kol','target_videos','target_lives','start_date','end_date','owner','status','notes','created_at','updated_at'],
  samples: ['id','partner_id','product','product_id','quantity','sent_date','received_date','tracking_code','status','owner','notes','created_at','updated_at'],
  videos: ['id','booking_id','partner_id','title','platform','url','posted_date','views','orders','gmv','status','notes','created_at','updated_at'],
  lives: ['id','partner_id','title','session_date','duration_minutes','views','orders','gmv','commission','status','notes','created_at','updated_at'],
  tasks: ['id','partner_id','title','due_date','priority','status','owner','notes','created_at','updated_at'],
  customers: ['id','name','phone','channel','orders','spent','segment','owner','notes','created_at','updated_at'],
  audit_logs: ['id','user_id','action','entity','entity_id','details','created_at']
};
var DATA_TABLES = ['partners','bookings','products','campaigns','samples','videos','lives','tasks','customers','audit_logs'];
var SESSION_TTL_SECONDS = 6 * 60 * 60;

function doGet(e)  { return handle_(e); }
function doPost(e) { return handle_(e); }

function handle_(e) {
  var out;
  try {
    var req = {};
    if (e && e.parameter) for (var k in e.parameter) req[k] = e.parameter[k];
    if (e && e.postData && e.postData.contents) {
      try { var b = JSON.parse(e.postData.contents); for (var k2 in b) req[k2] = b[k2]; } catch (_) {}
    }
    out = route_(req);
  } catch (err) {
    out = (err && err.out) ? err.out : { ok: false, code: 500, error: 'Lỗi máy chủ: ' + (err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function route_(req) {
  ensureSetup_();
  var action = String(req.action || '');
  if (action === 'login')  return login_(req);
  var user = requireSession_(req);          // mọi action còn lại cần đăng nhập
  if (action === 'logout')      return logout_(req);
  if (action === 'me')          return { ok: true, user: publicUser_(user) };
  if (action === 'dump')        return dump_();
  if (action === 'put')         return put_(req, user);
  if (action === 'del')         return del_(req, user);
  if (action === 'password')    return password_(req, user);
  if (action === 'user_create') return userCreate_(req, user);
  if (action === 'user_update') return userUpdate_(req, user);
  return { ok: false, code: 404, error: 'Hành động không hợp lệ' };
}

// ===== Thiết lập & tiện ích =====
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function ensureSetup_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = ss_();
    for (var name in TABS) {
      var sh = ss.getSheetByName(name);
      if (!sh) {
        sh = ss.insertSheet(name);
        // Định dạng chữ thuần cho toàn tab: giữ nguyên SĐT có số 0 đầu, ngày dạng YYYY-MM-DD.
        sh.getRange(1, 1, sh.getMaxRows(), TABS[name].length).setNumberFormat('@');
        sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]);
      }
    }
    var users = readTable_('users');
    if (!users.length) {
      appendRow_('users', {
        id: 1, email: 'admin@cerish.local', name: 'Quản trị CERISH', role: 'admin', active: 1,
        salt: 'cerish-admin', password_hash: sha256_('cerish-admin|Cerish@2026Demo!'),
        created_at: now_()
      });
    }
  } finally { lock.releaseLock(); }
}

function now_() { return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', "yyyy-MM-dd'T'HH:mm:ss"); }

function sha256_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}

function readTable_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var cols = TABS[name];
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getValues();
  return values.filter(function (r) { return String(r[0]) !== ''; }).map(function (r) {
    var o = {};
    cols.forEach(function (c, i) { o[c] = r[i]; });
    return o;
  });
}

function appendRow_(name, rec) {
  var sh = ss_().getSheetByName(name);
  sh.appendRow(TABS[name].map(function (c) { return rec[c] !== undefined && rec[c] !== null ? rec[c] : ''; }));
}

function findRowIndex_(name, id) {
  var sh = ss_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return -1;
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function upsert_(name, rec) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var row = findRowIndex_(name, rec.id);
    var values = [TABS[name].map(function (c) { return rec[c] !== undefined && rec[c] !== null ? rec[c] : ''; })];
    var sh = ss_().getSheetByName(name);
    if (row < 0) sh.appendRow(values[0]);
    else sh.getRange(row, 1, 1, TABS[name].length).setValues(values);
  } finally { lock.releaseLock(); }
}

function deleteRow_(name, id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var row = findRowIndex_(name, id);
    if (row > 0) ss_().getSheetByName(name).deleteRow(row);
  } finally { lock.releaseLock(); }
}

function publicUser_(u) { return { id: u.id, email: u.email, name: u.name, role: u.role, active: u.active, created_at: u.created_at }; }

// ===== Phiên đăng nhập (CacheService, 6 giờ) =====
function requireSession_(req) {
  var token = String(req.token || '');
  if (!token) throw httpErr_(401, 'Vui lòng đăng nhập');
  var uid = CacheService.getScriptCache().get('sess_' + token);
  if (!uid) throw httpErr_(401, 'Phiên đăng nhập đã hết hạn');
  var u = readTable_('users').filter(function (x) { return String(x.id) === String(uid) && Number(x.active) === 1; })[0];
  if (!u) throw httpErr_(401, 'Phiên đăng nhập không hợp lệ');
  CacheService.getScriptCache().put('sess_' + token, String(uid), SESSION_TTL_SECONDS); // gia hạn
  return u;
}
function httpErr_(code, msg) { var e = new Error(msg); e.out = { ok: false, code: code, error: msg }; return e; }

function login_(req) {
  var email = String(req.email || '').trim().toLowerCase();
  var password = String(req.password || '');
  var u = readTable_('users').filter(function (x) { return String(x.email).toLowerCase() === email && Number(x.active) === 1; })[0];
  if (!u || sha256_(u.salt + '|' + password) !== u.password_hash)
    return { ok: false, code: 401, error: 'Email hoặc mật khẩu chưa đúng' };
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('sess_' + token, String(u.id), SESSION_TTL_SECONDS);
  return { ok: true, token: token, user: publicUser_(u) };
}
function logout_(req) {
  CacheService.getScriptCache().remove('sess_' + String(req.token || ''));
  return { ok: true };
}

// ===== Dữ liệu =====
function dump_() {
  var out = { ok: true, tables: {} };
  DATA_TABLES.forEach(function (t) { out.tables[t] = readTable_(t); });
  out.tables.users = readTable_('users').map(publicUser_);
  return out;
}

function put_(req, user) {
  var table = String(req.table || '');
  if (DATA_TABLES.indexOf(table) < 0) return { ok: false, code: 404, error: 'Không tìm thấy phân hệ' };
  var rec = req.record;
  if (!rec || !rec.id) return { ok: false, code: 422, error: 'Thiếu dữ liệu bản ghi' };
  upsert_(table, rec);
  return { ok: true, id: rec.id };
}

function del_(req, user) {
  var table = String(req.table || '');
  if (DATA_TABLES.indexOf(table) < 0) return { ok: false, code: 404, error: 'Không tìm thấy phân hệ' };
  if (table !== 'audit_logs' && user.role !== 'admin') return { ok: false, code: 403, error: 'Chỉ quản trị viên được xóa' };
  deleteRow_(table, req.id);
  return { ok: true };
}

// ===== Tài khoản =====
function password_(req, user) {
  if (String(req.new_password || '').length < 10) return { ok: false, code: 422, error: 'Mật khẩu phải có từ 10 đến 128 ký tự' };
  if (sha256_(user.salt + '|' + String(req.current_password || '')) !== user.password_hash)
    return { ok: false, code: 403, error: 'Mật khẩu hiện tại chưa đúng' };
  var salt = Utilities.getUuid().slice(0, 12);
  var updated = user; updated.salt = salt; updated.password_hash = sha256_(salt + '|' + String(req.new_password));
  upsert_('users', updated);
  return { ok: true };
}

function userCreate_(req, user) {
  if (user.role !== 'admin') return { ok: false, code: 403, error: 'Chỉ quản trị viên có quyền' };
  var name = String(req.name || '').trim(), email = String(req.email || '').trim().toLowerCase(), role = String(req.role || 'staff');
  if (!name || name.length > 120 || email.indexOf('@') < 0 || email.length > 200) return { ok: false, code: 422, error: 'Tên hoặc email chưa hợp lệ' };
  if (['admin', 'manager', 'staff'].indexOf(role) < 0) return { ok: false, code: 422, error: 'Vai trò không hợp lệ' };
  if (String(req.password || '').length < 10) return { ok: false, code: 422, error: 'Mật khẩu phải có từ 10 đến 128 ký tự' };
  var users = readTable_('users');
  if (users.some(function (x) { return String(x.email).toLowerCase() === email; })) return { ok: false, code: 409, error: 'Email đã có trong hệ thống' };
  var salt = Utilities.getUuid().slice(0, 12);
  var rec = { id: Date.now(), email: email, name: name, role: role, active: 1, salt: salt, password_hash: sha256_(salt + '|' + String(req.password)), created_at: now_() };
  appendRow_('users', rec);
  return { ok: true, id: rec.id, user: publicUser_(rec) };
}

function userUpdate_(req, user) {
  if (user.role !== 'admin') return { ok: false, code: 403, error: 'Chỉ quản trị viên có quyền' };
  var target = readTable_('users').filter(function (x) { return String(x.id) === String(req.id); })[0];
  if (!target) return { ok: false, code: 404, error: 'Không có tài khoản' };
  var data = req.data || {};
  if (data.role != null && ['admin', 'manager', 'staff'].indexOf(data.role) < 0) return { ok: false, code: 422, error: 'Vai trò không hợp lệ' };
  if (String(target.id) === String(user.id) && ((data.active != null && !Number(data.active)) || (data.role != null && data.role !== 'admin')))
    return { ok: false, code: 409, error: 'Không thể tự tắt hoặc tự hạ quyền quản trị' };
  if (data.name != null) { if (!String(data.name).trim() || String(data.name).length > 120) return { ok: false, code: 422, error: 'Họ tên chưa hợp lệ' }; target.name = String(data.name).trim(); }
  if (data.role != null) target.role = data.role;
  if (data.active != null) target.active = Number(data.active) ? 1 : 0;
  if (data.password) {
    if (String(data.password).length < 10) return { ok: false, code: 422, error: 'Mật khẩu phải có từ 10 đến 128 ký tự' };
    target.salt = Utilities.getUuid().slice(0, 12);
    target.password_hash = sha256_(target.salt + '|' + String(data.password));
  }
  upsert_('users', target);
  return { ok: true };
}
