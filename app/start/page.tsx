import { Suspense } from "react";
import { connection } from "next/server";
import { loadCurriculum, CURRICULUM_YEAR } from "@/lib/curriculum";
import { currentTermOf } from "@/lib/terms";
import StartWizard from "./wizard";

async function Wizard({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  await connection();
  const { mode } = await searchParams;
  let data: Awaited<ReturnType<typeof loadCurriculum>> | null = null;
  let error = "";
  try {
    data = await loadCurriculum();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  if (!data) return <p className="rounded border border-red-300 bg-red-50 p-4 text-red-700">{error}</p>;
  return (
    <StartWizard
      mode={mode === "check" ? "check" : "new"}
      majors={data.majors}
      general={data.general}
      currentTerm={currentTermOf(new Date())}
      curriculumYear={CURRICULUM_YEAR}
    />
  );
}

export default function StartPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Suspense fallback={<p className="text-zinc-500">교육과정을 불러오는 중…</p>}>
        <Wizard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
