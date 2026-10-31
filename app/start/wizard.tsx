"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AREAS, evaluate, generateDraft, type GeneralCourse, type MajorData, type PlanState } from "@/lib/plan";
import { compareTerms, defaultTargetTerm, gradeOf, nextTerm, parseTerm, termKey, termLabel, termRange } from "@/lib/terms";
import { createPlanAction } from "../actions";

type Status = "completed" | "inProgress";

const card = "rounded-xl border border-zinc-200 p-5 dark:border-zinc-800";
const field = "rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700";
const STEPS = ["기본정보", "이수 과목", "듣고 싶은 교양"];

export default function StartWizard(props: {
  mode: "new" | "check";
  majors: MajorData[];
  general: GeneralCourse[];
  currentTerm: string;
  curriculumYear: number;
}) {
  const { majors, general, currentTerm, curriculumYear } = props;
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [majorId, setMajorId] = useState(majors[0]?.id);
  const [admissionYear, setAdmissionYear] = useState(props.mode === "new" ? parseTerm(currentTerm).year : parseTerm(currentTerm).year - 2);
  const [targetTerm, setTargetTerm] = useState(defaultTargetTerm(admissionYear));
  const [maxCredits, setMaxCredits] = useState(18);
  const [taken, setTaken] = useState<Map<number, Status>>(new Map());
  const [interests, setInterests] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<"major" | "general">(props.mode === "new" ? "general" : "major");
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("전체");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const major = majors.find((m) => m.id === majorId) ?? majors[0];
  const grade = gradeOf(currentTerm, admissionYear);
  const targetOptions = termRange(nextTerm(currentTerm), termKey(parseTerm(currentTerm).year + 8, 2));

  const allCourses = useMemo(
    () => new Map<number, { name: string; credits: number; kind: "major" | "general" }>([
      ...general.map((g) => [g.id, { name: g.name, credits: g.credits, kind: "general" as const }] as const),
      ...major.courses.map((c) => [c.id, { name: c.name, credits: c.credits, kind: "major" as const }] as const),
    ]),
    [general, major],
  );
  const sum = (st: Status) => [...taken].filter(([, s]) => s === st).reduce((a, [id]) => a + (allCourses.get(id)?.credits ?? 0), 0);

  const setStatus = (ids: number[], st: Status | null) => {
    const next = new Map(taken);
    for (const id of ids) {
      if (st) next.set(id, st);
      else next.delete(id);
    }
    setTaken(next);
  };

  const changeAdmission = (y: number) => {
    setAdmissionYear(y);
    const t = defaultTargetTerm(y);
    setTargetTerm(compareTerms(t, currentTerm) > 0 ? t : nextTerm(nextTerm(currentTerm)));
  };

  const finish = () => {
    setError("");
    const base: PlanState = {
      majorId: major.id,
      admissionYear,
      currentTerm,
      targetTerm,
      maxCredits,
      completed: [...taken].filter(([, s]) => s === "completed").map(([id]) => id),
      inProgress: [...taken].filter(([, s]) => s === "inProgress").map(([id]) => id),
      interests: [...interests],
      items: [],
    };
    const cur = { year: curriculumYear, major, general };
    const state = { ...base, items: generateDraft(base, cur) };
    const status = evaluate(state, cur).status;
    startTransition(async () => {
      const res = await createPlanAction(state, status);
      if (res.code) router.push(`/plan/${res.code}`);
      else setError(res.error ?? "저장에 실패했어요.");
    });
  };

  // 전공 과목을 학년·학기 묶음으로
  const majorGroups = useMemo(() => {
    const g = new Map<string, typeof major.courses>();
    for (const c of major.courses) {
      const key = `${c.year}학년 ${c.semesters.join("·")}학기`;
      g.set(key, [...(g.get(key) ?? []), c]);
    }
    return [...g];
  }, [major]);

  const generalList = general.filter(
    (g) => (area === "전체" || (area === "필수교양" ? g.category === "필수교양" : g.area === area)) && (!query || g.name.includes(query)),
  );

  return (
    <div>
      <h1 className="text-2xl font-bold">{props.mode === "new" ? "처음 수강 계획 세우기" : "내 졸업요건 점검하기"}</h1>
      <ol className="mt-4 flex gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className={`rounded-full px-3 py-1 ${i === step ? "bg-teal-700 text-white" : i < step ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-900"}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className={`${card} mt-6 grid gap-4 sm:grid-cols-2`}>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm font-medium">전공</span>
            <select className={field} value={major.id} onChange={(e) => { setMajorId(Number(e.target.value)); setTaken(new Map()); }}>
              {majors.map((m) => <option key={m.id} value={m.id}>{m.department} · {m.name}{m.verified ? "" : " (검증 전)"}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">입학년도</span>
            <select className={field} value={admissionYear} onChange={(e) => changeAdmission(Number(e.target.value))}>
              {Array.from({ length: 8 }, (_, i) => parseTerm(currentTerm).year - i).map((y) => <option key={y} value={y}>{y}학번</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">현재 학기</span>
            <p className={`${field} text-zinc-600 dark:text-zinc-400`}>{termLabel(currentTerm)} · {grade}학년{grade > 4 ? " (초과학기)" : ""}</p>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">희망 졸업학기</span>
            <select className={field} value={targetTerm} onChange={(e) => setTargetTerm(e.target.value)}>
              {targetOptions.map((t) => <option key={t} value={t}>{termLabel(t)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">학기당 최대 학점</span>
            <input className={field} type="number" min={3} max={30} value={maxCredits} onChange={(e) => setMaxCredits(Number(e.target.value))} />
          </label>
          {admissionYear !== curriculumYear && (
            <p className="rounded-lg bg-zinc-100 p-3 text-sm text-zinc-700 sm:col-span-2 dark:bg-zinc-900 dark:text-zinc-300">
              ⓘ {curriculumYear}학년도 교육과정 기준으로 계산해요. {admissionYear}학번 교육과정과 다를 수 있으니 결과는 참고용으로 보고, 학과에서 확인하세요.
            </p>
          )}
          <p className="text-sm text-zinc-500 sm:col-span-2">
            남은 학기: {termLabel(nextTerm(currentTerm))} ~ {termLabel(targetTerm)} ({termRange(nextTerm(currentTerm), targetTerm).length}학기)
          </p>
        </section>
      )}

      {step === 1 && (
        <section className={`${card} mt-6`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1">
              {(["major", "general"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm ${tab === t ? "bg-teal-700 text-white" : "bg-zinc-100 dark:bg-zinc-900"}`}>
                  {t === "major" ? "전공" : "교양"}
                </button>
              ))}
            </div>
            <p className="text-sm">
              이수 완료 <b>{sum("completed")}</b>학점 · 수강 중({termLabel(currentTerm)}) <b>{sum("inProgress")}</b>학점
            </p>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            체크하면 &lsquo;이수 완료&rsquo;, 한 번 더 누르면 &lsquo;수강 중&rsquo;, 한 번 더 누르면 해제돼요.
            {props.mode === "new" && " 1학년은 교양 탭에서 들은 과목만 체크하면 충분해요."}
          </p>

          {tab === "major" ? (
            <div className="mt-4 max-h-[28rem] space-y-4 overflow-y-auto pr-1">
              {majorGroups.map(([label, list]) => (
                <div key={label}>
                  <div className="flex items-center justify-between border-b border-zinc-200 pb-1 dark:border-zinc-800">
                    <h3 className="text-sm font-semibold">{label}</h3>
                    <span className="flex gap-2 text-xs">
                      <button className="text-teal-700 hover:underline dark:text-teal-400" onClick={() => setStatus(list.map((c) => c.id), "completed")}>전체 이수</button>
                      <button className="text-zinc-500 hover:underline" onClick={() => setStatus(list.map((c) => c.id), null)}>해제</button>
                    </span>
                  </div>
                  <ul className="mt-1">
                    {list.map((c) => <CourseRow key={c.id} id={c.id} name={c.name} meta={`${c.category} · ${c.credits}학점`} status={taken.get(c.id)} onChange={setStatus} />)}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <GeneralPicker query={query} setQuery={setQuery} area={area} setArea={setArea}>
              {generalList.map((g) => (
                <CourseRow key={g.id} id={g.id} name={g.name} meta={generalMeta(g)} status={taken.get(g.id)} onChange={setStatus} />
              ))}
            </GeneralPicker>
          )}
        </section>
      )}

      {step === 2 && (
        <section className={`${card} mt-6`}>
          <p className="text-sm">
            듣고 싶은 교양에 ★을 누르면 초안에 먼저 넣어요. <b>건너뛰어도 돼요.</b> 그러면 교양은 필요한 학점만큼 빈 칸으로 남겨 두고, 계획 작업대에서 직접 고를 수 있어요.
          </p>
          <GeneralPicker query={query} setQuery={setQuery} area={area} setArea={setArea}>
            {generalList.filter((g) => !taken.has(g.id)).map((g) => (
              <li key={g.id} className="flex items-center gap-2 py-1 text-sm">
                <button
                  aria-label="듣고 싶은 교양"
                  className={`text-lg leading-none ${interests.has(g.id) ? "text-amber-500" : "text-zinc-300 dark:text-zinc-600"}`}
                  onClick={() => { const n = new Set(interests); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); setInterests(n); }}
                >★</button>
                <span>{g.name}</span>
                <span className="text-xs text-zinc-500">{generalMeta(g)}</span>
              </li>
            ))}
          </GeneralPicker>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">고른 교양 {interests.size}개</p>
        </section>
      )}

      {error && <p className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6 flex justify-between">
        <button disabled={step === 0} onClick={() => setStep(step - 1)} className="rounded-lg border border-zinc-300 px-4 py-2 disabled:opacity-40 dark:border-zinc-700">← 이전</button>
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep(step + 1)} className="rounded-lg bg-teal-700 px-5 py-2 text-white">다음 →</button>
        ) : (
          <button onClick={finish} disabled={pending} className="rounded-lg bg-teal-700 px-5 py-2 text-white disabled:opacity-60">
            {pending ? "초안 만드는 중…" : "초안 만들기 →"}
          </button>
        )}
      </div>
    </div>
  );
}

function generalMeta(g: GeneralCourse) {
  return `${g.category === "필수교양" ? `필수교양 · ${g.requiredGroup}` : `${g.area} · ${g.competency}`} · ${g.credits}학점`;
}

function CourseRow({ id, name, meta, status, onChange }: {
  id: number; name: string; meta: string; status?: Status; onChange: (ids: number[], s: Status | null) => void;
}) {
  const next = status === undefined ? "completed" : status === "completed" ? "inProgress" : null;
  return (
    <li>
      <button onClick={() => onChange([id], next)} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
        <span className={`w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-xs ${status === "completed" ? "bg-teal-700 text-white" : status === "inProgress" ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" : "border border-zinc-300 text-zinc-400 dark:border-zinc-700"}`}>
          {status === "completed" ? "이수 완료" : status === "inProgress" ? "수강 중" : "미이수"}
        </span>
        <span>{name}</span>
        <span className="text-xs text-zinc-500">{meta}</span>
      </button>
    </li>
  );
}

function GeneralPicker({ query, setQuery, area, setArea, children }: {
  query: string; setQuery: (s: string) => void; area: string; setArea: (s: string) => void; children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <input className={`${field} flex-1 text-sm`} placeholder="과목명 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className={`${field} text-sm`} value={area} onChange={(e) => setArea(e.target.value)}>
          {["전체", "필수교양", ...AREAS].map((a) => <option key={a}>{a}</option>)}
        </select>
      </div>
      <ul className="mt-3 max-h-[24rem] overflow-y-auto pr-1">{children}</ul>
    </div>
  );
}
