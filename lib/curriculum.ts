import "server-only";
import { getSupabase } from "./supabase";
import type { GeneralCourse, MajorCourse, MajorData, Requirement } from "./plan";

export const CURRICULUM_YEAR = 2026;
// 졸업요건 판정을 검증한 학부 (다른 전공은 데이터만 있고 "검증 전"으로 표시)
const VERIFIED_DEPARTMENTS = ["시스템경영·안전공학부"];

type Row = Record<string, unknown>;
const one = <T,>(v: T | T[]): T => (Array.isArray(v) ? v[0] : v);

export async function loadCurriculum(): Promise<{ majors: MajorData[]; general: GeneralCourse[] }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("DB 연결 정보(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)가 설정되지 않았습니다.");

  const [mRes, mcRes, gcRes] = await Promise.all([
    supabase.from("majors").select("id, name, department, grad_requirements(total_credits, general_total, major_basic_total, major_advanced)").order("id"),
    supabase.from("major_courses").select("major_id, category, year, semesters, courses(id, name, credits)"),
    supabase.from("general_courses").select("category, competency, area, required_group, courses(id, name, credits)"),
  ]);
  const err = mRes.error ?? mcRes.error ?? gcRes.error;
  if (err) throw new Error(`DB 조회 실패: ${err.message}`);

  const majors: MajorData[] = (mRes.data as Row[]).map((m) => ({
    id: m.id as number,
    name: m.name as string,
    department: m.department as string,
    verified: VERIFIED_DEPARTMENTS.includes(m.department as string),
    requirement: one(m.grad_requirements as Requirement | Requirement[]),
    courses: (mcRes.data as Row[])
      .filter((r) => r.major_id === m.id)
      .map((r): MajorCourse => {
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
