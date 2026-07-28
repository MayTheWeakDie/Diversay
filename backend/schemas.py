from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional, List
from models import OrderStatus, UserRole, ProductCategory, UnitType, ActionType

# ============ User Schemas ============
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    requesting_admin: bool = False
    role_changed_at: Optional[datetime] = None
    has_write_access: bool = False
    
    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class SignupResponse(BaseModel):
    message: str
    user: UserResponse

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordReset(BaseModel):
    token: str
    new_password: str = Field(..., min_length=6)

class UpdateUserNameRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)

class UserRoleUpdate(BaseModel):
    role: UserRole
    has_write_access: Optional[bool] = None

# ============ Customer Schemas ============
class CustomerCreate(BaseModel):
    name: str
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    contact_number: Optional[str] = None
    email: Optional[str] = None

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    contact_number: Optional[str] = None
    email: Optional[str] = None

class CustomerResponse(BaseModel):
    id: int
    name: str
    address: Optional[str]
    city: Optional[str]
    state: Optional[str]
    contact_number: Optional[str]
    email: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class CustomerSearchResponse(BaseModel):
    id: int
    name: str
    address: Optional[str]
    city: Optional[str]
    state: Optional[str]
    contact_number: Optional[str]
    email: Optional[str]

# ============ Product Schemas ============
class ProductCreate(BaseModel):
    name: str
    category: ProductCategory = ProductCategory.OTHER
    default_unit: UnitType = UnitType.PIECES
    brand: Optional[str] = "DSL"
    unit_price: float = 0.0

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[ProductCategory] = None
    default_unit: Optional[UnitType] = None
    brand: Optional[str] = None
    unit_price: Optional[float] = None

class ProductResponse(BaseModel):
    id: int
    name: str
    category: ProductCategory
    default_unit: UnitType
    brand: str
    unit_price: float
    created_at: datetime
    
    class Config:
        from_attributes = True

# ============ Order Line Item Schemas ============
class OrderLineItemCreate(BaseModel):
    product_id: int
    quantity: float
    unit: UnitType

class OrderLineItemResponse(BaseModel):
    id: int
    product_id: int
    product_name: Optional[str] = None
    product_brand: Optional[str] = None
    quantity: float
    unit: UnitType
    unit_price: float
    total_price: Optional[float] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

# ============ Reference Card Schemas ============
class ReferenceCardLineItemCreate(BaseModel):
    product_id: int
    quantity: float
    unit: UnitType

class ReferenceCardCreate(BaseModel):
    invoice_number: str
    waybill_number: str
    brand: str = "DSL"
    line_items: List[ReferenceCardLineItemCreate]

class ReferenceCardResponse(BaseModel):
    id: int
    invoice_number: Optional[str] = None
    waybill_number: Optional[str] = None
    brand: str = "DSL"
    line_items: List[OrderLineItemResponse] = []
    
    class Config:
        from_attributes = True

# ============ Order Schemas ============
class OrderCreate(BaseModel):
    customer_id: int
    source_store_id: Optional[int] = None
    destination_store_id: Optional[int] = None
    waybill_number: Optional[str] = None
    invoice_number: Optional[str] = None
    dispatch_time: datetime
    expected_delivery_time: datetime
    notes: Optional[str] = None
    driver_name: Optional[str] = None
    vehicle_number: Optional[str] = None
    fuel_cost: Optional[float] = 0.0
    waybill_cost: Optional[float] = 0.0
    other_costs: Optional[List[dict]] = []
    line_items: Optional[List[OrderLineItemCreate]] = None
    reference_cards: Optional[List[ReferenceCardCreate]] = None
    commit_message: Optional[str] = None

class OrderUpdate(BaseModel):
    customer_id: Optional[int] = None
    source_store_id: Optional[int] = None
    destination_store_id: Optional[int] = None
    waybill_number: Optional[str] = None
    invoice_number: Optional[str] = None
    dispatch_time: Optional[datetime] = None
    expected_delivery_time: Optional[datetime] = None
    actual_delivery_time: Optional[datetime] = None
    notes: Optional[str] = None
    driver_name: Optional[str] = None
    vehicle_number: Optional[str] = None
    fuel_cost: Optional[float] = None
    waybill_cost: Optional[float] = None
    other_costs: Optional[List[dict]] = None
    line_items: Optional[List[OrderLineItemCreate]] = None
    reference_cards: Optional[List[ReferenceCardCreate]] = None
    commit_message: Optional[str] = None

class OrderStatusUpdate(BaseModel):
    order_status: OrderStatus

class MarkDeliveredRequest(BaseModel):
    actual_delivery_time: datetime

class OrderResponse(BaseModel):
    id: int
    order_number: str
    waybill_number: Optional[str]
    invoice_number: Optional[str]
    customer_id: int
    customer_name: Optional[str] = None
    customer_state: Optional[str] = None
    customer_address: Optional[str] = None
    source_store_id: Optional[int] = None
    destination_store_id: Optional[int] = None
    source_store_name: Optional[str] = None
    destination_store_name: Optional[str] = None
    destination_store_city: Optional[str] = None
    destination_store_state: Optional[str] = None
    destination_store_address: Optional[str] = None
    source_store_is_central: Optional[bool] = False
    destination_store_is_central: Optional[bool] = False
    dispatch_time: Optional[datetime]
    expected_delivery_time: Optional[datetime]
    actual_delivery_time: Optional[datetime]
    delivery_duration: Optional[int]
    order_status: OrderStatus
    notes: Optional[str]
    driver_name: Optional[str]
    vehicle_number: Optional[str]
    fuel_cost: float = 0.0
    waybill_cost: float = 0.0
    other_costs: Optional[List[dict]] = []
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    total_amount: float = 0.0
    line_items: List[OrderLineItemResponse] = []
    reference_cards: List[ReferenceCardResponse] = []
    
    class Config:
        from_attributes = True

class OrderDetailResponse(OrderResponse):
    customer: Optional[CustomerResponse] = None
    created_by_user: Optional[UserResponse] = None

# ============ Audit Log Schemas ============
class AuditLogResponse(BaseModel):
    id: int
    user_id: int
    user_name: Optional[str] = None
    action: ActionType
    table_name: str
    record_id: int
    details: Optional[str]
    timestamp: datetime
    
    class Config:
        from_attributes = True

# ============ Analytics Schemas ============
class StatusBreakdown(BaseModel):
    status: str
    count: int

class OrderMetrics(BaseModel):
    date: str
    count: int

class StateMetrics(BaseModel):
    state: str
    count: int

class DashboardMetrics(BaseModel):
    total_orders_today: int
    in_transit_count: int
    delayed_count: int
    delayed_orders: List[dict]
    delivered_this_week: int
    total_customers: int
    status_breakdown: List[StatusBreakdown]
    on_time_percentage: float
    late_percentage: float
    top_5_states: List[StateMetrics]
    orders_last_30_days: List[OrderMetrics]
    total_orders_30_days: int
    orders_growth_percentage: float

# ============ Store Schemas ============
class StoreCreate(BaseModel):
    name: str
    city: str
    state: str
    address: Optional[str] = None
    is_central: bool = False
    phone: Optional[str] = None
    manager_name: Optional[str] = None

class StoreUpdate(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    address: Optional[str] = None
    is_central: Optional[bool] = None
    phone: Optional[str] = None
    manager_name: Optional[str] = None

class StoreResponse(BaseModel):
    id: int
    name: str
    city: str
    state: str
    address: Optional[str]
    is_central: bool
    phone: Optional[str]
    manager_name: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class StoreInventoryResponse(BaseModel):
    id: int
    store_id: int
    product_id: int
    product_name: str
    product_category: str
    default_unit: str
    product_brand: str
    stock: float
    reorder_level: float
    unit_price: float
    
    class Config:
        from_attributes = True

class StoreInventoryUpdate(BaseModel):
    stock: Optional[float] = None
    reorder_level: Optional[float] = None
    product_name: Optional[str] = None
    product_brand: Optional[str] = None


class AcknowledgeRequest(BaseModel):
    notification_id: str


# ============ Inter-Store Transfer Schemas ============
class InterStoreTransferDestination(BaseModel):
    destination_store_id: int
    quantity: float = Field(..., gt=0)

class InterStoreTransferRequest(BaseModel):
    product_id: int
    transfers: List[InterStoreTransferDestination]

class InterStoreTransferResponse(BaseModel):
    message: str
    source_store_id: int
    product_id: int
    source_remaining_stock: float
    transfers_detail: List[dict]



