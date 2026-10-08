# Writing and editing training content

Each training module is one JSON file in `content/courses/`. The file name does not matter; the `slug` inside the file identifies the course. After editing, reload with **Admin > Courses > Reload content from files** or `flask load-content`. The browser edition on GitHub Pages is rebuilt automatically when the change is pushed to `main` (or run `python scripts/build_site.py` locally).

## File structure

```json
{
  "slug": "ladders",
  "title": "Ladders",
  "standard": "29 CFR 1926.1053",
  "standard_title": "Ladders (construction)",
  "category": "osha_top10",
  "top10_rank": 5,
  "divisions": ["electric", "environmental", "public"],
  "duration_minutes": 30,
  "renewal_months": 12,
  "summary": "Two or three sentences shown in the catalog and at the top of the course.",
  "objectives": ["Select the right ladder for the job.", "..."],
  "sections": [
    {"heading": "Why this standard is on the Top 10", "body": "Markdown text..."},
    {"heading": "Setting up an extension ladder", "body": "Markdown text..."}
  ],
  "key_takeaways": ["One sentence each.", "..."],
  "questions": [
    {
      "text": "At what angle should an extension ladder be set?",
      "options": ["2 to 1", "3 to 1", "4 to 1", "5 to 1"],
      "answer": 2,
      "explanation": "The 4 to 1 rule: one foot out for every four feet up."
    }
  ]
}
```

| Field | Notes |
| --- | --- |
| `slug` | Unique id, lowercase with hyphens. Changing it creates a new course. |
| `category` | `osha_top10` or `rescue`. Any other value is shown as-is. |
| `top10_rank` | 1 to 10 for Top 10 courses, `null` otherwise. Controls catalog ordering. |
| `divisions` | Division codes the course applies to **when first loaded**. After that, division mapping is managed in the app so administrators' changes are not overwritten. |
| `renewal_months` | How long a completion is valid. Also editable in the app. |
| `sections[].body` | Markdown: paragraphs, `- ` bullets, `1.` numbered lists, `**bold**`. No HTML. |
| `questions` | Ten questions are expected. Each has exactly four `options`; `answer` is the index of the correct option, counted from 0. |

## Writing guidance

- Write for the crew, not the compliance officer. Plain language, short paragraphs, examples from the shop, the plant and the street.
- Every number that comes from the standard (a height trigger, a ratio, an inspection interval) must be right. Check it against the CFR text at ecfr.gov before publishing.
- Keep modules to 25 to 40 minutes of reading: six to eight sections, roughly 1,000 to 1,500 words.
- Each question should be answerable from the module, with one clearly correct option and three realistic distractors. Avoid "all of the above". Spread the correct answers across all four positions. Write the explanation so a learner who missed the question learns something.
- Do not use the em dash character; use commas, periods or a hyphen.
- The two rescue modules are refreshers. Make it clear that the department's written procedure, its own equipment and its timed drills govern.

## Adding a new module

1. Copy an existing file, change the `slug`, `title`, `standard` and content.
2. Set `category` to `osha_top10` (with a rank) or anything else such as `rescue`, `department`, or `seasonal`.
3. Reload content. The new course appears under **Admin > Courses** with the divisions from the file.
4. Run **Admin > Assign training** to assign it to the employees in those divisions.

## Checking a file

```bash
python3 -c "import json; d=json.load(open('content/courses/ladders.json')); print(d['slug'], len(d['sections']), 'sections', len(d['questions']), 'questions')"
python -m pytest -q tests/test_app.py::test_content_loaded
```

The loader rejects a file with a missing `slug`, `title`, `sections` or `questions`, a question with fewer than two options, or an `answer` index outside the options.
