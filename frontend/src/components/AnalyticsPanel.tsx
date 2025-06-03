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
    if (loading) return <div className="text-gray-400">Loading performance data...</div>;
    if (error) return <div className="text-red-400">{error}</div>;
    if (!tripPerformance.length) return <div className="text-gray-400">No performance data available</div>;

    const data = tripPerformance[0]; // Get current hour's data
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-700 p-3 rounded">
            <div className="text-sm text-gray-400">Average Trip Duration</div>
            <div className="text-xl font-semibold">{formatDuration(data.avg_trip_duration)}</div>
          </div>
          <div className="bg-gray-700 p-3 rounded">
            <div className="text-sm text-gray-400">Average Speed</div>
            <div className="text-xl font-semibold">{Math.round(data.avg_speed)} mph</div>
          </div>
          <div className="bg-gray-700 p-3 rounded">
            <div className="text-sm text-gray-400">Average Fare</div>
            <div className="text-xl font-semibold">{formatCurrency(data.avg_fare)}</div>
          </div>
          <div className="bg-gray-700 p-3 rounded">
            <div className="text-sm text-gray-400">Average Tip</div>
            <div className="text-xl font-semibold">{formatCurrency(data.avg_tip)}</div>
          </div>
          <div className="bg-gray-700 p-3 rounded">
            <div className="text-sm text-gray-400">Revenue per Mile</div>
            <div className="text-xl font-semibold">{formatCurrency(data.avg_revenue_per_mile)}</div>
          </div>
          <div className="bg-gray-700 p-3 rounded">
            <div className="text-sm text-gray-400">Total Trips</div>
            <div className="text-xl font-semibold">{data.n_trips.toLocaleString()}</div>
          </div>
        </div>
      </div>
    );
  };

  const renderRoutesTab = () => {
    if (loading) return <div className="text-gray-400">Loading routes data...</div>;
    if (error) return <div className="text-red-400">{error}</div>;
    if (!popularRoutes.length) return <div className="text-gray-400">No routes data available</div>;

    console.log('Current zone data:', zoneData); // Debug log
    console.log('Popular routes:', popularRoutes); // Debug log

    return (
      <div className="space-y-3">
        {popularRoutes.map((route, idx) => {
          const destinationZone = zoneData[route.DOLocationID];
          console.log(`Looking up zone ${route.DOLocationID}:`, destinationZone); // Debug log
          return (
            <div key={idx} className="bg-gray-700 p-3 rounded">
              <div className="flex justify-between items-center mb-2">
                <div className="font-semibold">
                  {destinationZone ? (
                    <>
                      {destinationZone.zone}
                      <span className="text-sm text-gray-400 ml-2">({destinationZone.borough})</span>
                    </>
                  ) : (
                    `Zone ${route.DOLocationID}`
                  )}
                </div>
                <div className="text-sm text-gray-400">{route.n_trips} trips</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-400">Avg. Duration:</span>
                  <span className="ml-2">{formatDuration(route.avg_duration)}</span>
                </div>
                <div>
                  <span className="text-gray-400">Avg. Fare:</span>
                  <span className="ml-2">{formatCurrency(route.avg_fare)}</span>
                </div>
                <div>
                  <span className="text-gray-400">Avg. Distance:</span>
                  <span className="ml-2">{route.avg_distance.toFixed(1)} mi</span>
                </div>
                <div>
                  <span className="text-gray-400">Avg. Tip:</span>
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
    if (loading) return <div className="text-gray-400">Loading payment data...</div>;
    if (error) return <div className="text-red-400">{error}</div>;
    if (!paymentAnalysis.length) return <div className="text-gray-400">No payment data available</div>;

    return (
      <div className="space-y-3">
        {paymentAnalysis.map((payment, idx) => (
          <div key={idx} className="bg-gray-700 p-3 rounded">
            <div className="flex justify-between items-center mb-2">
              <div className="font-semibold">{payment.payment_method}</div>
              <div className="text-sm text-gray-400">{payment.n_trips} trips</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-400">Avg. Fare:</span>
                <span className="ml-2">{formatCurrency(payment.avg_fare)}</span>
              </div>
              <div>
                <span className="text-gray-400">Avg. Tip:</span>
                <span className="ml-2">{formatCurrency(payment.avg_tip)}</span>
              </div>
              <div>
                <span className="text-gray-400">Tip %:</span>
                <span className="ml-2">{(payment.avg_tip_percentage * 100).toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-gray-400">Total Revenue:</span>
                <span className="ml-2">{formatCurrency(payment.total_revenue)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold text-white">{zoneName}</h3>
        <p className="text-sm text-gray-400">{borough}</p>
      </div>
      
      <div className="flex border-b border-gray-700">
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'performance' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('performance')}
        >
          Performance
        </button>
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'routes' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('routes')}
        >
          Popular Routes
        </button>
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'payments' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => setActiveTab('payments')}
        >
          Payments
        </button>
      </div>

      <div className="p-4">
        {activeTab === 'performance' && renderPerformanceTab()}
        {activeTab === 'routes' && renderRoutesTab()}
        {activeTab === 'payments' && renderPaymentsTab()}
      </div>
    </div>
  );
} 