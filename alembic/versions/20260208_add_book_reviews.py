"""add book reviews

Revision ID: 20260208_add_book_reviews
Revises: 20260123_add_user_profile
Create Date: 2026-02-08 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260208_add_book_reviews"
down_revision: Union[str, Sequence[str], None] = "20260123_add_user_profile"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "book_reviews",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("book_id", sa.Integer(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "book_id", name="uq_user_book_review"),
    )
    op.create_index(op.f("ix_book_reviews_id"), "book_reviews", ["id"], unique=False)
    op.create_index(op.f("ix_book_reviews_user_id"), "book_reviews", ["user_id"], unique=False)
    op.create_index(op.f("ix_book_reviews_book_id"), "book_reviews", ["book_id"], unique=False)
    op.create_index(op.f("ix_book_reviews_created_at"), "book_reviews", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_book_reviews_created_at"), table_name="book_reviews")
    op.drop_index(op.f("ix_book_reviews_book_id"), table_name="book_reviews")
    op.drop_index(op.f("ix_book_reviews_user_id"), table_name="book_reviews")
    op.drop_index(op.f("ix_book_reviews_id"), table_name="book_reviews")
    op.drop_table("book_reviews")
