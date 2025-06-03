import { useState, useEffect } from 'react';
import {
  fetchTripPerformance,
  fetchPopularRoutes,
  fetchPaymentAnalysis
} from '../api';
import type { Feature } from 'geojson';

interface AnalyticsPanelProps {
  zoneId: number | null;
  zoneName: string;
  borough: string;
  hour: number;
}

interface ZoneData {
  LocationID: number;
  zone: string;
  borough: string;
}

interface ZoneFeature extends Feature {
  properties: {
    location_id: string;
    zone: string;
    borough: string;
  };
}

interface TripPerformance {
  pickup_hour: number;
  pickup_dow: number;
  avg_trip_duration: number;
  avg_speed: number;
  avg_revenue_per_mile: number;
  avg_fare: number;
  total_revenue: number;
  n_trips: number;
  avg_trip_distance: number;
  avg_tip: number;
  avg_tip_percentage: number;
  is_weekend: boolean;
}

interface PopularRoute {
  DOLocationID: number;
  pickup_hour: number;
  n_trips: number;
  avg_duration: number;
  avg_fare: number;
  avg_distance: number;
  avg_tip: number;
}

interface PaymentAnalysis {
  pickup_hour: number;
  payment_type: number;
  payment_method: string;
  n_trips: number;
  avg_fare: number;
  avg_tip: number;
  avg_tip_percentage: number;
  total_revenue: number;
}

export default function AnalyticsPanel({ zoneId, zoneName, borough, hour }: AnalyticsPanelProps) {
  const [activeTab, setActiveTab] = useState<'performance' | 'routes' | 'payments'>('performance');
  const [tripPerformance, setTripPerformance] = useState<TripPerformance[]>([]);
  const [popularRoutes, setPopularRoutes] = useState<PopularRoute[]>([]);
  const [paymentAnalysis, setPaymentAnalysis] = useState<PaymentAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoneData, setZoneData] = useState<Record<number, ZoneData>>({});

  useEffect(() => {
    async function loadZoneData() {
      try {
        const response = await fetch('/taxi_zones.geojson');
        if (!response.ok) throw new Error('Failed to load zone data');
        const data = await response.json();
        
        console.log('Loaded GeoJSON data:', data.features[0]); // Debug log
        
        const zoneMap: Record<number, ZoneData> = {};
        data.features.forEach((feature: ZoneFeature) => {
          const locationId = parseInt(feature.properties.location_id, 10);
          if (!isNaN(locationId)) {
            zoneMap[locationId] = {
              LocationID: locationId,
              zone: feature.properties.zone,
              borough: feature.properties.borough
            };
          }
        });
        console.log('Created zone map:', zoneMap); // Debug log
        setZoneData(zoneMap);
      } catch (err) {
        console.error('Error loading zone data:', err);
      }
    }
    loadZoneData();
  }, []);

  useEffect(() => {
    if (!zoneId) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [performance, routes, payments] = await Promise.all([
          fetchTripPerformance(zoneId),
          fetchPopularRoutes(zoneId, hour),
          fetchPaymentAnalysis(zoneId, hour)
        ]);
        setTripPerformance(performance);
        setPopularRoutes(routes);
        setPaymentAnalysis(payments);
      } catch (err) {
        console.error('Error fetching analytics:', err);
        setError('Failed to load analytics data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [zoneId, hour]);

  if (!zoneId) {
    return (
      <div className="p-4 bg-gray-800 rounded-lg">
        <p className="text-gray-400">Select a zone on the map to view analytics</p>
      </div>
    );
  }

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const formatDuration = (minutes: number) => 
    `${Math.round(minutes)} min`;

  const renderPerformanceTab = () => {
    if (loading) return <div className="text-muted-foreground">Loading performance data...</div>;
    if (error) return <div className="text-destructive">{error}</div>;
    if (!tripPerformance.length) return <div className="text-muted-foreground">No performance data available</div>;

    const data = tripPerformance[0];
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card text-card-foreground border rounded-lg shadow-sm p-4">
            <div className="text-xs font-medium mb-1 text-muted-foreground">Average Trip Duration</div>
            <div className="text-xl font-semibold">{formatDuration(data.avg_trip_duration)}</div>
          </div>
          <div className="bg-card text-card-foreground border rounded-lg shadow-sm p-4">
            <div className="text-xs font-medium mb-1 text-muted-foreground">Average Speed</div>
            <div className="text-xl font-semibold">{Math.round(data.avg_speed)} mph</div>
          </div>
          <div className="bg-card text-card-foreground border rounded-lg shadow-sm p-4">
            <div className="text-xs font-medium mb-1 text-muted-foreground">Average Fare</div>
            <div className="text-xl font-semibold">{formatCurrency(data.avg_fare)}</div>
          </div>
          <div className="bg-card text-card-foreground border rounded-lg shadow-sm p-4">
            <div className="text-xs font-medium mb-1 text-muted-foreground">Average Tip</div>
            <div className="text-xl font-semibold">{formatCurrency(data.avg_tip)}</div>
          </div>
          <div className="bg-card text-card-foreground border rounded-lg shadow-sm p-4">
            <div className="text-xs font-medium mb-1 text-muted-foreground">Revenue per Mile</div>
            <div className="text-xl font-semibold">{formatCurrency(data.avg_revenue_per_mile)}</div>
          </div>
          <div className="bg-card text-card-foreground border rounded-lg shadow-sm p-4">
            <div className="text-xs font-medium mb-1 text-muted-foreground">Total Trips</div>
            <div className="text-xl font-semibold">{data.n_trips.toLocaleString()}</div>
          </div>
        </div>
      </div>
    );
  };

  const renderRoutesTab = () => {
    if (loading) return <div className="text-muted-foreground">Loading routes data...</div>;
    if (error) return <div className="text-destructive">{error}</div>;
    if (!popularRoutes.length) return <div className="text-muted-foreground">No routes data available</div>;

    return (
      <div className="space-y-3">
        {popularRoutes.map((route, idx) => {
          const destinationZone = zoneData[route.DOLocationID];
          return (
            <div key={idx} className="bg-card text-card-foreground border rounded-lg shadow-sm p-4">
              <div className="flex justify-between items-center mb-2">
                <div className="font-semibold text-base">
                  {destinationZone ? (
                    <>
                      {destinationZone.zone}
                      <span className="text-xs text-muted-foreground ml-2">({destinationZone.borough})</span>
                    </>
                  ) : (
                    `Zone ${route.DOLocationID}`
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{route.n_trips} trips</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Avg. Duration:</span>
                  <span className="ml-2">{formatDuration(route.avg_duration)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Avg. Fare:</span>
                  <span className="ml-2">{formatCurrency(route.avg_fare)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Avg. Distance:</span>
                  <span className="ml-2">{route.avg_distance.toFixed(1)} mi</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Avg. Tip:</span>
                  <span className="ml-2">{formatCurrency(route.avg_tip)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPaymentsTab = () => {
    if (loading) return <div className="text-muted-foreground">Loading payment data...</div>;
    if (error) return <div className="text-destructive">{error}</div>;
    if (!paymentAnalysis.length) return <div className="text-muted-foreground">No payment data available</div>;

    return (
      <div className="space-y-3">
        {paymentAnalysis.map((payment, idx) => (
          <div key={idx} className="bg-card text-card-foreground border rounded-lg shadow-sm p-4">
            <div className="flex justify-between items-center mb-2">
              <div className="font-semibold text-base">{payment.payment_method}</div>
              <div className="text-xs text-muted-foreground">{payment.n_trips} trips</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Avg. Fare:</span>
                <span className="ml-2">{formatCurrency(payment.avg_fare)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Avg. Tip:</span>
                <span className="ml-2">{formatCurrency(payment.avg_tip)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tip %:</span>
                <span className="ml-2">{(payment.avg_tip_percentage * 100).toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-muted-foreground">Total Revenue:</span>
                <span className="ml-2">{formatCurrency(payment.total_revenue)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-muted/40 text-card-foreground rounded-2xl overflow-hidden shadow-lg border">
      <div className="p-6">
        <h3 className="text-2xl font-bold mb-1">{zoneName}</h3>
        <p className="text-base text-muted-foreground">{borough}</p>
      </div>
      <div className="w-full flex justify-center py-2 px-4">
        <div className="flex w-auto max-w-full bg-muted/30 p-1 rounded-2xl mx-auto overflow-hidden">
          <button
            className={`px-3 py-2 text-base font-bold transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              activeTab === 'performance'
                ? 'bg-card text-white border-2 border-primary rounded-2xl'
                : 'bg-muted text-muted-foreground rounded-2xl'
            }`}
            onClick={() => setActiveTab('performance')}
          >
            Performance
          </button>
          <button
            className={`px-3 py-2 text-base font-bold transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              activeTab === 'routes'
                ? 'bg-card text-white border-2 border-primary rounded-2xl'
                : 'bg-muted text-muted-foreground rounded-2xl'
            }`}
            onClick={() => setActiveTab('routes')}
          >
            Routes
          </button>
          <button
            className={`px-3 py-2 text-base font-bold transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              activeTab === 'payments'
                ? 'bg-card text-white border-2 border-primary rounded-2xl'
                : 'bg-muted text-muted-foreground rounded-2xl'
            }`}
            onClick={() => setActiveTab('payments')}
          >
            Payments
          </button>
        </div>
      </div>
      <div className="p-6">
        {activeTab === 'performance' && renderPerformanceTab()}
        {activeTab === 'routes' && renderRoutesTab()}
        {activeTab === 'payments' && renderPaymentsTab()}
      </div>
    </div>
  );
} 