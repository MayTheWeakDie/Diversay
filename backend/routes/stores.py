from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import User, Store, StoreInventory, Product, Customer, Order, OrderLineItem, OrderReferenceCard, OrderStatus, AuditLog, ActionType
from schemas import (
    StoreCreate, StoreUpdate, StoreResponse, StoreInventoryResponse, StoreInventoryUpdate,
    InterStoreTransferRequest, InterStoreTransferResponse
)
from auth import get_current_user, check_write_access
from utils import get_order_with_details
from typing import List, Optional
from datetime import datetime
import uuid

router = APIRouter(prefix="/stores", tags=["stores"])

@router.get("/", response_model=List[StoreResponse])
def list_stores(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all active stores."""
    stores = db.query(Store).filter(Store.is_deleted == False).order_by(Store.is_central.desc(), Store.name).all()
    return stores

@router.get("/{store_id}", response_model=StoreResponse)
def get_store(
    store_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a single store by ID."""
    store = db.query(Store).filter(Store.id == store_id, Store.is_deleted == False).first()
    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")
    return store

@router.post("/", response_model=StoreResponse, status_code=status.HTTP_201_CREATED)
def create_store(
    store: StoreCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_write_access)
):
    """Create a new store (admin only)."""
    existing = db.query(Store).filter(
        Store.name == store.name,
        Store.is_deleted == False
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A store with this name already exists"
        )
    
    new_store = Store(
        name=store.name,
        city=store.city,
        state=store.state,
        address=store.address,
        is_central=store.is_central,
        phone=store.phone,
        manager_name=store.manager_name
    )
    
    db.add(new_store)
    db.commit()
    db.refresh(new_store)
    return new_store

@router.put("/{store_id}", response_model=StoreResponse)
def update_store(
    store_id: int,
    store_update: StoreUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_write_access)
):
    """Update a store (admin only)."""
    store = db.query(Store).filter(Store.id == store_id, Store.is_deleted == False).first()
    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")
    
    update_data = store_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(store, field, value)
    
    db.commit()
    db.refresh(store)
    return store

@router.delete("/{store_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_store(
    store_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_write_access)
):
    """Soft delete a store (admin only)."""
    store = db.query(Store).filter(Store.id == store_id, Store.is_deleted == False).first()
    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")
    
    store.is_deleted = True
    db.commit()
    return None

@router.get("/{store_id}/inventory", response_model=List[StoreInventoryResponse])
def get_store_inventory(
    store_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve all product stock levels for a given store."""
    store = db.query(Store).filter(Store.id == store_id, Store.is_deleted == False).first()
    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")
        
    # Query only inventories that exist for non-deleted products
    existing_inv = db.query(StoreInventory).join(Product).filter(
        StoreInventory.store_id == store_id,
        Product.is_deleted == False
    ).options(
        joinedload(StoreInventory.product)
    ).all()
    
    inventory_list = []
    for inv in existing_inv:
        inventory_list.append({
            "id": inv.id,
            "store_id": store_id,
            "product_id": inv.product_id,
            "product_name": inv.product.name,
            "product_category": inv.product.category.value,
            "default_unit": inv.product.default_unit.value,
            "product_brand": inv.product.brand,
            "stock": inv.stock,
            "reorder_level": inv.reorder_level,
            "unit_price": inv.product.unit_price
        })
        
    return inventory_list

@router.put("/{store_id}/inventory/{product_id}", response_model=StoreInventoryResponse)
def update_store_inventory(
    store_id: int,
    product_id: int,
    inventory_update: StoreInventoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_write_access)
):
    """Update stock level or reorder level for a product at a specific store (admin only)."""
    store = db.query(Store).filter(Store.id == store_id, Store.is_deleted == False).first()
    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")
        
    product = db.query(Product).filter(Product.id == product_id, Product.is_deleted == False).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
        
    inv = db.query(StoreInventory).filter(
        StoreInventory.store_id == store_id,
        StoreInventory.product_id == product_id
    ).first()
    
    if not inv:
        inv = StoreInventory(
            store_id=store_id, 
            product_id=product_id, 
            stock=inventory_update.stock if inventory_update.stock is not None else 0.0,
            reorder_level=inventory_update.reorder_level if inventory_update.reorder_level is not None else 15.0
        )
        db.add(inv)
    else:
        if inventory_update.stock is not None:
            inv.stock = inventory_update.stock
        if inventory_update.reorder_level is not None:
            inv.reorder_level = inventory_update.reorder_level

    if inventory_update.product_name:
        product.name = inventory_update.product_name.strip()
    if inventory_update.product_brand:
        product.brand = inventory_update.product_brand.strip().upper()
        
    db.commit()
    db.refresh(inv)
    
    return {
        "id": inv.id,
        "store_id": store_id,
        "product_id": product_id,
        "product_name": product.name,
        "product_category": product.category.value,
        "default_unit": product.default_unit.value,
        "product_brand": product.brand,
        "stock": inv.stock,
        "reorder_level": inv.reorder_level,
        "unit_price": product.unit_price
    }

@router.delete("/{store_id}/inventory/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_store_inventory(
    store_id: int,
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_write_access)
):
    """Delete a product's inventory record from a specific store (admin only)."""
    store = db.query(Store).filter(Store.id == store_id, Store.is_deleted == False).first()
    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")
        
    inv = db.query(StoreInventory).filter(
        StoreInventory.store_id == store_id,
        StoreInventory.product_id == product_id
    ).first()
    
    if not inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product inventory record not found in this store"
        )
        
    db.delete(inv)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.post("/{source_store_id}/transfer", response_model=InterStoreTransferResponse)
def transfer_inter_store(
    source_store_id: int,
    transfer_req: InterStoreTransferRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_write_access)
):
    """Transfer product inventory stock from a source store to one or more destination stores."""
    source_store = db.query(Store).filter(Store.id == source_store_id, Store.is_deleted == False).first()
    if not source_store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source store not found")

    product = db.query(Product).filter(Product.id == transfer_req.product_id, Product.is_deleted == False).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    if not transfer_req.transfers:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one transfer destination must be specified")

    # Fetch source inventory
    source_inv = db.query(StoreInventory).filter(
        StoreInventory.store_id == source_store_id,
        StoreInventory.product_id == transfer_req.product_id
    ).first()

    current_stock = source_inv.stock if source_inv else 0.0
    total_requested_qty = sum(item.quantity for item in transfer_req.transfers)

    if total_requested_qty <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Transfer quantity must be greater than zero")

    if current_stock < total_requested_qty:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient stock in {source_store.name}. Available: {current_stock}, requested transfer: {total_requested_qty}"
        )

    # Ensure system transfer customer exists
    transfer_customer = db.query(Customer).filter(Customer.name == "Inter-Store Transfer", Customer.is_deleted == False).first()
    if not transfer_customer:
        transfer_customer = Customer(
            name="Inter-Store Transfer",
            address="System Inter-Store Transfer",
            city="Internal",
            state="Internal",
            contact_number="N/A",
            email="transfer@system.local",
            created_by_id=current_user.id
        )
        db.add(transfer_customer)
        db.flush()

    unit_name = product.default_unit.value if hasattr(product.default_unit, 'value') else str(product.default_unit)
    transfers_detail = []
    
    # 1. Deduct from source store
    source_inv.stock -= total_requested_qty

    # 2. Add to each destination store & create transfer Order for inbound/outbound analytics
    for item in transfer_req.transfers:
        if item.destination_store_id == source_store_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Destination store cannot be the same as the source store"
            )

        dest_store = db.query(Store).filter(Store.id == item.destination_store_id, Store.is_deleted == False).first()
        if not dest_store:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Destination store with ID {item.destination_store_id} not found"
            )

        dest_inv = db.query(StoreInventory).filter(
            StoreInventory.store_id == item.destination_store_id,
            StoreInventory.product_id == transfer_req.product_id
        ).first()

        if not dest_inv:
            dest_inv = StoreInventory(
                store_id=item.destination_store_id,
                product_id=transfer_req.product_id,
                stock=item.quantity,
                reorder_level=15.0
            )
            db.add(dest_inv)
        else:
            dest_inv.stock += item.quantity

        # Create Order record so this transaction registers in source (outbound) and destination (inbound) analytics
        now_dt = datetime.utcnow()
        order_no = f"TRF-{now_dt.strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:4].upper()}"

        transfer_order = Order(
            order_number=order_no,
            waybill_number=f"WB-{order_no}",
            invoice_number=f"INV-{order_no}",
            customer_id=transfer_customer.id,
            source_store_id=source_store_id,
            destination_store_id=item.destination_store_id,
            dispatch_time=now_dt,
            actual_delivery_time=now_dt,
            order_status=OrderStatus.DELIVERED_ON_TIME,
            created_by_id=current_user.id,
            notes=f"Inter-store transfer of {item.quantity} {unit_name} of {product.name} from {source_store.name} to {dest_store.name}",
            line_items=[
                OrderLineItem(
                    product_id=transfer_req.product_id,
                    quantity=item.quantity,
                    unit=product.default_unit,
                    unit_price=product.unit_price or 0.0
                )
            ]
        )
        db.add(transfer_order)

        audit = AuditLog(
            user_id=current_user.id,
            action=ActionType.CREATE,
            table_name="orders",
            record_id=0,
            details=f"Inter-store transfer: Transferred {item.quantity} {unit_name} of {product.name} from {source_store.name} to {dest_store.name}"
        )
        db.add(audit)

        transfers_detail.append({
            "destination_store_id": item.destination_store_id,
            "destination_store_name": dest_store.name,
            "quantity_transferred": item.quantity,
            "product_name": product.name,
            "source_store_name": source_store.name
        })

    db.commit()
    db.refresh(source_inv)

    detail_str = ", ".join([
        f"{t['quantity_transferred']} {unit_name} of {t['product_name']} from {t['source_store_name']} to {t['destination_store_name']}"
        for t in transfers_detail
    ])

    return {
        "message": f"Successfully transferred {detail_str}.",
        "source_store_id": source_store_id,
        "product_id": transfer_req.product_id,
        "source_remaining_stock": source_inv.stock,
        "transfers_detail": transfers_detail
    }

@router.get("/{store_id}/analytics")
def get_store_analytics(
    store_id: int,
    days: int = 7,
    trending_days: Optional[str] = "all",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get store-specific analytics.
    
    Args:
        days: Number of days of movement data to return (1=today, 7=this week, 30, 90, etc.)
        trending_days: Timeframe filter for trending products ("1", "7", "30", "90", "all")
    """
    from models import Order, OrderLineItem
    from datetime import datetime, timedelta
    
    store = db.query(Store).filter(Store.id == store_id, Store.is_deleted == False).first()
    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")
        
    incoming_orders = db.query(Order).filter(
        Order.destination_store_id == store_id, 
        Order.is_deleted == False
    ).options(
        joinedload(Order.line_items).joinedload(OrderLineItem.product),
        joinedload(Order.customer),
        joinedload(Order.created_by_user),
        joinedload(Order.source_store),
        joinedload(Order.destination_store),
        joinedload(Order.reference_cards).joinedload(OrderReferenceCard.line_items).joinedload(OrderLineItem.product)
    ).all()
    
    outgoing_orders = db.query(Order).filter(
        Order.source_store_id == store_id, 
        Order.is_deleted == False
    ).options(
        joinedload(Order.line_items).joinedload(OrderLineItem.product),
        joinedload(Order.customer),
        joinedload(Order.created_by_user),
        joinedload(Order.source_store),
        joinedload(Order.destination_store),
        joinedload(Order.reference_cards).joinedload(OrderReferenceCard.line_items).joinedload(OrderLineItem.product)
    ).all()
    
    total_incoming = len(incoming_orders)
    total_outgoing = len(outgoing_orders)
    
    now = datetime.utcnow()
    all_orders_list = incoming_orders + outgoing_orders
    
    trending_by_range = {
        "1": {},
        "7": {},
        "30": {},
        "90": {},
        "all": {}
    }
    
    for order in all_orders_list:
        for item in order.line_items:
            product_name = item.product.name if item.product else f"Product #{item.product_id}"
            order_time = order.dispatch_time or order.created_at
            
            trending_by_range["all"][product_name] = trending_by_range["all"].get(product_name, 0) + item.quantity
            
            if order_time:
                delta_days = (now - order_time).total_seconds() / 86400.0
                if delta_days <= 1.0:
                    trending_by_range["1"][product_name] = trending_by_range["1"].get(product_name, 0) + item.quantity
                if delta_days <= 7.0:
                    trending_by_range["7"][product_name] = trending_by_range["7"].get(product_name, 0) + item.quantity
                if delta_days <= 30.0:
                    trending_by_range["30"][product_name] = trending_by_range["30"].get(product_name, 0) + item.quantity
                if delta_days <= 90.0:
                    trending_by_range["90"][product_name] = trending_by_range["90"].get(product_name, 0) + item.quantity
            
    def format_top_5(trend_dict):
        return [
            {"name": name, "quantity": qty}
            for name, qty in sorted(trend_dict.items(), key=lambda x: x[1], reverse=True)[:5]
        ]
        
    top_products_by_range = {
        r: format_top_5(td) for r, td in trending_by_range.items()
    }
    
    selected_top = top_products_by_range.get(str(trending_days), top_products_by_range["all"])
    
    inv_items = db.query(StoreInventory).filter(
        StoreInventory.store_id == store_id
    ).options(
        joinedload(StoreInventory.product)
    ).all()
    dsl_count = 0
    dslp_count = 0
    dsl_stock = 0
    dslp_stock = 0
    for item in inv_items:
        product = item.product
        if product and not product.is_deleted:
            brand = (product.brand or "").upper()
            if brand == "DSL":
                dsl_count += 1
                dsl_stock += item.stock
            elif brand == "DSLP":
                dslp_count += 1
                dslp_stock += item.stock
    
    # Build movement date buckets based on requested day range
    # Clamp days to a sensible range (1..365)
    days = max(1, min(days, 365))
    movement_dates = {}
    
    if days == 1:
        # Today: 4-hour interval buckets for a smooth area chart
        today_str = now.date().isoformat()
        for hour in range(0, 24, 4):
            key = f"{today_str}T{hour:02d}:00:00"
            movement_dates[key] = {"incoming": 0, "outgoing": 0}
            
        today_date = now.date()
        for o in incoming_orders:
            if o.dispatch_time and o.dispatch_time.date() == today_date:
                h = o.dispatch_time.hour
                bucket_hour = (h // 4) * 4
                key = f"{today_str}T{bucket_hour:02d}:00:00"
                if key in movement_dates:
                    qty = sum(item.quantity for item in o.line_items)
                    movement_dates[key]["incoming"] += qty
                    
        for o in outgoing_orders:
            if o.dispatch_time and o.dispatch_time.date() == today_date:
                h = o.dispatch_time.hour
                bucket_hour = (h // 4) * 4
                key = f"{today_str}T{bucket_hour:02d}:00:00"
                if key in movement_dates:
                    qty = sum(item.quantity for item in o.line_items)
                    movement_dates[key]["outgoing"] += qty
    else:
        # Multi-day: Daily buckets
        for i in range(days):
            d = (now - timedelta(days=i)).date().isoformat()
            movement_dates[d] = {"incoming": 0, "outgoing": 0}
            
        for o in incoming_orders:
            if o.dispatch_time:
                d_str = o.dispatch_time.date().isoformat()
                if d_str in movement_dates:
                    qty = sum(item.quantity for item in o.line_items)
                    movement_dates[d_str]["incoming"] += qty
                    
        for o in outgoing_orders:
            if o.dispatch_time:
                d_str = o.dispatch_time.date().isoformat()
                if d_str in movement_dates:
                    qty = sum(item.quantity for item in o.line_items)
                    movement_dates[d_str]["outgoing"] += qty
                    
    movement_data = [
        {"date": d, "incoming": val["incoming"], "outgoing": val["outgoing"]}
        for d, val in sorted(movement_dates.items())
    ]

    incoming_transactions = [get_order_with_details(o) for o in sorted(incoming_orders, key=lambda x: x.created_at or datetime.min, reverse=True)]
    outgoing_transactions = [get_order_with_details(o) for o in sorted(outgoing_orders, key=lambda x: x.created_at or datetime.min, reverse=True)]
    
    return {
        "total_incoming": total_incoming,
        "total_outgoing": total_outgoing,
        "top_products": selected_top,
        "top_products_by_range": top_products_by_range,
        "dsl_count": dsl_count,
        "dslp_count": dslp_count,
        "dsl_stock": dsl_stock,
        "dslp_stock": dslp_stock,
        "movement_data": movement_data,
        "incoming_transactions": incoming_transactions,
        "outgoing_transactions": outgoing_transactions
    }

@router.get("/{store_id}/analytics/trending-details")
def get_store_trending_details(
    store_id: int,
    timeframe: str = "all",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed trending products with customer breakdown.
    
    Args:
        timeframe: "1", "7", "30", "90", or "all"
    """
    from models import Order, OrderLineItem, Store
    from sqlalchemy.orm import joinedload
    from datetime import datetime
    
    store = db.query(Store).filter(Store.id == store_id, Store.is_deleted == False).first()
    if not store:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")
        
    # We look at outgoing orders from this store to see which customers are buying
    outgoing_orders = db.query(Order).filter(
        Order.source_store_id == store_id, 
        Order.is_deleted == False
    ).options(
        joinedload(Order.line_items).joinedload(OrderLineItem.product),
        joinedload(Order.customer),
        joinedload(Order.destination_store)
    ).all()
    
    now = datetime.utcnow()
    
    # Structure: dict of product_name -> { "total_quantity": X, "customers": { customer_name: quantity } }
    product_map = {}
    
    for order in outgoing_orders:
        order_time = order.dispatch_time or order.created_at
        
        # Check timeframe
        if order_time and timeframe != "all":
            delta_days = (now - order_time).total_seconds() / 86400.0
            if timeframe == "1" and delta_days > 1.0:
                continue
            if timeframe == "7" and delta_days > 7.0:
                continue
            if timeframe == "30" and delta_days > 30.0:
                continue
            if timeframe == "90" and delta_days > 90.0:
                continue
                
        # Determine customer name (either actual customer or destination store if it's an internal transfer)
        if order.customer:
            customer_name = order.customer.name
        elif order.destination_store:
            customer_name = f"Store: {order.destination_store.name}"
        else:
            customer_name = "Unknown"
            
        for item in order.line_items:
            product_name = item.product.name if item.product else f"Product #{item.product_id}"
            
            if product_name not in product_map:
                product_map[product_name] = {
                    "product_name": product_name,
                    "total_quantity": 0,
                    "customers": {}
                }
                
            product_map[product_name]["total_quantity"] += item.quantity
            product_map[product_name]["customers"][customer_name] = product_map[product_name]["customers"].get(customer_name, 0) + item.quantity

    # Format output to a list
    results = []
    for p_name, p_data in product_map.items():
        # Convert customers dict to a list for frontend mapping
        customer_list = [
            {"name": c_name, "quantity": c_qty}
            for c_name, c_qty in sorted(p_data["customers"].items(), key=lambda x: x[1], reverse=True)
        ]
        
        results.append({
            "product_name": p_name,
            "total_quantity": p_data["total_quantity"],
            "customers": customer_list
        })
        
    # Sort products by total quantity descending
    results.sort(key=lambda x: x["total_quantity"], reverse=True)
    
    return {
        "timeframe": timeframe,
        "products": results
    }
