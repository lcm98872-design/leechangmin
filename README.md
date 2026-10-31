# 수강 계획 관리 서비스

이수한 과목을 넣으면 졸업까지 남은 학점을 계산하고, 학기별 수강 계획을 세운 뒤
**계획 → 수강신청 결과 → 재계획 → 이수** 흐름을 따라가며 관리해 주는 웹 서비스입니다.

- 대상: 국립부경대학교 시스템경영·안전공학부 (산업경영공학 / 기술·데이터공학 / 안전공학 전공)
- 기준: 2026학년도 교육과정 안내서
- 과목: 소프트웨어공학(2026-2) 학기 프로젝트

## 구성

| 역할 | 도구 |
|---|---|
| 웹 | Next.js (TypeScript) |
| DB | Supabase (PostgreSQL) |
| 배포 | Vercel |
| 테스트 | Vitest |

## 폴더

| 경로 | 내용 |
|---|---|
| `app/` | 화면 |
| `lib/` | 졸업요건 계산 등 핵심 로직과 테스트 |
| `supabase/schema.sql` | DB 테이블 |
| `supabase/seed.sql` | 교육과정 데이터 (`db/make_seed_sql.py`로 생성) |
| `db/*.csv` | 교육과정 안내서에서 정리한 원본 데이터 |

## 실행

```bash
npm install
cp .env.example .env.local   # Supabase 값 채우기
npm run dev                  # http://localhost:3000
npm test                     # 테스트
```
