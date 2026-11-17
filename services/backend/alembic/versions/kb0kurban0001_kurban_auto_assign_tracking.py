"""kurban: kayıtta numara (auto_assign), cins adı, video durumu, numara tekilliği

Revision ID: kb0kurban0001
Revises: dr0rem000001
"""
import sqlalchemy as sa
from alembic import op

revision = "kb0kurban0001"
down_revision = "dr0rem000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    duplicates = conn.execute(sa.text(
        "SELECT campaign_id, animal_number, count(*) FROM kurban_animals "
        "GROUP BY campaign_id, animal_number HAVING count(*) > 1"
    )).fetchall()
    if duplicates:
        listing = ", ".join(f"{row[1]} (kampanya {row[0]}, {row[2]} adet)" for row in duplicates[:20])
        raise RuntimeError(
            "Aynı kampanyada aynı numarayı taşıyan hayvanlar var; numaraları düzeltip yeniden çalıştırın: " + listing
        )
    op.add_column("kurban_campaigns", sa.Column("animal_label", sa.String(30), nullable=True))
    op.add_column("kurban_campaigns", sa.Column("auto_assign", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("kurban_animals", sa.Column("video_status", sa.String(12), nullable=False, server_default="none"))
    # Bağlantısı girilmiş videolar "çekildi" sayılır.
    op.execute("UPDATE kurban_animals SET video_status = 'recorded' WHERE video_url IS NOT NULL AND video_url <> ''")
    op.create_unique_constraint("uq_kurban_animal_campaign_number", "kurban_animals", ["campaign_id", "animal_number"])


def downgrade() -> None:
    op.drop_constraint("uq_kurban_animal_campaign_number", "kurban_animals", type_="unique")
    op.drop_column("kurban_animals", "video_status")
    op.drop_column("kurban_campaigns", "auto_assign")
    op.drop_column("kurban_campaigns", "animal_label")
