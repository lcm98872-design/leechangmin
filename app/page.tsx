import { Suspense } from "react";
import { connection } from "next/server";
import { getSupabase } from "@/lib/supabase";

type MajorRow = {
  id: number;
  name: string;
  department: string;
  grad_requirements: {
    total_credits: number;
    general_total: number;
    major_basic_total: number;
    major_advanced: number;
  } | null;
  major_courses: { count: number }[];
};

async function MajorList() {
  await connection(); // 요청 때마다 DB에서 읽는다
  let majors: MajorRow[] = [];
  let error: string | null = null;
  try {
    const supabase = getSupabase();
    if (!supabase) {
      error = "DB 연결 정보(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)가 설정되지 않았습니다.";
    } else {
      const res = await supabase
        .from("majors")
        .select("id, name, department, grad_requirements(total_credits, general_total, major_basic_total, major_advanced), major_courses(count)")
        .order("id");
      if (res.error) error = `DB 조회 실패: ${res.error.message}`;
      else majors = res.data as unknown as MajorRow[];
    }
  } catch (e) {
    // 예: SUPABASE_URL 형식이 잘못되면 createClient가 예외를 던진다
    error = `DB 연결 오류: ${e instanceof Error ? e.message : String(e)}`;
  }

  return (
    <>
      {error ? (
        <p className="mt-8 rounded border border-red-300 bg-red-50 p-4 text-red-700">{error}</p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-3">
          {majors.map((m) => (
            <li key={m.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">{m.department}</p>
              <h2 className="mt-1 font-semibold">{m.name}</h2>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between"><dt>졸업학점</dt><dd>{m.grad_requirements?.total_credits}</dd></div>
                <div className="flex justify-between"><dt>교양</dt><dd>{m.grad_requirements?.general_total}</dd></div>
                <div className="flex justify-between"><dt>일반전공</dt><dd>{m.grad_requirements?.major_basic_total}</dd></div>
                <div className="flex justify-between"><dt>심화전공</dt><dd>{m.grad_requirements?.major_advanced}</dd></div>
                <div className="flex justify-between"><dt>전공 개설 과목</dt><dd>{m.major_courses[0]?.count ?? 0}개</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold">수강 계획 관리</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        이수한 과목을 넣으면 졸업까지 남은 학점과 학기별 수강 계획을 정리해 줍니다.
        (2026 교육과정, 시스템경영·안전공학부)
      </p>
      <Suspense fallback={<p className="mt-8 text-zinc-500">전공 정보를 불러오는 중…</p>}>
        <MajorList />
      </Suspense>
    </main>
  );
}
