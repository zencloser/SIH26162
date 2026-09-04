# AGNIRA Backend API Contract

## Base URL

http://localhost:8000

---

# 1. Get Hotspots

GET /api/hotspots

Returns thermal anomalies that should be displayed on the map.

### Response

{
  "events": [
    {
      "id": "E001",
      "latitude": 28.6139,
      "longitude": 77.2090,
      "timestamp": "2026-09-04T14:30:00Z",

      "source": "VIIRS",
      "satellite": "NOAA-21",

      "frp": 312.0,
      "brightness": 341.2,
      "firms_confidence": "high",

      "classification": "industrial_fire",
      "classification_confidence": 0.93,

      "persistence_score": 18,
      "risk_score": 87,
      "severity": "high"
    }
  ]
}

---

# 2. Get Incident Details

GET /api/incidents/{event_id}

Returns complete information about one thermal anomaly.

### Response

{
  "id": "E001",

  "location": {
    "latitude": 28.6139,
    "longitude": 77.2090
  },

  "detection": {
    "timestamp": "2026-09-04T14:30:00Z",
    "source": "VIIRS",
    "satellite": "NOAA-21",
    "frp": 312.0,
    "brightness": 341.2,
    "firms_confidence": "high"
  },

  "classification": {
    "label": "industrial_fire",
    "confidence": 0.93,
    "reasoning": [
      "High thermal intensity",
      "Industrial facility nearby"
    ]
  },

  "persistence": {
    "score": 18,
    "detection_count": 4,
    "first_detected": "2026-08-28T14:30:00Z",
    "last_detected": "2026-09-04T14:30:00Z"
  },

  "context": {
    "industrial_area": true,
    "facility_type": "factory",
    "distance_meters": 140,
    "schools_count": 1,
    "hospitals_count": 0
  },

  "risk": {
    "score": 87,
    "severity": "high"
  }
}

---

# 3. Get Incident History

GET /api/incidents/{event_id}/history

Returns historical detections for an incident/source.

### Response

{
  "event_id": "E001",

  "history": [
    {
      "timestamp": "2026-08-28T14:30:00Z",
      "frp": 42.0,
      "brightness": 320.1
    },
    {
      "timestamp": "2026-08-30T14:30:00Z",
      "frp": 48.0,
      "brightness": 324.5
    },
    {
      "timestamp": "2026-09-01T14:30:00Z",
      "frp": 51.0,
      "brightness": 327.2
    },
    {
      "timestamp": "2026-09-04T14:30:00Z",
      "frp": 312.0,
      "brightness": 341.2
    }
  ]
}

---

# 4. Get Statistics

GET /api/statistics

Returns statistics for the dashboard.

### Response

{
  "active_anomalies": 24,
  "industrial_fires": 7,
  "persistent_sources": 5,
  "natural_fires": 8,
  "agricultural_burning": 4,
  "unknown": 0,
  "high_risk_events": 3
}

---

# Classification Values

The backend currently uses:

- industrial_fire
- natural_fire
- agricultural_burning
- persistent_source
- unknown

---

# Severity Values

The backend currently uses:

- low
- medium
- high
- critical

---

# Notes

The backend is responsible for:

- collecting/receiving data
- validating data
- combining FIRMS, OSM, historical and ML information
- calculating/receiving risk information
- providing stable JSON responses

The frontend is responsible for:

- map rendering
- marker colors and styles
- charts
- UI components
- filters
- visual presentation

The frontend should not directly depend on FIRMS, OSM or ML implementation details.