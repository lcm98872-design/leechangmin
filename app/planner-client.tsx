"use client";

import { useMemo, useState } from "react";
import { AREAS, generatePlan, type GeneralCourse, type MajorCourse, type Requirement } from "@/lib/planner";

export interface MajorData {
  id: number;
  name: string;
  requirement: Requirement;
  courses: MajorCourse[];
}

const thisYear = new Date().getFullYear();

const box = "rounded-lg border border-zinc-200 p-4 dark:border-zinc-800";
const input = "rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700";

const reasonColor: Record<string, string> = {
  "필수": "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  "관심 교양": "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  "영역·역량 충족": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "교양 학점": "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  "전공선택": "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  "졸업 학점": "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export default function Planner({ majors, general }: { majors: MajorData[]; general: GeneralCourse[] }) {
  const [majorId, setMajorId] = useState(majors[0]?.id);
  const [startYear, setStartYear] = useState(thisYear + 1);
  const [startSemester, setStartSemester] = useState<1 | 2>(1);
  const [startGrade, setStartGrade] = useState(1);
  const [maxCredits, setMaxCredits] = useState(18);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [interests, setInterests] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<string>("전체");

  const major = majors.find((m) => m.id === majorId) ?? majors[0];

  const toggle = (set: Set<number>, setter: (s: Set<number>) => void, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  const plan = useMemo(
    () =>
      major &&
      generatePlan({
        requirement: major.requirement,
        majorCourses: major.courses,
        generalCourses: general,
        completedIds: [...completed],
        interestIds: [...interests],
        maxCredits,
        startYear,
        startSemester,
        startGrade,
      }),
    [major, general, completed, interests, maxCredits, startYear, startSemester, startGrade],
  );

  const filteredGeneral = general.filter(
    (g) =>
      (area === "전체" || (area === "필수교양" ? g.category === "필수교양" : g.area === area)) &&
      (query === "" || g.name.includes(query)),
  );

  if (!major || !plan) return <p className="mt-8">전공 데이터가 없습니다.</p>;

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {/* ── 입력 ── */}
      <section className="space-y-6">
        <div className={box}>
          <h2 className="font-semibold">1. 내 정보</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <label className="col-span-2 flex flex-col gap-1">
              전공
              <select className={input} value={major.id} onChange={(e) => { setMajorId(Number(e.target.value)); setCompleted(new Set()); }}>
                {majors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              계획 시작 학기
              <span className="flex gap-1">
                <input className={`${input} w-20`} type="number" value={startYear} onChange={(e) => setStartYear(Number(e.target.value))} />
                <select className={input} value={startSemester} onChange={(e) => setStartSemester(Number(e.target.value) as 1 | 2)}>
                  <option value={1}>1학기</option>
                  <option value={2}>2학기</option>
                </select>
              </span>
            </label>
            <label className="flex flex-col gap-1">
              그 학기 학년
              <select className={input} value={startGrade} onChange={(e) => setStartGrade(Number(e.target.value))}>
                {[1, 2, 3, 4].map((g) => <option key={g} value={g}>{g}학년</option>)}
              </select>
            </label>
            <label className="col-span-2 flex flex-col gap-1">
              학기당 최대 학점
              <input className={`${input} w-24`} type="number" min={3} max={24} value={maxCredits} onChange={(e) => setMaxCredits(Math.max(3, Number(e.target.value)))} />
            </label>
          </div>
        </div>

        <div className={box}>
          <h2 className="font-semibold">2. 이미 들은 전공 과목</h2>
          <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto text-sm">
            {major.courses.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={completed.has(c.id)} onChange={() => toggle(completed, setCompleted, c.id)} />
                  <span>{c.name}</span>
                  <span className="text-xs text-zinc-500">{c.category} · {c.year}학년 {c.semesters.join(",")}학기</span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className={box}>
          <h2 className="font-semibold">3. 교양: 들은 과목 ✓ / 관심 교양 ★</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <input className={`${input} flex-1`} placeholder="과목명 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className={input} value={area} onChange={(e) => setArea(e.target.value)}>
              {["전체", "필수교양", ...AREAS].map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
          <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto text-sm">
            {filteredGeneral.map((g) => (
              <li key={g.id} className="flex items-center gap-2">
                <label title="들은 과목" className="flex items-center">
                  <input type="checkbox" checked={completed.has(g.id)} onChange={() => toggle(completed, setCompleted, g.id)} />
                </label>
                <button
                  type="button"
                  title="관심 교양"
                  className={interests.has(g.id) ? "text-amber-500" : "text-zinc-300 dark:text-zinc-600"}
                  onClick={() => toggle(interests, setInterests, g.id)}
                >
                  ★
                </button>
                <span>{g.name}</span>
                <span className="text-xs text-zinc-500">
                  {g.category === "필수교양" ? `필수 · ${g.requiredGroup}` : `${g.area} · ${g.competency}`} · {g.credits}학점
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">관심 교양 {interests.size}개 · 들은 교양 {general.filter((g) => completed.has(g.id)).length}개</p>
        </div>
      </section>

      {/* ── 결과 ── */}
      <section className="space-y-4">
        <div className={box}>
          <h2 className="font-semibold">졸업까지 계획 ({plan.terms.length}학기 · {plan.totalPlanned}학점)</h2>
          <p className="mt-1 text-xs text-zinc-500">
            <span className={`rounded px-1 ${reasonColor["필수"]}`}>필수</span> 과목은 학점이 모자라도 학기를 늘려 반드시 넣습니다.
          </p>
          {plan.warnings.map((w) => (
            <p key={w} className="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">⚠ {w}</p>
          ))}
        </div>
        {plan.terms.map((t) => (
          <div key={`${t.year}-${t.semester}`} className={box}>
            <h3 className="flex justify-between font-medium">
              <span>{t.year}년 {t.semester}학기 <span className="text-sm text-zinc-500">({t.grade > 4 ? "초과학기" : `${t.grade}학년`})</span></span>
              <span className="text-sm">{t.credits} / {maxCredits}학점</span>
            </h3>
            <ul className="mt-2 space-y-1 text-sm">
              {t.courses.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <span className={`shrink-0 rounded px-1.5 text-xs ${reasonColor[c.reason]}`}>{c.reason}</span>
                  <span>{c.name}</span>
                  <span className="text-xs text-zinc-500">{c.label} · {c.credits}학점</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
