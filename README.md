# Quản lý chi tiêu cá nhân

Ứng dụng web tiếng Việt để theo dõi thu nhập, chi tiêu, danh mục và số dư theo tháng. Mỗi tài khoản chỉ thao tác trên dữ liệu do tài khoản đó sở hữu. Repository này tổ chức mã ứng dụng và hạ tầng trong cùng một cây thư mục; phần `infra/` được tách riêng để có thể rà soát và chuyển sang repository nhóm sau này.

## Kiến trúc

- **Ứng dụng:** Node.js 24 LTS, Express 5, giao diện HTML/CSS/JavaScript thuần.
- **Cơ sở dữ liệu:** PostgreSQL 17.11, schema tại `src/db/schema.sql`.
- **Phiên và bảo mật:** bcryptjs, session lưu trong PostgreSQL, CSRF token, kiểm tra Origin, Helmet/CSP và giới hạn thử đăng nhập.
- **Reverse proxy:** Nginx 1.30.6 với chứng chỉ self-signed được tạo tự động cho demo local.
- **Quản trị CSDL:** pgAdmin 4 9.18, chỉ publish trên loopback `127.0.0.1:5050`.
- **Monitoring:** Prometheus 3.14.0, Grafana 13.2.2, Loki 3.6.11, Promtail 3.6.11, PostgreSQL Exporter 0.20.1, Nginx Prometheus Exporter 1.4.2, cAdvisor 0.60.6 và client metrics Node.js do Prometheus duy trì.
- **Lưu trữ:** PostgreSQL, pgAdmin, Prometheus, Grafana, Loki, trạng thái vị trí đọc của Promtail và chứng chỉ Nginx dùng named volume; `docker compose down` thông thường không xóa các volume này.

Node.js 24 là nhánh LTS theo lịch phát hành chính thức của Node.js. Các image được pin trong `infra/compose.yaml`; PostgreSQL Exporter `v0.20.1` công bố hỗ trợ kiểm thử PostgreSQL 13–18, gồm PostgreSQL 17. pgAdmin 9.18 hỗ trợ PostgreSQL 14–18. Không tìm thấy rubric gốc trong repository, nên demo dùng Loki + Promtail để khớp mẫu báo cáo. Loki và Promtail đều được pin ở tag `3.6.11`. Grafana công bố Promtail đã EOL từ 02/03/2026, không còn hỗ trợ hay cập nhật; chỉ giữ Promtail cho demo học tập và đối chiếu mẫu, không khuyến nghị production. Alloy cũ được giữ trong profile `legacy-alloy` để có thể dừng container của cấu hình trước; profile này không được bật khi chạy stack thông thường. [Node.js releases](https://nodejs.org/en/about/previous-releases) · [PostgreSQL 17.11](https://www.postgresql.org/docs/release/17.11/) · [PostgreSQL Exporter releases](https://github.com/prometheus-community/postgres_exporter/releases) · [PostgreSQL Exporter permissions](https://github.com/prometheus-community/postgres_exporter/blob/master/docs/database-permissions.md) · [pgAdmin 9.18 container docs](https://www.pgadmin.org/docs/pgadmin4/9.18/container_deployment.html) · [Loki 3.6.11 release](https://github.com/grafana/loki/releases/tag/v3.6.11) · [Promtail 3.6.11 image](https://hub.docker.com/r/grafana/promtail/tags) · [Promtail EOL](https://grafana.com/docs/loki/latest/send-data/promtail/)

## Yêu cầu

- Docker Desktop hoặc Docker Engine có Docker Compose v2, dùng Linux containers.
- Kết nối mạng để tải image ở lần chạy đầu.
- Cổng local `NGINX_HTTP_PORT` (mặc định `8080`), `8443`, `3001` và `5050` chưa được chương trình khác sử dụng. Trên VM hiện tại đặt `NGINX_HTTP_PORT=8081` vì cổng `8080` đã có dịch vụ khác.
- Các lệnh dưới đây chạy từ thư mục gốc repository.

## Tạo `.env` cho demo mới trên Windows

Phần này chỉ dành cho một stack demo mới trên máy Windows. Không chạy lệnh sao chép này trên VM hiện có: VM đã có `.env` và dữ liệu PostgreSQL; giữ file đó, chỉ bổ sung các biến còn thiếu theo mục Ubuntu VM bên dưới. Không commit `.env`.

```powershell
Copy-Item .env.example .env
```

Có thể tạo chuỗi ngẫu nhiên bằng OpenSSL rồi dán vào `DB_PASSWORD`, `SESSION_SECRET`, `GRAFANA_ADMIN_PASSWORD`, `PGADMIN_DEFAULT_PASSWORD` và `POSTGRES_EXPORTER_PASSWORD`; dùng một giá trị khác nhau cho từng mật khẩu:

```powershell
openssl rand -hex 32
```

`SESSION_SECRET` cần ít nhất 32 ký tự. Dùng secret khác nhau cho từng biến; không dùng giá trị hướng dẫn làm secret thật. File `.env.example` chỉ chứa placeholder.

## Chạy bằng Docker Compose

### Windows Docker Desktop — demo local mới

Compose file nằm trong `infra/` nhưng build context trỏ về repository hiện tại để lấy `Dockerfile`, `src/`, `public/` và `package.json`.

```powershell
docker compose --env-file .env -f infra/compose.yaml config --quiet
docker compose --env-file .env -f infra/compose.yaml up --build -d
```

Nếu đã chạy phiên bản stack trước đây và Alloy còn hoạt động, dừng riêng container Alloy trước khi khởi động Promtail. Lệnh giữ nguyên named volume và dữ liệu:

```powershell
docker compose --env-file .env -f infra/compose.yaml --profile legacy-alloy stop alloy
```

Không dùng `--profile legacy-alloy up`: profile đó chỉ giữ khả năng quản lý container Alloy cũ, và không được chạy cùng Promtail.

Trạng thái, log và dừng dịch vụ:

```powershell
docker compose --env-file .env -f infra/compose.yaml ps
docker compose --env-file .env -f infra/compose.yaml logs -f app nginx db pgadmin postgres-exporter-init postgres-exporter prometheus grafana loki promtail cadvisor
docker compose --env-file .env -f infra/compose.yaml down
```

`down` giữ named volumes. Không thêm `-v` khi chỉ muốn khởi động lại hoặc kiểm thử vì `-v` sẽ xóa dữ liệu volume. Hãy sao lưu dữ liệu trước khi chủ động xóa volume.

### Ubuntu VM hiện có — hướng dẫn cập nhật, chưa chạy trong lượt này

VM đang dùng Compose project `expense-tracker-demo`; tên này tạo prefix cho named volumes hiện có. Mọi lệnh Compose trên VM phải chỉ định `--project-name expense-tracker-demo`. Không chạy Compose trên VM mà thiếu cờ này, không đổi `name:` trong Compose, không chạy `Copy-Item .env.example .env`, không thay toàn bộ `.env`, và không dùng `down -v`.

Mở `.env` hiện có bằng trình soạn thảo trên VM và chỉ bổ sung/cập nhật các biến sau. Giữ nguyên toàn bộ biến DB và secret hiện có; tự đặt email cùng secret riêng cho pgAdmin/exporter, không chép placeholder từ mẫu:

```dotenv
PGADMIN_DEFAULT_EMAIL=<email-dang-nhap-pgadmin>
PGADMIN_DEFAULT_PASSWORD=<secret-pgadmin-rieng>
POSTGRES_EXPORTER_USER=<role-metrics-rieng>
POSTGRES_EXPORTER_PASSWORD=<secret-exporter-rieng>
NGINX_HTTP_PORT=8081
PROMTAIL_COMPOSE_PROJECT=expense-tracker-demo
```

Chạy từ thư mục repository triển khai `~/expense-tracker-deploy`. Các lệnh dưới đây là hướng dẫn Linux cho Owner chạy sau khi rà soát `.env`; chúng chưa được chạy trong lượt này:

```bash
cd ~/expense-tracker-deploy
docker compose --project-name expense-tracker-demo --env-file .env -f infra/compose.yaml config --quiet
docker compose --project-name expense-tracker-demo --env-file .env -f infra/compose.yaml up --build -d
docker compose --project-name expense-tracker-demo --env-file .env -f infra/compose.yaml ps
docker compose --project-name expense-tracker-demo --env-file .env -f infra/compose.yaml logs --tail 100 app nginx db pgadmin postgres-exporter-init postgres-exporter prometheus grafana loki promtail
```

HTTP của VM được publish ở `8081`, HTTPS vẫn ở `8443`, Grafana vẫn ở `3001`; pgAdmin chỉ bind loopback `127.0.0.1:5050`. Nginx chuyển HTTP tới HTTPS trên cùng hostname với cổng HTTPS `8443`. Không thay project identity để tránh tạo volume mang prefix khác.

Loki không có shell trong image, vì vậy không dùng healthcheck `CMD-SHELL` hay `docker compose exec loki sh`. Compose chỉ đợi service Loki được tạo trước khi khởi động Promtail; việc đó không khẳng định Loki đã sẵn sàng. Sau khi stack chạy, kiểm tra endpoint readiness riêng bằng một container curl trên network `logs` của đúng project:

```bash
docker run --rm --network expense-tracker-demo_logs curlimages/curl:8.12.1 --fail --show-error http://loki:3100/ready
```

Image curl được pin ở tag `8.12.1`; đây là container kiểm tra tạm, không thêm service vào stack. Nếu lệnh chưa trả trạng thái sẵn sàng, xem log Loki bằng lệnh Compose ở trên rồi thử lại. Việc `promtail` đang chạy chỉ xác nhận container khởi động, không thay cho kiểm tra `/ready` của Loki.

## Truy cập

- Ứng dụng: [https://localhost:8443](https://localhost:8443). Chứng chỉ tự ký nên trình duyệt sẽ hiển thị cảnh báo; đây chỉ là HTTPS demo/local.
- HTTP local: [http://localhost:8080](http://localhost:8080) theo mặc định, tự chuyển sang HTTPS cổng `8443`; có thể đổi host port bằng `NGINX_HTTP_PORT`. Trên VM đặt `NGINX_HTTP_PORT=8081`.
- Grafana: [http://localhost:3001](http://localhost:3001), đăng nhập bằng giá trị `GRAFANA_ADMIN_USER` và `GRAFANA_ADMIN_PASSWORD` trong `.env`.
- pgAdmin local: [http://localhost:5050](http://localhost:5050). Trên VM, mở giao diện qua SSH tunnel như hướng dẫn bên dưới. Đăng nhập bằng `PGADMIN_DEFAULT_EMAIL` và `PGADMIN_DEFAULT_PASSWORD`. Trong pgAdmin, đăng ký server với host `db`, port `5432`, database `DB_NAME`, username `DB_USER` và password `DB_PASSWORD`; các giá trị đăng nhập pgAdmin và PostgreSQL là riêng biệt.
- PostgreSQL, Prometheus và PostgreSQL Exporter không publish port ra host. pgAdmin kết nối DB qua network `data`; PostgreSQL Exporter kết nối DB qua `data` và Prometheus scrape exporter qua network nội bộ `metrics`.
- Dịch vụ `postgres-exporter-init` dùng `DB_USER`/`DB_PASSWORD` để tạo hoặc cập nhật role riêng `POSTGRES_EXPORTER_USER`, đặt role không phải superuser và chỉ cấp `CONNECT` trên database cấu hình cùng role dựng sẵn `pg_monitor`. Dịch vụ chỉ thay đổi metadata role/quyền, không chạy migration và không sửa bảng hoặc dữ liệu. Exporter chỉ nhận credential riêng `POSTGRES_EXPORTER_USER`/`POSTGRES_EXPORTER_PASSWORD`; người có quyền `docker inspect` vẫn có thể xem environment container, nên đây là cấu hình demo. Nếu role metrics này đã tồn tại, mật khẩu sẽ được đặt lại theo `.env` mỗi lần init chạy; không dùng tên role đó cho tài khoản khác.
- Promtail đọc log `json-file` của Docker qua Docker API socket, chỉ nhận các service `app`, `nginx`, `db` thuộc project được đặt trong `PROMTAIL_COMPOSE_PROJECT`, rồi gửi tới Loki qua network `logs`. Mặc định project là `chi-tieu-ca-nhan`; các nhãn cấu hình là `job`, `compose_service` và `level` (chỉ log app); không gắn nội dung log, request ID, container ID hay đường dẫn động làm nhãn. Grafana truy vấn Loki qua datasource provisioned.

### Mở pgAdmin trên Ubuntu VM qua SSH tunnel

pgAdmin trên VM chỉ bind vào `127.0.0.1:5050`, nên không cần publish giao diện này ra mạng ngoài. Từ PowerShell trên Windows, mở tunnel:

```powershell
ssh -N -L 5050:127.0.0.1:5050 your-vm-user@your-vm-host
```

Giữ cửa sổ PowerShell đó mở rồi truy cập [http://localhost:5050](http://localhost:5050) trên máy Windows. Đăng nhập bằng email/mật khẩu pgAdmin đã cấu hình trên VM. Bên trong pgAdmin, đăng ký PostgreSQL với host `db`, port `5432`, database `DB_NAME`, username `DB_USER` và password `DB_PASSWORD`; tunnel này chỉ chuyển tiếp giao diện pgAdmin, không mở PostgreSQL ra host.

Nếu cổng local `5050` trên Windows đang bận, dùng cổng local khác, ví dụ:

```powershell
ssh -N -L 15050:127.0.0.1:5050 your-vm-user@your-vm-host
```

Sau đó mở [http://localhost:15050](http://localhost:15050). Đóng tunnel bằng `Ctrl+C` trong cửa sổ SSH. Các lệnh và kết nối tunnel này chưa được chạy hoặc xác nhận trong lượt hiện tại.

Compose file vẫn giữ `name: chi-tieu-ca-nhan` để không đổi mặc định và prefix named volume của bản local. Trên VM, trước khi đồng bộ, Owner cần bổ sung riêng `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD`, `POSTGRES_EXPORTER_USER`, `POSTGRES_EXPORTER_PASSWORD`, `NGINX_HTTP_PORT=8081` và `PROMTAIL_COMPOSE_PROJECT=expense-tracker-demo` vào `.env` hiện có. Giữ nguyên project `expense-tracker-demo` bằng cờ `--project-name` trên mọi lệnh Compose; không đổi `name: chi-tieu-ca-nhan` trong nguồn và không thay toàn bộ `.env`. Hướng dẫn này không đọc hoặc sửa `.env` trên VM.

Docker socket bind mount `:ro` không giới hạn các lệnh API mà client có thể gửi tới daemon; người có quyền truy cập socket có quyền rất nhạy cảm trên Docker host. Chỉ dùng cấu hình demo trên máy tin cậy. Docker Desktop trên Windows dùng Linux containers; khả năng bind `/var/run/docker.sock` phụ thuộc cấu hình Docker Desktop và cần xác nhận runtime tại máy chạy.

Grafana và Promtail phụ thuộc service Loki được start, không phụ thuộc healthcheck Loki. Loki image không có `/bin/sh`; readiness phải được kiểm tra bằng container curl trên network `logs` như hướng dẫn Ubuntu VM ở trên.

Nginx chỉ proxy chính xác `/health/ready` khi client là loopback `127.0.0.1` để phục vụ healthcheck container; các đường dẫn `/health/` khác và `/metrics` tiếp tục bị chặn.

`postgres-exporter-init` cần quyền quản trị DB `DB_USER`/`DB_PASSWORD` và nhận các giá trị này qua environment; người có quyền `docker inspect` có thể xem environment container. Exporter riêng chỉ nhận credential role metrics. Cấu hình này phục vụ demo; production nên dùng secret file/secret manager và quy trình quản lý role phù hợp.

### Truy vấn log trong Grafana Explore

Các truy vấn sau dựa trên labels và log format trong cấu hình. Chưa được chạy trên Loki trong môi trường hiện tại; xem trạng thái kiểm chứng ở [báo cáo triển khai](docs/bao-cao-trien-khai.md).

```logql
# [CẦN KIỂM CHỨNG] Log truy cập Nginx có HTTP 5xx
{job="docker", compose_service="nginx"} |~ " 5[0-9][0-9] "

# [CẦN KIỂM CHỨNG] Log lỗi ứng dụng
{job="docker", compose_service="app", level="error"}

# [CẦN KIỂM CHỨNG] Số log theo service trong 5 phút
sum by (compose_service) (count_over_time({job="docker"}[5m]))
```

Các cổng web được bind vào `127.0.0.1`, phù hợp demo trên máy hiện tại. Không có thao tác thay đổi firewall/iptables/UFW của host. Nếu cần cho máy khác truy cập, hãy chủ động sửa địa chỉ bind, thay chứng chỉ bằng chứng chỉ phù hợp và thiết lập firewall theo môi trường.

## Chức năng ứng dụng

- Đăng ký, đăng nhập, đăng xuất; mật khẩu được băm bcrypt với cost 12.
- Tạo, sửa, xóa giao dịch thu/chi và danh mục.
- Lọc giao dịch theo tháng, loại và danh mục; xem tổng thu, tổng chi, số dư, biểu đồ dòng tiền và nhóm chi tiêu.
- Mỗi câu lệnh đọc/sửa/xóa theo ID đều ràng buộc với `user_id` từ session. Khóa ngoại ghép trên giao dịch ngăn dùng danh mục của người dùng khác hoặc danh mục sai loại.
- API dùng truy vấn tham số, kiểm tra đầu vào, giới hạn payload JSON 16 KB, CSRF token và giới hạn đăng nhập 10 lần/15 phút theo địa chỉ nguồn.

## Cấu trúc và phân công

**Người 1 — ứng dụng:** `package.json`, `src/`, `public/`, `test/`.

**Người 2 — hạ tầng:** `Dockerfile`, `.dockerignore`, `.env.example`, `.gitignore`, toàn bộ `infra/` (Compose, Nginx, Prometheus, Grafana, Loki và Promtail). `infra/alloy/config.alloy` cùng service profile `legacy-alloy` là cấu hình từ lượt trước, không chạy trong stack mặc định.

**Tài liệu dùng chung:** `README.md`, `docs/bao-cao-trien-khai.md`. Repository nhóm `chi-ti-u-c-nh-n` không thuộc phạm vi lần này; không có file nào được gửi sang repository đó.

## Kiểm tra ứng dụng cục bộ

Node.js 24.x và npm là đủ cho kiểm tra cú pháp. Test HTTP dùng `node:test`, Express session store giả và PostgreSQL pool giả để kiểm tra validation, CSRF, luồng đăng ký, tạo giao dịch và quyền sở hữu theo ID.

```powershell
npm ci
npm run lint
npm test
```

Các test này không thay thế kiểm thử tích hợp với PostgreSQL/Docker. Khi PostgreSQL được cài sẵn trên máy, có thể chạy ứng dụng local bằng cách cấu hình `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `SESSION_SECRET` và `COOKIE_SECURE=false`, rồi chạy `npm start`.

## Lỗi thường gặp

- **Compose báo thiếu biến:** tạo `.env`, thay placeholder và chạy lại lệnh.
- **Không bind được cổng:** giải phóng cổng `NGINX_HTTP_PORT` (mặc định `8080`), `8443`, `3001` hoặc `5050`, hoặc đặt port HTTP khác. Trên VM dùng `8081` theo cấu hình hiện tại.
- **Trình duyệt báo chứng chỉ không tin cậy:** hành vi dự kiến với self-signed local. Không dùng cấu hình này cho dịch vụ Internet.
- **App unhealthy hoặc không nối được DB:** xem `docker compose ... logs db app`; kiểm tra `DB_*` thống nhất và đợi healthcheck PostgreSQL hoàn tất.
- **Grafana không có datasource/dashboard:** xem log Grafana/Prometheus/Loki; kiểm tra file provisioning được mount từ `infra/grafana/`.
- **Grafana không có PostgreSQL metrics:** xem `docker compose ... logs postgres-exporter-init postgres-exporter prometheus`; trong Grafana Explore chọn datasource Prometheus rồi chạy `up{job="postgres"}`, `pg_up` và `pg_stat_database_xact_commit`. Target Prometheus không publish port ra host.
- **Không đăng nhập được pgAdmin:** dùng `PGADMIN_DEFAULT_EMAIL`/`PGADMIN_DEFAULT_PASSWORD` cho giao diện; sau đó kiểm tra riêng `DB_NAME`/`DB_USER`/`DB_PASSWORD` khi đăng ký kết nối tới host `db`.
- **Không thấy CPU/RAM/Network container:** cAdvisor cần quyền đọc thông tin host và được chạy privileged cùng mount hệ thống. Docker Desktop trên Windows/macOS có thể cung cấp ít thông tin host hơn Linux; kiểm tra target `containers` tại dashboard/Prometheus.
- **Promtail không gửi log:** xem log Loki/Promtail; kiểm tra Loki `/ready` bằng container curl trên network `logs`, socket `/var/run/docker.sock` được mount, các container dùng `json-file` hoặc `journald`, `PROMTAIL_COMPOSE_PROJECT` khớp project name Compose, và Explore đang lọc `job="docker"` cùng `compose_service`. Trên VM network là `expense-tracker-demo_logs`.

## Kiểm thử và tình trạng hiện tại

Kiểm tra cục bộ trên Windows: `npm.cmd test` đạt 2/2 test và `npm.cmd run lint` thành công. Docker CLI không có trong PATH nên `docker compose config` và runtime chưa được kiểm tra trên Windows. Test dùng PostgreSQL pool giả; chưa xác nhận tích hợp với PostgreSQL thật.

Theo kết quả kiểm tra thủ công do Owner cung cấp trên Ubuntu VM, tại thời điểm snapshot: `app`, `db`, `nginx`, `grafana`, `promtail`, `cadvisor` Up/healthy; `loki`, `prometheus`, `nginx-exporter`, `pgadmin`, `postgres-exporter` Up; hai job `cert-init` và `postgres-exporter-init` Exited (0). Các giao diện bind loopback: Grafana `127.0.0.1:3001`, Nginx `127.0.0.1:8081`/`8443`, pgAdmin `127.0.0.1:5050`. Đây là trạng thái được báo tại một thời điểm, không xác nhận liên tục sau đó.

Owner báo HTTP qua Nginx trả 308 tới HTTPS; HTTPS trả HTTP/2 200 khi dùng `curl -k`, kèm security headers. Một số header bị lặp, chưa có bằng chứng đã sửa. Vì dùng `curl -k`, chứng chỉ self-signed chưa được xác nhận là trusted. Grafana `/api/health` trả HTTP 200; ảnh dashboard Owner cung cấp có dữ liệu request rate, HTTP p95 latency, scrape targets, CPU, RAM và logs. Loki `/ready` mới nhất trả HTTP 200 với body `ready`; Loki từng trả 503 ở lần kiểm tra trước. PostgreSQL Exporter có `pg_up=1` và target Prometheus `postgres` trả `1` theo xác nhận trước đó. pgAdmin trả HTTP 302 và chỉ bind loopback; chưa xác nhận đăng nhập hoặc kết nối DB bên trong giao diện.

Owner cũng xác nhận ứng dụng có tổng thu `100.000đ`, tổng chi `20.000đ`, số dư `80.000đ`; đã thêm và sửa giao dịch, tải lại trang và đăng xuất/đăng nhập lại mà dữ liệu vẫn còn. Khi sửa khoản chi thành `30.000đ`, tổng chi/số dư đổi thành `30.000đ`/`70.000đ`; sửa lại `20.000đ` thì số liệu trở về `20.000đ`/`80.000đ`.

Các kết quả runtime trên do Owner cung cấp, không phải kiểm tra agent chạy trong lượt cập nhật này. Truy cập Internet công cộng, chứng chỉ CA tin cậy, truy vấn LogQL cụ thể, query/panel PostgreSQL chi tiết, đăng nhập/kết nối DB qua pgAdmin, xóa giao dịch/danh mục, cô lập dữ liệu giữa nhiều tài khoản và tích hợp đầy đủ với PostgreSQL thật vẫn cần kiểm chứng; xem chi tiết và vị trí ảnh minh chứng còn thiếu trong `docs/bao-cao-trien-khai.md`. Không có ảnh hoặc kết quả runtime nào được giả lập.
