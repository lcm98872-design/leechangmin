import { createClient } from "@supabase/supabase-js";

// 서버에서만 쓰는 Supabase 클라이언트.
// 값은 .env.local(로컬) 또는 Vercel 환경 변수에 넣는다. GitHub에는 올리지 않는다.
export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
