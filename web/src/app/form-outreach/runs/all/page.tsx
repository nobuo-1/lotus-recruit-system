import FormOutreachFetchRunLogPage from "../../_components/FormOutreachFetchRunLogPage";

export const dynamic = "force-dynamic";

export default function OutreachRunsAll() {
  return (
    <FormOutreachFetchRunLogPage
      title="フォーム情報取得ログ"
      description="自動・手動のフォーム情報取得ログをページングしながら確認できます。"
      pageSize={40}
    />
  );
}
