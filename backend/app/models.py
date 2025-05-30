from sqlalchemy import MetaData, Table, Column, Integer, Float, DateTime, String, BigInteger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import declarative_base
from .db import get_engine

metadata = MetaData()
Base = declarative_base(metadata=metadata)

# Define tables to match actual database schema
demand_heatmap = Table(
    "demand_heatmap",
    metadata,
    Column("PULocationID", Integer, primary_key=True),
    Column("pickup_hour", Integer),
    Column("n_trips", BigInteger),
)

tip_trends = Table(
    "tip_trends",
    metadata,
    Column("PULocationID", Integer, primary_key=True),
    Column("payment_type", BigInteger),
    Column("avg_tip_pct", Float),
    Column("n_trips", BigInteger),
)

fare_anomalies = Table(
    "fare_anomalies",
    metadata,
    Column("VendorID", Integer),
    Column("tpep_pickup_datetime", DateTime),
    Column("PULocationID", Integer),
    Column("DOLocationID", Integer),
    Column("fare_amount", Float),
    Column("tip_amount", Float),
    Column("trip_distance", Float),
)

async def init_models():
    """Initialize database tables."""
    engine = await get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(metadata.create_all)

async def get_session() -> AsyncSession:
    """Get a database session."""
    engine = await get_engine()
    async with AsyncSession(engine) as session:
        yield session 