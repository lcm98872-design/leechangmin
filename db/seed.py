"""CSV(교육과정 안내서 추출본)를 SQLite DB로 만든다.  사용: python db/seed.py"""
import csv, sqlite3, pathlib

HERE = pathlib.Path(__file__).parent
DB = HERE / "planner.db"

def rows(name):
    with open(HERE / name, encoding="utf-8") as f:
        return list(csv.DictReader(f))

def course_id(cur, name, credits, lec, lab, kind):
    cur.execute("INSERT INTO courses(name,credits,lecture_h,lab_h,kind) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING",
                (name, credits, lec, lab, kind))
    return cur.execute("SELECT id FROM courses WHERE name=? AND kind=? AND credits=? AND lecture_h=? AND lab_h=?",
                       (name, kind, credits, lec, lab)).fetchone()[0]

def main():
    DB.unlink(missing_ok=True)
    con = sqlite3.connect(DB)
    con.executescript((HERE / "schema.sql").read_text(encoding="utf-8"))
    cur = con.cursor()

    for r in rows("grad_requirements_sme.csv"):
        cur.execute("INSERT INTO majors(department,name) VALUES (?,?)", (r["학부·학과"], r["전공"]))
        mid = cur.lastrowid
        cur.execute("INSERT INTO grad_requirements VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (mid, r["졸업소요학점"], r["교양필수"], r["교양계"], r["전공공통·필수"], r["전공선택"],
                     r["일반전공계"], r["심화전공(선택)"], r["자유선택 등"], r["출처"]))
    majors = dict(cur.execute("SELECT name,id FROM majors"))

    for r in rows("major_courses_sme.csv"):
        cid = course_id(cur, r["과목명"], int(r["학점"]), int(r["강의시간"]), int(r["실습시간"]), "major")
        sems = r["안내서상 학기"].replace("학기", "")
        cur.execute("INSERT INTO major_courses VALUES (?,?,?,?,?,?)",
                    (majors[r["전공"]], cid, r["이수구분"], int(r["학년"]), sems, r["출처 쪽"]))

    for r in rows("general_courses.csv"):
        cid = course_id(cur, r["교과목명"], int(r["학점"]), int(r["강의시간"]), int(r["실습시간"]), "general")
        cur.execute("INSERT INTO general_courses VALUES (?,?,?,?,?,?)",
                    (cid, r["구분"], r["핵심역량"] or None, r["영역"] or None,
                     r["필수 이수그룹"] or None, r["비고·이수조건"] or None))
    con.commit()
    for t in ("majors", "courses", "major_courses", "general_courses"):
        print(f"{t}: {cur.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]}")
    con.close()

if __name__ == "__main__":
    main()
