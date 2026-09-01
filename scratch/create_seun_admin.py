import sys
import os

# Add backend directory to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

from database import SessionLocal
from models import User, UserRole
from auth import hash_password, verify_password

def create_admin():
    db = SessionLocal()
    try:
        email = "seunayorinde@gmail.com"
        name = "Mr. Seun"
        raw_password = "seunayorinde@2025"

        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"Creating new Admin user: {name} ({email})...")
            new_user = User(
                email=email,
                full_name=name,
                password_hash=hash_password(raw_password),
                role=UserRole.ADMIN,
                is_active=True,
                requesting_admin=False
            )
            db.add(new_user)
            db.commit()
            print("Successfully created Admin user!")
        else:
            print(f"User {email} exists. Updating to Admin status...")
            user.full_name = name
            user.role = UserRole.ADMIN
            user.is_active = True
            user.password_hash = hash_password(raw_password)
            db.commit()
            print("Successfully updated Admin user!")
    except Exception as e:
        print("Error creating admin user:", e)
    finally:
        db.close()

if __name__ == "__main__":
    create_admin()
