"""add tag_group to filename_patterns

Revision ID: 20260117_add_tag_group
Revises: 20260117_add_book_groups
Create Date: 2026-01-17 19:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260117_add_tag_group'
down_revision = '20260117_add_book_groups'
branch_labels = None
depends_on = None


def upgrade():
    # add tag_group column to filename_patterns table
    op.add_column('filename_patterns', sa.Column('tag_group', sa.Integer(), nullable=True, server_default='0'))


def downgrade():
    # remove tag_group column from filename_patterns table
    op.drop_column('filename_patterns', 'tag_group')
