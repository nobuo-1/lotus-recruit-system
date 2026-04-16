"use client";

export default function AppHeader({
  showBack = "auto",
}: {
  /** 互換維持のため残置。現在はサイドバーのみを表示する。 */
  showBack?: boolean | "auto";
}) {
  void showBack;
  return null;
}
