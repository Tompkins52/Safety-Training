from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required, login_user, logout_user
from urllib.parse import urlparse

from ..extensions import db
from ..timeutil import now
from ..models import User

bp = Blueprint("auth", __name__)


def _safe_next(target):
    if not target:
        return None
    parsed = urlparse(target)
    if parsed.scheme or parsed.netloc:
        return None
    return target


@bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("main.dashboard"))
    if request.method == "POST":
        email = (request.form.get("email") or "").strip().lower()
        password = request.form.get("password") or ""
        user = User.query.filter_by(email=email).first()
        if user and user.is_active_employee and user.check_password(password):
            login_user(user, remember=bool(request.form.get("remember")))
            user.last_login_at = now()
            db.session.commit()
            if user.must_change_password:
                flash("Please choose a new password before continuing.", "info")
                return redirect(url_for("auth.change_password"))
            return redirect(_safe_next(request.args.get("next")) or url_for("main.dashboard"))
        flash("Incorrect email or password.", "danger")
    return render_template("auth/login.html")


@bp.route("/logout")
@login_required
def logout():
    logout_user()
    flash("You have been signed out.", "info")
    return redirect(url_for("auth.login"))


@bp.route("/change-password", methods=["GET", "POST"])
@login_required
def change_password():
    if request.method == "POST":
        current = request.form.get("current_password") or ""
        new = request.form.get("new_password") or ""
        confirm = request.form.get("confirm_password") or ""
        if not current_user.check_password(current):
            flash("Your current password is incorrect.", "danger")
        elif len(new) < 10:
            flash("Use at least 10 characters for the new password.", "danger")
        elif new != confirm:
            flash("The new passwords do not match.", "danger")
        else:
            current_user.set_password(new)
            current_user.must_change_password = False
            db.session.commit()
            flash("Password updated.", "success")
            return redirect(url_for("main.dashboard"))
    return render_template("auth/change_password.html")


@bp.before_app_request
def enforce_password_change():
    if current_user.is_authenticated and current_user.must_change_password:
        allowed = {"auth.change_password", "auth.logout", "static"}
        if request.endpoint not in allowed:
            return redirect(url_for("auth.change_password"))
    return None
