/**
 * SECOND BRAIN — BỘ QUÉT GOOGLE DRIVE  →  GOOGLE SHEET (tab "files")
 * ------------------------------------------------------------------
 * Quét cây thư mục "SECOND BRAIN - XTRUONGMKTER", lọc rác, phân loại
 * dữ liệu dùng được / thô, rồi ghi vào tab "files" của Sheet.
 * Second Brain đọc tab này để vẽ chấm sao theo từng dự án.
 *
 * CÁCH CÀI (chỉ làm 1 lần):
 *  1) Mở Google Sheet "Second Brain DB" -> Extensions -> Apps Script
 *  2) Bấm dấu + bên trái -> Script -> đặt tên "driveIndexer"
 *  3) Dán TOÀN BỘ file này vào -> Save
 *  4) Chọn hàm "setupDriveIndexTrigger" trên thanh công cụ -> bấm Run
 *     (lần đầu sẽ hỏi cấp quyền Drive -> Advanced -> Allow)
 *  => Xong. Từ đó cứ 1 tiếng nó tự quét lại 1 lần.
 *
 * KHÔNG cần Deploy lại web app — bản đã deploy đọc được tab mới luôn.
 */

var SB_ROOT_FOLDER_ID = '1IJbCl1ZEYOmq84byS6JQvHie1FZDcbCo'; // SECOND BRAIN - XTRUONGMKTER
var SB_FILES_SHEET    = 'files';
var SB_MAX_FILES      = 1500;   // trần an toàn (Apps Script giới hạn 6 phút/lần chạy)
var SB_MAX_DEPTH      = 5;
var SB_TZ             = 'Asia/Ho_Chi_Minh';

/** Chạy 1 lần: bật lịch tự quét mỗi giờ + quét ngay 1 phát. */
function setupDriveIndexTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'indexDrive') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('indexDrive').timeBased().everyHours(1).create();
  var n = indexDrive();
  Logger.log('Đã bật lịch quét mỗi giờ. Lần quét đầu: ' + n + ' file.');
  return n;
}

/** Tắt lịch tự quét. */
function stopDriveIndexTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'indexDrive') ScriptApp.deleteTrigger(t);
  });
}

/** Quét toàn bộ cây Drive -> ghi tab "files". Trả về số file đã ghi. */
function indexDrive() {
  var root = DriveApp.getFolderById(SB_ROOT_FOLDER_ID);
  var rows = [];
  var projects = root.getFolders();
  while (projects.hasNext() && rows.length < SB_MAX_FILES) {
    var pf = projects.next();
    sbCollect_(pf, pf.getName(), '', rows, 0);
  }
  sbWriteFiles_(rows);
  return rows.length;
}

/** Đệ quy gom file. sub = tên thư mục con cấp 1 (01_..., 02_...). */
function sbCollect_(folder, project, sub, rows, depth) {
  if (depth > SB_MAX_DEPTH || rows.length >= SB_MAX_FILES) return;

  var files = folder.getFiles();
  while (files.hasNext() && rows.length < SB_MAX_FILES) {
    var f = files.next();
    var name = f.getName();
    var kind = sbClassify_(name, sub);
    if (kind === 'skip') continue;
    rows.push({
      id:      f.getId(),
      name:    name,
      project: project,
      folder:  sub || '(gốc dự án)',
      kind:    kind,
      type:    sbShortType_(f.getMimeType()),
      url:     f.getUrl(),
      updated: Utilities.formatDate(f.getLastUpdated(), SB_TZ, 'yyyy-MM-dd')
    });
  }

  var subs = folder.getFolders();
  while (subs.hasNext() && rows.length < SB_MAX_FILES) {
    var sf = subs.next();
    sbCollect_(sf, project, sub || sf.getName(), rows, depth + 1);
  }
}

/**
 * Phân loại: 'skip' (rác, bỏ hẳn) | 'raw' (thô) | 'usable' (dùng được).
 * Nhất quán — không đoán nội dung, chỉ dựa vào tên file và thư mục chứa nó.
 */
function sbClassify_(name, sub) {
  var n = String(name || '');
  // Rác hệ thống / file tạm -> bỏ hẳn, không lên sao
  if (/^~\$/.test(n)) return 'skip';
  if (/\.(tmp|crdownload|part|lnk|ini|bak)$/i.test(n)) return 'skip';
  if (n === '.DS_Store' || n === 'Thumbs.db' || n === 'desktop.ini') return 'skip';
  // Thư mục chứa đồ chưa phân loại / lưu trữ -> coi là THÔ
  if (/^01_INBOX/i.test(sub) || /^07_ARCHIVE/i.test(sub)) return 'raw';
  // Tên cho thấy là bản nháp / bản sao -> THÔ
  if (/(nháp|nhap|draft|tạm|tam thoi|copy of|bản sao|ban sao|\(1\)|\(2\))/i.test(n)) return 'raw';
  return 'usable';
}

function sbShortType_(mt) {
  var m = String(mt || '');
  if (m.indexOf('spreadsheet') >= 0) return 'Sheet';
  if (m.indexOf('presentation') >= 0) return 'Slide';
  if (m.indexOf('document') >= 0) return 'Doc';
  if (m.indexOf('pdf') >= 0) return 'PDF';
  if (m.indexOf('image') >= 0) return 'Ảnh';
  if (m.indexOf('video') >= 0) return 'Video';
  if (m.indexOf('audio') >= 0) return 'Âm thanh';
  if (m.indexOf('zip') >= 0 || m.indexOf('compressed') >= 0) return 'Nén';
  if (m.indexOf('csv') >= 0) return 'CSV';
  if (m.indexOf('text') >= 0) return 'Text';
  return 'File';
}

function sbWriteFiles_(rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SB_FILES_SHEET) || ss.insertSheet(SB_FILES_SHEET);
  sh.clear();
  var head = ['id', 'name', 'project', 'folder', 'kind', 'type', 'url', 'updated'];
  sh.getRange(1, 1, 1, head.length).setValues([head]);
  sh.setFrozenRows(1);
  if (rows.length) {
    var data = rows.map(function (o) {
      return head.map(function (k) { return o[k] == null ? '' : o[k]; });
    });
    sh.getRange(2, 1, data.length, head.length).setValues(data);
  }
}
