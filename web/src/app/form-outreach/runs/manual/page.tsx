// web/src/app/form-outreach/runs/manual/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { useRouter } from "next/navigation";

const TENANT_ID = "175b1a9d-3f85-482d-9323-68a44d214424";

type Prospect = {
  id: string;
  tenant_id: string | null;
  company_name: string | null;
  website: string | null;
  contact_form_url: string | null;
  contact_email: string | null;
  industry: string | null;
  company_size: string | null;
  job_site_source: string | null;
  status: string | null;
  created_at: string | null;
};

type TemplateRow = {
  id: string;
  name: string | null;
  subject: string | null;
  channel: string | null;
  created_at: string | null;
};

export default function ManualRuns() {
  const router = useRouter();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [msg, setMsg] = useState("");

  // フィルタ
  const [q, setQ] = useState("");
  const [industry, setIndustry] = useState<string>("");
  const [size, setSize] = useState<string>("");
  const [channel, setChannel] = useState<"all" | "form" | "email" | "both">(
    "all"
  );
  const [showSent, setShowSent] = useState(false);

  // テンプレ選択
  const [showTplModal, setShowTplModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setMsg("");
      try {
        const [rp, rt] = await Promise.all([
          fetch("/api/form-outreach/prospects", {
            headers: { "x-tenant-id": TENANT_ID },
            cache: "no-store",
          }),
          fetch("/api/form-outreach/templates", {
            headers: { "x-tenant-id": TENANT_ID },
            cache: "no-store",
          }),
        ]);
        const jp = await rp.json();
        const jt = await rt.json();
        if (!rp.ok) throw new Error(jp?.error || "prospects fetch failed");
        if (!rt.ok) throw new Error(jt?.error || "templates fetch failed");
        setProspects(jp.rows ?? []);
        setTemplates(jt.rows ?? []);
      } catch (e: any) {
        setMsg(String(e?.message || e));
        setProspects([]);
        setTemplates([]);
      }
    };
    load();
  }, []);

  const industryOptions = useMemo(() => {
    const s = new Set(
      prospects
        .map((p) => (p.industry || "").trim())
        .filter((v) => v && v.length > 0)
    );
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [prospects]);

  const sizeOptions = useMemo(() => {
    const s = new Set(
      prospects
        .map((p) => (p.company_size || "").trim())
        .filter((v) => v && v.length > 0)
    );
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [prospects]);

  const channelOf = (p: Prospect): "form" | "email" | "both" | "-" => {
    const hasForm = !!(p.contact_form_url || "").trim();
    const hasMail = !!(p.contact_email || "").trim();
    if (hasForm && hasMail) return "both";
    if (hasForm) return "form";
    if (hasMail) return "email";
    return "-";
  };

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return prospects.filter((p) => {
      if (qq) {
        const hit =
          (p.company_name || "").toLowerCase().includes(qq) ||
          (p.website || "").toLowerCase().includes(qq) ||
          (p.contact_email || "").toLowerCase().includes(qq);
        if (!hit) return false;
      }
      if (industry && (p.industry || "") !== industry) return false;
      if (size && (p.company_size || "") !== size) return false;

      const ch = channelOf(p);
      if (channel !== "all") {
        if (channel === "both" && ch !== "both") return false;
        if (channel === "form" && ch !== "form") return false;
        if (channel === "email" && ch !== "email") return false;
      }

      const sent = (p.status || "").toLowerCase().includes("sent");
      if (!showSent) {
        if (sent) return false;
      } else {
        if (!sent) return false;
      }
      return true;
    });
  }, [prospects, q, industry, size, channel, showSent]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allChecked =
    filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const handleExecute = async () => {
    setMsg("");
    if (selected.size === 0) return setMsg("対象の企業を選択してください。");
    if (!selectedTemplateId) return setMsg("テンプレートを選択してください。");
    setExecuting(true);
    try {
      let r = await fetch("/api/form-outreach/runs/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": TENANT_ID,
        },
        body: JSON.stringify({
          tenant_id: TENANT_ID,
          template_id: selectedTemplateId,
          prospect_ids: Array.from(selected),
          trigger: "manual",
        }),
      });
      if (r.status === 404) {
        r = await fetch("/api/form-outreach/runs", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-tenant-id": TENANT_ID,
          },
          body: JSON.stringify({
            tenant_id: TENANT_ID,
            flow: "manual-send",
            status: "queued",
            started_at: new Date().toISOString(),
            payload: {
              template_id: selectedTemplateId,
              prospect_ids: Array.from(selected),
            },
          }),
        });
      }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "execute failed");
      // 送信ログへ
      router.push("/form-outreach/schedules");
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setExecuting(false);
    }
  };

  return (
    <>
      <AppHeader showBack />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              メッセージ手動送信
            </h1>
            <p className="text-sm text-neutral-500">
              テンプレはモーダルで選択。業種/規模はプルダウン。実行後は送信ログへ遷移。
            </p>
          </div>
          <Link
            href="/form-outreach/templates"
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            テンプレート管理へ
          </Link>
        </div>

        {/* フィルタ */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <div className="mb-1 text-xs text-neutral-600">キーワード</div>
              <input
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                placeholder="社名・URL・メール"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-600">業種</div>
              <select
                className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              >
                <option value="">（指定なし）</option>
                {industryOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-600">企業規模</div>
              <select
                className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              >
                <option value="">（指定なし）</option>
                {sizeOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-600">チャンネル</div>
              <select
                className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                value={channel}
                onChange={(e) => setChannel(e.target.value as any)}
              >
                <option value="all">すべて</option>
                <option value="form">フォームのみ</option>
                <option value="email">メールのみ</option>
                <option value="both">両方可能</option>
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs text-neutral-600">表示対象</div>
              <select
                className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                value={showSent ? "sent" : "unsent"}
                onChange={(e) => setShowSent(e.target.value === "sent")}
              >
                <option value="unsent">未送信のみ</option>
                <option value="sent">送信済みのみ</option>
              </select>
            </div>
          </div>
        </section>

        {/* ▼ テンプレ選択（フィルタと実行の間に配置） */}
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => setShowTplModal(true)}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            テンプレートを選択
          </button>

          {/* 実行＆バッジ */}
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm">
              選択件数: {selected.size}
            </span>
            <span className="inline-flex items-center rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-800 shadow-sm">
              テンプレ:
              <span className="ml-1">
                {templates.find((t) => t.id === selectedTemplateId)?.name ||
                  "未選択"}
              </span>
            </span>
            <button
              onClick={handleExecute}
              disabled={executing}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
              title="選択企業に対して実行"
            >
              {executing ? "実行中…" : "実行"}
            </button>
          </div>
        </div>

        {/* 表（チャンネル列・送信状態は文字） */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden">
          <table className="min-w-[1000px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-3 text-left">社名</th>
                <th className="px-3 py-3 text-left">サイトURL</th>
                <th className="px-3 py-3 text-left">メール</th>
                <th className="px-3 py-3 text-left">業種</th>
                <th className="px-3 py-3 text-left">企業規模</th>
                <th className="px-3 py-3 text-left">チャンネル</th>
                <th className="px-3 py-3 text-left">送信状態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {filtered.map((p) => {
                const sent = (p.status || "").toLowerCase().includes("sent");
                const ch = channelOf(p);
                const chLabel =
                  ch === "both"
                    ? "両方"
                    : ch === "form"
                    ? "フォーム"
                    : ch === "email"
                    ? "メール"
                    : "-";
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                      />
                    </td>
                    <td className="px-3 py-2">{p.company_name || "-"}</td>
                    <td className="px-3 py-2">
                      {p.website ? (
                        <a
                          href={p.website}
                          target="_blank"
                          className="text-indigo-700 hover:underline break-all"
                        >
                          {p.website}
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2">{p.contact_email || "-"}</td>
                    <td className="px-3 py-2">{p.industry || "-"}</td>
                    <td className="px-3 py-2">{p.company_size || "-"}</td>
                    <td className="px-3 py-2">{chLabel}</td>
                    <td className="px-3 py-2">
                      {sent ? "送信済み" : "未送信"}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-neutral-400"
                  >
                    対象がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {msg && (
          <pre className="mt-3 whitespace-pre-wrap text-xs text-red-600">
            {msg}
          </pre>
        )}
      </main>

      {/* ▼ テンプレ選択モーダル */}
      {showTplModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setShowTplModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-base font-semibold text-neutral-800">
                テンプレートを選択
              </div>
              <button
                onClick={() => setShowTplModal(false)}
                className="rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
              >
                閉じる
              </button>
            </div>

            <div className="max-h-80 overflow-auto rounded-xl border border-neutral-200">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-600">
                  <tr>
                    <th className="px-3 py-2 text-left">名前</th>
                    <th className="px-3 py-2 text-left">チャンネル</th>
                    <th className="px-3 py-2 text-left">件名</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {templates.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2">{t.name || "-"}</td>
                      <td className="px-3 py-2">{t.channel || "-"}</td>
                      <td className="px-3 py-2 truncate max-w-[220px]">
                        {t.subject || "-"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => {
                            setSelectedTemplateId(t.id);
                            setShowTplModal(false);
                          }}
                          className="rounded-lg border border-neutral-200 px-3 py-1 text-xs hover:bg-neutral-50"
                        >
                          選択
                        </button>
                      </td>
                    </tr>
                  ))}
                  {templates.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-10 text-center text-neutral-400"
                      >
                        テンプレートがありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-xs text-neutral-600">
              現在の選択：
              <span className="ml-1 font-medium">
                {templates.find((t) => t.id === selectedTemplateId)?.name ||
                  "未選択"}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
