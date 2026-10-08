# Updating the OSHA Top 10 each year

OSHA announces its preliminary Top 10 most frequently cited standards every fall (usually in September at the National Safety Council Safety Congress and Expo) and publishes the finalized counts a few months later. The list is on OSHA's site at https://www.osha.gov/top10citedstandards.

The platform keeps the list in `content/osha_top10.json`. The newest fiscal year in that file is shown on the course catalog, with the training module that covers each standard.

## When the new list is announced

1. Open `content/osha_top10.json` and add a new entry at the top of `years`:

   ```json
   {
     "fiscal_year": 2027,
     "status": "preliminary",
     "period": "Oct. 1, 2026 to Sept. 30, 2027",
     "source": "https://www.osha.gov/top10citedstandards",
     "standards": [
       {"rank": 1, "standard": "29 CFR 1926.501", "title": "Fall Protection, general requirements (construction)", "citations": 0, "course_slug": "fall-protection-general"},
       ...
     ]
   }
   ```

2. For each of the ten standards set `course_slug` to the module that covers it. The existing slugs are:

   | Standard | course_slug |
   | --- | --- |
   | 1926.501 Fall Protection, general requirements | `fall-protection-general` |
   | 1910.1200 Hazard Communication | `hazard-communication` |
   | 1910.147 Lockout/Tagout | `lockout-tagout` |
   | 1926.451 Scaffolding | `scaffolding` |
   | 1926.1053 Ladders | `ladders` |
   | 1910.134 Respiratory Protection | `respiratory-protection` |
   | 1910.178 Powered Industrial Trucks | `powered-industrial-trucks` |
   | 1926.503 Fall Protection, training requirements | `fall-protection-training` |
   | 1926.102 Eye and Face Protection | `eye-face-protection` |
   | 1910.212 Machine Guarding | `machine-guarding` |

3. If a standard appears that has no module yet (for example 1910.305 Electrical, wiring methods, or 1926.1153 Respirable crystalline silica, both of which have been near the top ten in some years), write a new module following `docs/content-authoring.md`, give it the matching `course_slug`, reload content, and assign it.

4. Update the `top10_rank` field in each affected course file so the catalog orders modules by the new ranking, then reload content. Ranks only affect ordering; assignments and completions are not changed.

5. When OSHA publishes the final counts (usually by spring), set `status` to `final` and update the `citations` numbers.

No restart is needed for `osha_top10.json`; the catalog reads it on each page view. Course files need a content reload.
