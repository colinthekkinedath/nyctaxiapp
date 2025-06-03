# NYC Taxi Explorer

A web application for exploring NYC taxi data, featuring an interactive map visualization of demand patterns and fare anomalies.

![Screenshot](screenshot.png)

## Local Development

1. Create a `.env` file in the root directory with your Cloud SQL credentials:
```env
CLOUDSQL_CONNECTION_NAME=your-project:region:instance
DB_USER=your-db-user
DB_PASS=your-db-password
DB_NAME=nyctaxi
```

2. Start the development environment:
```bash
docker-compose up
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

## Deployment

### Backend (Cloud Run)

```bash
gcloud run deploy taxi-api \
  --source backend \
  --region us-central1 \
  --add-cloudsql-instances $CLOUDSQL_CONNECTION_NAME \
  --set-env-vars CLOUDSQL_CONNECTION_NAME=$CLOUDSQL_CONNECTION_NAME,DB_USER=$DB_USER,DB_PASS=$DB_PASS,DB_NAME=nyctaxi
```

### Frontend (Cloud Run)

```bash
gcloud run deploy taxi-ui \
  --source frontend \
  --region us-central1 \
  --set-env-vars VITE_API_BASE=https://taxi-api-<hash>-uc.a.run.app
```

Replace the backend URL with your actual deployed backend URL.

## Features

- Interactive map visualization of taxi demand by hour
- Color-coded zones based on trip volume
- Search functionality for zones and boroughs
- Tip trends analysis by zone
- Fare anomaly detection 