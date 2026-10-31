"""CSV를 Supabase에 넣을 seed SQL로 바꾼다.  사용: python3 db/make_seed_sql.py > supabase/seed.sql"""
import csv, pathlib

HERE = pathlib.Path(__file__).parent

def rows(name):
    with open(HERE / name, encoding="utf-8") as f:
        return list(csv.DictReader(f))

def q(v):
    return "null" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"

out = ["-- 자동 생성 파일: db/make_seed_sql.py 로 다시 만든다", "begin;"]

for r in rows("grad_requirements_sme.csv"):
    out.append(f"insert into majors(department,name) values ({q(r['학부·학과'])},{q(r['전공'])});")
    out.append(
        "insert into grad_requirements select id,"
        + ",".join(r[k] for k in ["졸업소요학점", "교양필수", "교양계", "전공공통·필수", "전공선택", "일반전공계", "심화전공(선택)", "자유선택 등"])
        + f",{q(r['출처'])} from majors where name={q(r['전공'])};"
    )

def course(name, cr, lec, lab, kind):
    out.append(f"insert into courses(name,credits,lecture_h,lab_h,kind) values ({q(name)},{cr},{lec},{lab},'{kind}') on conflict do nothing;")
    return f"(select id from courses where name={q(name)} and kind='{kind}' and credits={cr} and lecture_h={lec} and lab_h={lab})"

for r in rows("major_courses_sme.csv"):
    cid = course(r["과목명"], r["학점"], r["강의시간"], r["실습시간"], "major")
    sems = r["안내서상 학기"].replace("학기", "")
    out.append(
        f"insert into major_courses values ((select id from majors where name={q(r['전공'])}),{cid},"
        f"{q(r['이수구분'])},{r['학년']},{q(sems)},{q(r['출처 쪽'])});"
    )

for r in rows("general_courses.csv"):
    cid = course(r["교과목명"], r["학점"], r["강의시간"], r["실습시간"], "general")
    out.append(
        f"insert into general_courses values ({cid},{q(r['구분'])},{q(r['핵심역량'])},{q(r['영역'])},"
        f"{q(r['필수 이수그룹'])},{q(r['비고·이수조건'])});"
    )

out.append("commit;")
print("\n".join(out))
