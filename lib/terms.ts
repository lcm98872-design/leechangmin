// 학기 표기: "2027-1" (2027년 1학기)

export type Sem = 1 | 2;

export function termKey(year: number, sem: Sem): string {
  return `${year}-${sem}`;
}

export function parseTerm(key: string): { year: number; sem: Sem } {
  const [y, s] = key.split("-").map(Number);
  return { year: y, sem: (s === 2 ? 2 : 1) as Sem };
}

export function nextTerm(key: string): string {
  const { year, sem } = parseTerm(key);
  return sem === 1 ? termKey(year, 2) : termKey(year + 1, 1);
}

export function prevTerm(key: string): string {
  const { year, sem } = parseTerm(key);
  return sem === 2 ? termKey(year, 1) : termKey(year - 1, 2);
}

export function compareTerms(a: string, b: string): number {
  const x = parseTerm(a);
  const y = parseTerm(b);
  return x.year - y.year || x.sem - y.sem;
}

/** from부터 to까지(둘 다 포함) */
export function termRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = from; compareTerms(t, to) <= 0 && out.length < 40; t = nextTerm(t)) out.push(t);
  return out;
}

/** 입학년도 기준 학년 (5 이상이면 초과학기) */
export function gradeOf(term: string, admissionYear: number): number {
  return parseTerm(term).year - admissionYear + 1;
}

export function termLabel(key: string): string {
  const { year, sem } = parseTerm(key);
  return `${year}년 ${sem}학기`;
}

/** 오늘 날짜 기준 현재 학기 (3~8월 1학기, 9~2월 2학기) */
export function currentTermOf(date: Date): string {
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  if (m >= 3 && m <= 8) return termKey(y, 1);
  return m >= 9 ? termKey(y, 2) : termKey(y - 1, 2);
}

/** 기본 졸업 목표: 입학 + 3년의 2학기 (2026학번 → 2029-2) */
export function defaultTargetTerm(admissionYear: number): string {
  return termKey(admissionYear + 3, 2);
}

export const isTermKey = (s: unknown): s is string => typeof s === "string" && /^\d{4}-[12]$/.test(s);
