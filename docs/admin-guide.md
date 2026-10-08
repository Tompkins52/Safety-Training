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
- **Reminders.** Each employee is emailed 30 days before the due date, again 7 days before, and every 7 days once overdue. The daily job runs automatically; **Run reminder job now** sends anything that is due immediately.
- **Completion.** When an employee passes the quiz, their supervisor is emailed and next year's assignment is created, due 12 months after the completion date. Nothing needs to be done to keep the cycle going.
- **New hires** are added with "Assign all training now". **Transfers** between divisions: change the division on the employee record, then run **Assign training** to add any modules the new division requires. Old assignments stay on the record.
- **Leavers.** Untick "Active employee". They can no longer sign in, no reminders are sent, and they drop out of the reports.

## Quizzes

- Ten questions per module, drawn in a random order each attempt. 80% (8 of 10) passes. The pass mark can be changed with `QUIZ_PASS_PERCENT` in `.env`.
- A failed attempt shows the employee which questions were missed, with an explanation, and links back to the training. Retakes are unlimited; every attempt is kept on the employee's training record.
- Completion records keep the score, date, number of attempts and a certificate number. Certificates can be printed from **My Training**.

## Incidents

**Reporting.** Anyone can report under **Incidents > Report an incident**. The form asks for the facts: what, when, where, who was involved, witnesses, immediate actions, and type-specific details for injuries, property damage and vehicle incidents. Reports can be edited by the reporter or a supervisor until the incident is closed.

**Notification.** Safety administrators, the reporter's supervisor and the safety officer mailbox (if configured) are emailed when a report is submitted.

**Investigation.** A supervisor or administrator opens **Start investigation** and records:

- **Direct cause**: the unsafe act or condition that produced the injury or damage.
- **Root cause**: the underlying management, system or process failure that let the direct cause exist. Keep asking "why" until a fixable cause appears.
- **Contributing factor type**: Behavioral (actions, decisions, training, supervision), Engineered (equipment, design, guarding, tools), or Environmental (weather, lighting, surfaces, housekeeping, traffic), with detail.
- For injuries, whether the case is OSHA recordable; for vehicle incidents, the preventability determination.
- **Corrective actions** with a responsible person, target date and status. Overdue actions are flagged.

**Closing.** An incident cannot be closed until the direct cause, root cause and contributing factor type are recorded. Closing emails the reporter and their supervisor. A closed incident can be reopened.

**Printing.** **Print report** produces a clean one-page-per-section report with signature lines; use the browser's print dialog to print or save as PDF.

## Reports

- **Admin > Compliance report**: a matrix of every active employee and every course. Green is completed in the current cycle, amber is due within 30 days, red is overdue, grey is scheduled, and hatched cells are courses that do not apply to that employee's division. Filter by division, and export the same data as CSV.
- **Dashboard**: organization-wide counts and a per-division view of open training, overdue items, on-track percentage and open incidents.
- **Admin > Employees > Edit**: the full training record for one person, including when each reminder was sent.
- **Admin > Notifications**: every email the platform generated, with delivery status and the message text.

## Courses

Course content and quiz questions live in `content/courses/*.json`. To change wording or questions, edit the file (see `docs/content-authoring.md`) and use **Reload content from files** under **Admin > Courses**. The platform updates the course in place; employee records and past attempts are untouched.

Course settings managed in the app: which divisions a course applies to, its renewal interval, and whether it is active. Inactive courses are not assigned and are hidden from the catalog.

## Password resets

Open the employee under **Admin > Employees** and click **Reset password**. A new temporary password is shown once; the employee must change it at next login.
