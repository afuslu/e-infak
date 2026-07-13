"""add_donation_categories_org_settings_content_posts

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
Create Date: 2026-07-13 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('donation_categories',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('organization_id', sa.UUID(), nullable=False),
    sa.Column('campaign_id', sa.UUID(), nullable=True),
    sa.Column('icon', sa.String(length=10), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('description', sa.String(length=500), nullable=False),
    sa.Column('display_order', sa.Integer(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['campaign_id'], ['campaigns.id'], ),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_donation_categories_organization_id'), 'donation_categories', ['organization_id'], unique=False)

    op.create_table('organization_settings',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('organization_id', sa.UUID(), nullable=False),
    sa.Column('contact_phone', sa.String(length=30), nullable=True),
    sa.Column('contact_email', sa.String(length=255), nullable=True),
    sa.Column('contact_address', sa.String(length=500), nullable=True),
    sa.Column('bank1_name', sa.String(length=200), nullable=True),
    sa.Column('bank1_iban', sa.String(length=50), nullable=True),
    sa.Column('bank2_name', sa.String(length=200), nullable=True),
    sa.Column('bank2_iban', sa.String(length=50), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('organization_id')
    )
    op.create_index(op.f('ix_organization_settings_organization_id'), 'organization_settings', ['organization_id'], unique=False)

    op.create_table('content_posts',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('organization_id', sa.UUID(), nullable=False),
    sa.Column('title', sa.String(length=300), nullable=False),
    sa.Column('image_url', sa.String(length=500), nullable=True),
    sa.Column('published_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('display_order', sa.Integer(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_content_posts_organization_id'), 'content_posts', ['organization_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_content_posts_organization_id'), table_name='content_posts')
    op.drop_table('content_posts')
    op.drop_index(op.f('ix_organization_settings_organization_id'), table_name='organization_settings')
    op.drop_table('organization_settings')
    op.drop_index(op.f('ix_donation_categories_organization_id'), table_name='donation_categories')
    op.drop_table('donation_categories')
