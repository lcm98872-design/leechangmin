// 수강 계획의 핵심 로직: 초안 생성 → 진단·검사 → 수정(op) 적용.
// DB·화면과 무관한 순수 함수라서 테스트로 검증한다.
//
// 원칙
// - 진단에는 "실제 과목"만 센다. 빈 칸(선택과목 자리)은 학기 학점만 예약하고 졸업요건에는 세지 않는다.
// - 학점 용량 검사(남은 학기에 다 들을 수 있나)와 졸업요건 검사(요건이 채워지나)는 따로 본다.
// - 빨간 오류가 없어도 "확인 필요" 항목은 따로 보여 준다. 자동 검사 통과 ≠ 졸업 확정.

import { compareTerms, gradeOf, nextTerm, parseTerm, termLabel, termRange } from "./terms";

// ── 교육과정 데이터 ─────────────────────────────────────────
export type MajorCategory = "전공공통" | "전공필수" | "전공선택";

export interface MajorCourse {
  id: number;
  name: string;
  credits: number;
  category: MajorCategory;
  year: number;            // 권장 학년
  semesters: (1 | 2)[];    // 교육과정표상 학기 (개설 보장 아님)
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

export interface MajorData {
  id: number;
  name: string;
  department: string;
  verified: boolean;       // 졸업요건 판정을 검증한 전공인가
  requirement: Requirement;
  courses: MajorCourse[];
}

export interface Curriculum {
  year: number;            // 교육과정 기준 연도 (2026)
  major: MajorData;
  general: GeneralCourse[];
}

export const AREAS = ["인간문화", "사회역사", "자연과학기술"];
export const COMPETENCIES = ["주도적사고", "융합적탐색", "창의적해결", "소통형리더십", "사회적기여", "글로벌감각"];

// ── 계획 상태 ──────────────────────────────────────────────
export type SlotType = "전공선택" | "교양선택" | "자유선택";

export interface PlanItem {
  id: string;
  term: string;
  courseId?: number;
  slot?: { type: SlotType; credits: number };
}

export interface PlanState {
  majorId: number;
  admissionYear: number;
  currentTerm: string;     // 지금 학기 (수강 중 과목이 있는 학기)
  targetTerm: string;      // 희망 졸업학기
  maxCredits: number;
  completed: number[];     // 이수 완료
  inProgress: number[];    // 현재 학기 수강 중
  interests: number[];     // 듣고 싶은 교양
  items: PlanItem[];       // 다음 학기부터의 계획
}

let seq = 0;
export const newId = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;

// ── 과목 조회 ──────────────────────────────────────────────
export type AnyCourse =
  | ({ kind: "major" } & MajorCourse)
  | ({ kind: "general" } & GeneralCourse);

export function courseIndex(cur: Curriculum): Map<number, AnyCourse> {
  const m = new Map<number, AnyCourse>();
  for (const g of cur.general) m.set(g.id, { kind: "general", ...g });
  for (const c of cur.major.courses) m.set(c.id, { kind: "major", ...c });
  return m;
}

const isRequiredMajor = (c: AnyCourse) => c.kind === "major" && c.category !== "전공선택";

export function courseLabel(c: AnyCourse): string {
  if (c.kind === "major") return c.category;
  return c.category === "필수교양" ? "필수교양" : `교양·${c.area ?? ""}`;
}

/** 이 과목이 어떤 빈 칸을 채울 수 있나 (앞쪽이 우선) */
export function slotTypesFor(c: AnyCourse): SlotType[] {
  if (c.kind === "major") return c.category === "전공선택" ? ["전공선택", "자유선택"] : [];
  return c.category === "균형교양" ? ["교양선택", "자유선택"] : [];
}

// ── 초안 생성 ──────────────────────────────────────────────
export function plannedTerms(s: Pick<PlanState, "currentTerm" | "targetTerm">): string[] {
  return termRange(nextTerm(s.currentTerm), s.targetTerm);
}

export function generateDraft(s: PlanState, cur: Curriculum): PlanItem[] {
  const idx = courseIndex(cur);
  const done = new Set([...s.completed, ...s.inProgress]);
  const terms = plannedTerms(s);
  if (terms.length === 0) terms.push(nextTerm(s.currentTerm));
  const load = new Map(terms.map((t) => [t, 0]));
  const items: PlanItem[] = [];

  const ensureTerm = (t: string) => {
    if (!load.has(t)) {
      load.set(t, 0);
      terms.push(t);
    }
  };
  const room = (t: string, cap = s.maxCredits) => cap - (load.get(t) ?? 0);

  // 과목 하나를 가장 이른 적당한 학기에 넣는다. 희망 학기 안에 자리가 없으면 그 뒤 학기에 넣는다.
  const placeCourse = (c: AnyCourse) => {
    const fits = (t: string, strictGrade: boolean, strictSem: boolean) => {
      if (room(t) < c.credits) return false;
      if (c.kind === "major") {
        if (strictSem && !c.semesters.includes(parseTerm(t).sem)) return false;
        if (strictGrade && gradeOf(t, s.admissionYear) < c.year) return false;
      }
      return true;
    };
    for (const [g, sm] of [[true, true], [false, true], [false, false]] as const) {
      const t = terms.find((x) => fits(x, g, sm));
      if (t) return put(c, t);
    }
    // 희망 졸업학기 이후로 밀기
    let t = nextTerm(terms[terms.length - 1]);
    for (let i = 0; i < 12; i++, t = nextTerm(t)) {
      ensureTerm(t);
      if (c.kind === "major" && !c.semesters.includes(parseTerm(t).sem)) continue;
      if (room(t) >= c.credits) return put(c, t);
    }
  };
  const put = (c: AnyCourse, t: string) => {
    items.push({ id: newId(), term: t, courseId: c.id });
    load.set(t, (load.get(t) ?? 0) + c.credits);
  };
  const used = new Set<number>(done);

  // 1) 전공공통·전공필수
  const reqMajor = cur.major.courses
    .filter((c) => c.category !== "전공선택" && !used.has(c.id))
    .sort((a, b) => a.year - b.year || a.semesters[0] - b.semesters[0]);
  for (const c of reqMajor) {
    placeCourse({ kind: "major", ...c });
    used.add(c.id);
  }

  // 2) 필수교양: 그룹마다 1과목 (듣고 싶은 교양 > 자연기술 분반 > 첫 과목)
  const doneGroups = new Set(cur.general.filter((g) => done.has(g.id) && g.requiredGroup).map((g) => g.requiredGroup));
  const groups = [...new Set(cur.general.map((g) => g.requiredGroup).filter((x): x is string => !!x))];
  for (const group of groups) {
    if (doneGroups.has(group)) continue;
    const opts = cur.general.filter((g) => g.requiredGroup === group);
    const pick =
      opts.find((g) => s.interests.includes(g.id)) ?? opts.find((g) => g.name.includes("자연기술")) ?? opts[0];
    placeCourse({ kind: "general", ...pick });
    used.add(pick.id);
  }

  // 3) 듣고 싶은 교양
  for (const id of s.interests) {
    const c = idx.get(id);
    if (!c || used.has(id) || c.kind !== "general" || c.category !== "균형교양") continue;
    placeCourse(c);
    used.add(id);
  }

  // 4) 남은 학점은 빈 칸으로 (과목을 정하지 않는다)
  const credit = (ids: Iterable<number>, pred: (c: AnyCourse) => boolean) => {
    let sum = 0;
    for (const id of ids) {
      const c = idx.get(id);
      if (c && pred(c)) sum += c.credits;
    }
    return sum;
  };
  const concrete = [...used];
  const req = cur.major.requirement;
  const majorNeed = Math.max(0, req.major_basic_total + req.major_advanced - credit(concrete, (c) => c.kind === "major"));
  const generalNeed = Math.max(0, req.general_total - credit(concrete, (c) => c.kind === "general"));
  const freeNeed = Math.max(0, req.total_credits - credit(concrete, () => true) - majorNeed - generalNeed);

  const base = terms.filter((t) => compareTerms(t, s.targetTerm) <= 0);
  const slotTerms = base.length ? base : terms;
  const totalLoad = slotTerms.reduce((a, t) => a + (load.get(t) ?? 0), 0);
  const balanced = Math.min(s.maxCredits, Math.ceil((totalLoad + majorNeed + generalNeed + freeNeed) / slotTerms.length));

  const slots = new Map<string, number>(); // `${term}|${type}` → 학점
  const allocate = (type: SlotType, need: number, order: string[]) => {
    for (const cap of [balanced, s.maxCredits]) {
      for (const t of order) {
        if (need <= 0) return 0;
        const r = room(t, cap);
        if (r <= 0) continue;
        const take = Math.min(r, need);
        slots.set(`${t}|${type}`, (slots.get(`${t}|${type}`) ?? 0) + take);
        load.set(t, (load.get(t) ?? 0) + take);
        need -= take;
      }
    }
    return need;
  };
  allocate("교양선택", generalNeed, slotTerms);                   // 교양은 앞 학기부터
  allocate("전공선택", majorNeed, [...slotTerms].reverse());       // 전공선택은 뒤 학기부터
  allocate("자유선택", freeNeed, slotTerms);
  // 다 못 넣은 학점은 진단에서 "용량 부족"으로 보여 준다

  for (const [key, credits] of slots) {
    const [term, type] = key.split("|");
    items.push({ id: newId(), term, slot: { type: type as SlotType, credits } });
  }
  return sortItems(items, idx);
}

function sortItems(items: PlanItem[], idx: Map<number, AnyCourse>): PlanItem[] {
  const rank = (i: PlanItem) => {
    if (i.slot) return 9;
    const c = idx.get(i.courseId!);
    if (!c) return 8;
    if (isRequiredMajor(c)) return 0;
    if (c.kind === "general" && c.category === "필수교양") return 1;
    return c.kind === "major" ? 2 : 3;
  };
  return [...items].sort((a, b) => compareTerms(a.term, b.term) || rank(a) - rank(b));
}

// ── 수정 ───────────────────────────────────────────────────
export type Op =
  | { type: "move"; itemId: string; to: string }
  | { type: "remove"; itemId: string }
  | { type: "add"; courseId: number; term: string }
  | { type: "fillSlot"; itemId: string; courseId: number }
  | { type: "addSlot"; slotType: SlotType; credits: number; term: string }
  | { type: "setTarget"; term: string }
  | { type: "setMax"; value: number }
  | { type: "regenerate" };

export function applyOp(s: PlanState, op: Op, cur: Curriculum): PlanState {
  const idx = courseIndex(cur);
  switch (op.type) {
    case "move":
      return { ...s, items: s.items.map((i) => (i.id === op.itemId ? { ...i, term: op.to } : i)) };
    case "remove":
      return { ...s, items: s.items.filter((i) => i.id !== op.itemId) };
    case "add": {
      const c = idx.get(op.courseId);
      if (!c) return s;
      // 같은 학기에 맞는 빈 칸이 있으면 그 학점에서 뺀다 (중복 예약 방지)
      const slot = slotTypesFor(c)
        .map((t) => s.items.find((i) => i.term === op.term && i.slot?.type === t))
        .find(Boolean);
      const items = slot ? shrinkSlot(s.items, slot.id, c.credits) : s.items;
      return { ...s, items: sortItems([...items, { id: newId(), term: op.term, courseId: op.courseId }], idx) };
    }
    case "fillSlot": {
      const slot = s.items.find((i) => i.id === op.itemId);
      const c = idx.get(op.courseId);
      if (!slot?.slot || !c) return s;
      const items = shrinkSlot(s.items, slot.id, c.credits);
      return { ...s, items: sortItems([...items, { id: newId(), term: slot.term, courseId: c.id }], idx) };
    }
    case "addSlot": {
      const same = s.items.find((i) => i.term === op.term && i.slot?.type === op.slotType);
      const items = same
        ? s.items.map((i) => (i === same ? { ...i, slot: { ...i.slot!, credits: i.slot!.credits + op.credits } } : i))
        : [...s.items, { id: newId(), term: op.term, slot: { type: op.slotType, credits: op.credits } }];
      return { ...s, items: sortItems(items, idx) };
    }
    case "setTarget":
      return { ...s, targetTerm: op.term };
    case "setMax":
      return { ...s, maxCredits: Math.max(3, Math.min(30, Math.round(op.value) || 3)) };
    case "regenerate":
      return { ...s, items: generateDraft({ ...s, items: [] }, cur) };
  }
}

function shrinkSlot(items: PlanItem[], slotId: string, by: number): PlanItem[] {
  return items.flatMap((i) => {
    if (i.id !== slotId || !i.slot) return [i];
    const left = i.slot.credits - by;
    return left > 0 ? [{ ...i, slot: { ...i.slot, credits: left } }] : [];
  });
}

// ── 진단·검사 ──────────────────────────────────────────────
export interface Bar {
  done: number;
  inProgress: number;
  planned: number;
  required: number;
}
export const barTotal = (b: Bar) => b.done + b.inProgress + b.planned;

export interface TermView {
  key: string;
  grade: number;
  afterTarget: boolean;
  items: PlanItem[];
  courseCredits: number;
  slotCredits: number;
  load: number;
}

export type Level = "error" | "todo" | "warn" | "confirm";

export interface Issue {
  level: Level;
  code: string;
  message: string;
  actions: { label: string; op: Op }[];
}

export interface Evaluation {
  terms: TermView[];
  diag: {
    total: Bar;
    major: Bar;
    general: Bar;
    coreCourses: { total: number; satisfied: number; missing: MajorCourse[] };
    generalGroups: { total: number; satisfied: number; missing: string[] };
    areas: { name: string; ok: boolean }[];
    competencies: { name: string; ok: boolean }[];
    slots: Record<SlotType, number>;
    capacity: { terms: number; available: number; needed: number; ok: boolean };
  };
  issues: Issue[];
  status: "작성 중" | "자동 검사 통과";
}

export function evaluate(s: PlanState, cur: Curriculum): Evaluation {
  const idx = courseIndex(cur);
  const req = cur.major.requirement;
  const issues: Issue[] = [];
  const add = (level: Level, code: string, message: string, actions: Issue["actions"] = []) =>
    issues.push({ level, code, message, actions });

  // 학기 보기
  const base = plannedTerms(s);
  const extra = s.items.map((i) => i.term).filter((t) => compareTerms(t, s.currentTerm) > 0 && !base.includes(t));
  const keys = [...new Set([...base, ...extra])].sort(compareTerms);
  const terms: TermView[] = keys.map((key) => {
    const items = s.items.filter((i) => i.term === key);
    const courseCredits = items.reduce((a, i) => a + (i.courseId ? idx.get(i.courseId)?.credits ?? 0 : 0), 0);
    const slotCredits = items.reduce((a, i) => a + (i.slot?.credits ?? 0), 0);
    return {
      key,
      grade: gradeOf(key, s.admissionYear),
      afterTarget: compareTerms(key, s.targetTerm) > 0,
      items,
      courseCredits,
      slotCredits,
      load: courseCredits + slotCredits,
    };
  });

  // 학점 집계 (실제 과목만)
  const planned = s.items.filter((i) => i.courseId).map((i) => i.courseId!);
  const bar = (pred: (c: AnyCourse) => boolean, required: number): Bar => {
    const sum = (ids: number[]) => ids.reduce((a, id) => a + (idx.get(id) && pred(idx.get(id)!) ? idx.get(id)!.credits : 0), 0);
    return { done: sum(s.completed), inProgress: sum(s.inProgress), planned: sum(planned), required };
  };
  const total = bar(() => true, req.total_credits);
  const major = bar((c) => c.kind === "major", req.major_basic_total + req.major_advanced);
  const general = bar((c) => c.kind === "general", req.general_total);

  const have = new Set([...s.completed, ...s.inProgress, ...planned]);

  // 중복
  const seen = new Map<number, number>();
  for (const id of [...s.completed, ...s.inProgress, ...planned]) seen.set(id, (seen.get(id) ?? 0) + 1);
  for (const [id, n] of seen) {
    if (n < 2) continue;
    const c = idx.get(id);
    const dupItems = s.items.filter((i) => i.courseId === id);
    const extraItem = s.completed.includes(id) || s.inProgress.includes(id) ? dupItems[0] : dupItems[1];
    add("error", "duplicate", `${c?.name ?? "과목"}이(가) 두 번 들어가 있어요.`,
      extraItem ? [{ label: `${termLabel(extraItem.term)}에서 빼기`, op: { type: "remove", itemId: extraItem.id } }] : []);
  }

  // 학기 학점 초과
  for (const t of terms) {
    if (t.load <= s.maxCredits) continue;
    const over = t.load - s.maxCredits;
    const targets = terms.filter((x) => x.key !== t.key && !x.afterTarget && s.maxCredits - x.load > 0);
    const movable = t.items
      .filter((i) => i.courseId && !isRequiredMajor(idx.get(i.courseId)!))
      .concat(t.items.filter((i) => i.courseId && isRequiredMajor(idx.get(i.courseId)!)))
      .slice(0, 2);
    const actions: Issue["actions"] = [];
    for (const i of movable) {
      const c = idx.get(i.courseId!)!;
      const dest = targets.find((x) => s.maxCredits - x.load >= c.credits && semOk(c, x.key));
      if (dest) actions.push({ label: `${c.name} → ${termLabel(dest.key)}`, op: { type: "move", itemId: i.id, to: dest.key } });
    }
    const slot = t.items.find((i) => i.slot);
    if (slot) {
      const dest = targets[0];
      if (dest) actions.push({ label: `빈 칸 ${slot.slot!.credits}학점 → ${termLabel(dest.key)}`, op: { type: "move", itemId: slot.id, to: dest.key } });
    }
    add("error", "over_credit", `${termLabel(t.key)}이(가) ${t.load}학점으로 최대 ${s.maxCredits}학점보다 ${over}학점 많아요.`, actions);
  }

  // 필수 과목 (전공공통·전공필수)
  const core = cur.major.courses.filter((c) => c.category !== "전공선택");
  const missingCore = core.filter((c) => !have.has(c.id));
  for (const c of missingCore) {
    const dest = terms.find((x) => !x.afterTarget && s.maxCredits - x.load >= c.credits && c.semesters.includes(parseTerm(x.key).sem))
      ?? terms.find((x) => !x.afterTarget && s.maxCredits - x.load >= c.credits);
    add("error", "missing_required", `${c.category} ${c.name}이(가) 계획에 없어요.`,
      dest ? [{ label: `${termLabel(dest.key)}에 넣기`, op: { type: "add", courseId: c.id, term: dest.key } }] : []);
  }

  // 필수교양 그룹
  const groups = [...new Set(cur.general.map((g) => g.requiredGroup).filter((x): x is string => !!x))];
  const missingGroups = groups.filter((gr) => !cur.general.some((g) => g.requiredGroup === gr && have.has(g.id)));
  for (const gr of missingGroups) {
    const opts = cur.general.filter((g) => g.requiredGroup === gr);
    const pick = opts.find((g) => g.name.includes("자연기술")) ?? opts[0];
    const dest = terms.find((x) => !x.afterTarget && s.maxCredits - x.load >= pick.credits);
    add("error", "missing_group", `필수교양 '${gr}'을(를) 아직 안 들었고 계획에도 없어요.`,
      dest ? [{ label: `${pick.name} → ${termLabel(dest.key)}`, op: { type: "add", courseId: pick.id, term: dest.key } }] : []);
  }

  // 학점 용량: 희망 졸업학기까지 다 들을 수 있나 (졸업요건 충족과는 별개)
  const remainingTerms = base.length;
  const available = remainingTerms * s.maxCredits;
  const needed = Math.max(0, req.total_credits - total.done - total.inProgress);
  const capacity = { terms: remainingTerms, available, needed, ok: available >= needed };
  if (!capacity.ok) {
    const short = needed - available;
    const later = nextTerm(s.targetTerm);
    const raise = Math.min(30, Math.ceil(needed / Math.max(1, remainingTerms)));
    add("error", "capacity",
      `${termLabel(s.targetTerm)}까지 남은 ${remainingTerms}학기 × ${s.maxCredits}학점 = ${available}학점이라, 남은 ${needed}학점보다 ${short}학점 부족해요.`,
      [
        { label: `졸업학기를 ${termLabel(later)}로 늦추기`, op: { type: "setTarget", term: later } },
        ...(raise > s.maxCredits ? [{ label: `학기당 최대 ${raise}학점으로 올리기`, op: { type: "setMax", value: raise } as Op }] : []),
      ]);
  }

  // 희망 졸업학기 이후에 놓인 계획
  const late = terms.filter((t) => t.afterTarget && t.items.length > 0);
  if (late.length) {
    const last = late[late.length - 1].key;
    add("error", "after_target", `희망 졸업학기(${termLabel(s.targetTerm)}) 뒤에 계획이 ${late.reduce((a, t) => a + t.items.length, 0)}개 있어요.`,
      [{ label: `졸업학기를 ${termLabel(last)}로 바꾸기`, op: { type: "setTarget", term: last } }]);
  }

  // 빈 칸
  const slots: Record<SlotType, number> = { 전공선택: 0, 교양선택: 0, 자유선택: 0 };
  for (const i of s.items) if (i.slot) slots[i.slot.type] += i.slot.credits;

  // 졸업요건 (실제 과목 기준). 빈 칸으로 메울 수 있으면 "할 일", 빈 칸으로도 모자라면 오류
  const shortfall = (b: Bar, name: string, covering: number, slotType: SlotType) => {
    const short = b.required - barTotal(b);
    if (short <= 0) return;
    if (covering >= short) {
      add("todo", `short_${name}`, `${name} ${short}학점이 더 필요해요. 빈 칸에 과목을 골라 채우세요.`);
    } else {
      const dest = terms.find((x) => !x.afterTarget && s.maxCredits - x.load > 0);
      const gap = short - covering;
      add("error", `short_${name}`, `${name} ${short}학점이 더 필요한데 빈 칸이 ${covering}학점뿐이에요 (${gap}학점 부족).${capacity.ok ? "" : " 학점 용량을 먼저 늘린 뒤 빈 칸을 추가하세요."}`,
        dest ? [{ label: `${termLabel(dest.key)}에 ${slotType} 빈 칸 ${Math.min(gap, s.maxCredits - dest.load)}학점 추가`, op: { type: "addSlot", slotType, credits: Math.min(gap, s.maxCredits - dest.load), term: dest.key } }] : []);
    }
  };
  shortfall(major, "전공", slots.전공선택 + slots.자유선택, "전공선택");
  shortfall(general, "교양", slots.교양선택 + slots.자유선택, "교양선택");
  shortfall(total, "졸업", slots.전공선택 + slots.교양선택 + slots.자유선택, "자유선택");

  // 교양 영역·핵심역량 (균형교양)
  const haveGeneral = cur.general.filter((g) => have.has(g.id));
  const areas = AREAS.map((name) => ({ name, ok: haveGeneral.some((g) => g.area === name) }));
  const competencies = COMPETENCIES.map((name) => ({ name, ok: haveGeneral.some((g) => g.category === "균형교양" && g.competency === name) }));
  const missArea = areas.filter((a) => !a.ok).map((a) => a.name);
  const missComp = competencies.filter((a) => !a.ok).map((a) => a.name);
  if (missArea.length || missComp.length) {
    add("todo", "balance",
      `균형교양에서 ${[missArea.length ? `영역 ${missArea.join("·")}` : "", missComp.length ? `역량 ${missComp.join("·")}` : ""].filter(Boolean).join(", ")}을(를) 1과목 이상 들어야 해요. 교양 빈 칸을 채울 때 이 조건의 과목을 고르세요.`);
  }

  // 참고 경고 (통과를 막지 않음)
  for (const t of terms) {
    for (const i of t.items) {
      const c = i.courseId ? idx.get(i.courseId) : undefined;
      if (!c || c.kind !== "major") continue;
      if (!semOk(c, t.key)) {
        const dest = terms.find((x) => x.key !== t.key && !x.afterTarget && semOk(c, x.key) && s.maxCredits - x.load >= c.credits);
        add("warn", "semester", `${c.name}은(는) 교육과정표상 ${c.semesters.join("·")}학기 과목인데 ${termLabel(t.key)}에 있어요.`,
          dest ? [{ label: `${termLabel(dest.key)}로 옮기기`, op: { type: "move", itemId: i.id, to: dest.key } }] : []);
      }
      if (t.grade < c.year) add("warn", "early", `${c.name}은(는) ${c.year}학년 권장 과목인데 ${t.grade}학년에 있어요.`);
    }
  }

  // 확인 필요 (자동으로 판정하지 않는 것)
  if (s.admissionYear !== cur.year) {
    add("confirm", "curriculum_year", `${cur.year}학년도 교육과정 기준으로 계산했어요. ${s.admissionYear}학번 교육과정과 다를 수 있으니 학과에서 확인하세요.`);
  }
  if (!cur.major.verified) add("confirm", "unverified", "이 전공은 졸업요건 검증 전이라 결과가 정확하지 않을 수 있어요.");
  add("confirm", "offering", "교육과정표의 학기는 실제 개설을 보장하지 않아요. 수강신청 전 개설 여부를 확인하세요.");
  add("confirm", "abeek", "공학교육인증 이수 여부에 따라 교양 영역·역량 요건이 달라질 수 있어요.");

  const status = issues.some((i) => i.level === "error" || i.level === "todo") ? "작성 중" : "자동 검사 통과";

  return {
    terms,
    diag: {
      total, major, general,
      coreCourses: { total: core.length, satisfied: core.length - missingCore.length, missing: missingCore },
      generalGroups: { total: groups.length, satisfied: groups.length - missingGroups.length, missing: missingGroups },
      areas, competencies, slots, capacity,
    },
    issues,
    status,
  };
}

function semOk(c: AnyCourse, term: string): boolean {
  return c.kind !== "major" || c.semesters.includes(parseTerm(term).sem);
}

/** 빈 칸이나 학기에 넣을 수 있는 과목 후보 */
export function candidates(s: PlanState, cur: Curriculum, opts: { slotType?: SlotType; slotCredits?: number; term: string }): AnyCourse[] {
  const idx = courseIndex(cur);
  const taken = new Set([...s.completed, ...s.inProgress, ...s.items.filter((i) => i.courseId).map((i) => i.courseId!)]);
  const interests = new Set(s.interests);
  const sem = parseTerm(opts.term).sem;
  const list = [...idx.values()].filter((c) => {
    if (taken.has(c.id)) return false;
    if (opts.slotType) return slotTypesFor(c).includes(opts.slotType);
    return true;
  });
  const score = (c: AnyCourse) =>
    (opts.slotCredits !== undefined && c.credits > opts.slotCredits ? 100 : 0) +
    (interests.has(c.id) ? 0 : 10) + (c.kind === "major" && !c.semesters.includes(sem) ? 5 : 0) + (c.kind === "major" ? c.year : 3);
  return list.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
}
