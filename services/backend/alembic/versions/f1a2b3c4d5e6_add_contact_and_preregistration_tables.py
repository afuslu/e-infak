"""add_contact_and_preregistration_tables

Revision ID: f1a2b3c4d5e6
Revises: cd3bb376824a
Create Date: 2026-07-13 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'cd3bb376824a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('contact_messages',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('organization_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('phone', sa.String(length=20), nullable=False),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('is_read', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_contact_messages_organization_id'), 'contact_messages', ['organization_id'], unique=False)

    op.create_table('student_preregistrations',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('organization_id', sa.UUID(), nullable=False),
    sa.Column('program', sa.String(length=50), nullable=False),
    sa.Column('student_name', sa.String(length=200), nullable=False),
    sa.Column('student_age', sa.String(length=10), nullable=False),
    sa.Column('parent_name', sa.String(length=200), nullable=False),
    sa.Column('parent_phone', sa.String(length=20), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_student_preregistrations_organization_id'), 'student_preregistrations', ['organization_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_student_preregistrations_organization_id'), table_name='student_preregistrations')
    op.drop_table('student_preregistrations')
    op.drop_index(op.f('ix_contact_messages_organization_id'), table_name='contact_messages')
    op.drop_table('contact_messages')
