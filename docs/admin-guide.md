# Administrator guide

This guide is for the safety administrator who runs the platform day to day. Supervisors and employees only need the first section.

## Roles

| Role | Can do |
| --- | --- |
| Employee | Complete assigned training and quizzes, print certificates, report incidents, view the incidents they reported |
| Supervisor | Everything an employee can, plus see the training status of their direct reports (**My Team**), see incidents in their division and from their team, investigate and close those incidents |
| Safety administrator | Everything, plus employees, divisions, courses, bulk assignment, the compliance report, the notification log |

The supervisor an employee reports to is set on the employee's record. That person receives the completion emails and incident notices for that employee.

## Setting up the department

1. **Divisions.** Electric Services, Environmental Services and Public Services are created automatically. Add others under **Admin > Divisions** if needed (for example Fleet or Facilities), then open each course under **Admin > Courses** and tick the new division.
2. **Supervisors first.** Add supervisors and administrators under **Admin > Employees > Add employee** so they can be chosen as "Direct supervisor" for the people added afterwards.
3. **Employees.** Add each employee with their division and direct supervisor. Leave "Assign all training for the division now" ticked to create their assignments immediately, choose the due date, and optionally email them. The temporary password is shown once on screen; pass it to the employee, who must change it at first login.
4. **Email.** Confirm **Admin > Notifications** shows email delivery on. If it is off, see the deployment guide.

## The annual training cycle

- **Assigning.** **Admin > Assign training** creates an assignment for every active employee and every course that applies to their division, with one due date. Employees who already have an open assignment for a course are skipped, so the page can be used freely: at the start of each training year, after adding a new course, or after adding a division to a course.
- **Reminders.** Each employee is emailed 30 days before the due date, again 7 days before, and every 7 days once overdue, and their direct supervisor receives a copy each time. The daily job runs automatically; **Run reminder job now** sends anything that is due immediately.
- **Completion.** When an employee passes the quiz, their supervisor is emailed and next year's assignment is created, due 12 months after the completion date. Nothing needs to be done to keep the cycle going.
- **New hires** are added with "Assign new hire training now" (see below). **Transfers** between divisions: change the division on the employee record, then run **Assign training** to add any modules the new division requires. Old assignments stay on the record.
- **Leavers.** Untick "Active employee". They can no longer sign in, no reminders are sent, and they drop out of the reports.

## New hires and individual assignments

When you add an employee, leave **Assign new hire training now** ticked and the required new hire modules (ten of the nineteen, flagged `new_hire` in the module files) are assigned at once, due 30 days after the hire date. **Admin > New hire training** lists recent hires with their progress. To give any employee a module outside the annual set (or outside their division), use **Assign individual training** on the assignment page; the employee is emailed and the assignment is tagged "Assigned individually" on their training list.

## Quizzes

- Ten questions per module, drawn in a random order each attempt. 80% (8 of 10) passes. The pass mark can be changed with `QUIZ_PASS_PERCENT` in `.env`.
- A failed attempt shows the employee which questions were missed, with an explanation, and links back to the training. Retakes are unlimited; every attempt is kept on the employee's training record.
- Completion records keep the score, date, number of attempts and a certificate number. Certificates can be printed from **My Training**.

## Incidents

The incident report follows the department's eight-section form. Report numbers are built from the incident date, the type code and the sequence for that day: `10232026PI-01` is the first personal injury (`PI`) on October 23, 2026; property damage is `PD` and vehicle incidents are `VI`.

**Sections 1 to 4: the report.** The person conducting the investigation opens **Incidents > New incident report** and completes:

1. **Incident information**: type, date and time, location, division, severity, work activity, weather, people involved, witnesses, immediate actions, any property damage, and the investigator's name and title.
2. **Vehicle and equipment**: whether a vehicle was involved and, if so, its type, make and model, license plate, city vehicle number, driver, seat belt use, police report and testing. Tap the **vehicle diagram** to circle each damaged area and draw the positions of the vehicles on the **scene sketch** (the intersection is a starting point; draw over it). Record any machine, equipment or trailer with a description or sketch.
3. **Personal injury**: whether an injury occurred and, if so, the injured person, marks on the **body diagram**, injury type and body part check boxes, treatment, days away or restricted, and OSHA recordability.
4. **Incident description** in the investigator's words.

Reports can be edited by the reporter or a supervisor until the incident is closed. Safety administrators, the reporter's supervisor and the safety officer mailbox (if configured) are emailed when a report is submitted.

**Sections 5 and 6: statements.** From the report page, add a **principal statement** for each person directly involved and an **eyewitness statement** for each witness. A statement is signed and dated by the person giving it without seeing the rest of the report. Three ways to collect one:

- **Sign on this device**: hand the phone or tablet to the person. The statement page shows only the report number, date and location; they type their printed name, department or division, title and statement, draw their signature and tick the attestation.
- **Send a link**: enter the person's email address. They receive a link to their own statement page and nothing else, and the link stops accepting changes once the statement is signed.
- **Received on paper**: print the blank statement form from the report page, then transcribe the signed statement and record who received it and when.

**Sections 7 and 8: analysis and signatures.** A supervisor or administrator opens **Sections 7 and 8** and records the safety representative's **analysis of the facts**, **contributing causes**, **direct causes**, the **root cause** (keep asking "why" until a fixable cause appears), the **contributing factor type** (Behavioral: actions, decisions, training, supervision; Engineered: equipment, design, guarding, tools; Environmental: weather, lighting, surfaces, housekeeping, traffic), **recommended corrective actions** with the responsible party, target date and verification date (entering a verification date marks the action verified), and the **supporting references**: the policies, procedures and regulations that apply. For injuries, whether the case is OSHA recordable; for vehicle incidents, the preventability determination. The signature block holds the drawn signatures of the investigator, manager, safety manager and department assistant director.

**Closing.** An incident cannot be closed until the direct cause, root cause and contributing factor type are recorded. Closing emails the reporter and their supervisor. A closed incident can be reopened by an administrator.

**Printing.** **Print report** produces the full eight-section report with the diagrams, sketches, statements and signatures; use the browser's print dialog to print or save as PDF.

## Inspections and audits

**Inspections** lists the checklists: the **construction site inspection** (trenching, fall protection, scaffolds, ladders, electrical, cranes, traffic control and more), the **general industry inspection** for facilities and shops, and the **annual safety program audit**. Press **Start** to open a numbered inspection (`INS-2026-001`, audits are `AUD-2026-001`), enter the site, date and inspector, and work through the items. Each item is marked Satisfactory, Action needed or Not applicable (audits use In place, Partly in place, Missing, Not applicable) with room for a note. Every item that needs action appears in the **Findings** block, where you record the corrective action, the responsible party and a target date. Sign the inspection on screen, mark it complete, and print it or export all inspections to Excel.

Do the annual audit once a year with division management: it checks the written programs, training records, recordkeeping, PPE, emergency planning, hazard communication, electrical safety, confined spaces and management involvement.

## Reports

- **Admin > Compliance report**: a matrix of every active employee and every course. Green is completed in the current cycle, amber is due within 30 days, red is overdue, grey is scheduled, and hatched cells are courses that do not apply to that employee's division. Filter by division, and export the same data as CSV or Excel (a workbook with the training record, quiz attempts, compliance summary and course list). Employees can export their own record and supervisors their team from **My Training** and **My Team**.
- **Dashboard**: organization-wide counts and a per-division view of open training, overdue items, on-track percentage and open incidents.
- **Admin > Employees > Edit**: the full training record for one person, including when each reminder was sent.
- **Admin > Notifications**: every email the platform generated, with delivery status and the message text.

## Courses

Course content and quiz questions live in `content/courses/*.json`. To change wording or questions, edit the file (see `docs/content-authoring.md`) and use **Reload content from files** under **Admin > Courses**. The platform updates the course in place; employee records and past attempts are untouched.

Course settings managed in the app: which divisions a course applies to, its renewal interval, and whether it is active. Inactive courses are not assigned and are hidden from the catalog.

## Password resets

Open the employee under **Admin > Employees** and click **Reset password**. A new temporary password is shown once; the employee must change it at next login.
