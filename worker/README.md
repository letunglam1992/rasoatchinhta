# Worker rà chính tả bằng Cloudflare Workers AI

Cầu nối nhỏ giữa app `index.html` và Cloudflare Workers AI. Trình duyệt không gọi trực tiếp `api.cloudflare.com` được
(không có CORS, và không nên để API token trong trình duyệt), nên app gọi Worker này; Worker dùng binding `env.AI`.

Mã nguồn cũng được nhúng sẵn trong app (khung "Mã nguồn Worker" khi chọn *Cloudflare Workers AI*) và phải trùng với `worker.js`.

## Triển khai bằng giao diện web
1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Create Worker** → **Deploy** → **Edit code**, dán toàn bộ `worker.js` → **Deploy**.
2. **Settings → Bindings → Add → Workers AI**, tên biến: `AI`.
3. (Khuyến nghị) **Settings → Variables and Secrets**: thêm secret `APP_TOKEN` (chuỗi bí mật tự đặt).
4. Dán URL Worker, mô hình và `APP_TOKEN` vào app, bấm **Lưu cấu hình** → **Kiểm tra kết nối**.

## Triển khai bằng Wrangler
```bash
cd worker
npx wrangler deploy
npx wrangler secret put APP_TOKEN
```

## Biến cấu hình
| Tên | Loại | Ý nghĩa |
|---|---|---|
| `AI` | binding Workers AI | Bắt buộc |
| `APP_TOKEN` | secret | Nếu đặt, app phải gửi header `X-App-Token` khớp; tránh người lạ dùng hết hạn mức |
| `ALLOWED_ORIGIN` | biến | Danh sách origin được phép, cách nhau dấu phẩy (`null` = mở file từ ổ đĩa). Bỏ trống = mọi origin |

## Mô hình cho phép
`@cf/aisingapore/gemma-sea-lion-v4-27b-it` (mặc định), `@cf/google/gemma-4-26b-a4b-it`, `@cf/zai-org/glm-4.7-flash`.
Muốn thêm mô hình: sửa `ALLOWED_MODELS` trong `worker.js` **và** danh sách `<select id="cfModel">` trong `index.html`.

## Hạn mức
Gói Workers Free: 10.000 Neurons/ngày, đặt lại 00:00 UTC. Hết hạn mức Worker trả HTTP 429; app giữ lại kết quả các đoạn đã rà và báo phần chưa rà.
