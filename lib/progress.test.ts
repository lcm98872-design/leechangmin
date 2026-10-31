import { describe, expect, it } from "vitest";
import { calcProgress, type Requirement } from "./progress";

// 2026 교육과정 시스템경영·안전공학부 기준 (안내서 114~118쪽)
const req: Requirement = { total_credits: 132, general_total: 40, major_core: 36, major_basic_total: 45 };

describe("calcProgress", () => {
  it("아무것도 안 들었으면 남은 학점이 요건 그대로다", () => {
    const p = calcProgress(req, []);
    expect(p.total).toEqual({ earned: 0, required: 132, remaining: 132 });
    expect(p.majorCore.remaining).toBe(36);
  });

  it("전공공통과 전공필수를 합쳐서 전공 핵심 학점으로 센다", () => {
    const p = calcProgress(req, [
      { credits: 3, category: "전공공통" },
      { credits: 3, category: "전공필수" },
      { credits: 3, category: "전공선택" },
    ]);
    expect(p.majorCore.earned).toBe(6);
    expect(p.majorBasic.earned).toBe(9);
    expect(p.general.earned).toBe(0);
  });

  it("요건보다 더 들어도 남은 학점은 0 아래로 내려가지 않는다", () => {
    const many = Array.from({ length: 15 }, () => ({ credits: 3, category: "교양" as const }));
    const p = calcProgress(req, many);
    expect(p.general.earned).toBe(45);
    expect(p.general.remaining).toBe(0);
  });
});
