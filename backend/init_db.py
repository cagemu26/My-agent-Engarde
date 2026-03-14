#!/usr/bin/env python3
"""
Database initialization script.
Creates tables and seeds invitation codes.
"""
import json
from datetime import datetime, timedelta
from pathlib import Path
from app.core.database import engine, Base, SessionLocal
from app.core.security import get_password_hash
from app.models import User, InvitationCode


def init_db():
    """Create all database tables."""
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("Tables created successfully!")


def create_default_admin():
    """Create default admin user if not exists."""
    print("Creating default admin user...")

    db = SessionLocal()
    try:
        # Check if admin already exists
        admin = db.query(User).filter(User.email == "admin@engarde.ai").first()

        if not admin:
            admin = User(
                email="admin@engarde.ai",
                username="admin",
                password_hash=get_password_hash("admin123"),
                is_active=True,
                is_admin=True
            )
            db.add(admin)
            db.commit()
            print("Default admin user created: admin@engarde.ai / admin123")
        else:
            print("Admin user already exists")
    except Exception as e:
        print(f"Error creating admin user: {e}")
        db.rollback()
    finally:
        db.close()


def seed_invitation_codes():
    """Seed invitation codes from JSON file."""
    print("Seeding invitation codes...")

    # Try to load from project root
    json_path = Path(__file__).parent.parent / "invitation_codes.json"

    if not json_path.exists():
        print(f"Warning: {json_path} not found, skipping invitation codes seeding")
        return

    with open(json_path, "r") as f:
        codes_data = json.load(f)

    db = SessionLocal()
    try:
        for code_data in codes_data:
            # Check if code already exists
            existing = db.query(InvitationCode).filter(
                InvitationCode.code == code_data["code"]
            ).first()

            if not existing:
                invitation = InvitationCode(
                    code=code_data["code"],
                    expires_at=datetime.fromisoformat(
                        code_data["expires_at"].replace("Z", "+00:00")
                    ),
                    is_active=True
                )
                db.add(invitation)
                print(f"Added invitation code: {code_data['code']}")
            else:
                print(f"Invitation code already exists: {code_data['code']}")

        db.commit()
        print("Invitation codes seeded successfully!")
    except Exception as e:
        print(f"Error seeding invitation codes: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    init_db()
    seed_invitation_codes()
    create_default_admin()
    print("Database initialization complete!")
