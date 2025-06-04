import { useEffect, useState, useCallback, useMemo } from "react";
import Map, { Source, Layer, NavigationControl } from "react-map-gl/maplibre";
import type {
  ViewStateChangeEvent,
  MapLayerMouseEvent,
} from "@vis.gl/react-maplibre";
import type {
  Feature,
  FeatureCollection,
  Polygon,
  MultiPolygon,
} from "geojson";
import { fetchDemand } from "../api";
import AnalyticsPanel from "../components/AnalyticsPanel";
import "maplibre-gl/dist/maplibre-gl.css";

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
    trips?: number; // Add trips directly to properties
  };
}

type ZoneFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon,
  ZoneFeature["properties"]
>;

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
  const [rawZonesData, setRawZonesData] =
    useState<ZoneFeatureCollection | null>(null);
  const [selectedZone, setSelectedZone] = useState<PopupInfo | null>(null);
  const [viewState, setViewState] = useState({
    longitude: -73.935242,
    latitude: 40.73061,
    zoom: 10,
    bearing: 0,
    pitch: 45,
  });

  // Memoize the enhanced GeoJSON data with trip counts
  const enhancedZonesData = useMemo(() => {
    if (!rawZonesData) return null;

    return {
      ...rawZonesData,
      features: rawZonesData.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          trips: counts[parseInt(feature.properties.LocationID, 10)] || 0,
        },
      })),
    };
  }, [rawZonesData, counts]);

  // Memoize color and height expressions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colorExpression = useMemo(
    (): any => [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", "trips"], 0],
      0,
      "#FFEDA0",
      100,
      "#FED976",
      500,
      "#FEB24C",
      1000,
      "#FD8D3C",
      2000,
      "#FC4E2A",
      5000,
      "#E31A1C",
      10000,
      "#BD0026",
      20000,
      "#800026",
    ],

    [],
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heightExpression = useMemo(
    (): any => [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", "trips"], 0],
      0,
      0,
      100,
      50,
      500,
      100,
      1000,
      200,
      2000,
      300,
      5000,
      400,
      10000,
      500,
      20000,
      600,
    ],

    [],
  );

  const formatHour = (hour: number): string => {
    if (hour === 0) return "12 AM";
    if (hour === 12) return "12 PM";
    return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
  };

  // Load GeoJSON data
  useEffect(() => {
    async function loadZones() {
      try {
        const response = await fetch("/taxi_zones.geojson");
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

        if (
          !data ||
          data.type !== "FeatureCollection" ||
          !Array.isArray(data.features)
        ) {
          throw new Error("Invalid GeoJSON data");
        }

        const transformed = {
          ...data,
          features: data.features.map((feature: unknown) => {
            const typedFeature = feature as Feature<
              Polygon | MultiPolygon,
              { location_id: string; zone: string; borough: string }
            >;

            const locationId = parseInt(
              typedFeature.properties.location_id,
              10,
            );
            if (isNaN(locationId)) {
              throw new Error(
                `Invalid location_id "${typedFeature.properties.location_id}" in zone "${typedFeature.properties.zone}"`,
              );
            }
            return {
              ...typedFeature,
              properties: {
                ...typedFeature.properties,
                LocationID: locationId.toString(),
                location_id: typedFeature.properties.location_id,
              },
            };
          }),
        };
        console.log("Sample zone feature:", transformed.features[0]);
        setRawZonesData(transformed as ZoneFeatureCollection);
      } catch (err) {
        console.error("Error loading taxi zones:", err);
        setError("Failed to load taxi zones data");
      }
    }
    loadZones();
  }, []);

  // Fetch demand data
  useEffect(() => {
    if (!rawZonesData) return;

    setError(null);
    fetchDemand(hour)
      .then((rows: DemandRow[]) => {
        const m: Record<number, number> = {};
        rows.forEach((r) => {
          m[r.PULocationID] = r.n_trips;
        });
        console.log("Updated counts:", m); // Debug log
        setCounts(m);
      })
      .catch((err) => {
        console.error("Error fetching demand data:", err);
        setError("Failed to load demand data. Please try again later.");
      });
  }, [hour, rawZonesData]);

  const handleZoneClick = useCallback(
    (event: MapLayerMouseEvent) => {
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
        locationId,
      });
    },
    [counts],
  );

  // Add view state change optimization
  const handleViewStateChange = useCallback((evt: ViewStateChangeEvent) => {
    const { longitude, latitude, zoom, bearing, pitch } = evt.viewState;
    setViewState({ longitude, latitude, zoom, bearing, pitch });
  }, []);

  if (!enhancedZonesData) {
    return <div>Loading taxi zones data...</div>;
  }

  return (
    <div
      style={{
        position: "relative",
        height: "100vh",
        display: "flex",
        background: "#1a1a1a",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: 0 }}>
        {error && (
          <div
            style={{
              position: "absolute",
              top: "10px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 1000,
              background: "rgba(255, 0, 0, 0.2)",
              padding: "10px",
              borderRadius: "5px",
              border: "1px solid rgba(255, 0, 0, 0.3)",
              color: "#ff6b6b",
            }}
          >
            {error}
          </div>
        )}
        <Map
          {...viewState}
          onMove={handleViewStateChange}
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
          style={{ width: "100%", height: "100%" }}
          onClick={handleZoneClick}
          interactiveLayerIds={
            viewState.pitch > 0 ? ["zones-extrusion"] : ["zones"]
          }
          maxZoom={16}
        >
          <NavigationControl
            position="bottom-left"
            showCompass={true}
            showZoom={true}
            visualizePitch={true}
            style={{
              marginLeft: "12px",
              marginBottom: "12px",
            }}
          />

          <style>
            {`
              .maplibregl-ctrl-group {
                background: rgb(24, 24, 27) !important;
                border: 1px solid rgb(39, 39, 42) !important;
                box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1) !important;
                border-radius: 0.75rem !important;
                overflow: hidden !important;
              }
              .maplibregl-ctrl-group button {
                background-color: rgb(24, 24, 27) !important;
                border: none !important;
                border-bottom: 1px solid rgb(39, 39, 42) !important;
              }
              .maplibregl-ctrl-group button:last-child {
                border-bottom: none !important;
              }
              .maplibregl-ctrl-group button:hover {
                background-color: rgb(39, 39, 42) !important;
              }
              .maplibregl-ctrl-group button span {
                filter: invert(0.7) !important;
              }
              .maplibregl-ctrl-group button:hover span {
                filter: invert(0.9) !important;
              }
            `}
          </style>
          <Source
            type="geojson"
            data={enhancedZonesData}
            generateId={true}
            buffer={0}
            tolerance={0.375}
            maxzoom={14}
          >
            {viewState.pitch === 0 ? (
              <Layer
                id="zones"
                type="fill"
                paint={{
                  "fill-color": colorExpression,
                  "fill-opacity": 0.7,
                  "fill-outline-color": "#000",
                }}
              />
            ) : (
              <Layer
                id="zones-extrusion"
                type="fill-extrusion"
                paint={{
                  "fill-extrusion-color": colorExpression,
                  "fill-extrusion-height": heightExpression,
                  "fill-extrusion-base": 0,
                  "fill-extrusion-opacity": 0.7,
                  "fill-extrusion-vertical-gradient": true,
                }}
              />
            )}
          </Source>
        </Map>
      </div>
      <div className="dark bg-card text-card-foreground rounded-l-2xl shadow-xl border border-r-0 p-6 w-[400px] overflow-y-auto max-h-screen absolute right-0 top-0 bottom-0">
        <h2 className="text-2xl font-bold mb-6">NYC Taxi Insights 2024</h2>
        <AnalyticsPanel
          zoneId={selectedZone?.locationId ?? null}
          zoneName={selectedZone?.zone || ""}
          borough={selectedZone?.borough || ""}
          hour={hour}
        />
      </div>
      {/* Floating Controls: Collapsed by default, expand on hover/focus */}
      <div className="fixed top-6 left-6 z-50 group">
        {/* Collapsed state: just an icon button */}
        <button
          className="bg-card border border-border rounded-full shadow-xl p-3 flex items-center justify-center cursor-pointer group-hover:hidden group-focus-within:hidden transition text-2xl"
          tabIndex={0}
          aria-label="Show controls"
        >
          🌍
        </button>
        {/* Expanded state: on hover/focus */}
        <div className="hidden group-hover:flex group-focus-within:flex flex-col gap-4 bg-card border border-border rounded-xl shadow-xl p-6 min-w-[260px] transition">
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground font-medium">Hour:</span>
            <span className="text-foreground font-bold text-lg w-16 text-center">
              {formatHour(hour)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => setHour(+e.target.value)}
            className="w-40 h-2 accent-primary bg-muted rounded-full appearance-none focus:outline-none focus:ring-2 focus:ring-primary"
            style={{
              WebkitAppearance: "none",
              appearance: "none",
            }}
          />

          <button
            onClick={() =>
              setViewState((prev) => ({
                ...prev,
                pitch: prev.pitch === 0 ? 45 : 0,
              }))
            }
            className="bg-muted text-foreground border border-border rounded-lg px-6 py-2 shadow transition hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-w-[120px] font-medium text-base"
          >
            {viewState.pitch === 0 ? "Show 3D View" : "Show 2D View"}
          </button>
        </div>
      </div>
    </div>
  );
}
