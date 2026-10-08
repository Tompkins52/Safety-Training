# Deployment guide

The platform is a Python (Flask) web application with a SQLite database by default. It runs on a single small server or container and is intended for use on the department's internal network or behind the city's reverse proxy with HTTPS.

## 1. Requirements

- Python 3.10 or newer (or Docker)
- An SMTP relay or mailbox the app can send from (Microsoft 365, Google Workspace, an internal relay). Without one the app still works; notifications are written to the log instead of sent.
- A hostname and HTTPS certificate if the site will be reached from outside the server (recommended for any real use, since employees sign in with passwords).

## 2. Install

```bash
git clone https://github.com/Tompkins52/Safety-Training.git /opt/safety-training
cd /opt/safety-training
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
```

Edit `.env`:

| Setting | What to put |
| --- | --- |
| `SECRET_KEY` | A long random string: `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `ORG_NAME` | The department name shown in the app and in emails |
| `APP_BASE_URL` | The address employees use, e.g. `https://safety.cityname.gov`. Email links are built from it. |
| `TIMEZONE` | IANA time zone for the scheduler, e.g. `America/Chicago` |
| `MAIL_*` | SMTP settings (see below) |
| `SAFETY_OFFICER_EMAIL` | Optional shared mailbox that receives every incident notice |

Then create the database and the first administrator:

```bash
export FLASK_APP=run.py
.venv/bin/flask init-db
.venv/bin/flask create-admin --email safety@cityname.gov --first-name Pat --last-name Jones
```

The command prints a temporary password. The administrator is asked to change it at first login.

## 3. Run it

### Option A: gunicorn as a systemd service (Linux)

`/etc/systemd/system/safety-training.service`:

```ini
[Unit]
Description=Public Works Safety Training
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/safety-training
Environment=FLASK_APP=run.py
Environment=TZ=America/Chicago
ExecStart=/opt/safety-training/.venv/bin/gunicorn --workers 1 --threads 4 --timeout 120 --bind 127.0.0.1:8000 "app:create_app()"
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data:www-data /opt/safety-training/instance
sudo systemctl enable --now safety-training
```

Put nginx, Apache, IIS or the city's load balancer in front of port 8000 and terminate HTTPS there. With `APP_BASE_URL` starting with `https://`, the session cookie is marked secure automatically.

Use **one gunicorn worker** (threads are fine) so the built-in daily scheduler runs exactly once. If you need several workers, set `SCHEDULER_ENABLED=false` and use cron instead (section 5).

### Option B: Docker

```bash
cp .env.example .env     # edit it
docker compose up -d --build
docker compose exec web flask create-admin --email safety@cityname.gov --first-name Pat --last-name Jones
```

The container runs `flask init-db` on every start (idempotent) and serves on port 8000. `./instance` (database) and `./content` (course files) are mounted from the host, so upgrades do not lose data.

### Option C: Windows server

Install Python, create the virtual environment as above, and run `waitress` (`pip install waitress`) as a service with NSSM or Task Scheduler:

```
.venv\Scripts\waitress-serve --listen=0.0.0.0:8000 --threads=4 "run:app"
```

## 4. Email (SMTP)

Set `MAIL_ENABLED=true` and the server settings. Examples:

Microsoft 365 (SMTP AUTH must be enabled for the sending mailbox):

```
MAIL_SERVER=smtp.office365.com
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USERNAME=safety-training@cityname.gov
MAIL_PASSWORD=app-password-or-mailbox-password
MAIL_FROM=safety-training@cityname.gov
```

Internal relay without authentication:

```
MAIL_SERVER=smtp.internal.cityname.gov
MAIL_PORT=25
MAIL_USE_TLS=false
MAIL_USERNAME=
MAIL_FROM=safety-training@cityname.gov
```

Test with `flask send-test-email you@cityname.gov`. The result is also shown under **Admin > Notifications**.

## 5. The daily reminder job

Once a day the platform looks at every open assignment and sends:

- a reminder when the due date is 30 days away or less (once),
- a second reminder when it is 7 days away or less (once),
- an overdue reminder every 7 days after the due date.

Completion notices to supervisors and incident notices are sent immediately, not by the daily job.

By default the job runs inside the web process at the hour set by `SCHEDULER_HOUR` (06:00). To run it from cron instead, set `SCHEDULER_ENABLED=false` and add:

```
0 6 * * * cd /opt/safety-training && FLASK_APP=run.py .venv/bin/flask run-notifications >> /var/log/safety-training-reminders.log 2>&1
```

The job is safe to run more than once a day; nothing is sent twice. An administrator can also trigger it with **Run reminder job now** under **Admin > Notifications**.

## 6. Backups and upgrades

- Back up `instance/safety.db` (SQLite) regularly. A nightly copy is enough: `sqlite3 instance/safety.db ".backup /backups/safety-$(date +%F).db"`.
- To upgrade: `git pull`, `pip install -r requirements.txt`, restart the service. `flask init-db` can be re-run safely; it adds any new tables and reloads course content without touching employees, assignments or incidents.
- To move to PostgreSQL later, set `DATABASE_URL=postgresql+psycopg://user:pass@host/safety`, install `psycopg`, and run `flask init-db`.

## 7. Security notes

- Passwords are hashed (Werkzeug, scrypt). Temporary passwords must be changed at first login. Passwords are at least 10 characters.
- All forms are protected against CSRF. Role checks are enforced on every admin and supervisor page and on every incident.
- Run behind HTTPS. Keep the server on the internal network or behind the city's single sign-on proxy if one exists.
- The `.env` file holds the mail password and the secret key; keep it readable only by the service account.
