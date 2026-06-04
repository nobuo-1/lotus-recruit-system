import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { SiteKey } from "./types";

export type JobBoardLoginCredentials = {
  siteKey: SiteKey;
  username: string;
  password: string;
};

export async function loadJobBoardLoginCredentials(
  siteKey: SiteKey
): Promise<JobBoardLoginCredentials | null> {
  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("job_board_logins")
      .select("site_key,username,password")
      .eq("site_key", siteKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("loadJobBoardLoginCredentials error", error);
      return null;
    }
    if (!data?.username || !data?.password) return null;

    return {
      siteKey,
      username: String(data.username),
      password: String(data.password),
    };
  } catch (e) {
    console.error("loadJobBoardLoginCredentials unexpected error", e);
    return null;
  }
}

function looksLikeCookie(value: string) {
  return /^[^=\s;]+=[^;]+(?:;\s*[^=\s;]+=[^;]+)*$/.test(value.trim());
}

export function buildLoginAuthHeaders(
  credentials: JobBoardLoginCredentials | null
): HeadersInit {
  if (!credentials) return {};

  const headers: Record<string, string> = {};
  const username = credentials.username.trim();
  const password = credentials.password.trim();

  if (looksLikeCookie(password) || username.toLowerCase() === "cookie") {
    headers.cookie = password;
  }

  headers.authorization = `Basic ${Buffer.from(
    `${credentials.username}:${credentials.password}`
  ).toString("base64")}`;

  return headers;
}
