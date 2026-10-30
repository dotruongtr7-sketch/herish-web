# CERISH CRM V14 — giao diện Video & nội dung gộp một bảng

## Xem thử
- Mở `CERISH_CRM_V14_Preview.html` bằng Chrome. Đây là bản trình diễn độc lập dùng dữ liệu mẫu trong trình duyệt.
- Vào **Sản phẩm**, chọn một sản phẩm có booking (ví dụ Quần nỉ dài), mở tab **Video & nội dung**.
- Mỗi booking có một dòng chính. Nhấn mũi tên cạnh tên KOC/KOL để mở các video bên dưới; không còn bảng “Booking đang theo dõi” bị lặp.
- Nút **+ Gắn video** mở biểu mẫu thêm nhiều video, từng video có link, tiêu đề, trạng thái, ngày đăng, lượt xem, đơn, GMV và ghi chú. Có chức năng dán nhiều link mỗi dòng.
- Bộ lọc theo KOC/video/link, trạng thái video, chiến dịch và nhân sự; phân trang 10/25/50 booking.

## Chạy bản máy chủ
- Cài Python 3.10+ và chạy `pip install -r requirements.txt`.
- Trong thư mục này, chạy `python -m uvicorn app:app --host 127.0.0.1 --port 8787` hoặc file `run_windows.bat`.
- Mở http://127.0.0.1:8787 và đăng nhập theo tài khoản đã cấu hình. Mặc định dùng thử: `admin@cerish.local` / `Cerish@2026Demo!` (phải đổi ngay trước khi dùng thực tế).
- Bản máy chủ dùng `static/index.html` với kết nối API thật và cơ sở dữ liệu SQLite riêng; bản HTML xem thử không đồng bộ với cơ sở dữ liệu máy chủ.
- Tạo **Sản phẩm → Chiến dịch → Booking** để có danh sách booking liên kết chính xác. Những booking cũ chưa gắn chiến dịch cần được gắn lại.
- Sao lưu file SQLite đang dùng trước khi nâng cấp hoặc di chuyển dữ liệu.

## Lưu ý
- Chưa đồng bộ tự động TikTok Shop/Shopee. Chỉ số video được nhập thủ công.
- Bản này chưa phải môi trường production (vận hành chính thức): cần rà soát phân quyền theo nhân sự, bảo mật, sao lưu và triển khai HTTPS.
