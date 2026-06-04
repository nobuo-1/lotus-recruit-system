import FormOutreachFetchRunLogPage from "../_components/FormOutreachFetchRunLogPage";

export const dynamic = "force-dynamic";

export default function OutreachRuns() {
  return (
    <FormOutreachFetchRunLogPage
      title="フォーム情報取得ログ"
      description="自動・手動のフォーム情報取得ログを同じ表で確認できます。"
      pageSize={20}
    />
  );
}
