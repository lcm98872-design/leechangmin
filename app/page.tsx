import Link from "next/link";
import { openPlanAction } from "./actions";

const steps = ["기본정보", "이수 과목", "초안 자동 생성", "수정·재검사", "저장"];

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-16">
      <section className="text-center">
        <p className="text-sm font-medium text-teal-700 dark:text-teal-400">국립부경대학교 공과대학 수강 계획 관리</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">졸업까지 남은 과목, 이제 한눈에 확인하세요.</h1>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          들은 과목을 체크하면 졸업까지의 학기별 계획 초안을 만들고, 과목을 옮기거나 바꿀 때마다 졸업요건을 다시 검사해 줍니다.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link href="/start?mode=new" className="rounded-xl bg-teal-700 px-6 py-5 text-left text-white hover:bg-teal-800">
            <span className="block text-lg font-semibold">처음 수강 계획 세우기</span>
            <span className="text-sm text-teal-100">1학년 · 앞으로 무엇을 언제 들으면 될까?</span>
          </Link>
          <Link href="/start?mode=check" className="rounded-xl border border-teal-700 px-6 py-5 text-left hover:bg-teal-50 dark:hover:bg-teal-950">
            <span className="block text-lg font-semibold">내 졸업요건 점검하기</span>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">2~4학년 · 무엇이 부족하고 어떻게 채울까?</span>
          </Link>
        </div>
        <form action={openPlanAction} className="mx-auto mt-6 flex max-w-md gap-2">
          <input name="code" placeholder="계획 코드 (예: K7Q2-9XM4-LTPB)" className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
          <button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900">불러오기</button>
        </form>
      </section>

      <section className="mt-16 grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="font-semibold">이렇게 진행돼요</h2>
          <ol className="mt-3 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
            {steps.map((s, i) => <li key={s}>{i + 1}. {s}</li>)}
          </ol>
          <p className="mt-3 text-xs text-zinc-500">필수과목은 구체적으로 배치하고, 선택과목은 필요한 학점만큼 빈 칸으로 남겨 직접 고르게 합니다.</p>
        </div>
        <div className="rounded-xl border border-zinc-200 p-5 text-sm dark:border-zinc-800">
          <h2 className="font-semibold">지원 범위</h2>
          <p className="mt-3">✅ 시스템경영·안전공학부: 산업경영공학 · 기술·데이터공학 · 안전공학</p>
          <p className="mt-1 text-zinc-500">⏳ 그 외 공과대학 전공: 검증 후 순차 지원</p>
          <p className="mt-3 text-xs text-zinc-500">
            2026학년도 교육과정 기준입니다. 다른 학번도 같은 기준으로 계산하며, 결과는 참고용이에요. 최종 졸업요건은 학과에서 확인하세요.
          </p>
        </div>
      </section>
    </main>
  );
}
