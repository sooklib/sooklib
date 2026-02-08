"""add book translations

Revision ID: 20260208_add_book_translations
Revises: 20260208_add_book_reviews
Create Date: 2026-02-08 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260208_add_book_translations"
down_revision: Union[str, Sequence[str], None] = "20260208_add_book_reviews"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "book_translations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("book_id", sa.Integer(), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("book_id", "language", name="uq_book_translation"),
    )
    op.create_index(op.f("ix_book_translations_id"), "book_translations", ["id"], unique=False)
    op.create_index(op.f("ix_book_translations_book_id"), "book_translations", ["book_id"], unique=False)
    op.create_index(op.f("ix_book_translations_language"), "book_translations", ["language"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_book_translations_language"), table_name="book_translations")
    op.drop_index(op.f("ix_book_translations_book_id"), table_name="book_translations")
    op.drop_index(op.f("ix_book_translations_id"), table_name="book_translations")
    op.drop_table("book_translations")
