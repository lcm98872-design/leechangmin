import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AREAS, COMPETENCIES, generatePlan, type GeneralCourse, type MajorCourse, type PlanInput } from "./planner";

// ── 실제 교육과정 데이터(db/*.csv)로 테스트한다 ──────────────────
function csv(name: string): Record<string, string>[] {
  const [head, ...lines] = readFileSync(join(__dirname, "..", "db", name), "utf8").trim().split("\n");
  const split = (l: string) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
  const keys = split(head);
  return lines.map((l) => Object.fromEntries(split(l).map((v, i) => [keys[i], v])));
}

const MAJOR = "산업경영공학전공";
let nextId = 1;
const majorCourses: MajorCourse[] = csv("major_courses_sme.csv")
  .filter((r) => r["전공"] === MAJOR)
  .map((r) => ({
    id: nextId++,
    name: r["과목명"],
    credits: Number(r["학점"]),
    category: r["이수구분"] as MajorCourse["category"],
    year: Number(r["학년"]),
    semesters: r["안내서상 학기"].replace("학기", "").split(",").map(Number) as (1 | 2)[],
  }));
const generalCourses: GeneralCourse[] = csv("general_courses.csv").map((r) => ({
  id: nextId++,
  name: r["교과목명"],
  credits: Number(r["학점"]),
  category: r["구분"] as GeneralCourse["category"],
  competency: r["핵심역량"] || null,
  area: r["영역"] || null,
  requiredGroup: r["필수 이수그룹"] || null,
}));

const base: PlanInput = {
  requirement: { total_credits: 132, general_total: 40, major_basic_total: 45, major_advanced: 36 },
  majorCourses,
  generalCourses,
  completedIds: [],
  interestIds: [],
  maxCredits: 18,
  startYear: 2026,
  startSemester: 1,
  startGrade: 1,
};

const ids = (plan: ReturnType<typeof generatePlan>) => plan.terms.flatMap((t) => t.courses.map((c) => c.id));
const byName = (name: string) => [...majorCourses, ...generalCourses].find((c) => c.name === name)!;

describe("generatePlan", () => {
  it("전공공통·전공필수 과목이 하나도 빠지지 않는다", () => {
    const plan = generatePlan(base);
    const required = majorCourses.filter((m) => m.category !== "전공선택").map((m) => m.id);
    expect(ids(plan)).toEqual(expect.arrayContaining(required));
  });

  it("필수교양 6개 그룹을 각각 정확히 1과목씩 넣는다", () => {
    const plan = generatePlan(base);
    const chosen = generalCourses.filter((g) => ids(plan).includes(g.id) && g.requiredGroup);
    const groups = chosen.map((g) => g.requiredGroup);
    expect(new Set(groups).size).toBe(6);
    expect(groups.length).toBe(6);
  });

  it("학기당 최대 학점을 넘는 학기가 없다", () => {
    for (const maxCredits of [12, 15, 18, 21]) {
      const plan = generatePlan({ ...base, maxCredits });
      for (const t of plan.terms) expect(t.credits).toBeLessThanOrEqual(maxCredits);
    }
  });

  it("최대 학점이 작아도 필수 과목은 학기를 늘려서라도 모두 넣는다", () => {
    const plan = generatePlan({ ...base, maxCredits: 6 });
    const required = majorCourses.filter((m) => m.category !== "전공선택").map((m) => m.id);
    expect(ids(plan)).toEqual(expect.arrayContaining(required));
    expect(plan.terms.length).toBeGreaterThan(8);
    expect(plan.warnings.some((w) => w.includes("학기가 더 필요"))).toBe(true);
  });

  it("과목을 개설 학기에만 배치한다", () => {
    const plan = generatePlan(base);
    for (const t of plan.terms) {
      for (const c of t.courses) {
        const m = majorCourses.find((x) => x.id === c.id);
        if (m) expect(m.semesters).toContain(t.semester);
      }
    }
  });

  it("관심 교양을 계획에 넣는다", () => {
    const interest = generalCourses.filter((g) => g.category === "균형교양").slice(0, 3).map((g) => g.id);
    const plan = generatePlan({ ...base, interestIds: interest });
    expect(ids(plan)).toEqual(expect.arrayContaining(interest));
    const reasons = plan.terms.flatMap((t) => t.courses).filter((c) => interest.includes(c.id)).map((c) => c.reason);
    expect(reasons.every((r) => r === "관심 교양")).toBe(true);
  });

  it("필수교양 택1 그룹에서 관심 과목을 고르면 그 과목으로 이수한다", () => {
    const japanese = byName("글로벌외국어-대학일본어");
    const plan = generatePlan({ ...base, interestIds: [japanese.id] });
    expect(ids(plan)).toContain(japanese.id);
    expect(ids(plan)).not.toContain(byName("글로벌외국어-대학영어").id);
  });

  it("균형교양 3개 영역과 6개 핵심역량을 모두 채운다", () => {
    const plan = generatePlan(base);
    const chosen = generalCourses.filter((g) => ids(plan).includes(g.id));
    for (const a of AREAS) expect(chosen.some((g) => g.area === a)).toBe(true);
    for (const c of COMPETENCIES) expect(chosen.some((g) => g.competency === c)).toBe(true);
  });

  it("교양 40학점과 졸업 132학점을 채운다", () => {
    const plan = generatePlan(base);
    const general = plan.terms.flatMap((t) => t.courses).filter((c) => c.kind === "general").reduce((a, c) => a + c.credits, 0);
    expect(general).toBeGreaterThanOrEqual(40);
    expect(plan.totalPlanned).toBeGreaterThanOrEqual(132);
  });

  it("이미 들은 과목은 다시 넣지 않고 남은 학기만 계획한다", () => {
    const done = majorCourses.filter((m) => m.year === 2).map((m) => m.id);
    const plan = generatePlan({ ...base, completedIds: done, startYear: 2027, startGrade: 3 });
    for (const id of done) expect(ids(plan)).not.toContain(id);
    expect(plan.terms[0]).toMatchObject({ year: 2027, semester: 1, grade: 3 });
  });
});
