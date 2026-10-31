import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { loadCurriculum, CURRICULUM_YEAR } from "@/lib/curriculum";
import { loadPlan, normalizeCode } from "@/lib/store";
import Workbench from "./workbench";

async function PlanLoader({ params }: { params: Promise<{ code: string }> }) {
  await connection();
  const { code: raw } = await params;
  const code = normalizeCode(decodeURIComponent(raw));
  if (!code) notFound();

  let error = "";
  let result: { plan: Awaited<ReturnType<typeof loadPlan>>; cur: Awaited<ReturnType<typeof loadCurriculum>> } | null = null;
  try {
    const [plan, cur] = await Promise.all([loadPlan(code), loadCurriculum()]);
    result = { plan, cur };
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  if (!result) return <p className="m-8 rounded border border-red-300 bg-red-50 p-4 text-red-700">{error}</p>;
  if (!result.plan) notFound();

  const major = result.cur.majors.find((m) => m.id === result.plan!.state.majorId);
  if (!major) notFound();

  return (
    <Workbench
      code={code}
      initial={result.plan.state}
      savedAt={result.plan.updatedAt}
      curriculum={{ year: CURRICULUM_YEAR, major, general: result.cur.general }}
    />
  );
}

export default function PlanPage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense fallback={<p className="p-8 text-zinc-500">계획을 불러오는 중…</p>}>
      <PlanLoader params={params} />
    </Suspense>
  );
}
