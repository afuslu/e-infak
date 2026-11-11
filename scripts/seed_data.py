#!/usr/bin/env python3
"""
Seed demo data for development
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory and kardeslik helper path
sys.path.insert(0, str(Path(__file__).parent.parent / "services" / "backend"))
sys.path.insert(0, str(Path(__file__).parent / "kardeslik"))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.config import settings
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.models.campaign import Campaign, CampaignStatus, CampaignCategory
from app.models.cms import GalleryItem
from app.models.content_post import ContentPost
from app.models.kurban import KurbanCampaign, KurbanAnimal, KurbanShare, KurbanCampaignStatus, KurbanAnimalType, KurbanStatus
from app.models.orphan import Orphan, OrphanSponsorship, OrphanStatus
from app.core.security import get_password_hash
from redesign_kardeslik import DEMO_CAMPAIGNS, DEMO_GALLERY, DEMO_POSTS
import datetime

async def seed():
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Create Hicret Derneği
        hicret = Organization(
            slug="hicret-dernegi",
            name="Hicret Derneği",
            legal_name="Hicret Eğitim ve Yardımlaşma Derneği",
            email="hicretdernegi26@gmail.com",
            phone="+90 542 641 26 26",
            address="71 Evler Mh. Esenyazı Sk. No:41, Odunpazarı",
            city="Eskişehir",
            primary_domain="hicretdernegi.org",
            theme_primary_color="#0E7A5F",
            theme_accent_color="#B47B1E",
            logo_url="/images/hicret/logo.png",
        )
        session.add(hicret)
        await session.flush()
        
        # Create Kardeşlik Payı
        kardeslik = Organization(
            slug="kardeslik-payi",
            name="Kardeşlik Payı",
            legal_name="Kardeşlik Payı Sosyal Yardımlaşma Vakfı",
            email="info@kardeslikpayi.org",
            phone="02121234567",
            address="Test Mahallesi, Test Sokak No:2",
            city="İstanbul",
            primary_domain="kardeslikpayi.org",
            theme_primary_color="#dc2626",
            theme_accent_color="#f59e0b",
            logo_url="/images/kardeslik/logo-new.png",
        )
        session.add(kardeslik)
        await session.flush()
        
        # Create admin users
        hicret_admin = User(
            organization_id=hicret.id,
            email="admin@hicretdernegi.org",
            hashed_password=get_password_hash("admin123"),
            first_name="Admin",
            last_name="Hicret",
            role=UserRole.STK_ADMIN,
            is_active=True,
            is_verified=True,
        )
        session.add(hicret_admin)
        
        kardeslik_admin = User(
            organization_id=kardeslik.id,
            email="admin@kardeslikpayi.org",
            hashed_password=get_password_hash("admin123"),
            first_name="Admin",
            last_name="Kardeşlik",
            role=UserRole.STK_ADMIN,
            is_active=True,
            is_verified=True,
        )
        session.add(kardeslik_admin)
        
        # Create sample campaigns for Hicret
        campaigns_hicret = [
            Campaign(
                organization_id=hicret.id,
                slug="hafiz-yetistiriyorum",
                title="Hafız Yetiştiriyorum (Talebe Bursu)",
                summary="Kur'an-ı Kerim ezberi yapan talebelerimizin eğitim, barınma ve iaşe giderlerine destek olun.",
                story="<p>Hafızlık eğitimi alan talebelerimizin barınma, beslenme, kırtasiye ve tüm eğitim ihtiyaçlarını karşılıyoruz.</p>",
                category=CampaignCategory.EGITIM,
                status=CampaignStatus.ACTIVE,
                target_cents=35000000,
                collected_cents=14200000,
                cover_image_url="/images/hicret/h-hafizlik.png",
                suggested_amounts_cents=[60000, 120000, 240000, 600000],
                is_featured=True,
                display_order=1,
            ),
            Campaign(
                organization_id=hicret.id,
                slug="ibtida-ve-sibyan",
                title="Sıbyan ve İbtida Eğitimi Desteği",
                summary="4-12 yaş arası talebelerimizin Kur'an, ahlak ve temel İslami ilimler derslerine destek olun.",
                story="<p>Sıbyan Mektebi ve İbtida sınıflarımızda eğitim gören öğrencilerimizin kitap ve sınıf ihtiyaçlarını karşılıyoruz.</p>",
                category=CampaignCategory.EGITIM,
                status=CampaignStatus.ACTIVE,
                target_cents=25000000,
                collected_cents=9800000,
                cover_image_url="/images/hicret/h-ibtida.png",
                suggested_amounts_cents=[30000, 60000, 120000, 300000],
                is_featured=True,
                display_order=2,
            ),
            Campaign(
                organization_id=hicret.id,
                slug="arapca-ilmi-programi",
                title="Arapça ve İslami İlimler Programı",
                summary="Sarf, nahiv, fıkıh ve tefsir halkalarında yetişen ilim talebelerimizin yolculuğuna ortak olun.",
                story="<p>Klasik medrese usulüyle Arapça ve İslami ilimler okuyan talebelerimizin burs ve kitap ihtiyaçlarına destek oluyoruz.</p>",
                category=CampaignCategory.EGITIM,
                status=CampaignStatus.ACTIVE,
                target_cents=30000000,
                collected_cents=11500000,
                cover_image_url="/images/hicret/h-arapca.png",
                suggested_amounts_cents=[50000, 100000, 250000, 500000],
                is_featured=True,
                display_order=3,
            ),
            Campaign(
                organization_id=hicret.id,
                slug="su-kuyusu",
                title="Su Kuyusu Projesi",
                summary="Temiz suya erişimi olmayan bölgelerde kalıcı su kuyuları açıyoruz.",
                story="<p>Kurak bölgelerde yaklaşık 1.000 kişiye temiz içme suyu sağlayan kalıcı su kuyuları inşa ediyoruz.</p>",
                category=CampaignCategory.SU,
                status=CampaignStatus.ACTIVE,
                target_cents=15000000,
                collected_cents=6850000,
                cover_image_url="/images/hicret/h-su.png",
                suggested_amounts_cents=[50000, 150000, 500000, 1500000],
                is_featured=True,
                display_order=4,
            ),
            Campaign(
                organization_id=hicret.id,
                slug="medrese-sofrasi",
                title="Medrese Sofrası ve İftar Desteği",
                summary="Medreselerimizde eğitim gören talebelerimizin günlük yemek ve iftar sofralarını destekleyin.",
                story="<p>Talebelerimizin üç öğün sıcak yemek ve Ramazan iftar sofraları hayırseverlerimizin desteğiyle hazırlanmaktadır.</p>",
                category=CampaignCategory.GIDA,
                status=CampaignStatus.ACTIVE,
                target_cents=20000000,
                collected_cents=8400000,
                cover_image_url="/images/hicret/hicret-hero.png",
                suggested_amounts_cents=[25000, 50000, 150000, 300000],
                is_featured=True,
                display_order=5,
            ),
            Campaign(
                organization_id=hicret.id,
                slug="vekalet-kurban",
                title="Vekalet Kurban (Adak · Akika · Şükür)",
                summary="Adak, akika, şükür ve vacip kurbanlarınızı İslami usullere uygun kesip ihtiyaç sahiplerine ulaştırıyoruz.",
                story="<p>Vekalet yoluyla emanet edilen kurbanlarınız kesilerek talebe sofralarına ve ihtiyaç sahibi ailelere ulaştırılır.</p>",
                category=CampaignCategory.KURBAN,
                status=CampaignStatus.ACTIVE,
                target_cents=60000000,
                collected_cents=26400000,
                cover_image_url="/images/hicret/h-kurban.png",
                suggested_amounts_cents=[350000, 1200000, 2400000],
                is_featured=True,
                display_order=6,
            ),
        ]
        
        for campaign in campaigns_hicret:
            session.add(campaign)
        
        # Create comprehensive campaigns for Kardeşlik Payı covering all donation categories
        for data in DEMO_CAMPAIGNS:
            session.add(Campaign(
                organization_id=kardeslik.id,
                status=CampaignStatus.ACTIVE,
                is_featured=True,
                **data,
            ))
        
        # Create Kurban Campaigns
        kurban_hicret = KurbanCampaign(
            organization_id=hicret.id,
            title="Hicret Kurban Organizasyonu 2026",
            description="Vacip kurban hisselerinizi muhtaç kardeşlerimize ulaştırıyoruz.",
            price_per_share_cents=600000, # 6000 TL
            status=KurbanCampaignStatus.ACTIVE
        )
        session.add(kurban_hicret)
        
        kurban_kardeslik = KurbanCampaign(
            organization_id=kardeslik.id,
            title="Kardeşlik Payı Kurban Organizasyonu 2026",
            description="Afrika ve Asya'da kurban hissesi kesim ve dağıtım faaliyetleri.",
            price_per_share_cents=550000, # 5500 TL
            status=KurbanCampaignStatus.ACTIVE
        )
        session.add(kurban_kardeslik)
        await session.flush()
        
        # Create Kurban Animals
        animal_cow = KurbanAnimal(
            organization_id=hicret.id,
            campaign_id=kurban_hicret.id,
            animal_number="H-B-01",
            type=KurbanAnimalType.COW,
            status=KurbanStatus.WAITING
        )
        session.add(animal_cow)
        
        animal_sheep = KurbanAnimal(
            organization_id=kardeslik.id,
            campaign_id=kurban_kardeslik.id,
            animal_number="K-K-01",
            type=KurbanAnimalType.SHEEP,
            status=KurbanStatus.WAITING
        )
        session.add(animal_sheep)
        
        # Create Orphans
        orphans = [
            Orphan(
                organization_id=hicret.id,
                first_name="Muhammad",
                last_name="Al-Fayed",
                birth_date=datetime.date(2018, 4, 12),
                gender="male",
                country="Filistin",
                city="Gazze",
                description="Eğitim desteğine ihtiyacı olan 8 yaşında bir yetim kardeşimiz.",
                photo_url="/images/orphans/muhammad.jpg",
                monthly_sponsor_amount_cents=40000, # 400 TL
                status=OrphanStatus.WAITING
            ),
            Orphan(
                organization_id=kardeslik.id,
                first_name="Yusuf",
                last_name="Al-Mansur",
                birth_date=datetime.date(2019, 9, 20),
                gender="male",
                country="Somali",
                city="Mogadişu",
                description="Temel gıda, barınma ve medrese eğitimi yardımı bekleyen yetim kardeşimiz.",
                photo_url="/images/kardeslik/yetim-sponsorlugu.jpg",
                monthly_sponsor_amount_cents=40000, # 400 TL
                status=OrphanStatus.WAITING
            )
        ]
        for orphan in orphans:
            session.add(orphan)

        now_utc = datetime.datetime.now(datetime.timezone.utc)
        for idx, post_data in enumerate(DEMO_POSTS):
            session.add(ContentPost(
                organization_id=kardeslik.id,
                is_active=True,
                published_at=now_utc - datetime.timedelta(days=idx),
                **post_data,
            ))

        for item_data in DEMO_GALLERY:
            session.add(GalleryItem(
                organization_id=kardeslik.id,
                is_active=True,
                **item_data,
            ))

        await session.commit()
        print("✅ Demo data seeded successfully with Kurban & Orphan mock data!")
        print("\nLogin credentials:")
        print("Hicret: admin@hicretdernegi.org / admin123")
        print("Kardeşlik: admin@kardeslikpayi.org / admin123")


if __name__ == "__main__":
    asyncio.run(seed())
