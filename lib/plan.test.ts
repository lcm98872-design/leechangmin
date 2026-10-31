import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyOp, barTotal, courseIndex, defaultTarget, evaluate, generateDraft, gradeAt,
  type Curriculum, type GeneralCourse, type MajorCourse, type PlanState,
} from "./plan";

// ── 실제 교육과정 데이터(db/*.csv)로 테스트 ────────────────────
function csv(name: string): Record<string, string>[] {
  const [head, ...lines] = readFileSync(join(__dirname, "..", "db", name), "utf8").trim().split("\n");
  const split = (l: string) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, ""));
  const keys = split(head);
  return lines.map((l) => Object.fromEntries(split(l).map((v, i) => [keys[i], v])));
}
let nid = 1;
const majorCourses: MajorCourse[] = csv("major_courses_sme.csv")
  .filter((r) => r["전공"] === "산업경영공학전공")
  .map((r) => ({
    id: nid++, name: r["과목명"], credits: +r["학점"], category: r["이수구분"] as MajorCourse["category"],
    year: +r["학년"], semesters: r["안내서상 학기"].replace("학기", "").split(",").map(Number) as (1 | 2)[],
  }));
const general: GeneralCourse[] = csv("general_courses.csv").map((r) => ({
  id: nid++, name: r["교과목명"], credits: +r["학점"], category: r["구분"] as GeneralCourse["category"],
  competency: r["핵심역량"] || null, area: r["영역"] || null, requiredGroup: r["필수 이수그룹"] || null,
}));
const cur: Curriculum = {
  year: 2026,
  major: {
    id: 1, name: "산업경영공학전공", department: "시스템경영·안전공학부", verified: true,
    requirement: { total_credits: 132, general_total: 40, major_basic_total: 45, major_advanced: 36 },
    courses: majorCourses,
  },
  general,
};
const byName = (n: string) => [...majorCourses, ...general].find((c) => c.name === n)!;

// 1학년 1학기에 19학점 이수, 2학기(지금)에 17학점 수강 중인 학생
const balanced3 = general.filter((g) => g.category === "균형교양" && g.credits === 3);
const FIRST_SEM = [
  ...["대학생활과진로설계", "컴퓨팅사고-자연기술", "사유와표현-자연기술", "글로벌외국어-대학영어"].map((n) => byName(n).id),
  ...balanced3.slice(0, 4).map((g) => g.id),
];
const SECOND_SEM = [...["프론티어리더십", "부경인성세미나"].map((n) => byName(n).id), ...balanced3.slice(4, 9).map((g) => g.id)];

// 2026학번, 지금 2026-2 수강 중, 2029-2 졸업 목표
const freshman = (over: Partial<PlanState> = {}): PlanState => {
  const s: PlanState = {
    majorId: 1, admissionYear: 2026, currentTerm: "2026-2", targetTerm: "2029-2", maxCredits: 18,
    completed: FIRST_SEM, inProgress: SECOND_SEM, interests: [], pastLeaves: 0, leaveTerms: [],
    items: [], ...over,
  };
  return { ...s, items: generateDraft(s, cur) };
};
const plannedIds = (s: PlanState) => s.items.filter((i) => i.courseId).map((i) => i.courseId!);

describe("초안 생성", () => {
  it("현재 학기 다음부터 희망 졸업학기까지 6학기를 계획한다", () => {
    const ev = evaluate(freshman(), cur);
    expect(ev.terms.map((t) => t.key)).toEqual(["2027-1", "2027-2", "2028-1", "2028-2", "2029-1", "2029-2"]);
  });

  it("전공공통·전공필수는 모두 실제 과목으로 넣는다", () => {
    const s = freshman();
    const core = majorCourses.filter((c) => c.category !== "전공선택").map((c) => c.id);
    expect(plannedIds(s)).toEqual(expect.arrayContaining(core));
  });

  it("이수·수강 중인 과목은 다시 넣지 않는다", () => {
    const s = freshman();
    for (const id of [...FIRST_SEM, ...SECOND_SEM]) expect(plannedIds(s)).not.toContain(id);
  });

  it("전공선택·교양선택은 과목을 정하지 않고 빈 칸으로 둔다", () => {
    const s = freshman();
    const electives = majorCourses.filter((c) => c.category === "전공선택").map((c) => c.id);
    expect(plannedIds(s).some((id) => electives.includes(id))).toBe(false);
    expect(s.items.some((i) => i.slot?.type === "전공선택")).toBe(true);
    expect(s.items.some((i) => i.slot?.type === "교양선택")).toBe(true);
  });

  it("빈 칸 학점은 3학점 고정이 아니라 부족한 만큼이다", () => {
    const s = freshman();
    const ev = evaluate(s, cur);
    const sum = ev.diag.slots.전공선택 + ev.diag.slots.교양선택 + ev.diag.slots.자유선택;
    expect(sum).toBe(132 - barTotal(ev.diag.total)); // 실제 과목 + 빈 칸 = 졸업학점
    expect(ev.diag.slots.전공선택).toBe(81 - barTotal(ev.diag.major));
  });

  it("어느 학기도 최대 학점을 넘지 않는다", () => {
    for (const maxCredits of [15, 18, 21]) {
      const ev = evaluate(freshman({ maxCredits }), cur);
      for (const t of ev.terms) expect(t.load).toBeLessThanOrEqual(maxCredits);
    }
  });

  it("듣고 싶은 교양을 넣고, 필수교양 택1 그룹에서도 그 과목을 고른다", () => {
    const jp = byName("글로벌외국어-대학일본어").id;
    const like = general.filter((g) => g.category === "균형교양" && g.credits === 2)[0].id;
    const english = byName("글로벌외국어-대학영어").id;
    const s = freshman({ interests: [jp, like], completed: FIRST_SEM.filter((id) => id !== english) });
    expect(plannedIds(s)).toEqual(expect.arrayContaining([jp, like]));
    expect(plannedIds(s)).not.toContain(byName("글로벌외국어-대학영어").id);
  });
});

describe("진단과 검사", () => {
  it("빈 칸은 졸업요건 학점에 세지 않는다 → 초안은 '작성 중'", () => {
    const ev = evaluate(freshman(), cur);
    expect(barTotal(ev.diag.total)).toBeLessThan(132);
    expect(ev.status).toBe("작성 중");
    expect(ev.issues.some((i) => i.level === "todo" && i.code === "short_전공")).toBe(true);
    expect(ev.issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("학점 용량과 졸업요건을 따로 본다: 용량이 충분해도 필수과목이 빠지면 오류", () => {
    const s = freshman();
    const sim = s.items.find((i) => i.courseId === byName("시뮬레이션").id)!;
    const ev = evaluate(applyOp(s, { type: "remove", itemId: sim.id }, cur), cur);
    expect(ev.diag.capacity.ok).toBe(true);
    expect(ev.issues.some((i) => i.code === "missing_required" && i.message.includes("시뮬레이션"))).toBe(true);
  });

  it("빠진 필수과목은 제안 버튼으로 다시 넣을 수 있다", () => {
    const s = freshman();
    const sim = s.items.find((i) => i.courseId === byName("시뮬레이션").id)!;
    const removed = applyOp(s, { type: "remove", itemId: sim.id }, cur);
    const fix = evaluate(removed, cur).issues.find((i) => i.code === "missing_required")!.actions[0];
    const ev = evaluate(applyOp(removed, fix.op, cur), cur);
    expect(ev.issues.some((i) => i.code === "missing_required")).toBe(false);
  });

  it("학기 학점을 넘기면 오류와 옮길 학기를 제안하고, 제안을 따르면 해결된다", () => {
    const s = freshman();
    const t1 = s.items.filter((i) => i.term === "2027-2" && i.courseId).slice(0, 2);
    let moved = s;
    for (const i of t1) moved = applyOp(moved, { type: "move", itemId: i.id, to: "2027-1" }, cur);
    const over = evaluate(moved, cur).issues.find((i) => i.code === "over_credit");
    expect(over).toBeDefined();
    expect(over!.actions.length).toBeGreaterThan(0);
    const fixed = applyOp(moved, over!.actions[0].op, cur);
    const after = evaluate(fixed, cur).terms.find((t) => t.key === "2027-1")!;
    expect(after.load).toBeLessThan(evaluate(moved, cur).terms.find((t) => t.key === "2027-1")!.load);
  });

  it("희망 졸업학기까지 학점이 모자라면 용량 오류 → 졸업학기를 늦추면 해결", () => {
    const s = freshman({ maxCredits: 12 });
    const ev = evaluate(s, cur);
    const cap = ev.issues.find((i) => i.code === "capacity")!;
    expect(cap).toBeDefined();
    expect(ev.diag.capacity.ok).toBe(false);
    let next = s;
    for (let k = 0; k < 6 && !evaluate(next, cur).diag.capacity.ok; k++) {
      next = applyOp(next, evaluate(next, cur).issues.find((i) => i.code === "capacity")!.actions[0].op, cur);
    }
    expect(evaluate(next, cur).diag.capacity.ok).toBe(true);
  });

  it("빈 칸을 과목으로 채우면 빈 칸 학점이 줄고 진단 학점이 늘어난다 (중복 계산 없음)", () => {
    const s = freshman();
    const slot = s.items.find((i) => i.slot?.type === "전공선택" && i.slot.credits >= 3)!;
    const before = evaluate(s, cur);
    const elective = majorCourses.find((c) => c.category === "전공선택")!;
    const after = evaluate(applyOp(s, { type: "fillSlot", itemId: slot.id, courseId: elective.id }, cur), cur);
    expect(barTotal(after.diag.major)).toBe(barTotal(before.diag.major) + elective.credits);
    expect(after.diag.slots.전공선택).toBe(before.diag.slots.전공선택 - elective.credits);
    const termBefore = before.terms.find((t) => t.key === slot.term)!.load;
    const termAfter = after.terms.find((t) => t.key === slot.term)!.load;
    expect(termAfter).toBe(termBefore); // 학기 학점은 그대로
  });

  it("같은 과목을 두 번 넣으면 오류", () => {
    const s = freshman();
    const c = byName("인간공학").id;
    const ev = evaluate(applyOp(s, { type: "add", courseId: c, term: "2029-2" }, cur), cur);
    expect(ev.issues.some((i) => i.code === "duplicate")).toBe(true);
  });

  it("오류가 없어도 '확인 필요'는 항상 따로 보여 준다", () => {
    const ev = evaluate(freshman(), cur);
    expect(ev.issues.filter((i) => i.level === "confirm").length).toBeGreaterThan(0);
  });

  it("2026이 아닌 학번은 교육과정 기준 확인 안내가 붙는다", () => {
    const ev = evaluate(freshman({ admissionYear: 2024, targetTerm: "2027-2" }), cur);
    expect(ev.issues.some((i) => i.code === "curriculum_year")).toBe(true);
  });

  it("모든 빈 칸을 요건에 맞는 과목으로 채우면 '자동 검사 통과'", () => {
    let s = freshman({ maxCredits: 24 });
    const idx = courseIndex(cur);
    for (let guard = 0; guard < 200; guard++) {
      const slot = s.items.find((i) => i.slot);
      if (!slot) break;
      const ev = evaluate(s, cur);
      const missArea = ev.diag.areas.filter((a) => !a.ok).map((a) => a.name);
      const missComp = ev.diag.competencies.filter((a) => !a.ok).map((a) => a.name);
      const taken = new Set([...s.completed, ...s.inProgress, ...s.items.filter((i) => i.courseId).map((i) => i.courseId!)]);
      const pool = [...idx.values()].filter((c) => !taken.has(c.id) && 
        (slot.slot!.type === "전공선택" ? c.kind === "major" && c.category === "전공선택"
          : slot.slot!.type === "교양선택" ? c.kind === "general" && c.category === "균형교양"
          : (c.kind === "major" && c.category === "전공선택") || (c.kind === "general" && c.category === "균형교양")));
      const fits = pool.filter((c) => c.credits <= slot.slot!.credits);
      const pick = fits.find((c) => c.kind === "general" && (missArea.includes(c.area ?? "") || missComp.includes(c.competency ?? ""))) ?? fits[0] ?? pool[0];
      if (!pick) break;
      s = applyOp(s, { type: "fillSlot", itemId: slot.id, courseId: pick.id }, cur);
    }
    const ev = evaluate(s, cur);
    expect(ev.issues.filter((i) => i.level === "error" || i.level === "todo")).toEqual([]);
    expect(ev.status).toBe("자동 검사 통과");
    expect(ev.issues.some((i) => i.level === "confirm")).toBe(true);
  });
});

describe("휴학", () => {
  it("지난 휴학 학기 수를 빼고 학년을 계산한다 (2022학번 + 휴학 4학기 → 지금 3학년)", () => {
    const s = { admissionYear: 2022, currentTerm: "2026-2", targetTerm: "2027-2", pastLeaves: 4, leaveTerms: [] };
    expect(gradeAt(s, "2026-2")).toBe(3);
    expect(gradeAt(s, "2027-1")).toBe(4);
    expect(defaultTarget(s)).toBe("2027-2");
    expect(gradeAt({ ...s, pastLeaves: 0 }, "2026-2")).toBe(5); // 휴학 없으면 초과학기
  });

  it("휴학 예정 학기는 기본 졸업학기를 늦추고, 그 뒤 학년이 한 학기씩 밀린다", () => {
    const s = { admissionYear: 2026, currentTerm: "2026-2", pastLeaves: 0, leaveTerms: ["2027-1", "2027-2"] };
    expect(defaultTarget(s)).toBe("2030-2");
    expect(gradeAt({ ...s, targetTerm: "2030-2" }, "2027-1")).toBe(0);
    expect(gradeAt({ ...s, targetTerm: "2030-2" }, "2028-1")).toBe(2);
  });

  it("휴학 예정 학기에는 초안을 배치하지 않는다", () => {
    const s = freshman({ leaveTerms: ["2027-2"], targetTerm: "2030-1" });
    expect(s.items.some((i) => i.term === "2027-2")).toBe(false);
    const ev = evaluate(s, cur);
    expect(ev.terms.find((t) => t.key === "2027-2")?.leave).toBe(true);
    expect(ev.diag.capacity.terms).toBe(6);
  });

  it("작업대에서 휴학으로 바꾸면 그 학기 과목이 다음 학기로 밀리고 용량이 줄어든다", () => {
    const s = freshman();
    const before = evaluate(s, cur);
    const moved = s.items.filter((i) => i.term === "2027-2").length;
    const next = applyOp(s, { type: "toggleLeave", term: "2027-2" }, cur);
    const ev = evaluate(next, cur);
    expect(next.items.some((i) => i.term === "2027-2")).toBe(false);
    expect(ev.terms.find((t) => t.key === "2028-1")!.items.length).toBeGreaterThanOrEqual(moved);
    expect(ev.diag.capacity.available).toBe(before.diag.capacity.available - 18);
    // 다시 누르면 휴학 취소
    expect(applyOp(next, { type: "toggleLeave", term: "2027-2" }, cur).leaveTerms).toEqual([]);
  });

  it("휴학 학기에 과목이 남아 있으면 오류와 옮길 학기를 제안한다", () => {
    const s = freshman();
    const item = s.items.find((i) => i.term === "2027-1")!;
    const withLeave = { ...s, leaveTerms: ["2027-1"] };
    const iss = evaluate(withLeave, cur).issues.find((i) => i.code === "leave_items")!;
    expect(iss).toBeDefined();
    const fixed = applyOp(withLeave, iss.actions[0].op, cur);
    expect(fixed.items.find((i) => i.id === item.id)!.term).not.toBe("2027-1");
  });
});

describe("학년 확인", () => {
  it("들은 학점에 비해 학년이 낮으면 알려 주고, 고치기 버튼으로 학년을 바꾼다", () => {
    const many = [...majorCourses.filter((c) => c.year <= 3).map((c) => c.id), ...FIRST_SEM]; // 약 80학점 이상
    const s = freshman({ completed: many });
    const ev = evaluate(s, cur);
    const iss = ev.issues.find((i) => i.code === "grade_mismatch")!;
    expect(iss).toBeDefined();
    const fixed = applyOp(s, iss.actions[0].op, cur);
    const ev2 = evaluate(fixed, cur);
    expect(ev2.diag.now.grade).toBeGreaterThan(ev.diag.now.grade);
    expect(ev2.issues.some((i) => i.code === "grade_mismatch")).toBe(false);
  });

  it("평범한 1학년은 학년 경고가 없다", () => {
    expect(evaluate(freshman(), cur).issues.some((i) => i.code === "grade_mismatch")).toBe(false);
  });
});
