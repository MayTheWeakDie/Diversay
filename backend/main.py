from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routes import auth, customers, products, orders, analytics, stores, drivers, vehicles, global_analytics
from config import get_settings
import logging
logging.basicConfig(level=logging.INFO)

settings = get_settings()
logger = logging.getLogger(__name__)

from sqlalchemy import text
from database import SessionLocal
from models import User, UserRole
from auth import hash_password

def seed_admin_user():
    db = SessionLocal()
    try:
        admin_email = "diversaysolutions@gmail.com"
        admin_user = db.query(User).filter(User.email == admin_email).first()
        if not admin_user:
            logger.info("Seeding permanent admin user...")
            new_admin = User(
                email=admin_email,
                full_name="Grace",
                password_hash=hash_password("diversaysolutions@2025"),
                role=UserRole.ADMIN,
                is_active=True,
                requesting_admin=False
            )
            db.add(new_admin)
            db.commit()
            logger.info("Permanent admin user seeded successfully!")
        else:
            # Ensure they are an Admin, Active, and details match requested values
            updated = False
            if admin_user.full_name != "Grace":
                admin_user.full_name = "Grace"
                updated = True
            if admin_user.role != UserRole.ADMIN:
                admin_user.role = UserRole.ADMIN
                updated = True
            if not admin_user.is_active:
                admin_user.is_active = True
                updated = True
            
            # Verify and update password hash if it doesn't match
            from auth import verify_password
            if not verify_password("diversaysolutions@2025", admin_user.password_hash):
                admin_user.password_hash = hash_password("diversaysolutions@2025")
                updated = True
                
            if updated:
                db.commit()
                logger.info("Permanent admin user details updated/restored.")
    except Exception as e:
        logger.error(f"Error seeding admin user: {e}")
    finally:
        db.close()

def seed_products():
    from models import Product, ProductCategory, UnitType
    db = SessionLocal()
    try:
        products_list = [
            "Quinrocin", "Megadox", "Kolin plus", "Stodi", "Phytocee", "Zigbir", 
            "Ds-viracid-s", "Terminator- iii", "Biokleen", "Wyldox", "Neodine", 
            "Amprolium", "coxstop", "Divercipro", "Divercool-c", "DiverGen D", 
            "Divermer", "Ds livorton", "Ds-ultr-tm plus", "Dsl biokleen", 
            "Dsl citramax", "Dsl neodine", "gentylo", "levastar dewormer", 
            "viracid", "zigbir liquid"
        ]
        
        for name in products_list:
            existing = db.query(Product).filter(
                Product.name.ilike(name)
            ).first()
            if not existing:
                logger.info(f"Seeding product: {name}")
                new_product = Product(
                    name=name,
                    category=ProductCategory.OTHER,
                    default_unit=UnitType.PIECES,
                    brand="DSLP" if "divermectin" in name.lower() else "DSL",
                    unit_price=0.0
                )
                db.add(new_product)
        db.commit()
        logger.info("Products seeded successfully!")
    except Exception as e:
        logger.error(f"Error seeding products: {e}")
        db.rollback()
    finally:
        db.close()

def seed_stores():
    import random
    from models import Store, Product, StoreInventory
    db = SessionLocal()
    try:
        stores_data = [
            {"name": "Lagos Store (Agege)", "city": "Agege", "state": "Lagos", "address": "Central Warehouse & Production Factory, Agege, Lagos", "is_central": True, "phone": "+234 801 000 0001", "manager_name": "Grace"},
            {"name": "Awe Store", "city": "Awe", "state": "Oyo", "address": "Awe Distribution Centre, Oyo", "is_central": False, "phone": "+234 801 000 0002", "manager_name": None},
            {"name": "Jos Store", "city": "Jos", "state": "Plateau", "address": "Jos Warehouse, Plateau State", "is_central": False, "phone": "+234 801 000 0003", "manager_name": None},
            {"name": "Owerri Store", "city": "Owerri", "state": "Imo", "address": "Owerri Distribution Hub, Imo State", "is_central": False, "phone": "+234 801 000 0004", "manager_name": None},
            {"name": "Abuja Store", "city": "Abuja", "state": "FCT", "address": "Abuja Logistics Centre, FCT", "is_central": False, "phone": "+234 801 000 0005", "manager_name": None},
            {"name": "Port Harcourt Store", "city": "Port Harcourt", "state": "Rivers", "address": "PH Warehouse, Rivers State", "is_central": False, "phone": "+234 801 000 0006", "manager_name": None},
            {"name": "Kaduna Store", "city": "Kaduna", "state": "Kaduna", "address": "Kaduna Distribution Point, Kaduna State", "is_central": False, "phone": "+234 801 000 0007", "manager_name": None},
        ]
        
        products = db.query(Product).filter(Product.is_deleted == False).all()
        existing_stores = {s.name: s for s in db.query(Store).filter(Store.is_deleted == False).all()}
        
        existing_inv_keys = {
            (inv.store_id, inv.product_id) 
            for inv in db.query(StoreInventory.store_id, StoreInventory.product_id).all()
        }
        
        for store_data in stores_data:
            store_name = store_data["name"]
            is_new_store = False
            if store_name not in existing_stores:
                logger.info(f"Seeding store: {store_name}")
                store = Store(**store_data)
                db.add(store)
                db.commit()
                db.refresh(store)
                existing_stores[store_name] = store
                is_new_store = True
            
            store = existing_stores[store_name]
            
            # Only seed initial random inventory for brand new stores.
            # Otherwise, if an admin deletes a product from an existing store,
            # it would get recreated on every server restart.
            if is_new_store:
                for p in products:
                    if (store.id, p.id) not in existing_inv_keys:
                        stock_val = float(random.randint(150, 600)) if store.is_central else float(random.randint(0, 120))
                        if not store.is_central and random.random() < 0.15:
                            stock_val = 0.0
                        new_inv = StoreInventory(store_id=store.id, product_id=p.id, stock=stock_val)
                        db.add(new_inv)
                    
        db.commit()
        logger.info("Stores and inventories seeded successfully!")
    except Exception as e:
        logger.error(f"Error seeding stores: {e}")
        db.rollback()
    finally:
        db.close()

def seed_drivers():
    from models import Driver
    db = SessionLocal()
    try:
        if db.query(Driver).count() == 0:
            drivers = ["Akeem", "Gani", "Emmanuel", "David", "Ibrahim", "Roselin", "Joseph", "3rd party", "Simeon", "Felix", "Fashe", "Nkeruka", "Blessing"]
            for d_name in drivers:
                db.add(Driver(name=d_name))
            db.commit()
            logger.info("Drivers seeded successfully!")
    except Exception as e:
        logger.error(f"Error seeding drivers: {e}")
        db.rollback()
    finally:
        db.close()

def seed_vehicles():
    from models import Vehicle
    from routes.vehicles import format_plate_number
    db = SessionLocal()
    try:
        if db.query(Vehicle).count() == 0:
            raw_plates = [
                "APP483EQ", "KTU316HP", "AGl 982 kk", "EKY357FD", 
                "AGL92KM", "LSD829YA", "AGL94KM", "JJJ318GH", 
                "GGE549DW", "JJJ322GH"
            ]
            for plate in raw_plates:
                formatted = format_plate_number(plate)
                db.add(Vehicle(plate_number=formatted))
            db.commit()
            logger.info("Vehicles seeded successfully!")
    except Exception as e:
        logger.error(f"Error seeding vehicles: {e}")
        db.rollback()
    finally:
        db.close()

# Create tables (with error handling in case DB is unavailable)
try:
    Base.metadata.create_all(bind=engine)
    
    # Run dialect-specific migrations/patches
    if engine.dialect.name == "postgresql":
        try:
            with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
                conn.execute(text("ALTER TYPE unittype ADD VALUE IF NOT EXISTS 'PIECES';"))
                logger.info("Successfully ensured 'PIECES' is in unittype enum.")
        except Exception as e:
            logger.warning(f"Could not add PIECES to unittype enum: {e}")

        # Migrate all old unit type values to PIECES and rebuild the enum
        try:
            with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
                # 1. Convert columns to VARCHAR so we can update freely
                conn.execute(text("ALTER TABLE products ALTER COLUMN default_unit TYPE VARCHAR USING default_unit::VARCHAR;"))
                conn.execute(text("ALTER TABLE order_line_items ALTER COLUMN unit TYPE VARCHAR USING unit::VARCHAR;"))
                
                # 2. Normalize carton-like values to CARTON
                conn.execute(text("UPDATE products SET default_unit = 'CARTON' WHERE UPPER(default_unit) IN ('CARTON', 'CARTONS');"))
                conn.execute(text("UPDATE order_line_items SET unit = 'CARTON' WHERE UPPER(unit) IN ('CARTON', 'CARTONS');"))
                
                # 3. Normalize all other/invalid/null values to PIECES
                conn.execute(text("UPDATE products SET default_unit = 'PIECES' WHERE default_unit IS NULL OR default_unit NOT IN ('CARTON');"))
                conn.execute(text("UPDATE order_line_items SET unit = 'PIECES' WHERE unit IS NULL OR unit NOT IN ('CARTON');"))
                
                # 4. Drop old enum type and recreate with only valid values
                conn.execute(text("DROP TYPE IF EXISTS unittype CASCADE;"))
                conn.execute(text("CREATE TYPE unittype AS ENUM ('CARTON', 'PIECES');"))
                
                # 5. Convert columns back to the new enum
                conn.execute(text("ALTER TABLE products ALTER COLUMN default_unit TYPE unittype USING default_unit::unittype;"))
                conn.execute(text("ALTER TABLE order_line_items ALTER COLUMN unit TYPE unittype USING unit::unittype;"))
                
                logger.info("Successfully migrated unittype enum to CARTON/PIECES only.")
        except Exception as e:
            logger.warning(f"Could not migrate unittype enum values: {e}")

    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS requesting_admin BOOLEAN DEFAULT FALSE;"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role_changed_at TIMESTAMP;"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS has_write_access BOOLEAN DEFAULT FALSE;"))
        conn.execute(text("UPDATE users SET is_active = TRUE;"))
        conn.execute(text("UPDATE products SET default_unit = 'PIECES';"))
        
        # Swap existing Delivery No (waybill_number) and Invoice No prefixes in database
        try:
            conn.execute(text("""
                UPDATE orders 
                SET 
                  waybill_number = REPLACE(waybill_number, '/SA/', '/DLN/'),
                  invoice_number = REPLACE(invoice_number, '/DLN/', '/SA/')
                WHERE 
                  waybill_number LIKE '%/SA/%' OR invoice_number LIKE '%/DLN/%';
            """))
            logger.info("Successfully swapped SA/DLN prefixes in orders table.")
        except Exception as e:
            logger.warning(f"Could not swap SA/DLN prefixes in database: {e}")
        
        # Create order_reference_cards table if it doesn't exist
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS order_reference_cards (
                    id SERIAL PRIMARY KEY,
                    order_id INTEGER NOT NULL REFERENCES orders(id),
                    invoice_number VARCHAR,
                    waybill_number VARCHAR,
                    brand VARCHAR DEFAULT 'DSL'
                );
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_order_reference_cards_order_id ON order_reference_cards (order_id);"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_order_reference_cards_id ON order_reference_cards (id);"))
            logger.info("Ensured order_reference_cards table exists.")
        except Exception as e:
            logger.warning(f"Could not create order_reference_cards table: {e}")
        
        # Add reference_card_id column to order_line_items if it doesn't exist
        try:
            conn.execute(text("ALTER TABLE order_line_items ADD COLUMN IF NOT EXISTS reference_card_id INTEGER REFERENCES order_reference_cards(id);"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_order_line_items_reference_card_id ON order_line_items (reference_card_id);"))
            logger.info("Ensured reference_card_id column exists on order_line_items.")
        except Exception as e:
            logger.warning(f"Could not add reference_card_id column: {e}")
            
        conn.commit()
    seed_admin_user()
    seed_products()
    seed_stores()
    seed_drivers()
    seed_vehicles()
except Exception as e:
    logger.warning(f"Could not create tables or run migrations on startup: {e}. Database may be unavailable.")

# Create FastAPI app
app = FastAPI(
    title="Diversay Logistics Portal API",
    description="Backend API for Diversay Solutions logistics management",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000"
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",  # Automatically allow any Vercel deployment URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(customers.router)
app.include_router(products.router)
app.include_router(orders.router)
app.include_router(analytics.router)
app.include_router(global_analytics.router)
app.include_router(stores.router)
app.include_router(drivers.router)
app.include_router(vehicles.router)

@app.get("/")
def root():
    return {
        "message": "Diversay Logistics Portal API",
        "version": "1.0.0",
        "docs": "/docs"
    }

@app.api_route("/health", methods=["GET", "HEAD"])
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
