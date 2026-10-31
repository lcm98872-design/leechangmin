import { Suspense } from "react";
import { connection } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { GeneralCourse, MajorCourse, Requirement } from "@/lib/planner";
import Planner, { type MajorData } from "./planner-client";

type Row = Record<string, unknown>;
const one = <T,>(v: T | T[]): T => (Array.isArray(v) ? v[0] : v);

async function loadData(): Promise<{ majors: MajorData[]; general: GeneralCourse[] }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("DB 연결 정보(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)가 설정되지 않았습니다.");

  const [majorsRes, mcRes, gcRes] = await Promise.all([
    supabase.from("majors").select("id, name, grad_requirements(total_credits, general_total, major_basic_total, major_advanced)").order("id"),
    supabase.from("major_courses").select("major_id, category, year, semesters, courses(id, name, credits)"),
    supabase.from("general_courses").select("category, competency, area, required_group, courses(id, name, credits)"),
  ]);
  const err = majorsRes.error ?? mcRes.error ?? gcRes.error;
  if (err) throw new Error(`DB 조회 실패: ${err.message}`);

  const majors: MajorData[] = (majorsRes.data as Row[]).map((m) => ({
    id: m.id as number,
    name: m.name as string,
    requirement: one(m.grad_requirements as Requirement | Requirement[]),
    courses: (mcRes.data as Row[])
      .filter((r) => r.major_id === m.id)
      .map((r) => {
        const c = one(r.courses as Row | Row[]);
        return {
          id: c.id as number,
          name: c.name as string,
          credits: c.credits as number,
          category: r.category as MajorCourse["category"],
          year: r.year as number,
          semesters: String(r.semesters).split(",").map(Number) as (1 | 2)[],
        };
      })
      .sort((a, b) => a.year - b.year || a.semesters[0] - b.semesters[0] || a.name.localeCompare(b.name)),
  }));

  const general: GeneralCourse[] = (gcRes.data as Row[])
    .map((r) => {
      const c = one(r.courses as Row | Row[]);
      return {
        id: c.id as number,
        name: c.name as string,
        credits: c.credits as number,
        category: r.category as GeneralCourse["category"],
        competency: (r.competency as string) ?? null,
        area: (r.area as string) ?? null,
        requiredGroup: (r.required_group as string) ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { majors, general };
}

async function PlannerSection() {
  await connection(); // 요청 때마다 DB에서 읽는다
  let data: Awaited<ReturnType<typeof loadData>> | null = null;
  let error = "";
  try {
    data = await loadData();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  if (!data) {
    return <p className="mt-8 rounded border border-red-300 bg-red-50 p-4 text-red-700">{error}</p>;
  }
  return <Planner majors={data.majors} general={data.general} />;
}

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">수강 계획 관리</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        들은 과목과 관심 교양을 고르면, 꼭 들어야 하는 과목을 빠짐없이 넣어 졸업까지 학기별 계획을 짜 줍니다.
        <br />
        <span className="text-sm">2026 교육과정 · 시스템경영·안전공학부 기준 · 참고용이며 최종 확인은 학과에 하세요.</span>
      </p>
      <Suspense fallback={<p className="mt-8 text-zinc-500">교육과정을 불러오는 중…</p>}>
        <PlannerSection />
      </Suspense>
    </main>
  );
}
