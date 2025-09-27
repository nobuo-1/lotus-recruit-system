// web/src/app/settings/page.tsx
import { redirect } from "next/navigation";

export default function SettingsIndex() {
  redirect("/settings/org");
}
