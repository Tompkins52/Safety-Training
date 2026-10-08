"""Build the browser edition (static site) into dist/.

The browser edition runs entirely in the visitor's browser with no server, so it
can be hosted on GitHub Pages. It is generated from the same course content as
the full platform:

    python scripts/build_site.py            # writes ./dist
    python scripts/build_site.py --out .    # writes the repository root, which GitHub Pages serves from main

Progress and incident reports in the browser edition are stored in the
visitor's own browser (localStorage). Email reminders, supervisor notifications
and department-wide records need the full platform (see README.md).
"""
import argparse
import glob
import json
import os
import shutil
from datetime import date

import markdown

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CONTENT = os.path.join(ROOT, "content")
SITE = os.path.join(ROOT, "site")
APP_CSS = os.path.join(ROOT, "app", "static", "css", "app.css")

DIVISIONS = [
    {"code": "electric", "name": "Electric Services"},
    {"code": "environmental", "name": "Environmental Services"},
    {"code": "public", "name": "Public Services"},
]


def md(text):
    return markdown.markdown(text or "", extensions=["extra", "sane_lists", "nl2br"])


def load_courses():
    courses = []
    for path in sorted(glob.glob(os.path.join(CONTENT, "courses", "*.json"))):
        with open(path, encoding="utf-8") as fh:
            d = json.load(fh)
        assert len(d["questions"]) == 10, f"{path}: expected 10 questions"
        courses.append(
            {
                "slug": d["slug"],
                "title": d["title"],
                "standard": d.get("standard"),
                "standard_title": d.get("standard_title"),
                "category": d.get("category", "osha_top10"),
                "top10_rank": d.get("top10_rank"),
                "divisions": d.get("divisions", []),
                "duration_minutes": d.get("duration_minutes", 30),
                "renewal_months": d.get("renewal_months", 12),
                "summary": d.get("summary", ""),
                "objectives": d.get("objectives", []),
                "sections": [{"heading": s["heading"], "html": md(s["body"])} for s in d["sections"]],
                "key_takeaways": d.get("key_takeaways", []),
                "questions": [
                    {"text": q["text"], "options": q["options"], "answer": int(q["answer"]), "explanation": q.get("explanation", "")}
                    for q in d["questions"]
                ],
            }
        )
    order = {"osha_top10": 0, "rescue": 1}
    courses.sort(key=lambda c: (order.get(c["category"], 2), c["top10_rank"] or 99, c["title"]))
    return courses


def load_top10():
    path = os.path.join(CONTENT, "osha_top10.json")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        years = json.load(fh).get("years", [])
    return sorted(years, key=lambda y: y.get("fiscal_year", 0), reverse=True)


def build(out_dir):
    """Write the five site files into out_dir (other files there are left alone)."""
    os.makedirs(out_dir, exist_ok=True)
    data = {
        "generated": date.today().isoformat(),
        "divisions": DIVISIONS,
        "courses": load_courses(),
        "top10": load_top10(),
        "pass_percent": 80,
        "credits": "Developed by Lorenzo McCoy and Mark Tompkins",
        "repo": "https://github.com/Tompkins52/Safety-Training",
    }
    with open(os.path.join(out_dir, "data.js"), "w", encoding="utf-8") as fh:
        fh.write("window.SAFETY_DATA = ")
        json.dump(data, fh, ensure_ascii=False)
        fh.write(";\n")
    with open(APP_CSS, encoding="utf-8") as fh:
        css = fh.read()
    with open(os.path.join(SITE, "extra.css"), encoding="utf-8") as fh:
        css += "\n\n/* Browser edition */\n" + fh.read()
    with open(os.path.join(out_dir, "styles.css"), "w", encoding="utf-8") as fh:
        fh.write(css)
    for name in ("index.html", "app.js"):
        shutil.copy(os.path.join(SITE, name), os.path.join(out_dir, name))
    # Tell GitHub Pages not to run Jekyll on the output.
    open(os.path.join(out_dir, ".nojekyll"), "w").close()
    print(f"Built {len(data['courses'])} courses into {out_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--out", default=os.path.join(ROOT, "dist"))
    args = parser.parse_args()
    build(os.path.abspath(args.out))
