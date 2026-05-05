// =====================================================
//  daily ENGLISH — Cloudflare Worker (Claude 프록시)
//  https://workers.cloudflare.com 에 붙여넣기 하세요
// =====================================================

const CLAUDE_API = "https://api.anthropic.com/v1/messages";

// ✅ 여기에 Anthropic API 키를 입력하세요
const ANTHROPIC_KEY = "여기에_sk-ant-로_시작하는_키_입력";

// ✅ 여기에 GitHub Pages 주소를 입력하세요 (보안용)
const ALLOWED_ORIGIN = "https://yoong-kim.github.io";

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Only allow POST from your GitHub Pages
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const body = await request.json();

      const res = await fetch(CLAUDE_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        },
      });
    }
  },
};
