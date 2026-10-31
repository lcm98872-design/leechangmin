"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AREAS, applyOp, barTotal, candidates, courseIndex, courseLabel, evaluate,
  type AnyCourse, type Bar, type Curriculum, type Evaluation, type Issue, type Op, type PlanItem, type PlanState, type SlotType,
} from "@/lib/plan";
import { nextTerm, parseTerm, termLabel, termRange, termKey } from "@/lib/terms";
import { savePlanAction } from "../../actions";

const LEVEL = {
  error: { icon: "🔴", name: "오류", box: "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100" },
  todo: { icon: "🟠", name: "할 일", box: "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-100" },
  warn: { icon: "🟡", name: "참고", box: "border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-100" },
  confirm: { icon: "⚪", name: "확인 필요", box: "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300" },
} as const;

type Picker = { term: string; slotItemId?: string; slotType?: SlotType } | null;

export default function Workbench({ code, initial, savedAt, curriculum: cur }: {
  code: string; initial: PlanState; savedAt: string; curriculum: Curriculum;
}) {
  const [state, setState] = useState(initial);
  const [savedState, setSavedState] = useState(initial);
  const [lastSaved, setLastSaved] = useState(savedAt);
  const [change, setChange] = useState<string[] | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [saving, startSaving] = useTransition();
  const [saveError, setSaveError] = useState("");
  const [copied, setCopied] = useState(false);

  const idx = useMemo(() => courseIndex(cur), [cur]);
  const ev = useMemo(() => evaluate(state, cur), [state, cur]);
  const dirty = state !== savedState;

  const run = (op: Op, what: string) => {
    const next = applyOp(state, op, cur);
    setChange([what, ...describeChange(ev, evaluate(next, cur))]);
    setState(next);
  };

  const save = () => {
    setSaveError("");
    startSaving(async () => {
      const res = await savePlanAction(code, state, ev.status);
      if (res.ok) { setSavedState(state); setLastSaved(new Date().toISOString()); }
      else setSaveError(res.error ?? "저장 실패");
    });
  };

  const counts = (lv: Issue["level"]) => ev.issues.filter((i) => i.level === lv).length;
  const targetOptions = termRange(nextTerm(state.currentTerm), termKey(parseTerm(state.currentTerm).year + 8, 2));

  return (
    <main className="mx-auto max-w-[96rem] px-4 py-6">
      {/* ── 상단: 상태와 저장 ── */}
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">← 처음</Link>
        <h1 className="text-xl font-bold">계획 작업대</h1>
        <span className="text-sm text-zinc-500">{cur.major.name} · {state.admissionYear}학번</span>
        <ol className="flex items-center gap-1 text-xs">
          {["작성 중", "자동 검사 통과", "계획 확정", "이수 결과 반영"].map((s, i) => (
            <li key={s} className={`rounded-full px-2 py-0.5 ${s === ev.status ? (s === "작성 중" ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200" : "bg-teal-700 text-white") : "bg-zinc-100 text-zinc-400 dark:bg-zinc-900"}`}>
              {i > 0 && "→ "}{s}
            </li>
          ))}
        </ol>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <button
            onClick={() => { navigator.clipboard.writeText(`${location.origin}/plan/${code}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 font-mono dark:border-zinc-700" title="링크 복사"
          >
            {copied ? "링크 복사됨" : code}
          </button>
          <button onClick={save} disabled={!dirty || saving} className="rounded-lg bg-teal-700 px-4 py-1.5 text-white disabled:bg-zinc-300 dark:disabled:bg-zinc-800">
            {saving ? "저장 중…" : dirty ? "저장" : "저장됨"}
          </button>
        </div>
      </header>
      <p className="mt-1 text-xs text-zinc-500">
        이 코드(링크)를 아는 사람은 계획을 볼 수 있어요. 개인정보는 넣지 마세요. 마지막 저장: {new Date(lastSaved).toLocaleString("ko-KR")}
        {saveError && <span className="ml-2 text-red-600">{saveError}</span>}
      </p>

      {/* ── 조건 ── */}
      <section className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
        <label className="flex items-center gap-2">희망 졸업학기
          <select className="rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" value={state.targetTerm}
            onChange={(e) => run({ type: "setTarget", term: e.target.value }, `희망 졸업학기 → ${termLabel(e.target.value)}`)}>
            {targetOptions.map((t) => <option key={t} value={t}>{termLabel(t)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">학기당 최대
          <input type="number" min={3} max={30} className="w-16 rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" value={state.maxCredits}
            onChange={(e) => run({ type: "setMax", value: Number(e.target.value) }, `학기당 최대 학점 → ${e.target.value}`)} />학점
        </label>
        <span className="text-zinc-500">남은 학기 {ev.diag.capacity.terms}개 · 들을 수 있는 최대 {ev.diag.capacity.available}학점</span>
        <button className="ml-auto text-zinc-600 underline dark:text-zinc-400"
          onClick={() => { if (confirm("지금 계획을 지우고 조건에 맞춰 초안을 다시 만들까요?")) run({ type: "regenerate" }, "초안을 다시 만들었어요"); }}>
          초안 다시 만들기
        </button>
      </section>

      {/* ── 방금 바뀐 것 ── */}
      {change && (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-teal-300 bg-teal-50 px-4 py-2 text-sm text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-100">
          <span className="font-semibold">방금 바뀐 것</span>
          <ul className="flex flex-1 flex-wrap gap-x-4">{change.map((c) => <li key={c}>{c}</li>)}</ul>
          <button onClick={() => setChange(null)} className="text-teal-700">✕</button>
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          {/* ── 학기별 계획 ── */}
          <section className="flex gap-3 overflow-x-auto pb-2">
            <CurrentTermColumn state={state} idx={idx} />
            {ev.terms.map((t) => (
              <div key={t.key} className={`flex w-60 shrink-0 flex-col rounded-xl border p-3 ${t.leave ? "border-dashed border-amber-400 bg-amber-50/50 dark:bg-amber-950/20" : t.load > state.maxCredits ? "border-red-400" : t.afterTarget ? "border-dashed border-orange-400" : "border-zinc-200 dark:border-zinc-800"}`}>
                <div className="flex items-baseline justify-between">
                  <h3 className="font-semibold">{termLabel(t.key)}</h3>
                  <span className="text-xs text-zinc-500">{t.leave ? "휴학" : t.afterTarget ? "졸업학기 이후" : t.grade > 4 ? "초과학기" : `${t.grade}학년`}</span>
                </div>
                <div className="mt-1 text-right">
                  <button onClick={() => run({ type: "toggleLeave", term: t.key }, t.leave ? `${termLabel(t.key)} 휴학 취소` : `${termLabel(t.key)} 휴학`)}
                    className="text-xs text-amber-700 hover:underline dark:text-amber-400">
                    {t.leave ? "휴학 취소" : "이 학기 휴학"}
                  </button>
                </div>
                <ul className="mt-2 flex-1 space-y-1.5">
                  {t.items.map((i) => (
                    <ItemCard key={i.id} item={i} idx={idx} terms={ev.terms.filter((x) => !x.leave).map((x) => x.key)} term={t.key}
                      onMove={(to) => run({ type: "move", itemId: i.id, to }, `${itemName(i, idx)} → ${termLabel(to)}`)}
                      onRemove={() => run({ type: "remove", itemId: i.id }, `${itemName(i, idx)} 뺌`)}
                      onFill={() => setPicker({ term: t.key, slotItemId: i.id, slotType: i.slot?.type })} />
                  ))}
                </ul>
                {!t.leave && <button onClick={() => setPicker({ term: t.key })} className="mt-2 rounded-lg border border-dashed border-zinc-300 py-1 text-xs text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900">+ 과목 추가</button>}
                <div className={`mt-2 flex justify-between border-t border-zinc-200 pt-2 text-sm dark:border-zinc-800 ${t.load > state.maxCredits ? "font-semibold text-red-600" : ""}`}>
                  <span>계획 학점</span>
                  <span>{t.load} / {state.maxCredits}{t.slotCredits > 0 && <span className="ml-1 text-xs text-zinc-500">(빈 칸 {t.slotCredits})</span>}</span>
                </div>
              </div>
            ))}
          </section>

          {/* ── 문제와 고치는 방법 ── */}
          <section>
            <h2 className="font-semibold">
              검사 결과 <span className="text-sm font-normal text-zinc-500">오류 {counts("error")} · 할 일 {counts("todo")} · 참고 {counts("warn")} · 확인 필요 {counts("confirm")}</span>
            </h2>
            {ev.status === "자동 검사 통과" && (
              <p className="mt-2 rounded-lg bg-teal-50 p-3 text-sm text-teal-900 dark:bg-teal-950/40 dark:text-teal-100">
                ✅ 자동으로 검사할 수 있는 조건은 모두 통과했어요. 아래 &lsquo;확인 필요&rsquo; 항목은 직접 확인해 주세요. 졸업을 보장하는 결과는 아니에요.
              </p>
            )}
            <ul className="mt-2 space-y-2">
              {ev.issues.map((iss, n) => (
                <li key={`${iss.code}-${n}`} className={`rounded-lg border px-3 py-2 text-sm ${LEVEL[iss.level].box}`}>
                  <span className="mr-1">{LEVEL[iss.level].icon}</span>{iss.message}
                  {iss.actions.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-2">
                      {iss.actions.map((a) => (
                        <button key={a.label} onClick={() => run(a.op, a.label)} className="rounded border border-current px-2 py-0.5 text-xs hover:bg-white/60 dark:hover:bg-black/30">{a.label}</button>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <Diagnosis ev={ev} />
      </div>

      {picker && (
        <CoursePicker
          state={state} cur={cur} picker={picker}
          onClose={() => setPicker(null)}
          onPick={(c) => {
            if (picker.slotItemId) run({ type: "fillSlot", itemId: picker.slotItemId, courseId: c.id }, `${picker.slotType} 빈 칸에 ${c.name}`);
            else run({ type: "add", courseId: c.id, term: picker.term }, `${termLabel(picker.term)}에 ${c.name} 추가`);
            setPicker(null);
          }}
        />
      )}
    </main>
  );
}

// ── 변경 영향 요약 ──
function describeChange(a: Evaluation, b: Evaluation): string[] {
  const out: string[] = [];
  const bars: [string, Bar, Bar][] = [["졸업", a.diag.total, b.diag.total], ["전공", a.diag.major, b.diag.major], ["교양", a.diag.general, b.diag.general]];
  for (const [n, x, y] of bars) {
    const d = barTotal(y) - barTotal(x);
    if (d) out.push(`${n} 학점 ${d > 0 ? "+" : ""}${d} (${barTotal(y)}/${y.required})`);
  }
  for (const lv of ["error", "todo"] as const) {
    const x = a.issues.filter((i) => i.level === lv).length;
    const y = b.issues.filter((i) => i.level === lv).length;
    if (x !== y) out.push(`${LEVEL[lv].name} ${x} → ${y}`);
  }
  for (const t of b.terms) {
    const before = a.terms.find((x) => x.key === t.key)?.load ?? 0;
    if (before !== t.load) out.push(`${termLabel(t.key)} ${before} → ${t.load}학점`);
  }
  if (a.diag.capacity.available !== b.diag.capacity.available)
    out.push(`들을 수 있는 학점 ${a.diag.capacity.available} → ${b.diag.capacity.available} (필요 ${b.diag.capacity.needed})`);
  if (a.diag.capacity.ok !== b.diag.capacity.ok) out.push(b.diag.capacity.ok ? "학점 용량 충분 ✅" : "학점 용량 부족 ❌");
  if (a.status !== b.status) out.push(`상태: ${b.status}`);
  if (out.length === 0) out.push("진단 결과는 그대로예요");
  return out;
}

const itemName = (i: PlanItem, idx: Map<number, AnyCourse>) =>
  i.slot ? `${i.slot.type} 빈 칸 ${i.slot.credits}학점` : idx.get(i.courseId!)?.name ?? "과목";

function CurrentTermColumn({ state, idx }: { state: PlanState; idx: Map<number, AnyCourse> }) {
  const list = state.inProgress.map((id) => idx.get(id)).filter(Boolean) as AnyCourse[];
  return (
    <div className="flex w-52 shrink-0 flex-col rounded-xl border border-sky-200 bg-sky-50/50 p-3 dark:border-sky-900 dark:bg-sky-950/20">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">{termLabel(state.currentTerm)}</h3>
        <span className="text-xs text-sky-700 dark:text-sky-300">지금 · 수강 중</span>
      </div>
      <ul className="mt-2 flex-1 space-y-1 text-sm">
        {list.length === 0 && <li className="text-xs text-zinc-500">수강 중으로 표시한 과목이 없어요</li>}
        {list.map((c) => <li key={c.id}>{c.name} <span className="text-xs text-zinc-500">{c.credits}</span></li>)}
      </ul>
      <p className="mt-2 border-t border-sky-200 pt-2 text-sm dark:border-sky-900">{list.reduce((a, c) => a + c.credits, 0)}학점</p>
      <p className="mt-2 text-xs text-zinc-500">이수 완료 {state.completed.length}과목 · {state.completed.reduce((a, id) => a + (idx.get(id)?.credits ?? 0), 0)}학점</p>
    </div>
  );
}

function ItemCard({ item, idx, terms, term, onMove, onRemove, onFill }: {
  item: PlanItem; idx: Map<number, AnyCourse>; terms: string[]; term: string;
  onMove: (to: string) => void; onRemove: () => void; onFill: () => void;
}) {
  const move = (
    <select aria-label="다른 학기로 이동" value="" onChange={(e) => e.target.value && onMove(e.target.value)}
      className="w-14 rounded border border-zinc-300 bg-transparent text-xs dark:border-zinc-700">
      <option value="">이동</option>
      {terms.filter((t) => t !== term).map((t) => <option key={t} value={t}>{termLabel(t)}</option>)}
    </select>
  );
  if (item.slot) {
    return (
      <li className="rounded-lg border border-dashed border-zinc-400 p-2 text-sm dark:border-zinc-600">
        <button onClick={onFill} className="w-full text-left text-teal-700 hover:underline dark:text-teal-400">+ {item.slot.type} {item.slot.credits}학점 고르기</button>
        <div className="mt-1 flex items-center justify-end gap-1">{move}<button onClick={onRemove} className="px-1 text-xs text-zinc-400 hover:text-red-600" aria-label="빼기">✕</button></div>
      </li>
    );
  }
  const c = idx.get(item.courseId!);
  const required = c && ((c.kind === "major" && c.category !== "전공선택") || (c.kind === "general" && c.category === "필수교양"));
  return (
    <li className="rounded-lg border border-zinc-200 p-2 text-sm dark:border-zinc-800">
      <div className="flex items-start justify-between gap-1">
        <span>{required && <span className="mr-1 rounded bg-red-100 px-1 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">필수</span>}{c?.name ?? "알 수 없는 과목"}</span>
        <span className="shrink-0 text-xs text-zinc-500">{c?.credits}학점</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-1">
        <span className="text-xs text-zinc-500">{c ? courseLabel(c) : ""}{c?.kind === "major" && ` · ${c.semesters.join("·")}학기`}</span>
        <span className="flex items-center gap-1">{move}<button onClick={onRemove} className="px-1 text-xs text-zinc-400 hover:text-red-600" aria-label="빼기">✕</button></span>
      </div>
    </li>
  );
}

function BarRow({ name, bar, unit = "학점" }: { name: string; bar: Bar; unit?: string }) {
  const pct = (n: number) => `${Math.min(100, (n / Math.max(1, bar.required)) * 100)}%`;
  const total = barTotal(bar);
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{name}</span>
        <span className={total >= bar.required ? "text-teal-700 dark:text-teal-400" : ""}>{total} / {bar.required}{unit}</span>
      </div>
      <div className="mt-1 flex h-2 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
        <div className="bg-teal-700" style={{ width: pct(bar.done) }} />
        <div className="bg-sky-400" style={{ width: pct(bar.inProgress) }} />
        <div className="bg-teal-300 dark:bg-teal-800" style={{ width: pct(bar.planned) }} />
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">이수 {bar.done} · 수강 중 {bar.inProgress} · 계획 {bar.planned}</p>
    </div>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <li className="flex justify-between text-sm"><span>{children}</span><span>{ok ? "✅" : "⬜"}</span></li>;
}

function Diagnosis({ ev }: { ev: Evaluation }) {
  const d = ev.diag;
  return (
    <aside className="h-fit space-y-4 rounded-xl border border-zinc-200 p-4 xl:sticky xl:top-4 dark:border-zinc-800">
      <h2 className="font-semibold">졸업요건 진단</h2>
      <p className="text-xs text-zinc-500">실제 과목만 셉니다. 빈 칸은 과목을 고르면 반영돼요.</p>
      <BarRow name="졸업 학점" bar={d.total} />
      <BarRow name="전공 (일반 45 + 심화 36)" bar={d.major} />
      <BarRow name="교양" bar={d.general} />
      <ul className="space-y-1 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <Check ok={d.coreCourses.satisfied === d.coreCourses.total}>전공공통·필수 {d.coreCourses.satisfied}/{d.coreCourses.total}과목</Check>
        <Check ok={d.generalGroups.satisfied === d.generalGroups.total}>필수교양 {d.generalGroups.satisfied}/{d.generalGroups.total}그룹</Check>
        <Check ok={d.areas.every((a) => a.ok)}>균형교양 영역 {d.areas.filter((a) => a.ok).length}/{AREAS.length}</Check>
        <Check ok={d.competencies.every((a) => a.ok)}>핵심역량 {d.competencies.filter((a) => a.ok).length}/{d.competencies.length}</Check>
      </ul>
      <div className="border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
        <p className="font-medium">학점 용량 <span className="text-xs font-normal text-zinc-500">(요건 충족과 별개)</span></p>
        <p className={d.capacity.ok ? "text-teal-700 dark:text-teal-400" : "text-red-600"}>
          남은 {d.capacity.terms}학기에 최대 {d.capacity.available}학점 · 필요 {d.capacity.needed}학점 {d.capacity.ok ? "✅" : "❌"}
        </p>
      </div>
      {(d.slots.전공선택 + d.slots.교양선택 + d.slots.자유선택) > 0 && (
        <div className="border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
          <p className="font-medium">아직 고르지 않은 빈 칸</p>
          {(["전공선택", "교양선택", "자유선택"] as SlotType[]).filter((t) => d.slots[t] > 0).map((t) => <p key={t}>{t} {d.slots[t]}학점</p>)}
        </div>
      )}
      <div className="flex gap-3 text-xs text-zinc-500">
        <span><span className="inline-block h-2 w-2 bg-teal-700" /> 이수</span>
        <span><span className="inline-block h-2 w-2 bg-sky-400" /> 수강 중</span>
        <span><span className="inline-block h-2 w-2 bg-teal-300" /> 계획</span>
      </div>
    </aside>
  );
}

function CoursePicker({ state, cur, picker, onClose, onPick }: {
  state: PlanState; cur: Curriculum; picker: NonNullable<Picker>; onClose: () => void; onPick: (c: AnyCourse) => void;
}) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("전체");
  const ev = useMemo(() => evaluate(state, cur), [state, cur]);
  const missingArea = new Set(ev.diag.areas.filter((a) => !a.ok).map((a) => a.name));
  const missingComp = new Set(ev.diag.competencies.filter((a) => !a.ok).map((a) => a.name));
  const slot = picker.slotItemId ? state.items.find((i) => i.id === picker.slotItemId)?.slot : undefined;
  const list = candidates(state, cur, { slotType: picker.slotType, slotCredits: slot?.credits, term: picker.term })
    .filter((c) => !query || c.name.includes(query))
    .filter((c) => area === "전체" || (c.kind === "general" && c.area === area))
    .slice(0, 150);
  const sem = parseTerm(picker.term).sem;
  const interests = new Set(state.interests);

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-xl bg-white p-4 dark:bg-zinc-950" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{termLabel(picker.term)} · {picker.slotType ? `${picker.slotType} 빈 칸 ${slot?.credits ?? ""}학점 채우기` : "과목 추가"}</h2>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="mt-3 flex gap-2">
          <input autoFocus className="flex-1 rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700" placeholder="과목명 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700" value={area} onChange={(e) => setArea(e.target.value)}>
            {["전체", ...AREAS].map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
        <p className="mt-2 text-xs text-zinc-500">★ 듣고 싶은 교양 · 🎯 아직 못 채운 영역·역량 · 학기 표시가 다르면 교육과정표상 다른 학기 과목</p>
        <ul className="mt-2 flex-1 overflow-y-auto">
          {list.map((c) => {
            const fills = c.kind === "general" && ((c.area && missingArea.has(c.area)) || (c.competency && missingComp.has(c.competency)));
            const semMismatch = c.kind === "major" && !c.semesters.includes(sem);
            return (
              <li key={c.id}>
                <button onClick={() => onPick(c)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900">
                  <span className="w-4">{interests.has(c.id) ? "★" : fills ? "🎯" : ""}</span>
                  <span className="flex-1">{c.name}</span>
                  <span className="text-xs text-zinc-500">
                    {courseLabel(c)}{c.kind === "general" && c.competency ? ` · ${c.competency}` : ""}
                    {c.kind === "major" && <span className={semMismatch ? "text-yellow-700" : ""}> · {c.semesters.join("·")}학기</span>} ·{" "}
                    <span className={slot && c.credits > slot.credits ? "text-yellow-700" : ""}>{c.credits}학점{slot && c.credits > slot.credits ? " (빈 칸보다 큼)" : ""}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="p-4 text-center text-sm text-zinc-500">고를 수 있는 과목이 없어요</li>}
        </ul>
      </div>
    </div>
  );
}
