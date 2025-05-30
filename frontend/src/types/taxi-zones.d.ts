declare module "*.geojson" {
  interface Feature {
    type: "Feature";
    properties: {
      location_id: string;
      zone: string;
      borough: string;
      shape_area?: string;
      objectid?: string;
      shape_leng?: string;
    };
    geometry: {
      type: "Polygon" | "MultiPolygon";
      coordinates: number[][][] | number[][][][];
    };
  }

  interface GeoJSON {
    type: "FeatureCollection";
    features: Feature[];
    crs?: {
      type: string;
      properties: {
        name: string;
      };
    };
    bbox?: number[];
  }

  const value: GeoJSON;
  export default value;
} 