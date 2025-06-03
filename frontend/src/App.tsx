import { Suspense, lazy } from 'react';

const MapView = lazy(() => import('./pages/MapView'));

export default () => (
  <Suspense fallback={<div className="flex items-center justify-center h-screen bg-background text-foreground">Loading map...</div>}>
    <MapView />
  </Suspense>
);
