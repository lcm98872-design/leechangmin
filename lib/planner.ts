// 졸업까지 학기별 수강 계획을 만든다. DB·화면과 무관한 순수 함수라서 테스트로 검증한다.
//
// 규칙
// 1. "꼭 들어야 하는 과목"(전공공통·전공필수, 필수교양 각 그룹 1과목)은 무조건 계획에 넣는다.
//    학기당 학점이 모자라면 학기를 늘려서라도 넣는다.
// 2. 교양은 관심 교양을 먼저 고르고, 그다음 부족한 영역·핵심역량을 채우는 과목을 고른다.
// 3. 나머지 학점은 전공선택으로 채운다.
// 4. 과목은 개설 학기(1학기/2학기)에만 배치하고, 한 학기 학점은 사용자가 정한 최대 학점을 넘지 않는다.

export type MajorCategory = "전공공통" | "전공필수" | "전공선택";

export interface MajorCourse {
  id: number;
  name: string;
  credits: number;
  category: MajorCategory;
  year: number;          // 권장 학년
  semesters: (1 | 2)[];  // 개설 학기
}

export interface GeneralCourse {
  id: number;
  name: string;
  credits: number;
  category: "필수교양" | "균형교양";
  competency: string | null;
  area: string | null;
  requiredGroup: string | null;
}

export interface Requirement {
  total_credits: number;
  general_total: number;
  major_basic_total: number;
  major_advanced: number;
}

export interface PlanInput {
  requirement: Requirement;
  majorCourses: MajorCourse[];
  generalCourses: GeneralCourse[];
  completedIds: number[];
  interestIds: number[];          // 관심 교양
  maxCredits: number;             // 학기당 최대 학점
  startYear: number;              // 계획을 시작할 학기 (예: 2027년 1학기)
  startSemester: 1 | 2;
  startGrade: number;             // 그 학기의 학년
  doubleMajor?: boolean;          // 복수전공이면 심화전공 학점을 계산하지 않는다
}

export type Reason = "필수" | "관심 교양" | "영역·역량 충족" | "교양 학점" | "전공선택" | "졸업 학점";

export interface PlannedCourse {
  id: number;
  name: string;
  credits: number;
  kind: "major" | "general";
  label: string;   // 전공필수 / 균형교양-인간문화 등
  reason: Reason;
  required: boolean;
}

export interface Term {
  year: number;
  semester: 1 | 2;
  grade: number;
  courses: PlannedCourse[];
  credits: number;
}

export interface Plan {
  terms: Term[];
  totalPlanned: number;
  warnings: string[];
}

export const COMPETENCIES = ["주도적사고", "융합적탐색", "창의적해결", "소통형리더십", "사회적기여", "글로벌감각"];
export const AREAS = ["인간문화", "사회역사", "자연과학기술"];

interface Candidate extends PlannedCourse {
  semesters: (1 | 2)[];
  minGrade: number;
  order: number;
}

export function generatePlan(input: PlanInput): Plan {
  const { requirement: req, maxCredits } = input;
  const warnings: string[] = [];
  const done = new Set(input.completedIds);
  const generalById = new Map(input.generalCourses.map((g) => [g.id, g]));
  const majorById = new Map(input.majorCourses.map((m) => [m.id, m]));

  // ── 이미 들은 학점 ─────────────────────────────────────────
  let earnedGeneral = 0;
  let earnedMajor = 0;
  const coveredAreas = new Set<string>();
  const coveredComps = new Set<string>();
  const doneGroups = new Set<string>();
  for (const id of done) {
    const g = generalById.get(id);
    if (g) {
      earnedGeneral += g.credits;
      if (g.area) coveredAreas.add(g.area);
      if (g.competency) coveredComps.add(g.competency);
      if (g.requiredGroup) doneGroups.add(g.requiredGroup);
    }
    const m = majorById.get(id);
    if (m) earnedMajor += m.credits;
  }

  const picked: Candidate[] = [];
  const pickedIds = new Set<number>();
  const add = (c: Candidate) => {
    if (pickedIds.has(c.id) || done.has(c.id)) return false;
    picked.push(c);
    pickedIds.add(c.id);
    return true;
  };

  const majorCand = (m: MajorCourse, reason: Reason, required: boolean): Candidate => ({
    id: m.id, name: m.name, credits: m.credits, kind: "major", label: m.category,
    reason, required, semesters: m.semesters, minGrade: m.year, order: m.year * 10,
  });
  const generalCand = (g: GeneralCourse, reason: Reason, required: boolean): Candidate => ({
    id: g.id, name: g.name, credits: g.credits, kind: "general",
    label: g.category === "필수교양" ? "필수교양" : `균형교양-${g.area ?? ""}`,
    reason, required, semesters: [1, 2], minGrade: 1, order: required ? 0 : 5,
  });

  // ── 1. 꼭 들어야 하는 과목 ──────────────────────────────────
  for (const m of input.majorCourses) {
    if (m.category !== "전공선택") add(majorCand(m, "필수", true));
  }
  const groups = [...new Set(input.generalCourses.map((g) => g.requiredGroup).filter((x): x is string => !!x))];
  for (const group of groups) {
    if (doneGroups.has(group)) continue;
    const options = input.generalCourses.filter((g) => g.requiredGroup === group);
    // 관심 교양 > 공대 학생이니 자연기술 분반 > 첫 번째
    const choice =
      options.find((g) => input.interestIds.includes(g.id)) ??
      options.find((g) => g.name.includes("자연기술")) ??
      options[0];
    add(generalCand(choice, "필수", true));
  }

  // ── 2. 교양: 관심 → 영역·역량 → 학점 ─────────────────────────
  const plannedGeneral = () =>
    earnedGeneral + picked.filter((c) => c.kind === "general").reduce((a, c) => a + c.credits, 0);
  const balanced = input.generalCourses.filter((g) => g.category === "균형교양");
  const cover = (g: GeneralCourse) => {
    if (g.area) coveredAreas.add(g.area);
    if (g.competency) coveredComps.add(g.competency);
  };
  for (const c of picked) {
    const g = generalById.get(c.id);
    if (g) cover(g);
  }

  for (const id of input.interestIds) {
    const g = generalById.get(id);
    if (!g || g.category !== "균형교양") continue;
    if (add(generalCand(g, "관심 교양", false))) cover(g);
  }
  if (plannedGeneral() > req.general_total) {
    warnings.push(`관심 교양이 많아 교양이 ${plannedGeneral()}학점으로 기준(${req.general_total}학점)보다 많습니다.`);
  }

  // 부족한 영역·역량을 한 과목으로 최대한 많이 채우는 과목을 고른다
  for (;;) {
    const missing = (g: GeneralCourse) =>
      (g.area && !coveredAreas.has(g.area) ? 1 : 0) + (g.competency && !coveredComps.has(g.competency) ? 1 : 0);
    const best = balanced
      .filter((g) => !pickedIds.has(g.id) && !done.has(g.id) && missing(g) > 0)
      .sort((a, b) => missing(b) - missing(a) || b.credits - a.credits)[0];
    if (!best) break;
    add(generalCand(best, "영역·역량 충족", false));
    cover(best);
  }

  for (const g of balanced.filter((g) => g.credits === 3)) {
    if (plannedGeneral() >= req.general_total) break;
    add(generalCand(g, "교양 학점", false));
  }

  // ── 3. 전공선택으로 전공 학점 채우기 ─────────────────────────
  const majorTarget = req.major_basic_total + (input.doubleMajor ? 0 : req.major_advanced);
  const plannedMajor = () =>
    earnedMajor + picked.filter((c) => c.kind === "major").reduce((a, c) => a + c.credits, 0);
  const electives = input.majorCourses
    .filter((m) => m.category === "전공선택")
    .sort((a, b) => a.year - b.year || a.semesters[0] - b.semesters[0]);
  for (const m of electives) {
    if (plannedMajor() >= majorTarget) break;
    add(majorCand(m, "전공선택", false));
  }
  // 자유선택 등 졸업 학점까지 남은 부분도 전공선택으로 채운다
  for (const m of electives) {
    if (plannedMajor() + plannedGeneral() >= req.total_credits) break;
    add(majorCand(m, "졸업 학점", false));
  }
  if (plannedMajor() + plannedGeneral() < req.total_credits) {
    warnings.push("개설 과목만으로 졸업 학점을 다 채우지 못했습니다. 다른 전공·교양 과목이 더 필요합니다.");
  }

  // ── 4. 학기 배치 ────────────────────────────────────────────
  const terms: Term[] = [];
  const termAt = (i: number): Term => {
    while (terms.length <= i) {
      const k = terms.length;
      const sem0 = input.startSemester - 1 + k;
      terms.push({
        year: input.startYear + Math.floor(sem0 / 2),
        semester: ((sem0 % 2) + 1) as 1 | 2,
        grade: input.startGrade + Math.floor((input.startSemester - 1 + k) / 2),
        courses: [],
        credits: 0,
      });
    }
    return terms[i];
  };
  const normalTerms = Math.max(1, (4 - input.startGrade) * 2 + (3 - input.startSemester));

  const place = (c: Candidate, limitTerms: number | null) => {
    for (let i = 0; limitTerms === null || i < limitTerms; i++) {
      const t = termAt(i);
      if (!c.semesters.includes(t.semester)) continue;
      if (t.grade < c.minGrade && (limitTerms === null ? i < normalTerms : true)) continue;
      if (t.credits + c.credits > maxCredits) continue;
      const { semesters, minGrade, order, ...course } = c;
      void semesters; void minGrade; void order;
      t.courses.push(course);
      t.credits += c.credits;
      return true;
    }
    return false;
  };

  const sorted = [...picked].sort((a, b) => a.order - b.order);
  const required = sorted.filter((c) => c.required);
  const optional = sorted.filter((c) => !c.required);

  // 필수 과목은 무조건 배치 (필요하면 학기를 늘린다)
  for (const c of required) {
    if (c.credits > maxCredits) {
      warnings.push(`${c.name}(${c.credits}학점)이 학기당 최대 학점보다 커서 배치할 수 없습니다.`);
      continue;
    }
    place(c, null);
  }
  // 나머지는 정규 학기 안에서 먼저, 안 되면 학기를 늘린다
  for (const c of optional) {
    if (!place(c, normalTerms)) place(c, null);
  }

  // 빈 학기 정리
  while (terms.length && terms[terms.length - 1].courses.length === 0) terms.pop();
  if (terms.length > normalTerms) {
    warnings.push(`학기당 ${maxCredits}학점으로는 정규 학기 안에 끝나지 않아 ${terms.length - normalTerms}학기가 더 필요합니다.`);
  }

  return {
    terms,
    totalPlanned: terms.reduce((a, t) => a + t.credits, 0),
    warnings,
  };
}
