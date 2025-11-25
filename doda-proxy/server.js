// doda-proxy/server.js
const express = require("express");
const { parseDodaJobsCountInternal } = require("./doda-parser");

const app = express();

// Vercel 側と共有する API キー（環境変数で管理）
const API_KEY = process.env.DODA_PROXY_API_KEY || "";

const COMMON_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
  "accept-language": "ja-JP,ja;q=0.9,en;q=0.8",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  referer: "https://doda.jp/",
};

app.get("/healthz", (req, res) => {
  res.json({ ok: true });
});

/**
 * GET /doda/jobs-count?target=<Dodaの検索URL>
 */
app.get("/doda/jobs-count", async (req, res) => {
  try {
    // 簡易APIキー認証
    if (API_KEY && req.header("x-api-key") !== API_KEY) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const target = req.query.target;
    if (typeof target !== "string" || !target.startsWith("https://doda.jp/")) {
      return res.status(400).json({ ok: false, error: "invalid target" });
    }

    // 15秒でタイムアウト
    const controller = new AbortController();
    const timeoutMs = 15000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const r = await fetch(target, {
        method: "GET",
        headers: COMMON_HEADERS,
        signal: controller.signal,
      });

      const status = r.status;
      const html = await r.text();

      const { count, hint } = parseDodaJobsCountInternal(html);

      return res.json({
        ok: true,
        total: count,
        url: target,
        httpStatus: status,
        parseHint: hint,
      });
    } catch (e) {
      console.error("fetch to doda failed", e);
      return res.status(500).json({
        ok: false,
        error: e.message || String(e),
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.error("doda-proxy error", e);
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// ★ここを修正：0.0.0.0 に明示的にバインドする
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "0.0.0.0";

app.listen(port, host, () => {
  console.log(`Doda proxy listening on http://${host}:${port}`);
});
