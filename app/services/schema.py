"""Keeps an existing database in step with the models without a migration tool.

`db.create_all()` creates missing tables but never adds columns to tables that
already exist. Each release that adds columns would otherwise require the
administrator to rebuild the database. `upgrade_schema()` compares every mapped
table with the live database and issues `ALTER TABLE ... ADD COLUMN` for each
column that is missing. Columns are only ever added, never dropped or changed.
"""
from sqlalchemy import inspect, text

from ..extensions import db


def missing_columns():
    """Return [(table_name, Column), ...] for model columns absent from the database."""
    inspector = inspect(db.engine)
    existing_tables = set(inspector.get_table_names())
    missing = []
    for table in db.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        present = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name not in present:
                missing.append((table.name, column))
    return missing


def _column_ddl(column):
    type_sql = column.type.compile(dialect=db.engine.dialect)
    ddl = f'"{column.name}" {type_sql}'
    default = column.default.arg if column.default is not None and column.default.is_scalar else None
    if default is not None:
        if isinstance(default, bool):
            ddl += " DEFAULT " + ("1" if default else "0")
        elif isinstance(default, (int, float)):
            ddl += f" DEFAULT {default}"
        else:
            ddl += " DEFAULT '" + str(default).replace("'", "''") + "'"
    return ddl


def upgrade_schema():
    """Add any model columns missing from existing tables. Returns the names added."""
    added = []
    for table_name, column in missing_columns():
        db.session.execute(text(f'ALTER TABLE "{table_name}" ADD COLUMN {_column_ddl(column)}'))
        added.append(f"{table_name}.{column.name}")
    if added:
        db.session.commit()
    return added
