/**
 * HERISH — Nhận lead từ website đổ về Google Sheet
 * ================================================
 * Cách dùng (một lần, ~3 phút):
 * 1. Vào https://script.google.com  →  New project (Dự án mới)
 * 2. Xóa hết code mẫu, DÁN TOÀN BỘ file này vào
 * 3. Deploy  →  New deployment  →  chọn loại "Web app"
 *      - Execute as: Me (chính bạn)
 *      - Who has access: Anyone (Bất kỳ ai)  ← quan trọng
 * 4. Copy "Web app URL" (dạng https://script.google.com/macros/s/..../exec)
 * 5. Gửi URL đó cho dev dán vào biến LEAD_ENDPOINT trong assets/js/app.js
 *
 * Lần chạy đầu tiên, script tự tạo 1 Google Sheet tên "Herish - Leads"
 * trong Drive của bạn và ghi từng dòng lead vào đó.
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = getSheet_();
    sheet.appendRow([
      data.at || new Date().toLocaleString('vi-VN'),
      data.type || '',
      data.name || '',
      data.phone || '',
      data.email || '',
      data.message || '',
      data.extra || '',
      data.page || ''
    ]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Mở trong trình duyệt để kiểm tra đã deploy đúng chưa
function doGet() {
  return json_({ ok: true, service: 'Herish Leads', time: new Date().toISOString() });
}

function getSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  var ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('Herish - Leads');
    props.setProperty('SHEET_ID', ss.getId());
    var s = ss.getSheets()[0];
    s.appendRow(['Thời gian', 'Loại', 'Tên', 'SĐT', 'Email', 'Nội dung', 'Thêm', 'Trang']);
    s.getRange('A1:H1').setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return ss.getSheets()[0];
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
