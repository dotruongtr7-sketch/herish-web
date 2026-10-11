# Herish — Web quà tặng (bản thiết kế lại 2026)

Web tĩnh thay thế **herish.vn** (tên miền cũ đã hết hạn). Chạy được ngay trên GitHub Pages, không cần server.

## Cấu trúc
- `index.html` — trang chủ (hero, bộ sưu tập, sản phẩm nổi bật, vì sao chọn Herish, FAQ, liên hệ)
- `products.html` — danh sách sản phẩm: tìm kiếm, lọc theo bộ sưu tập + khoảng giá, sắp xếp, nút xóa bộ lọc, màn hình trống
- `product.html?code=MÃ` — chi tiết sản phẩm, form "thông báo khi có hàng"
- `assets/js/data.js` — snapshot dữ liệu thật lấy từ API `https://herish.id.vn/api` (19 sản phẩm, FAQ, liên hệ)
- `assets/img/products/` — ảnh sản phẩm đã tải về repo (web tự chạy kể cả khi server cũ sập)

## Cơ chế dữ liệu
Trang luôn render từ snapshot trong `data.js` trước, sau đó **tự gọi API cũ** (`herish.id.vn/api/products`) để làm mới giá/tồn kho nếu backend còn sống. Backend chết → web vẫn hoạt động bình thường.

Cập nhật snapshot: chạy lại bước tải API → ghi đè `assets/js/data.js` + ảnh mới vào `assets/img/products/`.

## Các lỗi từ sheet "Báo bug" đã xử lý triệt để
| # | Lỗi cũ | Cách xử lý trong bản này |
|---|--------|--------------------------|
| 1 | Sort giá bị ngược chiều | `price-desc` sort `b.sale - a.sale` thật sự giảm dần |
| 2 | % giảm giá lệch giữa list và detail | Một hàm `discountOf()` duy nhất dùng chung mọi nơi |
| 3 | Thiếu nút reset filter | Nút "↺ Xóa bộ lọc" trên toolbar + trong màn hình trống |
| 4 | "Thông báo cho tôi" không tick sẵn | Checkbox mặc định `checked` |
| 6 | Giá gạch ngang sai định dạng (d500.000) | `formatPrice()` → `500.000đ`, giá gốc có `line-through` |
| 7 | Số đếm sản phẩm bị hardcode | Đếm động theo kết quả lọc thực tế |
| 8 | Thiếu màn hình "không tìm thấy" | Empty state + nút xóa lọc |
| 12 | Nút điều hướng sai link | Mọi link `?cat=`, `?code=` đều validate trước khi render |
| 14 | Mất xuống dòng từ CMS | `white-space: pre-line` cho mô tả & FAQ |

## Deploy
GitHub Pages từ branch `main`, thư mục gốc. Muốn gắn lại tên miền riêng: thêm file `CNAME` + trỏ DNS.
