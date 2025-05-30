import { useEffect, useState, useCallback } from "react";
import Map, { Source, Layer, NavigationControl } from 'react-map-gl/maplibre';
import type { ViewStateChangeEvent, MapLayerMouseEvent } from '@vis.gl/react-maplibre';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { fetchDemand, fetchTips } from "../api";
import 'maplibre-gl/dist/maplibre-gl.css';

interface DemandRow {
  PULocationID: number;
  n_trips: number;
}

interface ZoneFeature extends Feature<Polygon | MultiPolygon> {
  properties: {
    location_id: string;
    LocationID: string;
    zone: string;
    borough: string;
  };
}

type ZoneFeatureCollection = FeatureCollection<Polygon | MultiPolygon, ZoneFeature['properties']>;

interface PopupInfo {
  longitude: number;
  latitude: number;
  zone: string;
  borough: string;
  trips: number;
  avgTip: number | null;
}

export default function MapView() {
  const [hour, setHour] = useState(17);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [zonesData, setZonesData] = useState<ZoneFeatureCollection | null>(null);
  const [selectedZone, setSelectedZone] = useState<PopupInfo | null>(null);
  const [tipInfo, setTipInfo] = useState<Record<number, number | null>>({});
  const [viewState, setViewState] = useState({
    longitude: -73.935242,
    latitude: 40.730610,
    zoom: 10,
    bearing: 0,
    pitch: 0
  });

  // Load GeoJSON data
  useEffect(() => {
    async function loadZones() {
      try {
        const response = await fetch('/taxi_zones.geojson');
        if (!response.ok) {
          throw new Error(`Failed to load taxi zones: ${response.statusText}`);
        }
        const text = await response.text();
        
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error("Failed to parse GeoJSON:", e);
          throw new Error("Invalid JSON format in taxi zones file");
        }

        if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
          throw new Error("Invalid GeoJSON data");
        }

        const transformed = {
          ...data,
          features: data.features.map((feature: unknown) => {
            const typedFeature = feature as Feature<Polygon | MultiPolygon, { location_id: string; zone: string; borough: string }>;
            const locationId = parseInt(typedFeature.properties.location_id, 10);
            if (isNaN(locationId)) {
              throw new Error(`Invalid location_id "${typedFeature.properties.location_id}" in zone "${typedFeature.properties.zone}"`);
            }
            return {
              ...typedFeature,
              properties: {
                ...typedFeature.properties,
                LocationID: locationId.toString(),
                location_id: typedFeature.properties.location_id
              }
            };
          })
        };
        console.log('Sample zone feature:', transformed.features[0]);
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
    if (!zonesData) return;

    setError(null);
    fetchDemand(hour)
      .then((rows: DemandRow[]) => {
        const m: Record<number, number> = {};
        rows.forEach(r => {
          m[r.PULocationID] = r.n_trips;
        });
        console.log('Updated counts:', m); // Debug log
        setCounts(m);
      })
      .catch(err => {
        console.error("Error fetching demand data:", err);
        setError("Failed to load demand data. Please try again later.");
      });
  }, [hour, zonesData]);

  const handleZoneClick = useCallback((event: MapLayerMouseEvent) => {
    if (!event.features || event.features.length === 0) return;
    const feature = event.features[0] as unknown as ZoneFeature;
    const locationId = parseInt(feature.properties.LocationID, 10);
    const trips = counts[locationId] || 0;

    // Set selected zone info
    setSelectedZone({
      longitude: event.lngLat.lng,
      latitude: event.lngLat.lat,
      zone: feature.properties.zone,
      borough: feature.properties.borough,
      trips,
      avgTip: tipInfo[locationId] ?? null
    });

    // Fetch tip info if not already fetched
    if (tipInfo[locationId] === undefined) {
      fetchTips(locationId)
        .then(tipData => {
          const avgTip = tipData?.average ?? null;
          setTipInfo(prev => ({ ...prev, [locationId]: avgTip }));
          setSelectedZone(prev => prev ? { ...prev, avgTip } : null);
        })
        .catch(error => {
          console.error("Error fetching tip info:", error);
          setTipInfo(prev => ({ ...prev, [locationId]: null }));
        });
    }
  }, [counts, tipInfo]);

  if (!zonesData) {
    return <div>Loading taxi zones data...</div>;
  }

  return (
    <div style={{ position: 'relative', height: '100vh', display: 'flex', background: '#1a1a1a' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        {error && (
          <div style={{
            position: 'absolute',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'rgba(255, 0, 0, 0.2)',
            padding: '10px',
            borderRadius: '5px',
            border: '1px solid rgba(255, 0, 0, 0.3)',
            color: '#ff6b6b'
          }}>
            {error}
          </div>
        )}
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          zIndex: 1000,
          background: 'rgba(0, 0, 0, 0.8)',
          color: '#fff',
          padding: '8px 16px',
          borderRadius: '8px',
          fontWeight: '500',
          fontSize: '1.1em',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
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
            width: '200px',
            WebkitAppearance: 'none',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '4px',
            height: '6px'
          }}
        />
        <Map
          {...viewState}
          onMoveEnd={(evt: ViewStateChangeEvent) => {
            const { longitude, latitude, zoom, bearing, pitch } = evt.viewState;
            setViewState({ longitude, latitude, zoom, bearing, pitch });
          }}
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
          style={{ width: '100%', height: '100%' }}
          onClick={handleZoneClick}
          interactiveLayerIds={['zones']}
        >
          <NavigationControl />
          <Source type="geojson" data={zonesData}>
            <Layer
              id="zones"
              type="fill"
              paint={{
                'fill-color': [
                  'case',
                  ['has', ['get', 'LocationID', ['properties']], ['literal', counts]],
                  [
                    'interpolate',
                    ['linear'],
                    ['to-number', ['get', ['get', 'LocationID', ['properties']], ['literal', counts]]],
                    0, '#FFEDA0',
                    100, '#FED976',
                    500, '#FEB24C',
                    1000, '#FD8D3C',
                    2000, '#FC4E2A',
                    5000, '#E31A1C',
                    10000, '#BD0026',
                    20000, '#800026'
                  ],
                  '#FFEDA0'
                ],
                'fill-opacity': 0.7,
                'fill-outline-color': '#000'
              }}
            />
          </Source>
        </Map>
      </div>
      <div style={{
        width: '300px',
        background: '#2a2a2a',
        boxShadow: '-2px 0 5px rgba(0, 0, 0, 0.3)',
        padding: '20px',
        overflowY: 'auto',
        height: '100vh',
        borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
        color: '#e0e0e0'
      }}>
        <h2 style={{ 
          margin: '0 0 20px 0',
          fontSize: '1.5em',
          fontWeight: '600',
          color: '#fff'
        }}>
          NYC Taxi Insights
        </h2>
        
        {selectedZone ? (
          <div style={{ 
            padding: '15px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            marginBottom: '15px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <h3 style={{ 
              margin: '0 0 12px 0',
              fontSize: '1.2em',
              color: '#fff',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              paddingBottom: '8px'
            }}>
              {selectedZone.zone}
            </h3>
            <div style={{ marginBottom: '12px' }}>
              <p style={{ margin: '0 0 8px 0', color: '#b0b0b0' }}>
                <strong style={{ color: '#fff' }}>Borough:</strong> {selectedZone.borough}
              </p>
              <p style={{ margin: '0 0 8px 0', color: '#b0b0b0' }}>
                <strong style={{ color: '#fff' }}>Trips:</strong> {selectedZone.trips.toLocaleString()}
              </p>
              <p style={{ margin: '0', color: '#b0b0b0' }}>
                <strong style={{ color: '#fff' }}>Average Tip:</strong> {selectedZone.avgTip !== null ? `$${selectedZone.avgTip.toFixed(2)}` : 'N/A'}
              </p>
            </div>
            <button 
              onClick={() => setSelectedZone(null)}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#fff',
                padding: '8px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9em',
                width: '100%'
              }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
              onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            >
              Clear Selection
            </button>
          </div>
        ) : (
          <div style={{ 
            padding: '15px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            marginBottom: '15px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <p style={{ margin: '0', color: '#b0b0b0' }}>
              Select a zone on the map to view detailed information about taxi activity in that area.
            </p>
          </div>
        )}

        <div style={{ 
          padding: '15px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          marginBottom: '15px',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <h3 style={{ 
            margin: '0 0 10px 0',
            fontSize: '1.1em',
            color: '#fff'
          }}>
            Coming Soon
          </h3>
          <ul style={{ 
            margin: '0',
            padding: '0 0 0 20px',
            color: '#b0b0b0'
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