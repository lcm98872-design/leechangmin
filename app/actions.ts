"use server";

import { redirect } from "next/navigation";
import { insertPlan, normalizeCode, updatePlan, validateState, type SavedStatus } from "@/lib/store";

const STATUSES: SavedStatus[] = ["작성 중", "자동 검사 통과"];

export async function createPlanAction(state: unknown, status: unknown): Promise<{ code?: string; error?: string }> {
  const s = validateState(state);
  if (!s) return { error: "입력값이 올바르지 않아요." };
  try {
    return { code: await insertPlan(s, STATUSES.includes(status as SavedStatus) ? (status as SavedStatus) : "작성 중") };
  } catch (e) {
    return { error: `저장 실패: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function savePlanAction(code: unknown, state: unknown, status: unknown): Promise<{ ok?: true; error?: string }> {
  const c = typeof code === "string" ? normalizeCode(code) : null;
  const s = validateState(state);
  if (!c || !s) return { error: "입력값이 올바르지 않아요." };
  try {
    const ok = await updatePlan(c, s, STATUSES.includes(status as SavedStatus) ? (status as SavedStatus) : "작성 중");
    return ok ? { ok: true } : { error: "계획을 찾을 수 없어요." };
  } catch (e) {
    return { error: `저장 실패: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function openPlanAction(formData: FormData) {
  const code = normalizeCode(String(formData.get("code") ?? ""));
  redirect(`/plan/${code ?? "invalid"}`);
}
