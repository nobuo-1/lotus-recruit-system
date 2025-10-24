// web/src/lib/replaceVars.ts
export function replaceVars(
  input: string,
  vars: Record<string, string | number | null | undefined>
) {
  const safe = (v: any) => (v == null ? "" : String(v));
  return input
    .replaceAll(/\{\{\s*COMPANY\s*\}\}/g, safe(vars.COMPANY))
    .replaceAll(/\{\{\s*WEBSITE\s*\}\}/g, safe(vars.WEBSITE))
    .replaceAll(/\{\{\s*CONTACT_EMAIL\s*\}\}/g, safe(vars.CONTACT_EMAIL))
    .replaceAll(/\{\{\s*SITE\s*\}\}/g, safe(vars.SITE));
}
