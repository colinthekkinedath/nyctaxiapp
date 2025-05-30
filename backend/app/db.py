import os
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy import select, literal

# env vars injected by Cloud Run or `.env` during local dev
DB_USER = os.environ["DB_USER"]
DB_PASS = os.environ["DB_PASS"]
DB_NAME = os.environ.get("DB_NAME", "nyctaxi")

# Check if we're running in development (using Cloud SQL Auth Proxy)
is_dev = os.environ.get("ENV") == "development"

async def create_engine_with_retry(max_retries=5, retry_delay=5):
    """Create database engine with retry logic."""
    retries = 0
    while retries < max_retries:
        try:
            if is_dev:
                # In development, connect through the Cloud SQL Auth Proxy
                engine = create_async_engine(
                    f"mysql+aiomysql://{DB_USER}:{DB_PASS}@cloud-sql-proxy:3306/{DB_NAME}",
                    pool_pre_ping=True,
                    pool_size=5,
                    max_overflow=2,
                )
            else:
                # In production, connect directly to Cloud SQL
                instance_connection_name = os.environ["CLOUDSQL_CONNECTION_NAME"]
                engine = create_async_engine(
                    f"mysql+aiomysql://{DB_USER}:{DB_PASS}@/{DB_NAME}?unix_socket=/cloudsql/{instance_connection_name}",
                    pool_pre_ping=True,
                    pool_size=5,
                    max_overflow=2,
                )
            
            # Test the connection using a proper select statement
            async with engine.begin() as conn:
                await conn.execute(select(literal(1)))
            return engine
            
        except OperationalError as e:
            retries += 1
            if retries == max_retries:
                raise
            print(f"Database connection attempt {retries} failed: {e}. Retrying in {retry_delay} seconds...")
            await asyncio.sleep(retry_delay)

# Create the engine with retry logic
engine = None

async def get_engine():
    """Get or create the database engine."""
    global engine
    if engine is None:
        engine = await create_engine_with_retry()
    return engine 