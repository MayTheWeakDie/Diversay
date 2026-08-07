import os
from pathlib import Path
from dotenv import dotenv_values
from pydantic_settings import BaseSettings
from functools import lru_cache

ROOT_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    SMTP_SERVER: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str
    SMTP_PASSWORD: str
    SENDER_EMAIL: str
    FRONTEND_URL: str = "http://localhost:3000"
    SUPABASE_URL: str | None = None
    SUPABASE_ANON_KEY: str | None = None
    
    class Config:
        env_file = ROOT_ENV_FILE
        extra = "ignore"

@lru_cache()
def get_settings():
    env_dict = {}
    if ROOT_ENV_FILE.exists():
        env_dict.update(dotenv_values(ROOT_ENV_FILE))
    for k, v in os.environ.items():
        if k in Settings.model_fields:
            env_dict[k] = v
    cleaned = {k: v.strip() if isinstance(v, str) else v for k, v in env_dict.items()}
    return Settings(**cleaned)

