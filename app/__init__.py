"""Application factory for the Public Works safety training platform."""
import os
import sys
from datetime import date, datetime

from flask import Flask, render_template

from config import Config
from .cli import register_cli
from .extensions import csrf, db, login_manager
from .models import User
from .utils import register_template_helpers

__version__ = "1.0.0"
CREDITS = "Developed by Lorenzo McCoy and Mark Tompkins"


def create_app(config_object=Config):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(config_object)
    app.url_map.strict_slashes = False
    os.makedirs(app.instance_path, exist_ok=True)
    if app.config["SQLALCHEMY_DATABASE_URI"].startswith("sqlite:///"):
        db_path = app.config["SQLALCHEMY_DATABASE_URI"][len("sqlite:///"):]
        if db_path:
            os.makedirs(os.path.dirname(db_path), exist_ok=True)

    db.init_app(app)
    csrf.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = "auth.login"
    login_manager.login_message = "Please sign in to continue."
    login_manager.login_message_category = "info"

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    from .blueprints.admin import bp as admin_bp
    from .blueprints.auth import bp as auth_bp
    from .blueprints.incidents import bp as incidents_bp
    from .blueprints.main import bp as main_bp
    from .blueprints.training import bp as training_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)
    app.register_blueprint(training_bp, url_prefix="/training")
    app.register_blueprint(incidents_bp, url_prefix="/incidents")
    app.register_blueprint(admin_bp, url_prefix="/admin")

    register_template_helpers(app)
    register_cli(app)

    @app.context_processor
    def inject_globals():
        return {
            "org_name": app.config.get("ORG_NAME"),
            "app_name": app.config.get("APP_NAME"),
            "app_version": __version__,
            "credits": CREDITS,
            "current_year": date.today().year,
            "now": datetime.now(),
        }

    @app.errorhandler(403)
    def forbidden(_error):
        return render_template("errors/403.html"), 403

    @app.errorhandler(404)
    def not_found(_error):
        return render_template("errors/404.html"), 404

    with app.app_context():
        db.create_all()

    if app.config.get("SCHEDULER_ENABLED") and not app.config.get("TESTING") and not _is_cli_command():
        from .scheduler import start_scheduler

        start_scheduler(app)

    return app


def _is_cli_command():
    """True when running a `flask <command>` other than `flask run`, so one-off
    commands such as `flask seed-demo` do not start the background scheduler."""
    argv0 = os.path.basename(sys.argv[0]) if sys.argv else ""
    return argv0 == "flask" and "run" not in sys.argv[1:]
