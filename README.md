# Hệ thống quản lý chi tiêu cá nhân

Ứng dụng web tiếng Việt dùng để quản lý giao dịch thu, chi, danh mục và số dư theo tháng. Mỗi tài khoản chỉ truy cập dữ liệu gắn với phiên đăng nhập của mình.

## Thành phần

- Node.js 24, Express 5 và giao diện HTML/CSS/JavaScript.
- PostgreSQL 17 lưu tài khoản, danh mục, giao dịch và session.
- pgAdmin 4 để quản trị PostgreSQL.
- Docker Compose đóng gói ứng dụng, cơ sở dữ liệu, pgAdmin và Nginx.
- Nginx reverse proxy; chứng chỉ tự ký phục vụ demo HTTPS.

## Chức năng

Đăng ký, đăng nhập, đăng xuất; thêm, sửa, xóa giao dịch và danh mục; lọc giao dịch theo tháng/loại/danh mục; xem tổng thu, tổng chi, số dư và biểu đồ.

## Chạy demo local

Tạo `.env` từ `.env.example`, thay các placeholder bằng thông tin riêng, sau đó chạy từ thư mục gốc:

```powershell
Copy-Item .env.example .env
docker compose --env-file .env -f infra/compose.yaml config --quiet
docker compose --env-file .env -f infra/compose.yaml up --build -d
docker compose --env-file .env -f infra/compose.yaml ps
```

Ứng dụng dùng HTTPS self-signed tại `https://localhost:8443`; HTTP mặc định tại `http://localhost:8080` chuyển hướng sang HTTPS. pgAdmin tại `http://localhost:5050`; đăng ký PostgreSQL bên trong pgAdmin bằng host `db`, port `5432` và thông tin database trong `.env`. PostgreSQL không publish port ra host.

## Kiểm tra mã nguồn

```powershell
npm ci
npm run lint
npm test
```

Các test HTTP của ứng dụng sử dụng PostgreSQL pool giả, không thay thế kiểm thử tích hợp với PostgreSQL thật. Không commit `.env`, mật khẩu, chứng chỉ riêng hoặc backup dữ liệu.

## Monitoring bằng Prometheus và Grafana

Prometheus scrape ứng dụng tại `/metrics`, Nginx Exporter, PostgreSQL Exporter và cAdvisor theo chu kỳ 15 giây. PostgreSQL Exporter dùng role `chi_tieu_metrics` riêng; PostgreSQL vẫn không publish cổng ra host. Grafana được provision với datasource Prometheus và dashboard có request rate, độ trễ HTTP p95, scrape targets, CPU/RAM/network container cùng một số chỉ số PostgreSQL.

Sau khi chạy Compose, kiểm tra service bằng `docker compose --env-file .env -f infra/compose.yaml ps`; mở Grafana ở `http://localhost:3001` và đăng nhập bằng biến Grafana trong `.env`. Các panel hiển thị chuỗi metrics theo khoảng thời gian đã chọn; chúng không thay thế kiểm thử nghiệp vụ.
