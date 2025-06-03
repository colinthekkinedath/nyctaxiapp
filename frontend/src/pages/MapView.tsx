import { useEffect, useState, useCallback } from "react";
import Map, { Source, Layer, NavigationControl } from 'react-map-gl/maplibre';
import type { ViewStateChangeEvent, MapLayerMouseEvent } from '@vis.gl/react-maplibre';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { fetchDemand } from "../api";
import AnalyticsPanel from "../components/AnalyticsPanel";
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
  locationId: number;
}

export default function MapView() {
  const [hour, setHour] = useState(17);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [zonesData, setZonesData] = useState<ZoneFeatureCollection | null>(null);
  const [selectedZone, setSelectedZone] = useState<PopupInfo | null>(null);
  const [viewState, setViewState] = useState({
    longitude: -73.935242,
    latitude: 40.730610,
    zoom: 10,
    bearing: 0,
    pitch: 45
  });

  const formatHour = (hour: number): string => {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
  };

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
      avgTip: null,
      locationId
    });
  }, [counts]);

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
          Hour: {formatHour(hour)}
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
          interactiveLayerIds={['zones', 'zones-extrusion']}
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
            <Layer
              id="zones-extrusion"
              type="fill-extrusion"
              paint={{
                'fill-extrusion-color': [
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
                'fill-extrusion-height': [
                  'case',
                  ['has', ['get', 'LocationID', ['properties']], ['literal', counts]],
                  [
                    'interpolate',
                    ['linear'],
                    ['to-number', ['get', ['get', 'LocationID', ['properties']], ['literal', counts]]],
                    0, 0,
                    100, 50,
                    500, 100,
                    1000, 200,
                    2000, 300,
                    5000, 400,
                    10000, 500,
                    20000, 600
                  ],
                  0
                ],
                'fill-extrusion-base': 0,
                'fill-extrusion-opacity': 0.7,
                'fill-extrusion-vertical-gradient': true
              }}
            />
          </Source>
        </Map>
      </div>
      <div style={{
        width: '400px',
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
          NYC Taxi Insights 2024
        </h2>
        
        <AnalyticsPanel
          zoneId={selectedZone?.locationId ?? null}
          zoneName={selectedZone?.zone || ''}
          borough={selectedZone?.borough || ''}
          hour={hour}
        />
      </div>
      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        zIndex: 1000,
        background: 'rgba(42, 42, 42, 0.95)',
        color: '#e0e0e0',
        padding: '12px',
        borderRadius: '8px',
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <button
          onClick={() => setViewState(prev => ({ ...prev, pitch: prev.pitch === 0 ? 45 : 0 }))}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.95em',
            fontWeight: '500',
            transition: 'all 0.2s ease',
            minWidth: '120px'
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          }}
        >
          {viewState.pitch === 0 ? 'Show 3D View' : 'Show 2D View'}
        </button>
      </div>
    </div>
  );
} 