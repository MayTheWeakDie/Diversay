from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import User, UserRole
from schemas import UserCreate, UserLogin, UserResponse, TokenResponse, SignupResponse, PasswordResetRequest, PasswordReset, UpdateUserNameRequest, UserRoleUpdate
from auth import hash_password, verify_password, create_access_token, get_current_user
from datetime import timedelta, datetime
from typing import List

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login", response_model=TokenResponse)
def login(user_login: UserLogin, db: Session = Depends(get_db)):
    """Login user and return JWT token."""
    user = db.query(User).filter(User.email == user_login.email).first()
    
    if not user or not verify_password(user_login.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Please contact an administrator."
        )
    
    access_token = create_access_token(data={"sub": user.id})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "requesting_admin": user.requesting_admin,
            "role_changed_at": user.role_changed_at,
            "has_write_access": user.has_write_access
        }
    }

@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
def signup(user_create: UserCreate, db: Session = Depends(get_db)):
    """Register new viewer user (active immediately, read-only)."""
    existing_user = db.query(User).filter(User.email == user_create.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered. Please log in instead."
        )
    
    new_user = User(
        email=user_create.email,
        password_hash=hash_password(user_create.password),
        full_name=user_create.full_name,
        role=UserRole.VIEWER,
        is_active=True,  # Active by default so they can log in and view
        requesting_admin=False
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {
        "message": "Signup successful! You can now log in.",
        "user": {
            "id": new_user.id,
            "email": new_user.email,
            "full_name": new_user.full_name,
            "role": new_user.role,
            "is_active": new_user.is_active,
            "created_at": new_user.created_at,
            "requesting_admin": new_user.requesting_admin,
            "role_changed_at": new_user.role_changed_at,
            "has_write_access": new_user.has_write_access
        }
    }

@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current logged-in user info."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "is_active": current_user.is_active,
        "created_at": current_user.created_at,
        "requesting_admin": current_user.requesting_admin,
        "role_changed_at": current_user.role_changed_at,
        "has_write_access": current_user.has_write_access
    }

@router.get("/admins")
def get_admins(db: Session = Depends(get_db)):
    """Get active administrators info."""
    admins = db.query(User).filter(User.role == UserRole.ADMIN, User.is_active == True).all()
    return [{"id": admin.id, "full_name": admin.full_name, "email": admin.email} for admin in admins]

@router.patch("/me", response_model=UserResponse)
def update_user_info(current_user: User = Depends(get_current_user), update_data: UpdateUserNameRequest = None, db: Session = Depends(get_db)):
    """Update current user's name."""
    if update_data:
        if update_data.full_name:
            current_user.full_name = update_data.full_name
        db.commit()
        db.refresh(current_user)
    
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "is_active": current_user.is_active,
        "created_at": current_user.created_at,
        "requesting_admin": current_user.requesting_admin,
        "role_changed_at": current_user.role_changed_at,
        "has_write_access": current_user.has_write_access
    }

@router.post("/request-admin")
def request_admin_access(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Request promotion to Admin (write access)."""
    if current_user.role == UserRole.ADMIN:
        return {"message": "You are already an admin."}
    
    current_user.requesting_admin = True
    db.commit()
    return {"message": "Request for admin access submitted successfully.", "requesting_admin": True}

@router.post("/password-reset-request")
def request_password_reset(request: PasswordResetRequest, db: Session = Depends(get_db)):
    """Request password reset (mock - skip email for now)."""
    user = db.query(User).filter(User.email == request.email).first()
    
    if not user:
        return {"message": "If that email is registered, you will receive a password reset link."}
    
    return {"message": "Password reset link sent to email (mock)"}

@router.post("/password-reset")
def reset_password(reset: PasswordReset, db: Session = Depends(get_db)):
    """Reset password with token."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Password reset not implemented yet"
    )

@router.post("/logout")
def logout():
    """Logout user (client clears token)."""
    return {"message": "Logged out successfully"}

# ============= ADMIN ENDPOINTS =============

@router.get("/admin/pending-approvals")
def get_pending_approvals(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get list of users requesting admin access (admin only)."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can view pending approvals"
        )
    
    pending_users = db.query(User).filter(User.requesting_admin == True).all()
    
    return {
        "total": len(pending_users),
        "pending_users": [
            {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role,
                "created_at": user.created_at,
                "requesting_admin": user.requesting_admin
            }
            for user in pending_users
        ]
    }

@router.patch("/admin/approve-user/{user_id}", response_model=UserResponse)
def approve_user(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Approve a pending admin request (admin only)."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can approve users"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.has_write_access = True
    user.requesting_admin = False
    user.role_changed_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "requesting_admin": user.requesting_admin,
        "role_changed_at": user.role_changed_at,
        "has_write_access": user.has_write_access
    }

@router.patch("/admin/reject-user/{user_id}")
def reject_user(user_id: int, reason: str = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Reject a pending admin request (admin only)."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can reject users"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.requesting_admin = False
    db.commit()
    
    return {"message": f"Admin request for {user.email} has been rejected."}

@router.get("/admin/users", response_model=List[UserResponse])
def get_all_users(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get list of all users in the system (admin only)."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can view the user list"
        )
    return db.query(User).order_by(User.full_name).all()

@router.patch("/admin/users/{user_id}/role", response_model=UserResponse)
def update_user_role(user_id: int, payload: UserRoleUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update a user's role directly (admin only)."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can modify user roles"
        )
    
    # Prevent self-demotion to avoid locking out the last admin
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot change your own role to prevent lockout"
        )
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
        
    if payload.role is not None:
        user.role = payload.role
        if payload.role == UserRole.ADMIN:
            user.has_write_access = True
            
    if payload.has_write_access is not None:
        if not user.has_write_access and payload.has_write_access:
            user.role_changed_at = datetime.utcnow()
        user.has_write_access = payload.has_write_access
        
    db.commit()
    db.refresh(user)
    
    # Return formatted dict conforming to UserResponse schema
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "requesting_admin": user.requesting_admin,
        "role_changed_at": user.role_changed_at,
        "has_write_access": user.has_write_access
    }
