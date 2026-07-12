#!/usr/bin/env python3
"""
Seed demo data for development
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "services" / "backend"))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.config import settings
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.models.campaign import Campaign, CampaignStatus, CampaignCategory
from app.models.kurban import KurbanCampaign, KurbanAnimal, KurbanShare, KurbanCampaignStatus, KurbanAnimalType, KurbanStatus
from app.models.orphan import Orphan, OrphanSponsorship, OrphanStatus
from app.core.security import get_password_hash
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
            email="info@hicretdernegi.org",
            phone="02221234567",
            address="Test Mahallesi, Test Sokak No:1",
            city="Eskişehir",
            primary_domain="hicretdernegi.org",
            theme_primary_color="#065f46",
            theme_accent_color="#0284c7",
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
                slug="talebe-bursu",
                title="Talebe Eğitim Bursu",
                summary="Üniversite öğrencilerine destek programı",
                story="<p>Üniversite eğitimi alan gençlerimize destek olmak için başlattığımız kampanya ile maddi imkanları kısıtlı öğrencilerimizin eğitimlerine katkı sağlıyoruz.</p>",
                category=CampaignCategory.EGITIM,
                status=CampaignStatus.ACTIVE,
                target_cents=100000000,  # 1M TL
                collected_cents=35000000,  # 350K TL
                cover_image_url="/images/hicret/talebe 1.png",
                suggested_amounts_cents=[5000, 10000, 25000, 50000],
                is_featured=True,
            ),
            Campaign(
                organization_id=hicret.id,
                slug="iftar-yemegi",
                title="İftar Yemeği Organizasyonu",
                summary="Ramazan ayında ihtiyaç sahiplerine iftar",
                story="<p>Ramazan ayında maddi durumu iyi olmayan kardeşlerimize sıcak iftar yemeği ulaştırıyoruz.</p>",
                category=CampaignCategory.GIDA,
                status=CampaignStatus.ACTIVE,
                target_cents=50000000,  # 500K TL
                collected_cents=25000000,  # 250K TL
                suggested_amounts_cents=[5000, 10000, 20000],
                is_featured=True,
            ),
        ]
        
        for campaign in campaigns_hicret:
            session.add(campaign)
        
        # Create sample campaigns for Kardeşlik
        campaigns_kardeslik = [
            Campaign(
                organization_id=kardeslik.id,
                slug="su-kuyusu-projesi",
                title="Su Kuyusu Projesi",
                summary="Afrika'da temiz su kuyuları açıyoruz",
                story="<p>Temiz suya erişimi olmayan bölgelerde su kuyuları açarak binlerce insanın hayatını kolaylaştırıyoruz.</p>",
                category=CampaignCategory.SU,
                status=CampaignStatus.ACTIVE,
                target_cents=75000000,  # 750K TL
                collected_cents=42000000,  # 420K TL
                cover_image_url="/images/kardeslik/su-kuyusu.jpg",
                suggested_amounts_cents=[10000, 25000, 50000, 100000],
                is_featured=True,
            ),
            Campaign(
                organization_id=kardeslik.id,
                slug="yetim-sponsorlugu",
                title="Yetim Sponsorluğu",
                summary="Yetim çocuklara düzenli destek",
                story="<p>Ailelerini kaybetmiş çocuklarımıza eğitim, sağlık ve barınma desteği sağlıyoruz.</p>",
                category=CampaignCategory.YETIM,
                status=CampaignStatus.ACTIVE,
                target_cents=120000000,  # 1.2M TL
                collected_cents=65000000,  # 650K TL
                cover_image_url="/images/kardeslik/yetim-sponsorlugu.jpg",
                suggested_amounts_cents=[10000, 25000, 50000],
                is_featured=True,
            ),
        ]
        
        for campaign in campaigns_kardeslik:
            session.add(campaign)
        
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
                first_name="Aisha",
                last_name="Yusuf",
                birth_date=datetime.date(2019, 9, 20),
                gender="female",
                country="Somali",
                city="Mogadişu",
                description="Temel gıda ve barınma yardımı bekleyen yetim kızımız.",
                photo_url="/images/orphans/aisha.jpg",
                monthly_sponsor_amount_cents=40000, # 400 TL
                status=OrphanStatus.WAITING
            )
        ]
        for orphan in orphans:
            session.add(orphan)
            
        await session.commit()
        print("✅ Demo data seeded successfully with Kurban & Orphan mock data!")
        print("\nLogin credentials:")
        print("Hicret: admin@hicretdernegi.org / admin123")
        print("Kardeşlik: admin@kardeslikpayi.org / admin123")


if __name__ == "__main__":
    asyncio.run(seed())
