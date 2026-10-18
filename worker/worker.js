// Cloudflare Worker — cầu nối rà soát chính tả bằng Workers AI cho app "Rà soát văn bản".
// Trình duyệt không gọi trực tiếp api.cloudflare.com được (không có CORS, và không nên để
// API token trong trình duyệt), nên app gọi Worker này; Worker dùng binding Workers AI (env.AI).
//
// Cấu hình trong Cloudflare:
//   - Binding "Workers AI" đặt tên biến là: AI           (bắt buộc)
//   - Secret  APP_TOKEN                                   (khuyến nghị: chuỗi bí mật tự đặt)
//   - Biến    ALLOWED_ORIGIN                              (tuỳ chọn: danh sách origin, cách nhau bởi dấu phẩy;
//                                                          bỏ trống = cho mọi origin. Mở file từ ổ đĩa có origin "null")

const ALLOWED_MODELS = [
  '@cf/aisingapore/gemma-sea-lion-v4-27b-it',
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/zai-org/glm-4.7-flash',
];
const DEFAULT_MODEL = ALLOWED_MODELS[0];
const MAX_BODY_CHARS = 60000;   // chặn yêu cầu quá lớn
const MAX_OUTPUT_TOKENS = 4096;

function corsHeaders(request, env) {
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin');
  if (allowed.length === 0) h['Access-Control-Allow-Origin'] = '*';
  else if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function reply(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// Mỗi mô hình trả về một dạng khác nhau; chuẩn hoá về chuỗi văn bản.
function extractText(out) {
  if (typeof out === 'string') return out;
  if (!out || typeof out !== 'object') return '';
  if (typeof out.response === 'string') return out.response;
  if (out.response && typeof out.response === 'object') return JSON.stringify(out.response);
  const choice = out.choices && out.choices[0];
  if (choice && choice.message && typeof choice.message.content === 'string') return choice.message.content;
  if (choice && typeof choice.text === 'string') return choice.text;
  return JSON.stringify(out);
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: 'Chỉ hỗ trợ phương thức POST.' }, 405, headers);

    if (env.APP_TOKEN && request.headers.get('X-App-Token') !== env.APP_TOKEN) {
      return reply({ error: 'Mã truy cập (APP_TOKEN) không đúng hoặc còn thiếu.' }, 401, headers);
    }
    if (!env.AI) {
      return reply({ error: 'Worker chưa gắn binding Workers AI (tên biến phải là AI).' }, 500, headers);
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) return reply({ error: 'Yêu cầu quá lớn.' }, 413, headers);

    let payload;
    try { payload = JSON.parse(raw); } catch (e) { return reply({ error: 'Nội dung yêu cầu không phải JSON hợp lệ.' }, 400, headers); }

    const model = payload.model || DEFAULT_MODEL;
    if (!ALLOWED_MODELS.includes(model)) return reply({ error: 'Mô hình không nằm trong danh sách cho phép: ' + model }, 400, headers);

    const messages = Array.isArray(payload.messages)
      ? payload.messages
          .filter(m => m && typeof m.content === 'string' && ['system', 'user', 'assistant'].includes(m.role))
          .map(m => ({ role: m.role, content: m.content }))
      : [];
    if (messages.length === 0) return reply({ error: 'Thiếu trường messages.' }, 400, headers);

    const maxTokens = Math.min(Math.max(parseInt(payload.max_tokens, 10) || 2048, 64), MAX_OUTPUT_TOKENS);

    try {
      const out = await env.AI.run(model, { messages, max_tokens: maxTokens, temperature: 0 });
      return reply({ text: extractText(out), model }, 200, headers);
    } catch (e) {
      const msg = String((e && e.message) || e);
      // 3036: hết hạn mức Neurons miễn phí trong ngày; 3040: hết công suất tạm thời; 5035: mô hình cần gói trả phí.
      const status = /3036|3040|429|capacity|limit/i.test(msg) ? 429 : (/5035|403/.test(msg) ? 403 : 502);
      return reply({ error: msg }, status, headers);
    }
  },
};
