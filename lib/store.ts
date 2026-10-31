import "server-only";
import { createClient } from "@supabase/supabase-js";
import { newId, type PlanItem, type PlanState, type SlotType } from "./plan";
import { isTermKey } from "./terms";

// 계획 저장소. secret key 로만 접근한다 (웹 브라우저에는 이 키가 가지 않는다).
function admin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("저장용 DB 키(SUPABASE_SECRET_KEY)가 설정되지 않았습니다.");
  return createClient(url, key, { auth: { persistSession: false } });
}

// 헷갈리는 글자(0, O, 1, I)를 뺀 32글자 × 12자리 = 약 10^18 가지
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const s = Array.from(bytes, (b) => ALPHABET[b % 32]).join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
export function normalizeCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length !== 12 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

const SLOT_TYPES: SlotType[] = ["전공선택", "교양선택", "자유선택"];
const int = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const ids = (v: unknown, max: number) => Array.isArray(v) && v.length <= max && v.every((x) => int(x, 1, 1e9));

/** 브라우저에서 온 값은 믿지 않고 모양을 검사한다 */
export function validateState(v: unknown): PlanState | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  if (!int(s.majorId, 1, 1e6) || !int(s.admissionYear, 2000, 2100) || !int(s.maxCredits, 3, 30)) return null;
  if (!isTermKey(s.currentTerm) || !isTermKey(s.targetTerm)) return null;
  if (!ids(s.completed, 200) || !ids(s.inProgress, 60) || !ids(s.interests, 100)) return null;
  if (!Array.isArray(s.items) || s.items.length > 200) return null;
  const items: PlanItem[] = [];
  for (const raw of s.items as unknown[]) {
    const i = raw as Record<string, unknown>;
    if (!i || !isTermKey(i.term)) return null;
    const slot = i.slot as Record<string, unknown> | undefined;
    if (int(i.courseId, 1, 1e9) && !slot) items.push({ id: newId(), term: i.term, courseId: i.courseId as number });
    else if (!i.courseId && slot && SLOT_TYPES.includes(slot.type as SlotType) && int(slot.credits, 1, 30))
      items.push({ id: newId(), term: i.term, slot: { type: slot.type as SlotType, credits: slot.credits as number } });
    else return null;
  }
  return {
    majorId: s.majorId as number, admissionYear: s.admissionYear as number,
    currentTerm: s.currentTerm, targetTerm: s.targetTerm, maxCredits: s.maxCredits as number,
    completed: s.completed as number[], inProgress: s.inProgress as number[], interests: s.interests as number[],
    items,
  };
}

const itemRows = (planId: number, s: PlanState) => [
  ...s.completed.map((id) => ({ plan_id: planId, status: "completed", term: null, course_id: id, slot_type: null, slot_credits: null })),
  ...s.inProgress.map((id) => ({ plan_id: planId, status: "in_progress", term: s.currentTerm, course_id: id, slot_type: null, slot_credits: null })),
  ...s.items.map((i) => ({
    plan_id: planId, status: "planned", term: i.term,
    course_id: i.courseId ?? null, slot_type: i.slot?.type ?? null, slot_credits: i.slot?.credits ?? null,
  })),
];

export type SavedStatus = "작성 중" | "자동 검사 통과";

export async function insertPlan(s: PlanState, status: SavedStatus): Promise<string> {
  const db = admin();
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newCode();
    const { data, error } = await db.from("plans").insert({
      code, major_id: s.majorId, admission_year: s.admissionYear, current_term: s.currentTerm,
      target_term: s.targetTerm, max_credits: s.maxCredits, interests: s.interests, status,
    }).select("id").single();
    if (error?.code === "23505") continue; // 코드 충돌 → 다시
    if (error) throw new Error(error.message);
    const { error: e2 } = await db.from("plan_items").insert(itemRows(data.id, s));
    if (e2) throw new Error(e2.message);
    return code;
  }
  throw new Error("코드 생성 실패");
}

export async function updatePlan(code: string, s: PlanState, status: SavedStatus): Promise<boolean> {
  const db = admin();
  const { data, error } = await db.from("plans").update({
    major_id: s.majorId, admission_year: s.admissionYear, current_term: s.currentTerm, target_term: s.targetTerm,
    max_credits: s.maxCredits, interests: s.interests, status, updated_at: new Date().toISOString(),
  }).eq("code", code).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  const del = await db.from("plan_items").delete().eq("plan_id", data.id);
  if (del.error) throw new Error(del.error.message);
  const ins = await db.from("plan_items").insert(itemRows(data.id, s));
  if (ins.error) throw new Error(ins.error.message);
  return true;
}

export interface LoadedPlan {
  code: string;
  status: string;
  updatedAt: string;
  state: PlanState;
}

export async function loadPlan(code: string): Promise<LoadedPlan | null> {
  const db = admin();
  const { data: p, error } = await db.from("plans").select("*").eq("code", code).maybeSingle();
  if (error) throw new Error(error.message);
  if (!p) return null;
  const { data: rows, error: e2 } = await db.from("plan_items").select("*").eq("plan_id", p.id).order("id");
  if (e2) throw new Error(e2.message);
  const r = rows ?? [];
  return {
    code: p.code,
    status: p.status,
    updatedAt: p.updated_at,
    state: {
      majorId: p.major_id, admissionYear: p.admission_year, currentTerm: p.current_term, targetTerm: p.target_term,
      maxCredits: p.max_credits, interests: p.interests ?? [],
      completed: r.filter((x) => x.status === "completed").map((x) => x.course_id),
      inProgress: r.filter((x) => x.status === "in_progress").map((x) => x.course_id),
      items: r.filter((x) => x.status === "planned").map((x) => ({
        id: newId(), term: x.term,
        ...(x.course_id ? { courseId: x.course_id } : { slot: { type: x.slot_type, credits: x.slot_credits } }),
      })),
    },
  };
}
