// web/src/app/mails/page.tsx
import Link from "next/link";

async function load() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/mails`,
    { cache: "no-store" }
  );
  const j = await res.json();
  return j?.rows ?? [];
}

export default async function MailsListPage() {
  const rows = await load();
  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">メール一覧</h1>
        <Link
          href="/mails/new"
          className="rounded-xl border px-4 py-2 hover:bg-neutral-50"
        >
          新規メール
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-3 py-3 text-left">名前</th>
              <th className="px-3 py-3 text-left">件名</th>
              <th className="px-3 py-3 text-center">ステータス</th>
              <th className="px-3 py-3 text-left">作成日</th>
              <th className="px-3 py-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-3">{r.name}</td>
                <td className="px-3 py-3">{r.subject}</td>
                <td className="px-3 py-3 text-center">{r.status}</td>
                <td className="px-3 py-3">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-3 text-center">
                  <Link
                    href={`/mails/${r.id}`}
                    className="rounded border px-2 py-1 hover:bg-neutral-50"
                  >
                    詳細
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-neutral-400"
                >
                  メールはありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
