// 졸업 요건 대비 이수 현황 계산 (DB와 화면에 의존하지 않는 순수 함수)

export type Category = "전공공통" | "전공필수" | "전공선택" | "교양";

export interface Requirement {
  total_credits: number;
  general_total: number;
  major_core: number;      // 전공공통 + 전공필수
  major_basic_total: number;
}

export interface TakenCourse {
  credits: number;
  category: Category;
}

export interface Progress {
  total: { earned: number; required: number; remaining: number };
  general: { earned: number; required: number; remaining: number };
  majorCore: { earned: number; required: number; remaining: number };
  majorBasic: { earned: number; required: number; remaining: number };
}

const line = (earned: number, required: number) => ({
  earned,
  required,
  remaining: Math.max(0, required - earned),
});

export function calcProgress(req: Requirement, taken: TakenCourse[]): Progress {
  const sum = (pred: (c: TakenCourse) => boolean) =>
    taken.filter(pred).reduce((acc, c) => acc + c.credits, 0);

  const general = sum((c) => c.category === "교양");
  const core = sum((c) => c.category === "전공공통" || c.category === "전공필수");
  const majorAll = sum((c) => c.category !== "교양");
  const total = sum(() => true);

  return {
    total: line(total, req.total_credits),
    general: line(general, req.general_total),
    majorCore: line(core, req.major_core),
    majorBasic: line(majorAll, req.major_basic_total),
  };
}
