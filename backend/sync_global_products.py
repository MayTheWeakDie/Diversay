import sys
import logging
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Store, StoreInventory, Product

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def sync_global_products():
    db = SessionLocal()
    try:
        # 1. Find Awe Store
        awe_store = db.query(Store).filter(Store.name.ilike('%awe store%'), Store.is_deleted == False).first()
        if not awe_store:
            logger.error("Awe store not found!")
            return
            
        logger.info(f"Found Awe Store with ID: {awe_store.id}")
        
        # 2. Get product IDs in Awe Store
        awe_inventories = db.query(StoreInventory).filter(StoreInventory.store_id == awe_store.id).all()
        awe_product_ids = {inv.product_id for inv in awe_inventories}
        
        logger.info(f"Awe Store has {len(awe_product_ids)} products.")
        
        # 3. Soft-delete all global products NOT in awe_product_ids
        all_products = db.query(Product).filter(Product.is_deleted == False).all()
        deleted_count = 0
        
        for p in all_products:
            if p.id not in awe_product_ids:
                p.is_deleted = True
                deleted_count += 1
                
        db.commit()
        logger.info(f"Successfully soft-deleted {deleted_count} surplus global products.")
        logger.info(f"Global product list now matches Awe Store ({len(all_products) - deleted_count} active products).")
        
    except Exception as e:
        logger.error(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    sync_global_products()
