// web/src/app/form-outreach/runs/manual/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

/** ▼ データセット（企業一覧ページと同じ3種） */
type Dataset = "prospects" | "rejected" | "similar";
const PAGE_SIZE = 10;

type ProsRow = {
  id: string;
  tenant_id: string | null;
  company_name: string | null;
  website: string | null;
  contact_form_url: string | null;
  contact_email: string | null;
  industry: string | null;
  company_size: string | null;
  job_site_source: string | null;
  status?: string | null;
  created_at: string | null;
};

type RejRow = {
  id: string;
  tenant_id: string | null;
  corporate_number: string | null;
  company_name: string | null;
  website: string | null;
  contact_email: string | null;
  phone: string | null;
  contact_form_url: string | null;
  industry_large: string | null;
  industry_small: string | null;
  company_size: string | null;
  company_size_extracted: string | null;
  created_at: string | null;
  source_site: string | null;
  status?: string | null; // 任意
};

type SimRow = {
  id: string;
  tenant_id: string | null;
  target_company_name: string | null;
  found_company_name: string | null;
  found_website: string | null;
  source_site: string | null;
  matched_addr: boolean | null;
  matched_company_ratio: number | null;
  contact_form_url: string | null;
  contact_email: string | null;
  created_at: string | null;
  status?: string | null; // 任意
};

type AnyRow = ProsRow | RejRow | SimRow;

type TemplateRow = {
  id: string;
  name: string | null;
  subject: string | null;
  channel: string | null; // "email" | "form" | "both" | null
  created_at: string | null;
};

function ellipsize(u?: string | null, max = 54) {
  const s = u || "";
  if (s.length <= max) return s;
  const head = Math.max(0, Math.floor((max - 1) * 0.65));
  const tail = Math.max(0, max - 1 - head);
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function nowrap18Class(s: string, limit = 18) {
  const len = (s ?? "").length;
  return len <= limit ? "whitespace-nowrap" : "whitespace-normal break-words";
}

const tabLabel = (id: Dataset) =>
  id === "prospects"
    ? "正規企業リスト"
    : id === "rejected"
    ? "不備企業リスト"
    : "近似サイトリスト";

const mapDatasetToTable = (d: Dataset) =>
  d === "prospects"
    ? "form_prospects"
    : d === "rejected"
    ? "form_prospects_rejected"
    : "form_similar_sites";

export default function ManualRuns() {
  const router = useRouter();

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [dataset, setDataset] = useState<Dataset>("prospects");

  // テーブル＆テンプレ
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // ページング
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // フィルタ（軽め：サーバ側に渡すのは q / email/form / 日付くらい）
  const [q, setQ] = useState("");
  const [emailFilter, setEmailFilter] = useState<"" | "has" | "none">("");
  const [formFilter, setFormFilter] = useState<"" | "has" | "none">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // 並び替え（企業一覧に揃える）
  const [sortKey, setSortKey] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // テンプレ選択
  const [showTplModal, setShowTplModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  // 一括選択
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allChecked =
    rows.length > 0 && rows.every((r) => selected.has((r as any).id));

  // 不明項目のプレースホルダ（UIから変更可）
  const [unknownPlaceholder, setUnknownPlaceholder] =
    useState("メッセージをご確認ください");

  // 送信実行フラグ
  const [executing, setExecuting] = useState(false);

  // ▼ テナント取得（/api/me/tenant を踏襲）
  useEffect(() => {
    (async () => {
      try {
        let meRes = await fetch("/api/me/tenant", { cache: "no-store" });
        if (!meRes.ok)
          meRes = await fetch("/api/me/tenant/", { cache: "no-store" });
        const me = await meRes.json().catch(() => ({}));
        const tId = me?.tenant_id ?? me?.profile?.tenant_id ?? null;
        setTenantId(tId);
      } catch {
        setTenantId(null);
      }
    })();
  }, []);

  // ▼ テンプレ取得
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/form-outreach/templates", {
          headers: tenantId ? { "x-tenant-id": String(tenantId) } : undefined,
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "templates fetch failed");
        setTemplates(j.rows ?? []);
      } catch (e: any) {
        setTemplates([]);
        setMsg(String(e?.message || e));
      }
    })();
  }, [tenantId]);

  // ▼ データ読込（企業一覧APIを再利用）
  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    setMsg("");
    try {
      const qs = new URLSearchParams();
      qs.set("table", mapDatasetToTable(dataset)); // ← 実テーブル名を明示
      qs.set("limit", String(PAGE_SIZE));
      qs.set("page", String(page));
      qs.set("sort", sortKey);
      qs.set("dir", sortDir);
      if (q.trim()) qs.set("q", q.trim());
      if (emailFilter) qs.set("email", emailFilter);
      if (formFilter) qs.set("form", formFilter);
      if (dateFrom) qs.set("date_from", dateFrom);
      if (dateTo) qs.set("date_to", dateTo);

      const r = await fetch(`/api/form-outreach/companies?${qs.toString()}`, {
        headers: { "x-tenant-id": String(tenantId) },
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      setRows(j.rows ?? []);
      setTotal(j.total ?? 0);
      // ページ跨ぎ選択の整合を一応クリーニング
      setSelected(
        (prev) =>
          new Set(
            Array.from(prev).filter((id) =>
              (j.rows ?? []).some((x: any) => x.id === id)
            )
          )
      );
    } catch (e: any) {
      setRows([]);
      setTotal(0);
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, dataset, page, sortKey, sortDir, emailFilter, formFilter]);

  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map((r: any) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  // チャンネル判定（行→ form / email / both / -）
  const channelOf = (r: AnyRow): "form" | "email" | "both" | "-" => {
    const hasForm = !!((r as any).contact_form_url || "").trim();
    const hasMail = !!((r as any).contact_email || "").trim();
    if (hasForm && hasMail) return "both";
    if (hasForm) return "form";
    if (hasMail) return "email";
    return "-";
  };

  // 並び替えUI（企業一覧と同じアイコン遷移）
  const sortIcon = (key: string, activeKey: string, dir: "asc" | "desc") => {
    if (activeKey !== key)
      return <ArrowUpDown className="h-3.5 w-3.5 text-neutral-600/70" />;
    return dir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-neutral-600" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-neutral-600" />
    );
  };

  const companyNameOf = (r: AnyRow) =>
    (r as any).company_name ||
    (r as SimRow).target_company_name ||
    (r as SimRow).found_company_name ||
    "-";

  const websiteOf = (r: AnyRow) =>
    (r as ProsRow).website || (r as SimRow).found_website || "";

  const industryOf = (r: AnyRow) =>
    (r as ProsRow).industry ||
    (r as RejRow).industry_large ||
    (r as RejRow).industry_small ||
    "";

  const sizeOf = (r: AnyRow) =>
    (r as ProsRow).company_size ||
    (r as RejRow).company_size ||
    (r as RejRow).company_size_extracted ||
    "";

  // 実行（メール or フォーム：サーバ側でAI入力＆送信、reCAPTCHA等は待機リストに）
  const handleExecute = async () => {
    setMsg("");
    if (selected.size === 0) return setMsg("対象の企業を選択してください。");
    if (!selectedTemplateId) return setMsg("テンプレートを選択してください。");

    setExecuting(true);
    try {
      const payload = {
        tenant_id: tenantId,
        table: mapDatasetToTable(dataset),
        template_id: selectedTemplateId,
        prospect_ids: Array.from(selected),
        unknown_placeholder: unknownPlaceholder,
        trigger: "manual",
      };

      // 推奨API（無ければ後述のサンプルroute.tsを設置）
      let r = await fetch("/api/form-outreach/manual/send", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": String(tenantId),
        },
        body: JSON.stringify(payload),
      });

      // フォールバック：存在しない環境では queue ログだけでも残す
      if (r.status === 404) {
        r = await fetch("/api/form-outreach/runs", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-tenant-id": String(tenantId),
          },
          body: JSON.stringify({
            tenant_id: tenantId,
            flow: "manual-send",
            status: "queued",
            started_at: new Date().toISOString(),
            payload,
          }),
        });
      }

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "execute failed");

      // 失敗分が返ってきたら待機リストへ（サーバ側で追加済みなら何もしない）
      if (Array.isArray(j.failed) && j.failed.length > 0) {
        await fetch("/api/form-outreach/waitlist", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-tenant-id": String(tenantId),
          },
          body: JSON.stringify({
            tenant_id: tenantId,
            table: mapDatasetToTable(dataset),
            items: j.failed.map((f: any) => ({
              prospect_id: f.id,
              reason: f.reason || "send_failed",
            })),
          }),
        }).catch(() => {});
      }

      // 成功したらスケジュール/ログへ
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
      <main className="mx-auto max-w-7xl p-6">
        {/* タイトル + 待機リストへの導線 */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              メッセージ手動送信
            </h1>
            <p className="text-sm text-neutral-500">
              3テーブル切替 / 10件ページング /
              企業一覧のテーブルUI準拠。テンプレ選択→メール/フォーム自動送信。失敗やreCAPTCHAは待機リストへ。
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              テナント: <span className="font-mono">{tenantId ?? "-"}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/form-outreach/waitlist"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              待機リストを見る
            </Link>
            <Link
              href="/form-outreach/templates"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              テンプレート管理へ
            </Link>
          </div>
        </div>

        {/* タブ（データセット切替） */}
        <div className="mb-3 inline-flex rounded-lg border border-neutral-200 overflow-hidden">
          {(["prospects", "rejected", "similar"] as Dataset[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setDataset(t);
                setPage(1);
                setSelected(new Set());
              }}
              className={`px-3 py-2 text-sm border-r border-neutral-200 last:border-r-0 ${
                dataset === t
                  ? "bg-neutral-100 font-medium"
                  : "bg-white hover:bg-neutral-50"
              }`}
            >
              {tabLabel(t)}
            </button>
          ))}
        </div>

        {/* フィルタ（企業一覧準拠・必要最小限） */}
        <section className="rounded-2xl border border-neutral-200 p-4 mb-3 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs text-neutral-500 mb-1">
                キーワード
              </label>
              <input
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                placeholder="社名 / URL / メール"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">
                メール
              </label>
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={emailFilter}
                onChange={(e) => setEmailFilter(e.target.value as any)}
              >
                <option value="">すべて</option>
                <option value="has">あり</option>
                <option value="none">なし</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">
                フォーム
              </label>
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={formFilter}
                onChange={(e) => setFormFilter(e.target.value as any)}
              >
                <option value="">すべて</option>
                <option value="has">あり</option>
                <option value="none">なし</option>
              </select>
            </div>
            <div className="md:col-span-1">
              <label className="block text-xs text-neutral-500 mb-1">
                不明項目の置換文字
              </label>
              <input
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={unknownPlaceholder}
                onChange={(e) => setUnknownPlaceholder(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-500 mb-1">
                作成日（from）
              </label>
              <input
                type="date"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">
                作成日（to）
              </label>
              <input
                type="date"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            <div className="md:col-span-3 flex items-end gap-2">
              <button
                onClick={() => {
                  setPage(1);
                  load();
                }}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
              >
                フィルタを適用
              </button>
              <button
                onClick={() => {
                  setQ("");
                  setEmailFilter("");
                  setFormFilter("");
                  setDateFrom("");
                  setDateTo("");
                  setPage(1);
                  load();
                }}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
              >
                リセット
              </button>
            </div>
          </div>
        </section>

        {/* テンプレ選択＆実行 */}
        <div className="mb-3 flex items-center gap-3">
          <button
            onClick={() => setShowTplModal(true)}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50"
          >
            テンプレートを選択
          </button>
          <span className="inline-flex items-center rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700">
            {selectedTemplate?.name || "未選択"}
          </span>

          <button
            onClick={handleExecute}
            disabled={executing || selected.size === 0 || !selectedTemplateId}
            className="ml-auto rounded-lg border border-neutral-200 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {executing ? "実行中…" : "実行"}
          </button>
          <div className="text-sm text-neutral-700">
            選択件数:{" "}
            <span className="font-semibold text-neutral-900">
              {selected.size}
            </span>
          </div>
        </div>

        {/* ▼ テーブル（企業一覧ページ準拠の見た目） */}
        <section className="rounded-2xl border border-neutral-200 overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-3 py-3 text-left">
                    <button
                      className="inline-flex items-center gap-1 hover:underline"
                      onClick={() => {
                        if (sortKey === "company_name")
                          setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                        else {
                          setSortKey("company_name");
                          setSortDir("asc");
                        }
                        setPage(1);
                      }}
                    >
                      社名 {sortIcon("company_name", sortKey, sortDir)}
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left">
                    <button
                      className="inline-flex items-center gap-1 hover:underline"
                      onClick={() => {
                        if (sortKey === "created_at")
                          setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                        else {
                          setSortKey("created_at");
                          setSortDir("desc");
                        }
                        setPage(1);
                      }}
                    >
                      取得日時 {sortIcon("created_at", sortKey, sortDir)}
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left">サイトURL</th>
                  <th className="px-3 py-3 text-left">メール</th>
                  <th className="px-3 py-3 text-left">フォーム</th>
                  <th className="px-3 py-3 text-left">業種</th>
                  <th className="px-3 py-3 text-left">規模</th>
                  <th className="px-3 py-3 text-left">チャンネル</th>
                  <th className="px-3 py-3 text-left">状態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {rows.map((r: AnyRow) => {
                  const id = (r as any).id;
                  const ch = channelOf(r);
                  const chLabel =
                    ch === "both"
                      ? "両方"
                      : ch === "form"
                      ? "フォーム"
                      : ch === "email"
                      ? "メール"
                      : "-";
                  const sent = ((r as any).status || "")
                    .toLowerCase()
                    .includes("sent");

                  const cname = String(companyNameOf(r) || "-");
                  const industry = String(industryOf(r) || "-");
                  const website = websiteOf(r);

                  return (
                    <tr key={id}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          onChange={() => toggleOne(id)}
                          aria-label={`${cname} を選択`}
                        />
                      </td>
                      <td className={`px-3 py-2 ${nowrap18Class(cname)}`}>
                        {cname}
                      </td>
                      <td className="px-3 py-2">
                        {(r as any).created_at || ""
                          ? String((r as any).created_at)
                              .replace("T", " ")
                              .replace("Z", "")
                          : "-"}
                      </td>
                      <td className="px-3 py-2">
                        {website ? (
                          <a
                            href={website}
                            target="_blank"
                            className="text-indigo-700 hover:underline break-all"
                          >
                            {ellipsize(website)}
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {(r as any).contact_email || "-"}
                      </td>
                      <td className="px-3 py-2">
                        {(r as any).contact_form_url ? "あり" : "なし"}
                      </td>
                      <td className={`px-3 py-2 ${nowrap18Class(industry)}`}>
                        {industry || "-"}
                      </td>
                      <td className="px-3 py-2">{sizeOf(r) || "-"}</td>
                      <td className="px-3 py-2">{chLabel}</td>
                      <td className="px-3 py-2">{sent ? "済" : "未"}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-10 text-center text-neutral-400"
                    >
                      対象がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ページネーション（企業一覧と同じ配置） */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
            <div className="text-xs text-neutral-500">
              全 {total} 件 / {page} / {totalPages} ページ（{PAGE_SIZE}
              件/ページ）
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                前へ
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
              >
                次へ
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
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
            className="w-full max-w-3xl rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg"
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
                    <th className="px-3 py-2"></th>
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
              現在の選択：{" "}
              <span className="font-medium">
                {selectedTemplate?.name || "未選択"}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
