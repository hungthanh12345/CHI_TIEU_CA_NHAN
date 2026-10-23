# Quản lý chi tiêu cá nhân

Ứng dụng web tiếng Việt để theo dõi thu nhập, chi tiêu, danh mục và số dư theo tháng. Mỗi tài khoản chỉ thao tác trên dữ liệu do tài khoản đó sở hữu. Repository này tổ chức mã ứng dụng và hạ tầng trong cùng một cây thư mục; phần `infra/` được tách riêng để có thể rà soát và chuyển sang repository nhóm sau này.

## Kiến trúc

- **Ứng dụng:** Node.js 24 LTS, Express 5, giao diện HTML/CSS/JavaScript thuần.
- **Cơ sở dữ liệu:** PostgreSQL 17.11, schema tại `src/db/schema.sql`.
- **Phiên và bảo mật:** bcryptjs, session lưu trong PostgreSQL, CSRF token, kiểm tra Origin, Helmet/CSP và giới hạn thử đăng nhập.
- **Reverse proxy:** Nginx 1.30.6 với chứng chỉ self-signed có SAN cho IP VM `192.168.195.129` trong bản demo.
- **Quản trị CSDL:** pgAdmin 4 9.18, publish trên IP VM `192.168.195.129:5050`.
- **Monitoring:** Prometheus 3.14.0, Grafana 13.2.2, Loki 3.6.11, Promtail 3.6.11, PostgreSQL Exporter 0.20.1, Nginx Prometheus Exporter 1.4.2, cAdvisor 0.60.6 và client metrics Node.js do Prometheus duy trì.
- **Lưu trữ:** PostgreSQL, pgAdmin, Prometheus, Grafana, Loki, trạng thái vị trí đọc của Promtail và chứng chỉ Nginx dùng named volume; `docker compose down` thông thường không xóa các volume này.

Node.js 24 là nhánh LTS theo lịch phát hành chính thức của Node.js. Các image được pin trong `infra/compose.yaml`; PostgreSQL Exporter `v0.20.1` công bố hỗ trợ kiểm thử PostgreSQL 13–18, gồm PostgreSQL 17. pgAdmin 9.18 hỗ trợ PostgreSQL 14–18. Không tìm thấy rubric gốc trong repository, nên demo dùng Loki + Promtail để khớp mẫu báo cáo. Loki và Promtail đều được pin ở tag `3.6.11`. Grafana công bố Promtail đã EOL từ 02/03/2026, không còn hỗ trợ hay cập nhật; chỉ giữ Promtail cho demo học tập và đối chiếu mẫu, không khuyến nghị production. Alloy cũ được giữ trong profile `legacy-alloy` để có thể dừng container của cấu hình trước; profile này không được bật khi chạy stack thông thường. [Node.js releases](https://nodejs.org/en/about/previous-releases) · [PostgreSQL 17.11](https://www.postgresql.org/docs/release/17.11/) · [PostgreSQL Exporter releases](https://github.com/prometheus-community/postgres_exporter/releases) · [PostgreSQL Exporter permissions](https://github.com/prometheus-community/postgres_exporter/blob/master/docs/database-permissions.md) · [pgAdmin 9.18 container docs](https://www.pgadmin.org/docs/pgadmin4/9.18/container_deployment.html) · [Loki 3.6.11 release](https://github.com/grafana/loki/releases/tag/v3.6.11) · [Promtail 3.6.11 image](https://hub.docker.com/r/grafana/promtail/tags) · [Promtail EOL](https://grafana.com/docs/loki/latest/send-data/promtail/)

## Yêu cầu

- Docker Desktop hoặc Docker Engine có Docker Compose v2, dùng Linux containers.
- Kết nối mạng để tải image ở lần chạy đầu.
- IP giao diện VM phải được đặt trong `VM_HOST_IP` và có thể truy cập từ máy đang dùng; các cổng `NGINX_HTTP_PORT` (mặc định `8080`), `8443`, `3001` và `5050` phải còn trống. VM hiện tại dùng `VM_HOST_IP=192.168.195.129` và `NGINX_HTTP_PORT=8081` vì cổng `8080` đã có dịch vụ khác.
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

`VM_HOST_IP` là địa chỉ IPv4 của máy chạy Docker. Bản demo VM hiện dùng `192.168.195.129`; nếu chạy trên máy khác, hãy đổi biến này thành IP thực của máy đó trước khi khởi động. Không dùng địa chỉ IP của VM nếu địa chỉ đó không được gán trên máy Docker.

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

### Ubuntu VM hiện có — trạng thái và runbook cập nhật

VM đang dùng Compose project `expense-tracker-demo`; tên này tạo prefix cho named volumes hiện có. Mọi lệnh Compose trên VM phải chỉ định `--project-name expense-tracker-demo`. Không chạy Compose trên VM mà thiếu cờ này, không đổi `name:` trong Compose, không chạy `Copy-Item .env.example .env`, không thay toàn bộ `.env`, và không dùng `down -v`.

Owner báo cáo rằng `.env` trên VM đã được cấu hình cho IP VM, cổng HTTP `8081`, project Promtail `expense-tracker-demo` và thông tin pgAdmin/Exporter. Agent không đọc `.env` và không thể đăng nhập SSH trong lần rà soát này, nên chưa đối chiếu sự hiện diện hoặc giá trị biến. Nếu cần kiểm tra, chỉ kiểm tra tên biến; tuyệt đối không sao chép/ghi đè cả file, không đưa giá trị secret vào log hoặc tài liệu.

Các tên biến mà cấu hình nguồn sử dụng:

```dotenv
VM_HOST_IP=192.168.195.129
NGINX_HTTP_PORT=8081
PROMTAIL_COMPOSE_PROJECT=expense-tracker-demo
PGADMIN_DEFAULT_EMAIL=<email-hop-le>
PGADMIN_DEFAULT_PASSWORD=<secret-pgadmin-rieng>
POSTGRES_EXPORTER_USER=<role-metrics-rieng>
POSTGRES_EXPORTER_PASSWORD=<secret-exporter-rieng>
```

Chỉ chạy các lệnh cập nhật sau khi đã so sánh file cấu hình triển khai với repository, xác nhận backup, giữ nguyên project identity và đã kiểm tra kế hoạch thay đổi. Đây là hướng dẫn Linux trên Ubuntu VM, không phải lệnh đã chạy trong lượt này:

```bash
cd ~/expense-tracker-deploy
docker compose --project-name expense-tracker-demo --env-file .env -f infra/compose.yaml config --quiet
docker compose --project-name expense-tracker-demo --env-file .env -f infra/compose.yaml up --build -d
docker compose --project-name expense-tracker-demo --env-file .env -f infra/compose.yaml ps
docker compose --project-name expense-tracker-demo --env-file .env -f infra/compose.yaml logs --tail 100 app nginx db pgadmin postgres-exporter-init postgres-exporter prometheus grafana loki promtail
```

Trong repository hiện tại, Compose dùng `VM_HOST_IP` cho Nginx HTTP `:8081`, HTTPS `:8443`, Grafana `:3001` và pgAdmin `:5050`; Nginx chuyển HTTP sang HTTPS. Owner cung cấp ảnh ngày 23/10/2026: Docker hiển thị các mapping trên IP VM, ảnh curl cho thấy HTTPS `200` (dùng `-k`) và HTTP `308`, còn Grafana và pgAdmin mở được qua IP. Owner cũng báo `docker compose config --quiet`, `nginx -t`, `cert-init` và kiểm tra SAN đạt. Đây là bằng chứng do Owner cung cấp, Agent chưa tái kiểm tra hay đối chiếu checksum vì SSH Agent bị từ chối. Ảnh pgAdmin chỉ xác nhận giao diện/database mở tại thời điểm chụp; không chứng minh toàn bộ CRUD, backup/restore hoặc hoạt động liên tục. Snapshot loopback được giữ làm lịch sử.

Loki không có shell trong image, vì vậy không dùng healthcheck `CMD-SHELL` hay `docker compose exec loki sh`. Compose chỉ đợi service Loki được tạo trước khi khởi động Promtail; việc đó không khẳng định Loki đã sẵn sàng. Sau khi stack chạy, kiểm tra endpoint readiness riêng bằng một container curl trên network `logs` của đúng project:

```bash
docker run --rm --network expense-tracker-demo_logs curlimages/curl:8.12.1 --fail --show-error http://loki:3100/ready
```

Image curl được pin ở tag `8.12.1`; đây là container kiểm tra tạm, không thêm service vào stack. Nếu lệnh chưa trả trạng thái sẵn sàng, xem log Loki bằng lệnh Compose ở trên rồi thử lại. Việc `promtail` đang chạy chỉ xác nhận container khởi động, không thay cho kiểm tra `/ready` của Loki.

## Truy cập

- Ứng dụng qua HTTPS: [https://192.168.195.129:8443](https://192.168.195.129:8443). Chứng chỉ demo tự ký có SAN cho IP VM nhưng không được CA tin cậy; trình duyệt vẫn có thể cảnh báo.
- HTTP VM: [http://192.168.195.129:8081](http://192.168.195.129:8081), chuyển hướng sang HTTPS cổng `8443`. Cổng HTTP được đặt bằng `NGINX_HTTP_PORT`.
- Grafana: [http://192.168.195.129:3001](http://192.168.195.129:3001), đăng nhập bằng giá trị `GRAFANA_ADMIN_USER` và `GRAFANA_ADMIN_PASSWORD` trong `.env`.
- Prometheus: [http://192.168.195.129:9091](http://192.168.195.129:9091), ánh xạ cổng host `9091` tới cổng container `9090` theo cấu hình Owner cung cấp; Agent chưa truy cập lại runtime. Ảnh nghiệm thu Owner cung cấp cho thấy truy vấn PromQL `up` trả 5 chuỗi, mỗi chuỗi bằng `1`, và trang Target health có 5/5 mục tiêu UP tại thời điểm chụp. Đây là bằng chứng tại một thời điểm, không xác nhận uptime liên tục.
- pgAdmin: [http://192.168.195.129:5050](http://192.168.195.129:5050). Ảnh Owner ngày 23/10/2026 cho thấy giao diện, database `chi_tieu` và schema `public` mở được; ảnh Docker cùng ngày cho thấy container `Up` và mapping IP. Agent chưa kiểm tra trực tiếp. Đăng nhập bằng `PGADMIN_DEFAULT_EMAIL` và `PGADMIN_DEFAULT_PASSWORD`; đăng ký server với host `db`, port `5432`, database `DB_NAME`, username `DB_USER` và password `DB_PASSWORD`. Tài khoản pgAdmin và PostgreSQL riêng biệt; ảnh giao diện chỉ chứng minh trạng thái tại thời điểm chụp, không phải kiểm thử đầy đủ.
- Prometheus publish `192.168.195.129:9091:9090` và nối vào `edge` để truy cập giao diện/API, đồng thời vẫn nối vào network `metrics` có `internal: true` để scrape các endpoint metrics. PostgreSQL và PostgreSQL Exporter không publish port ra host; network `data` của database không đổi. pgAdmin kết nối DB qua `data`; PostgreSQL Exporter kết nối DB qua `data` và Prometheus scrape exporter qua `metrics`.
- Dịch vụ `postgres-exporter-init` dùng `DB_USER`/`DB_PASSWORD` để tạo hoặc cập nhật role riêng `POSTGRES_EXPORTER_USER`, đặt role không phải superuser và chỉ cấp `CONNECT` trên database cấu hình cùng role dựng sẵn `pg_monitor`. Dịch vụ chỉ thay đổi metadata role/quyền, không chạy migration và không sửa bảng hoặc dữ liệu. Exporter chỉ nhận credential riêng `POSTGRES_EXPORTER_USER`/`POSTGRES_EXPORTER_PASSWORD`; người có quyền `docker inspect` vẫn có thể xem environment container, nên đây là cấu hình demo. Nếu role metrics này đã tồn tại, mật khẩu sẽ được đặt lại theo `.env` mỗi lần init chạy; không dùng tên role đó cho tài khoản khác.
- Promtail đọc log `json-file` của Docker qua Docker API socket, chỉ nhận các service `app`, `nginx`, `db` thuộc project được đặt trong `PROMTAIL_COMPOSE_PROJECT`, rồi gửi tới Loki qua network `logs`. Mặc định project là `chi-tieu-ca-nhan`; các nhãn cấu hình là `job`, `compose_service` và `level` (chỉ log app); không gắn nội dung log, request ID, container ID hay đường dẫn động làm nhãn. Grafana truy vấn Loki qua datasource provisioned.

### Truy cập các giao diện bằng IP VM

Compose publish Nginx, Grafana và pgAdmin trực tiếp trên `VM_HOST_IP`; Prometheus được publish riêng trên `192.168.195.129:9091`. Các cổng giao diện không bind vào loopback. Máy truy cập phải có route tới VM; firewall hiện có cũng phải cho phép các cổng cần dùng. Tác vụ cập nhật này không thay đổi firewall của máy chủ. PostgreSQL vẫn chỉ nằm trong mạng Docker và không được publish ra host.

Các URL `192.168.195.129` ở trên là địa chỉ VM đã được cung cấp cho dự án. Owner báo cấu hình IP mới và chứng chỉ self-signed có SAN IP đã được áp dụng/kiểm tra trên VM; Agent chưa tự kiểm tra runtime. Nếu IP VM thay đổi, cập nhật `VM_HOST_IP` trong `.env` hiện có, `server_name` trong `infra/nginx/default.conf`, rồi chạy quy trình tạo chứng chỉ có SAN chứa IP mới sau khi sao lưu/kiểm tra chứng chỉ hiện tại. Chứng chỉ self-signed không được mặc định tin cậy bởi CA.

Compose file vẫn giữ `name: chi-tieu-ca-nhan` cho demo local. Trên VM, luôn giữ project `expense-tracker-demo` bằng cờ `--project-name` để bảo toàn prefix volume; không đổi `name:` trong nguồn, không thay toàn bộ `.env`, không chạy `down -v`. Thay đổi bind IP/port tự nó không yêu cầu xóa dữ liệu; container liên quan có thể được tạo lại. PostgreSQL, Grafana và pgAdmin dùng named volumes; dữ liệu phụ thuộc việc tiếp tục dùng đúng Compose project identity và volume mappings. `cert-init` có thể thay file chứng chỉ trong volume `nginx_certs` khi SAN không khớp, nhưng không sửa volume dữ liệu PostgreSQL/Grafana/pgAdmin.

Docker socket bind mount `:ro` không giới hạn các lệnh API mà client có thể gửi tới daemon; người có quyền truy cập socket có quyền rất nhạy cảm trên Docker host. Chỉ dùng cấu hình demo trên máy tin cậy. Docker Desktop trên Windows dùng Linux containers; khả năng bind `/var/run/docker.sock` phụ thuộc cấu hình Docker Desktop và cần xác nhận runtime tại máy chạy.

Grafana và Promtail phụ thuộc service Loki được start, không phụ thuộc healthcheck Loki. Loki image không có `/bin/sh`; readiness phải được kiểm tra bằng container curl trên network `logs` như hướng dẫn Ubuntu VM ở trên.

Nginx chỉ proxy chính xác `/health/ready` khi client là loopback `127.0.0.1` để phục vụ healthcheck container; các đường dẫn `/health/` khác và `/metrics` tiếp tục bị chặn.

`postgres-exporter-init` cần quyền quản trị DB `DB_USER`/`DB_PASSWORD` và nhận các giá trị này qua environment; người có quyền `docker inspect` có thể xem environment container. Exporter riêng chỉ nhận credential role metrics. Cấu hình này phục vụ demo; production nên dùng secret file/secret manager và quy trình quản lý role phù hợp.

### Truy vấn log trong Grafana Explore

Ảnh chụp Grafana Explore do Owner cung cấp trong báo cáo Word ghi nhận ba truy vấn dưới đây trả về log tại thời điểm chụp ngày 21/10/2026. Đây là bằng chứng tại thời điểm chụp, không phải kết quả agent chạy lại trong lượt cập nhật này và không bảo đảm log còn hiện diện ở thời điểm hiện tại. Label `compose_service` và `level` khớp cấu hình Promtail. Chi tiết trạng thái và giới hạn kiểm chứng nằm trong [báo cáo triển khai](docs/bao-cao-trien-khai.md).

```logql
# 1. Log ứng dụng; ảnh Explore Owner cung cấp hiển thị 88 dòng tại thời điểm chụp
{compose_service="app"}

# 2. Log truy cập Nginx; ảnh Explore Owner cung cấp hiển thị 135 dòng tại thời điểm chụp
{compose_service="nginx"}

# 3. Log readiness của ứng dụng; ảnh Explore Owner cung cấp hiển thị các dòng GET /health/ready có status 200
{compose_service="app", level="info"} |= "health/ready"
```

Các truy vấn lọc riêng HTTP 5xx, lỗi ứng dụng theo `level="error"` và thống kê tổng hợp theo service chưa có ảnh/kết quả nghiệm thu; không coi chúng là đã kiểm chứng.

Các cổng giao diện trong Compose được bind cụ thể vào `VM_HOST_IP`, không dùng `0.0.0.0`; máy có route tới IP đó có thể kết nối nếu firewall cho phép. Owner báo đã tạo quy tắc iptables giới hạn Grafana `3001` và pgAdmin `5050` cho máy Windows trong mạng VMware; Agent chưa xem quy tắc hoặc kiểm tra từ máy client. Không mở các giao diện demo ra Internet công cộng. PostgreSQL và cổng monitoring nội bộ không được publish ra host.

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
- **Không truy cập được bằng IP VM:** xác nhận `VM_HOST_IP` đúng và đang được gán trên máy chạy Docker, cổng `NGINX_HTTP_PORT`, `8443`, `3001`, `5050` không bị chiếm, client có route tới VM và firewall hiện có cho phép kết nối. Trên VM hiện tại, HTTP dùng `8081`.
- **Trình duyệt báo chứng chỉ không tin cậy:** hành vi dự kiến với self-signed local. Không dùng cấu hình này cho dịch vụ Internet.
- **App unhealthy hoặc không nối được DB:** xem `docker compose ... logs db app`; kiểm tra `DB_*` thống nhất và đợi healthcheck PostgreSQL hoàn tất.
- **Grafana không có datasource/dashboard:** xem log Grafana/Prometheus/Loki; kiểm tra file provisioning được mount từ `infra/grafana/`.
- **Grafana không có PostgreSQL metrics:** xem `docker compose ... logs postgres-exporter-init postgres-exporter prometheus`; trong Grafana Explore hoặc Prometheus tại [http://192.168.195.129:9091](http://192.168.195.129:9091) chọn datasource Prometheus rồi chạy `up{job="postgres"}`, `pg_up` và `pg_stat_database_xact_commit`. `up` kiểm tra khả năng scrape endpoint; `pg_up` kiểm tra kết nối exporter tới PostgreSQL. Các biểu thức này cần được diễn giải riêng.
- **Không đăng nhập được pgAdmin:** dùng `PGADMIN_DEFAULT_EMAIL`/`PGADMIN_DEFAULT_PASSWORD` cho giao diện; sau đó kiểm tra riêng `DB_NAME`/`DB_USER`/`DB_PASSWORD` khi đăng ký kết nối tới host `db`.
- **Không thấy CPU/RAM/Network container:** cAdvisor cần quyền đọc thông tin host và được chạy privileged cùng mount hệ thống. Docker Desktop trên Windows/macOS có thể cung cấp ít thông tin host hơn Linux; kiểm tra target `containers` tại dashboard/Prometheus.
- **Promtail không gửi log:** xem log Loki/Promtail; kiểm tra Loki `/ready` bằng container curl trên network `logs`, socket `/var/run/docker.sock` được mount, các container dùng `json-file` hoặc `journald`, `PROMTAIL_COMPOSE_PROJECT` khớp project name Compose, và Explore đang lọc `job="docker"` cùng `compose_service`. Trên VM network là `expense-tracker-demo_logs`.

## Kiểm thử và tình trạng hiện tại

Trong lần kiểm tra cục bộ ngày 23/10/2026, `npm.cmd run lint` kết thúc mã 0. Lần `npm.cmd test` trong sandbox bị `EACCES` khi test HTTP kết nối loopback; khi chạy lại với quyền mạng loopback cục bộ, cả 2 test đạt (exit 0). Test dùng PostgreSQL pool giả; chúng không chứng minh hai tài khoản được cô lập trên PostgreSQL thật hoặc thao tác CRUD thành công trên dữ liệu thật. PyYAML parse 6 file YAML và JSON parser parse 1 file JSON; Docker CLI và Nginx CLI không có trong PATH Windows, nên chưa chạy `docker compose config` hoặc `nginx -t` cục bộ.

Snapshot loopback do Owner cung cấp là bằng chứng lịch sử. Ảnh Owner ngày 23/10/2026 cho thấy Docker mapping Nginx `8081/8443`, Grafana `3001`, pgAdmin `5050` vào `192.168.195.129`; app, DB, Nginx, Grafana, Promtail và cAdvisor hiển thị `Up (healthy)`, các container khác trong ảnh `Up`. Ảnh curl cho thấy HTTPS `200` với `-k` và HTTP `308`; ảnh Grafana có dữ liệu ở các panel; ảnh pgAdmin mở database `chi_tieu`. Owner báo `config --quiet`, `nginx -t`, `cert-init` và kiểm tra SAN đạt, cùng rule iptables giới hạn Grafana/pgAdmin cho máy Windows. Agent chưa kiểm tra độc lập hoặc đối chiếu checksum vì SSH Agent trả `Permission denied`; firewall, volume mount, CA trust và trạng thái sau thời điểm chụp vẫn chưa xác minh.

Trong snapshot loopback cũ do Owner cung cấp, HTTP qua Nginx trả 308 và HTTPS trả HTTP/2 200 khi dùng `curl -k`; một số security header bị lặp. Snapshot đó cũng ghi Grafana `/api/health` HTTP 200 trên loopback. Sau đó Owner báo đã chuyển Nginx/Grafana/pgAdmin sang bind IP VM, đã tạo chứng chỉ self-signed có IP SAN và Nginx/Grafana chạy healthy; các thông tin mới chưa được Agent kiểm tra lại. `curl -k` ở bằng chứng cũ bỏ qua xác thực CA; chứng chỉ mới có SAN IP theo Owner nhưng chưa chứng minh được CA trust. Kết quả cuối của pgAdmin chưa xác minh sau khi sửa nhầm IP.

Ảnh dashboard Owner cung cấp có dữ liệu request rate, HTTP p95 latency, scrape targets, CPU, RAM, logs và các panel PostgreSQL; ảnh chỉ chứng minh dữ liệu có trên màn hình tại thời điểm chụp. Loki `/ready` từng trả 503, sau đó Owner báo HTTP 200/body `ready`; ba ảnh Explore cho thấy truy vấn app/Nginx/readiness trả dữ liệu tại thời điểm chụp. Owner báo PostgreSQL Exporter có `pg_up=1` và Prometheus target `postgres` trả `1`. Ảnh pgAdmin hiển thị schema/bảng tại thời điểm chụp trước sự cố IP, không chứng minh pgAdmin hoạt động ở runtime cuối.

Owner cũng xác nhận ứng dụng có tổng thu `100.000đ`, tổng chi `20.000đ`, số dư `80.000đ`; đã thêm và sửa giao dịch, tải lại trang và đăng xuất/đăng nhập lại mà dữ liệu vẫn còn. Khi sửa khoản chi thành `30.000đ`, tổng chi/số dư đổi thành `30.000đ`/`70.000đ`; sửa lại `20.000đ` thì số liệu trở về `20.000đ`/`80.000đ`.

Các kết quả runtime và ảnh trên do Owner cung cấp, không phải kiểm tra Agent chạy trong lượt này. Truy cập Internet công cộng, chứng chỉ CA tin cậy, truy vấn LogQL cho HTTP 5xx/lỗi app/thống kê tổng hợp, kiểm chứng độc lập biểu thức và giá trị query PostgreSQL, trạng thái cuối pgAdmin, thao tác xóa giao dịch/danh mục, cô lập dữ liệu giữa nhiều tài khoản và tích hợp test tự động với PostgreSQL thật vẫn cần kiểm chứng; xem chi tiết trong `docs/bao-cao-trien-khai.md`. Không có ảnh hoặc kết quả runtime nào được giả lập.
