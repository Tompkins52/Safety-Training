"""Outbound email.

When MAIL_ENABLED is false (the default), nothing is sent: the message is
written to the application log so the platform can be used without an SMTP
server. Every message, sent or not, is also recorded in the notification log by
the notifications service.
"""
import smtplib
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

from flask import current_app


def send_email(to, subject, text_body, html_body=None):
    """Send one email. Returns (delivered: bool, detail: str)."""
    app = current_app
    cfg = app.config
    if isinstance(to, str):
        to = [to]
    to = [t for t in to if t]
    if not to:
        return False, "no recipient address"

    if not cfg.get("MAIL_ENABLED"):
        app.logger.info("[mail disabled] to=%s subject=%s", ", ".join(to), subject)
        return False, "logged only (MAIL_ENABLED is false)"

    if not cfg.get("MAIL_SERVER"):
        app.logger.warning("MAIL_ENABLED is true but MAIL_SERVER is not set")
        return False, "MAIL_SERVER not configured"

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = cfg.get("MAIL_FROM")
    msg["To"] = ", ".join(to)
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid()
    msg.set_content(text_body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    try:
        if cfg.get("MAIL_USE_SSL"):
            server = smtplib.SMTP_SSL(cfg["MAIL_SERVER"], cfg["MAIL_PORT"], timeout=cfg.get("MAIL_TIMEOUT", 20))
        else:
            server = smtplib.SMTP(cfg["MAIL_SERVER"], cfg["MAIL_PORT"], timeout=cfg.get("MAIL_TIMEOUT", 20))
        with server:
            server.ehlo()
            if cfg.get("MAIL_USE_TLS") and not cfg.get("MAIL_USE_SSL"):
                server.starttls()
                server.ehlo()
            if cfg.get("MAIL_USERNAME"):
                server.login(cfg["MAIL_USERNAME"], cfg.get("MAIL_PASSWORD", ""))
            server.send_message(msg)
        return True, "sent"
    except Exception as exc:  # noqa: BLE001 - report any SMTP failure to the log
        app.logger.error("Email to %s failed: %s", ", ".join(to), exc)
        return False, f"error: {exc}"[:250]
