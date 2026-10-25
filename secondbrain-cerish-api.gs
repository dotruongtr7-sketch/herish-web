/************************************************************************
 * SECOND BRAIN — CERISH DASHBOARD API  (Google Apps Script)
 * ---------------------------------------------------------------------
 * Vai trò: CẦU NỐI giữa dữ liệu CERISH trong Google Drive (Second Brain)
 *          và dashboard secondbrain.html (GitHub Pages).
 *
 * Cách dùng (anh Trường làm 1 lần):
 *   1. Vào https://script.google.com  →  New project.
 *   2. Dán TOÀN BỘ file này vào, lưu (Ctrl+S).
 *   3. Chạy hàm setup() 1 lần  →  cấp quyền (Authorize) khi được hỏi.
 *      → Nó tạo Google Sheet "CERISH_DASHBOARD" trong thư mục
 *        SECOND BRAIN/CERISH/07_Tài chính & Báo cáo, đổ sẵn số mẫu (T8/2026).
 *   4. Deploy  →  New deployment  →  type = Web app
 *        - Execute as: Me (chính anh)
 *        - Who has access: Anyone with the link
 *      → Copy "Web app URL" rồi gửi cho Em để nối vào dashboard.
 *
 * BẢO MẬT: API chỉ trả số khi request kèm đúng ?token=  (đặt ở TOKEN bên dưới).
 * Sau này cập nhật số: mở Sheet CERISH_DASHBOARD sửa trực tiếp — dashboard tự lấy số mới.
 ************************************************************************/

// ====== CẤU HÌNH ======
var TOKEN      = 'cerish-2026';   // đổi thành chuỗi bí mật của anh; dashboard phải gửi đúng token này
var SHEET_NAME = 'CERISH_DASHBOARD';
var FOLDER_ID  = '1Ir5-CGtkeS3imWZobf6tbmUGoH4H_BPM'; // SB/CERISH/07_Tài chính & Báo cáo
var PROP_KEY   = 'CERISH_DASHBOARD_SHEET_ID';

// ====== TẠO & ĐỔ SỐ MẪU (chạy 1 lần) ======
function setup() {
  var ss = getOrCreateSheet_();

  // --- Tab KPI: số tổng quan (nguồn: file NGUỒN CHUẨN .md, kỳ T8/2026) ---
  writeTab_(ss, 'KPI', [
    ['Chỉ số', 'Giá trị', 'Đơn vị', 'Ghi chú'],
    ['GMV (đơn tạo)',            424300000, 'đ',   'TikTok Analytics T8/2026'],
    ['Số đơn tạo',              5440,       'đơn', 'Analytics'],
    ['Số đơn thành công',       4304,       'đơn', 'ước tính sau hủy/hoàn'],
    ['Số món bán ra',           5711,       'món', 'Analytics'],
    ['Số khách hàng',           5059,       'khách', 'Analytics'],
    ['AOV (giá trị đơn TB)',    78000,      'đ',   'GMV ÷ số đơn'],
    ['Giá bán TB đơn LIVE',     59800,      'đ',   'Insight P&L'],
    ['Tỉ lệ hủy trước ship',    0.1776,     '%',   '966 đơn'],
    ['Tỉ lệ giao thất bại',     0.0125,     '%',   '68 đơn'],
    ['Tỉ lệ hoàn sau nhận',     0.0313,     '%',   '~170 đơn'],
    ['Doanh thu net settled',   124419000,  'đ',   'ĐÃ quyết toán (base tính phí %)'],
    ['Tổng phí sàn thực tế',    47462056,   'đ',   '= 38,15% doanh thu (gồm affiliate)'],
    ['Giá vốn / đơn (TB)',      34650,      'đ',   '33.000/quần × 1,05 món'],
  ]);

  // --- Tab THEO_THANG: dòng tiền từng tháng (ANH ĐỔ TỪ P&L tháng vào đây) ---
  writeTab_(ss, 'THEO_THANG', [
    ['Tháng', 'Doanh thu (net)', 'Giá vốn', 'Phí sàn', 'Chi phí khác', 'Lợi nhuận', 'Biên LN %'],
    ['2026-08', 124419000, 54000000, 47462056, 6000000, 16956944, 0.136],
    // ↑ số mẫu — anh mở Sheet sửa/thêm dòng tháng mới. Dashboard tự lấy.
  ]);

  // --- Tab THAM_SO: cơ cấu phí & tham số nội bộ ---
  writeTab_(ss, 'THAM_SO', [
    ['Tham số', 'Giá trị', 'Loại'],
    ['Phí nền tảng TikTok',     0.12,  '% doanh thu'],
    ['Phí giao dịch',           0.0547,'% doanh thu'],
    ['Thuế GTGT',               0.01,  '% doanh thu'],
    ['Thuế TNCN',               0.005, '% doanh thu'],
    ['Phí ship (SFR)',          3255,  'đ/đơn cố định'],
    ['Phí xử lý đơn',           3000,  'đ/đơn cố định'],
    ['Hoa hồng affiliate KOC',  0.1061,'% (chỉ khi qua KOC)'],
    ['Đóng gói',                1000,  'đ/đơn'],
    ['Lương cứng livestream',   300000,'đ/ngày (100k×3h)'],
    ['Hoa hồng livestream',     0.01,  '% doanh thu chốt'],
    ['Điểm hòa vốn live/ngày',  40,    'đơn (~2,34tr)'],
  ]);

  SpreadsheetApp.flush();
  Logger.log('✅ Đã tạo/đổ số: ' + ss.getUrl());
  return ss.getUrl();
}

// ====== API: dashboard gọi vào đây ======
function doGet(e) {
  var token = (e && e.parameter && e.parameter.token) || '';
  if (token !== TOKEN) {
    return json_({ ok: false, error: 'invalid_token' });
  }
  try {
    var ss = getOrCreateSheet_();
    var kpi    = tabToObjects_(ss, 'KPI',       ['metric', 'value', 'unit', 'note']);
    var months = tabToObjects_(ss, 'THEO_THANG',['month', 'revenue', 'cogs', 'fee', 'other', 'profit', 'margin']);
    var params = tabToObjects_(ss, 'THAM_SO',   ['param', 'value', 'type']);

    return json_({
      ok: true,
      brand: 'CERISH',
      updated: new Date().toISOString(),
      kpi: kpi,
      months: months,
      params: params,
      insights: buildInsights_(kpi, months)
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ====== NHẬN ĐỊNH / GỢI Ý QUYẾT ĐỊNH (tự sinh từ số) ======
function buildInsights_(kpi, months) {
  var out = [];
  var m = {};
  kpi.forEach(function (r) { m[r.metric] = Number(r.value); });

  var cancel = m['Tỉ lệ hủy trước ship'];
  if (cancel >= 0.15) {
    out.push('⚠️ Tỉ lệ hủy trước ship ' + pct_(cancel) + ' — cao (ngưỡng tốt <10%). Soát lại khâu xác nhận đơn/giá ship để giảm hủy, cứu doanh thu.');
  }
  var ret = m['Tỉ lệ hoàn sau nhận'];
  if (ret >= 0.03) out.push('⚠️ Hoàn sau nhận ' + pct_(ret) + ' — để ý chất lượng/size sản phẩm để giảm hoàn.');

  if (months && months.length) {
    var last = months[months.length - 1];
    var margin = Number(last.margin);
    if (margin < 0.15) out.push('📉 Biên lợi nhuận tháng ' + last.month + ' chỉ ' + pct_(margin) + ' — mỏng. Cân nhắc tăng AOV (bán combo) hoặc giảm phí affiliate bằng đẩy live in-house.');
    else out.push('✅ Biên lợi nhuận tháng ' + last.month + ' ' + pct_(margin) + '.');
  }

  out.push('💡 Live in-house KHÔNG mất 10,6% hoa hồng affiliate — đẩy giờ live tự vận hành là đòn bẩy lợi nhuận rõ nhất của CERISH. Hòa vốn ~40 đơn/ngày.');
  return out;
}

// ====== TIỆN ÍCH ======
function getOrCreateSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_KEY);
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }

  var ss = SpreadsheetApp.create(SHEET_NAME);
  props.setProperty(PROP_KEY, ss.getId());
  // chuyển file vào đúng thư mục SB/CERISH/07
  try {
    var file = DriveApp.getFileById(ss.getId());
    DriveApp.getFolderById(FOLDER_ID).addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  } catch (e) { Logger.log('Không move được vào folder: ' + e); }
  return ss;
}

function writeTab_(ss, name, rows) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  sh.setFrozenRows(1);
  var def = ss.getSheetByName('Sheet1');
  if (def && def.getName() !== name && ss.getSheets().length > 1) { try { ss.deleteSheet(def); } catch (e) {} }
}

function tabToObjects_(ss, name, keys) {
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === '' && data[i][1] === '') continue;
    var o = {};
    for (var k = 0; k < keys.length; k++) o[keys[k]] = data[i][k];
    out.push(o);
  }
  return out;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function pct_(x) { return (Number(x) * 100).toFixed(1).replace('.', ',') + '%'; }
