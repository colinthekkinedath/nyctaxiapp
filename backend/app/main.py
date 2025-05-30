from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, inspect, distinct
from .models import demand_heatmap, tip_trends, fare_anomalies, get_session, init_models, get_engine
import json
from pathlib import Path
import os

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Initialize database tables on startup."""
    try:
        await init_models()
    except Exception as e:
        print(f"Failed to initialize database: {e}")
        raise

@app.get("/api/demand")
async def get_demand(hour: int, session: AsyncSession = Depends(get_session)):
    """Get demand heatmap data for a specific hour."""
    try:
        query = select(
            demand_heatmap.c.PULocationID,
            demand_heatmap.c.n_trips
        ).where(demand_heatmap.c.pickup_hour == hour)
        
        result = await session.execute(query)
        rows = result.fetchall()
        
        if not rows:
            raise HTTPException(status_code=404, detail="No data found for this hour")
            
        return [
            {
                "PULocationID": row.PULocationID,
                "n_trips": row.n_trips,
            }
            for row in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tips")
async def get_tips(session: AsyncSession = Depends(get_session)):
    """Get tip trends data."""
    try:
        query = select(tip_trends)
        result = await session.execute(query)
        rows = result.fetchall()
        
        if not rows:
            raise HTTPException(status_code=404, detail="No tip data found")
            
        return [
            {
                "PULocationID": row.PULocationID,
                "payment_type": row.payment_type,
                "avg_tip_pct": row.avg_tip_pct,
                "n_trips": row.n_trips,
            }
            for row in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/anomalies")
async def get_anomalies(session: AsyncSession = Depends(get_session)):
    """Get fare anomalies data."""
    try:
        query = select(fare_anomalies).order_by(fare_anomalies.c.fare_amount.desc()).limit(100)
        result = await session.execute(query)
        rows = result.fetchall()
        
        if not rows:
            raise HTTPException(status_code=404, detail="No anomaly data found")
            
        return [
            {
                "VendorID": row.VendorID,
                "pickup_datetime": row.tpep_pickup_datetime.isoformat(),
                "PULocationID": row.PULocationID,
                "DOLocationID": row.DOLocationID,
                "fare_amount": row.fare_amount,
                "tip_amount": row.tip_amount,
                "trip_distance": row.trip_distance,
            }
            for row in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/debug/schema")
async def get_schema(session: AsyncSession = Depends(get_session)):
    """Debug endpoint to inspect table structure."""
    try:
        engine = await get_engine()
        async with engine.begin() as conn:
            def get_table_info(conn):
                inspector = inspect(conn)
                tables = ["demand_heatmap", "tip_trends", "fare_anomalies"]
                schema = {}
                for table in tables:
                    try:
                        columns = inspector.get_columns(table)
                        schema[table] = [{"name": col["name"], "type": str(col["type"])} for col in columns]
                    except Exception as e:
                        schema[table] = f"Error: {str(e)}"
                return schema
            
            schema = await conn.run_sync(get_table_info)
            return schema
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/debug/locations")
async def get_locations(session: AsyncSession = Depends(get_session)):
    """Debug endpoint to show unique PULocationID values."""
    try:
        # Get unique PULocationIDs from demand_heatmap
        query = select(distinct(demand_heatmap.c.PULocationID)).order_by(demand_heatmap.c.PULocationID)
        result = await session.execute(query)
        demand_locations = [row[0] for row in result.fetchall()]
        
        # Get unique PULocationIDs from tip_trends
        query = select(distinct(tip_trends.c.PULocationID)).order_by(tip_trends.c.PULocationID)
        result = await session.execute(query)
        tip_locations = [row[0] for row in result.fetchall()]
        
        # Get unique PULocationIDs from fare_anomalies
        query = select(distinct(fare_anomalies.c.PULocationID)).order_by(fare_anomalies.c.PULocationID)
        result = await session.execute(query)
        anomaly_locations = [row[0] for row in result.fetchall()]
        
        return {
            "demand_heatmap_locations": demand_locations,
            "tip_trends_locations": tip_locations,
            "fare_anomalies_locations": anomaly_locations
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/debug/taxi-zones-sample")
async def get_taxi_zones_sample():
    """Debug endpoint to show a sample of taxi zones data."""
    try:
        # Read the taxi zones GeoJSON file
        zones_file = Path("frontend/src/assets/taxi_zones.geojson")
        if not zones_file.exists():
            raise HTTPException(status_code=404, detail="Taxi zones file not found")
            
        with open(zones_file) as f:
            zones_data = json.load(f)
            
        # Get a sample of location IDs
        location_ids = []
        for feature in zones_data["features"][:10]:  # First 10 features
            if "properties" in feature and "LocationID" in feature["properties"]:
                location_ids.append({
                    "LocationID": feature["properties"]["LocationID"],
                    "zone": feature["properties"].get("zone", ""),
                    "borough": feature["properties"].get("borough", "")
                })
                
        return {
            "sample_location_ids": location_ids,
            "total_features": len(zones_data["features"]),
            "location_id_range": {
                "min": min(f["properties"]["LocationID"] for f in zones_data["features"]),
                "max": max(f["properties"]["LocationID"] for f in zones_data["features"])
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/debug/taxi-zones-raw")
async def get_taxi_zones_raw():
    """Debug endpoint to read the raw taxi zones GeoJSON file."""
    # Try multiple possible paths
    possible_paths = [
        Path("frontend/public/taxi_zones.geojson"),  # Local development
        Path("/app/frontend/public/taxi_zones.geojson"),  # Docker container
        Path("../frontend/public/taxi_zones.geojson"),  # Relative to backend
    ]
    
    file_path = None
    for path in possible_paths:
        if path.exists():
            file_path = path
            break
    
    if not file_path:
        attempted_paths = [str(p) for p in possible_paths]
        raise HTTPException(
            status_code=404,
            detail=f"Taxi zones file not found. Attempted paths: {', '.join(attempted_paths)}"
        )
    
    try:
        content = file_path.read_text()
        # Validate JSON
        try:
            json_data = json.loads(content)
            is_valid_json = True
        except json.JSONDecodeError:
            is_valid_json = False
            json_data = None
        
        return {
            "file_path": str(file_path),
            "file_size": file_path.stat().st_size,
            "preview": content[:500] + "..." if len(content) > 500 else content,
            "is_valid_json": is_valid_json,
            "json_preview": json.dumps(json_data, indent=2)[:1000] + "..." if json_data and len(json.dumps(json_data)) > 1000 else json_data
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error reading taxi zones file: {str(e)}"
        )

@app.get("/api/tips/{zone_id}")
async def get_tip_for_zone(zone_id: int, session: AsyncSession = Depends(get_session)):
    """Get average tip for a specific zone."""
    query = select(tip_trends).where(tip_trends.c.PULocationID == zone_id)
    result = await session.execute(query)
    rows = result.fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="No tip data found for this zone")
    # Average across all payment types for this zone
    avg_tip = sum(row.avg_tip_pct for row in rows) / len(rows)
    return {"average": avg_tip} 