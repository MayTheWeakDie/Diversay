import sys
import logging
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Store, StoreInventory, Product

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def sync_inventories():
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
        
        # 3. For all other stores
        other_stores = db.query(Store).filter(Store.id != awe_store.id, Store.is_deleted == False).all()
        
        for store in other_stores:
            logger.info(f"Syncing store: {store.name} (ID: {store.id})")
            
            store_inventories = db.query(StoreInventory).filter(StoreInventory.store_id == store.id).all()
            store_product_ids = {inv.product_id for inv in store_inventories}
            
            # Find what to delete and what to add
            to_delete = store_product_ids - awe_product_ids
            to_add = awe_product_ids - store_product_ids
            
            logger.info(f"  - Deleting {len(to_delete)} surplus products.")
            logger.info(f"  - Adding {len(to_add)} missing products.")
            
            # Delete surplus products
            if to_delete:
                db.query(StoreInventory).filter(
                    StoreInventory.store_id == store.id,
                    StoreInventory.product_id.in_(to_delete)
                ).delete(synchronize_session=False)
                
            # Add missing products
            for p_id in to_add:
                new_inv = StoreInventory(
                    store_id=store.id,
                    product_id=p_id,
                    stock=0.0
                )
                db.add(new_inv)
                
        db.commit()
        logger.info("Sync complete!")
        
    except Exception as e:
        logger.error(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    sync_inventories()
