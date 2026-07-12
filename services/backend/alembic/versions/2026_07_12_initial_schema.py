"""initial migration

Revision ID: 2026_07_12_initial
Revises: 
Create Date: 2026-07-12 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '2026_07_12_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. organizations
    op.create_table(
        'organizations',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('slug', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('legal_name', sa.String(length=200), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('phone', sa.String(length=20), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.Column('tax_number', sa.String(length=20), nullable=True),
        sa.Column('primary_domain', sa.String(length=255), nullable=False),
        sa.Column('custom_domains', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('theme_primary_color', sa.String(length=7), nullable=True),
        sa.Column('theme_accent_color', sa.String(length=7), nullable=True),
        sa.Column('logo_url', sa.String(length=500), nullable=True),
        sa.Column('logo_dark_url', sa.String(length=500), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('settings', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('bank_name', sa.String(length=100), nullable=True),
        sa.Column('iban', sa.String(length=32), nullable=True),
        sa.Column('account_holder', sa.String(length=200), nullable=True),
        sa.Column('vpos_merchant_id', sa.String(length=100), nullable=True),
        sa.Column('vpos_terminal_id', sa.String(length=100), nullable=True),
        sa.Column('vpos_password', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('primary_domain'),
        sa.UniqueConstraint('slug')
    )
    op.create_index(op.f('ix_organizations_slug'), 'organizations', ['slug'], unique=True)

    # 2. users
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('first_name', sa.String(length=100), nullable=False),
        sa.Column('last_name', sa.String(length=100), nullable=False),
        sa.Column('phone', sa.String(length=20), nullable=True),
        sa.Column('role', sa.Enum('PLATFORM_ADMIN', 'STK_ADMIN', 'MUHASEBE', 'CRM', 'OPERASYON', 'READONLY', name='userrole'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('is_verified', sa.Boolean(), nullable=True),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_organization_id'), 'users', ['organization_id'], unique=False)

    # 3. campaigns
    op.create_table(
        'campaigns',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('slug', sa.String(length=200), nullable=False),
        sa.Column('title', sa.String(length=300), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('story', sa.Text(), nullable=True),
        sa.Column('category', sa.Enum('EGITIM', 'SAGLIK', 'GIDA', 'SU', 'YETIM', 'KURBAN', 'INSAAT', 'GENEL', name='campaigncategory'), nullable=False),
        sa.Column('status', sa.Enum('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', name='campaignstatus'), nullable=False),
        sa.Column('target_cents', sa.Integer(), nullable=False),
        sa.Column('collected_cents', sa.Integer(), nullable=True),
        sa.Column('cover_image_url', sa.String(length=500), nullable=True),
        sa.Column('gallery_urls', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('video_url', sa.String(length=500), nullable=True),
        sa.Column('suggested_amounts_cents', postgresql.ARRAY(sa.Integer()), nullable=True),
        sa.Column('allow_custom_amount', sa.Boolean(), nullable=True),
        sa.Column('min_donation_cents', sa.Integer(), nullable=True),
        sa.Column('is_featured', sa.Boolean(), nullable=True),
        sa.Column('display_order', sa.Integer(), nullable=True),
        sa.Column('show_collected', sa.Boolean(), nullable=True),
        sa.Column('show_donor_list', sa.Boolean(), nullable=True),
        sa.Column('start_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('end_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('tags', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_campaigns_organization_id'), 'campaigns', ['organization_id'], unique=False)
    op.create_index(op.f('ix_campaigns_slug'), 'campaigns', ['slug'], unique=False)
    op.create_index(op.f('ix_campaigns_status'), 'campaigns', ['status'], unique=False)

    # 4. donors
    op.create_table(
        'donors',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('donor_type', sa.Enum('INDIVIDUAL', 'CORPORATE', name='donortype'), nullable=False),
        sa.Column('first_name', sa.String(length=100), nullable=False),
        sa.Column('last_name', sa.String(length=100), nullable=True),
        sa.Column('company_name', sa.String(length=200), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('phone', sa.String(length=20), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.Column('country', sa.String(length=100), nullable=True),
        sa.Column('tc_no', sa.String(length=11), nullable=True),
        sa.Column('tax_number', sa.String(length=20), nullable=True),
        sa.Column('total_donations', sa.Integer(), nullable=True),
        sa.Column('total_donated_cents', sa.Integer(), nullable=True),
        sa.Column('first_donation_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_donation_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('allow_email', sa.Boolean(), nullable=True),
        sa.Column('allow_sms', sa.Boolean(), nullable=True),
        sa.Column('is_anonymous', sa.Boolean(), nullable=True),
        sa.Column('tags', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_donors_email'), 'donors', ['email'], unique=False)
    op.create_index(op.f('ix_donors_organization_id'), 'donors', ['organization_id'], unique=False)
    op.create_index(op.f('ix_donors_phone'), 'donors', ['phone'], unique=False)

    # 5. donations
    op.create_table(
        'donations',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('campaign_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('donor_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('receipt_number', sa.String(length=50), nullable=False),
        sa.Column('amount_cents', sa.Integer(), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=True),
        sa.Column('payment_method', sa.Enum('CREDIT_CARD', 'BANK_TRANSFER', 'CASH', name='paymentmethod'), nullable=False),
        sa.Column('status', sa.Enum('PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED', 'CANCELLED', name='donationstatus'), nullable=False),
        sa.Column('transaction_id', sa.String(length=100), nullable=True),
        sa.Column('payment_provider', sa.String(length=50), nullable=True),
        sa.Column('payment_details', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('card_last_4', sa.String(length=4), nullable=True),
        sa.Column('card_brand', sa.String(length=20), nullable=True),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('refunded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('receipt_pdf_url', sa.String(length=500), nullable=True),
        sa.Column('receipt_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('donor_message', sa.Text(), nullable=True),
        sa.Column('is_anonymous', sa.Boolean(), nullable=True),
        sa.Column('idempotency_key', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaigns.id'], ),
        sa.ForeignKeyConstraint(['donor_id'], ['donors.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_donations_campaign_id'), 'donations', ['campaign_id'], unique=False)
    op.create_index(op.f('ix_donations_donor_id'), 'donations', ['donor_id'], unique=False)
    op.create_index(op.f('ix_donations_idempotency_key'), 'donations', ['idempotency_key'], unique=True)
    op.create_index(op.f('ix_donations_organization_id'), 'donations', ['organization_id'], unique=False)
    op.create_index(op.f('ix_donations_receipt_number'), 'donations', ['receipt_number'], unique=True)
    op.create_index(op.f('ix_donations_status'), 'donations', ['status'], unique=False)
    op.create_index(op.f('ix_donations_transaction_id'), 'donations', ['transaction_id'], unique=False)

    # 6. sessions
    op.create_table(
        'sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('refresh_token', sa.String(length=500), nullable=False),
        sa.Column('access_token', sa.String(length=500), nullable=True),
        sa.Column('ip_address', sa.String(length=50), nullable=True),
        sa.Column('user_agent', sa.String(length=500), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sessions_refresh_token'), 'sessions', ['refresh_token'], unique=True)
    op.create_index(op.f('ix_sessions_user_id'), 'sessions', ['user_id'], unique=False)

    # 7. kurban_campaigns
    op.create_table(
        'kurban_campaigns',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(length=300), nullable=False),
        sa.Column('description', sa.String(length=1000), nullable=True),
        sa.Column('price_per_share_cents', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('ACTIVE', 'COMPLETED', name='kurbancampaignstatus'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_kurban_campaigns_organization_id'), 'kurban_campaigns', ['organization_id'], unique=False)

    # 8. kurban_animals
    op.create_table(
        'kurban_animals',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('campaign_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('animal_number', sa.String(length=50), nullable=False),
        sa.Column('type', sa.Enum('COW', 'SHEEP', name='kurbananimaltype'), nullable=False),
        sa.Column('status', sa.Enum('WAITING', 'SLAUGHTERED', name='kurbanstatus'), nullable=False),
        sa.Column('video_url', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['campaign_id'], ['kurban_campaigns.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_kurban_animals_campaign_id'), 'kurban_animals', ['campaign_id'], unique=False)
    op.create_index(op.f('ix_kurban_animals_organization_id'), 'kurban_animals', ['organization_id'], unique=False)

    # 9. kurban_shares
    op.create_table(
        'kurban_shares',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('animal_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('donation_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('donor_name', sa.String(length=200), nullable=False),
        sa.Column('donor_phone', sa.String(length=20), nullable=False),
        sa.Column('share_number', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('WAITING', 'SLAUGHTERED', name='kurbanstatus'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['animal_id'], ['kurban_animals.id'], ),
        sa.ForeignKeyConstraint(['donation_id'], ['donations.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_kurban_shares_animal_id'), 'kurban_shares', ['animal_id'], unique=False)
    op.create_index(op.f('ix_kurban_shares_donation_id'), 'kurban_shares', ['donation_id'], unique=False)
    op.create_index(op.f('ix_kurban_shares_organization_id'), 'kurban_shares', ['organization_id'], unique=False)

    # 10. orphans
    op.create_table(
        'orphans',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('first_name', sa.String(length=100), nullable=False),
        sa.Column('last_name', sa.String(length=100), nullable=True),
        sa.Column('birth_date', sa.Date(), nullable=False),
        sa.Column('gender', sa.String(length=10), nullable=False),
        sa.Column('country', sa.String(length=100), nullable=False),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('photo_url', sa.String(length=500), nullable=True),
        sa.Column('monthly_sponsor_amount_cents', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('WAITING', 'SPONSORED', name='orphanstatus'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_orphans_organization_id'), 'orphans', ['organization_id'], unique=False)

    # 11. orphan_sponsorships
    op.create_table(
        'orphan_sponsorships',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('orphan_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('donation_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('donor_name', sa.String(length=200), nullable=False),
        sa.Column('donor_phone', sa.String(length=20), nullable=False),
        sa.Column('start_date', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('end_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['donation_id'], ['donations.id'], ),
        sa.ForeignKeyConstraint(['orphan_id'], ['orphans.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_orphan_sponsorships_active'), 'orphan_sponsorships', ['active'], unique=False)
    op.create_index(op.f('ix_orphan_sponsorships_donation_id'), 'orphan_sponsorships', ['donation_id'], unique=False)
    op.create_index(op.f('ix_orphan_sponsorships_orphan_id'), 'orphan_sponsorships', ['orphan_id'], unique=False)
    op.create_index(op.f('ix_orphan_sponsorships_organization_id'), 'orphan_sponsorships', ['organization_id'], unique=False)

    # Additional Indexes
    op.create_index('idx_donations_org_status', 'donations', ['organization_id', 'status'], unique=False)
    op.create_index('idx_donations_org_campaign', 'donations', ['organization_id', 'campaign_id'], unique=False)
    op.create_index('idx_donations_org_donor', 'donations', ['organization_id', 'donor_id'], unique=False)
    op.create_index('idx_donors_org_email', 'donors', ['organization_id', 'email'], unique=False)
    op.create_index('idx_donors_org_phone', 'donors', ['organization_id', 'phone'], unique=False)

def downgrade() -> None:
    op.drop_table('orphan_sponsorships')
    op.drop_table('orphans')
    op.drop_table('kurban_shares')
    op.drop_table('kurban_animals')
    op.drop_table('kurban_campaigns')
    op.drop_table('sessions')
    op.drop_table('donations')
    op.drop_table('donors')
    op.drop_table('campaigns')
    op.drop_table('users')
    op.drop_table('organizations')
