"""add kindle email to users

Revision ID: 20260122_add_kindle_email
Revises: d6eb388894fa
Create Date: 2026-01-22 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260122_add_kindle_email'
down_revision: Union[str, Sequence[str], None] = 'd6eb388894fa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('kindle_email', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'kindle_email')
