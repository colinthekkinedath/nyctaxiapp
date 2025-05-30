import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import { useEffect, useState, useCallback } from "react";
import { fetchDemand, fetchTips } from "../api";
import type { StyleFunction } from "leaflet";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import L from "leaflet";
import { useMap } from "react-leaflet";

interface DemandRow {
  PULocationID: number;
  n_trips: number;
}

interface ZoneFeature extends Feature<Polygon | MultiPolygon> {
  properties: {
    location_id: string;
    LocationID: number;
    zone: string;
    borough: string;
  };
}

type ZoneFeatureCollection = FeatureCollection<Polygon | MultiPolygon, ZoneFeature['properties']>;

// Component to handle GeoJSON data loading
function GeoJSONLayer({ data, style, counts }: { data: ZoneFeatureCollection; style: StyleFunction; counts: Record<number, number> }) {
  const [error, setError] = useState<string | null>(null);
  const [tipInfo, setTipInfo] = useState<Record<number, number | null>>({});

  useEffect(() => {
    setTipInfo({}); // Reset tips when data changes
  }, [data]);

  useEffect(() => {
    if (!data) {
      setError("No GeoJSON data provided");
      return;
    }

    try {
      // Basic GeoJSON validation
      if (typeof data !== 'object') {
        throw new Error("GeoJSON data must be an object");
      }
      if (data.type !== "FeatureCollection") {
        throw new Error("GeoJSON must be a FeatureCollection");
      }
      if (!Array.isArray(data.features)) {
        throw new Error("GeoJSON features must be an array");
      }

      // Log some debug info
      console.log("GeoJSON data loaded:", {
        type: data.type,
        featureCount: data.features.length,
        sampleLocationIDs: data.features.slice(0, 5).map(f => f.properties?.location_id)
      });

      // Validate each feature
      data.features.forEach((feature, index) => {
        if (!feature || typeof feature !== 'object') {
          throw new Error(`Invalid feature at index ${index}: not an object`);
        }
        if (!feature.type || feature.type !== 'Feature') {
          throw new Error(`Invalid feature at index ${index}: not a Feature`);
        }
        if (!feature.properties || typeof feature.properties !== 'object') {
          throw new Error(`Invalid feature at index ${index}: missing or invalid properties`);
        }
        if (typeof feature.properties.location_id !== 'string') {
          throw new Error(`Invalid feature at index ${index}: location_id must be a string`);
        }
        if (typeof feature.properties.LocationID !== 'number') {
          throw new Error(`Invalid feature at index ${index}: LocationID must be a number`);
        }
        if (!feature.geometry || typeof feature.geometry !== 'object') {
          throw new Error(`Invalid feature at index ${index}: missing or invalid geometry`);
        }
      });
    } catch (error) {
      console.error("GeoJSON validation error:", error);
      setError(error instanceof Error ? error.message : "Invalid GeoJSON data");
      return;
    }
  }, [data]);

  // Add debug logging for zone clicks
  const handleZoneClick = useCallback((feature: ZoneFeature, layer: L.Layer) => {
    const updatePopupContent = (currentCounts: Record<number, number>, currentTipInfo: Record<number, number | null>, currentFeature: ZoneFeature) => {
      const locationId = Number(currentFeature.properties.LocationID);
      const trips = currentCounts[locationId] || 0;
      const avgTip = currentTipInfo[locationId];
      
      return `<b>Zone:</b> ${currentFeature.properties.zone}<br/>` +
             `<b>Borough:</b> ${currentFeature.properties.borough}<br/>` +
             `<b>Trips:</b> ${trips.toLocaleString()}<br/>` +
             `<b>Average Tip:</b> ${avgTip !== undefined ? (avgTip !== null ? `$${avgTip.toFixed(2)}` : 'N/A') : 'Loading...'}`;
    };

    layer.on('click', async () => {
      const locationId = Number(feature.properties.LocationID);
      console.log("Zone clicked:", {
        zone: feature.properties.zone,
        locationId,
        locationIdType: typeof locationId,
        trips: counts[locationId] || 0,
        counts,
        tipInfo
      });

      // Initial popup with current counts
      layer.bindPopup(updatePopupContent(counts, tipInfo, feature)).openPopup();

      // Fetch tip info if not already fetched
      if (tipInfo[locationId] === undefined) {
        try {
          const tipData = await fetchTips(locationId);
          const avgTip = tipData?.average ?? null;
          setTipInfo(prev => {
            const newTipInfo = { ...prev, [locationId]: avgTip };
            // Update popup with new tip info
            layer.setPopupContent(updatePopupContent(counts, newTipInfo, feature));
            return newTipInfo;
          });
        } catch (error) {
          console.error("Error fetching tip info:", error);
          layer.setPopupContent(updatePopupContent(counts, { ...tipInfo, [locationId]: null }, feature));
        }
      }
    });
  }, [counts, tipInfo]); // Only include counts and tipInfo as dependencies

  if (error) {
    console.error("GeoJSON error:", error);
    return null;
  }

  return (
    <GeoJSON
      data={data}
      style={style}
      onEachFeature={handleZoneClick}
    />
  );
}

// Helper component to fit map to GeoJSON bounds
function FitBounds({ data }: { data: ZoneFeatureCollection }) {
  const map = useMap();
  useEffect(() => {
    if (data && data.features.length > 0) {
      const geoJsonLayer = L.geoJSON(data);
      map.fitBounds(geoJsonLayer.getBounds());
    }
  }, [data, map]);
  return null;
}

export default function MapView() {
  const [hour, setHour] = useState(17);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [zonesData, setZonesData] = useState<ZoneFeatureCollection | null>(null);

  // Load GeoJSON data
  useEffect(() => {
    async function loadZones() {
      try {
        // Load the file as raw text
        const response = await fetch('/taxi_zones.geojson');
        if (!response.ok) {
          throw new Error(`Failed to load taxi zones: ${response.statusText}`);
        }
        const text = await response.text();
        console.log("Raw GeoJSON text (first 500 chars):", text.substring(0, 500));
        
        // Parse the JSON manually
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error("Failed to parse GeoJSON:", e);
          throw new Error("Invalid JSON format in taxi zones file");
        }

        console.log("Parsed taxi zones data:", {
          type: data.type,
          hasFeatures: Array.isArray(data.features),
          featureCount: data.features?.length,
          firstFeature: data.features?.[0],
          dataKeys: Object.keys(data),
          featuresKeys: data.features?.[0] ? Object.keys(data.features[0]) : [],
          propertiesKeys: data.features?.[0]?.properties ? Object.keys(data.features[0].properties) : []
        });

        if (!data) {
          throw new Error("No data loaded");
        }
        if (data.type !== "FeatureCollection") {
          throw new Error(`Invalid data type: ${data.type}, expected FeatureCollection`);
        }
        if (!Array.isArray(data.features)) {
          throw new Error(`Features is not an array: ${typeof data.features}`);
        }
        if (data.features.length === 0) {
          throw new Error("No features found in data");
        }

        // Transform features here!
        const transformed = {
          ...data,
          features: data.features.map((feature: unknown) => {
            const typedFeature = feature as Feature<Polygon | MultiPolygon, { location_id: string; zone: string; borough: string }>;
            const locationId = parseInt(typedFeature.properties.location_id, 10);
            if (isNaN(locationId)) {
              throw new Error(`Invalid location_id "${typedFeature.properties.location_id}" in zone "${typedFeature.properties.zone}"`);
            }
            // Use original coordinates
            const geometry = typedFeature.geometry;
            return {
              ...typedFeature,
              geometry,
              properties: {
                ...typedFeature.properties,
                LocationID: locationId,
                location_id: typedFeature.properties.location_id
              }
            };
          })
        };
        setZonesData(transformed as ZoneFeatureCollection);
      } catch (err) {
        console.error("Error loading taxi zones:", err);
        setError("Failed to load taxi zones data");
      }
    }
    loadZones();
  }, []);

  // Fetch demand data
  useEffect(() => {
    if (!zonesData) {
      console.log("Not fetching demand data yet - waiting for zones data");
      return;
    }

    console.log("Starting demand data fetch for hour:", hour);
    setError(null);
    fetchDemand(hour)
      .then((rows: DemandRow[]) => {
        console.log("Demand data received:", {
          rowCount: rows.length,
          sample: rows.slice(0, 5),
          locationIds: rows.map(r => r.PULocationID).sort((a, b) => a - b),
          hour,
          hasZonesData: !!zonesData
        });
        const m: Record<number, number> = {};
        rows.forEach(r => {
          m[r.PULocationID] = r.n_trips;
          console.log(`Mapping location ID ${r.PULocationID} to ${r.n_trips} trips`);
        });
        console.log("Setting counts state with", Object.keys(m).length, "entries");
        setCounts(m);
      })
      .catch(err => {
        console.error("Error fetching demand data:", err);
        setError("Failed to load demand data. Please try again later.");
      });
  }, [hour, zonesData]);

  // Add logging to track counts state changes
  useEffect(() => {
    console.log("Counts state updated:", {
      count: Object.keys(counts).length,
      sample: Object.entries(counts).slice(0, 5),
      hour
    });
  }, [counts, hour]);

  const zoneStyle: StyleFunction = useCallback((feature) => {
    if (!feature) return {};
    // Use the correct type from ZoneFeature
    const typedFeature = feature as ZoneFeature;
    const locationId = typedFeature.properties.LocationID;
    const n = counts[locationId] || 0;
    console.log(`Styling zone ${locationId}: ${n} trips`);
    /* seven-bucket choropleth */
    const fill =
      n > 1000 ? "#800026" :
      n > 500  ? "#BD0026" :
      n > 250  ? "#E31A1C" :
      n > 100  ? "#FC4E2A" :
      n > 50   ? "#FD8D3C" :
      n > 20   ? "#FEB24C" : "#FFEDA0";
    return { weight: 0.4, fillOpacity: 0.7, fillColor: fill };
  }, [counts]);

  if (!zonesData) {
    return <div>Loading taxi zones data...</div>;
  }

  return (
    <div style={{ position: 'relative', height: '100vh', display: 'flex' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        {error && (
          <div style={{
            position: 'absolute',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'rgba(255, 0, 0, 0.1)',
            padding: '10px',
            borderRadius: '5px',
            border: '1px solid red'
          }}>
            {error}
          </div>
        )}
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          zIndex: 1000,
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '4px 12px',
          borderRadius: '6px',
          fontWeight: 'bold',
          fontSize: '1.1em',
        }}>
          Hour: {hour}:00
        </div>
        <input 
          type="range" 
          min={0} 
          max={23} 
          value={hour}
          onChange={e => setHour(+e.target.value)}
          style={{
            position: 'absolute',
            top: '40px',
            left: '10px',
            zIndex: 1000,
            width: '200px'
          }}
        />
        <MapContainer 
          style={{ height: "100vh", width: "100%" }}
          scrollWheelZoom={true}
          maxBounds={[[40.4774, -74.2591], [40.9176, -73.7004]]} // NYC bounding box
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <GeoJSONLayer data={zonesData} style={zoneStyle} counts={counts} />
          {zonesData && <FitBounds data={zonesData} />}
        </MapContainer>
      </div>
      <div style={{
        width: '300px',
        background: 'rgba(255, 255, 255, 0.95)',
        boxShadow: '-2px 0 5px rgba(0, 0, 0, 0.1)',
        padding: '20px',
        overflowY: 'auto',
        height: '100vh',
        borderLeft: '1px solid rgba(0, 0, 0, 0.1)'
      }}>
        <h2 style={{ 
          margin: '0 0 20px 0',
          fontSize: '1.5em',
          fontWeight: '600',
          color: '#333'
        }}>
          NYC Taxi Insights
        </h2>
        <div style={{ 
          padding: '15px',
          background: '#f5f5f5',
          borderRadius: '8px',
          marginBottom: '15px'
        }}>
          <p style={{ margin: '0', color: '#666' }}>
            Select a zone on the map to view detailed information about taxi activity in that area.
          </p>
        </div>
        {/* Placeholder for future features */}
        <div style={{ 
          padding: '15px',
          background: '#f5f5f5',
          borderRadius: '8px',
          marginBottom: '15px'
        }}>
          <h3 style={{ 
            margin: '0 0 10px 0',
            fontSize: '1.1em',
            color: '#444'
          }}>
            Coming Soon
          </h3>
          <ul style={{ 
            margin: '0',
            padding: '0 0 0 20px',
            color: '#666'
          }}>
            <li>Zone comparison</li>
            <li>Historical trends</li>
            <li>Popular routes</li>
            <li>Peak hours analysis</li>
          </ul>
        </div>
      </div>
    </div>
  );
} 