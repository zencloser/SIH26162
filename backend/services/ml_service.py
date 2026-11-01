"""
backend/services/ml_service.py

REAL trained-model integration for SIH26162.

Replaces the temporary rule-based classifier with the actual trained
RandomForestClassifier shipped in ML_FINAL_BACKEND_PACKAGE.zip
(industrial_fire_classifier_final.pkl / model_features_final.pkl).

No fallback: if the model or its feature file cannot be loaded, or if a
required feature is missing/invalid, this module raises. It never returns
fabricated confidence/probabilities and never silently substitutes the old
rule-based output.
"""

from __future__ import annotations

import math
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional

import joblib
import pandas as pd

# ---------------------------------------------------------------------------
# Paths (project-relative, no developer-specific absolute paths)
# ---------------------------------------------------------------------------

# backend/services/ml_service.py -> backend/ -> backend/ml_models/
_BACKEND_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = _BACKEND_DIR / "ml_models"
MODEL_PATH = MODEL_DIR / "industrial_fire_classifier_final.pkl"
FEATURES_PATH = MODEL_DIR / "model_features_final.pkl"

# ---------------------------------------------------------------------------
# Constants confirmed from the trained artifacts (see integration notes)
# ---------------------------------------------------------------------------

# Fallback order if model_features_final.pkl is somehow unavailable at import
# time; the loader below always prefers the value read from the .pkl file and
# asserts it matches this, so drift is caught rather than silently accepted.
_EXPECTED_FEATURE_ORDER = [
    "bright_ti4",
    "frp",
    "confidence",
    "daynight",
    "detections_total",
    "avg_frp",
    "max_frp",
    "detection_span_days",
    "night_ratio",
    "persistence_score",
]

# Model's own classes_ (confirmed by inspecting the loaded estimator):
# ['Industrial', 'Natural', 'Other']
MODEL_LABEL_TO_API_LABEL = {
    "Industrial": "industrial_fire",
    "Natural": "natural_fire",
    "Other": "unknown",
}

# Full set of labels the existing API contract expects. The trained model
# only produces 3 of these; the other two are structurally present in the
# response with probability 0.0 because the model has no such classes -
# they are never fabricated with a nonzero value.
ALL_API_LABELS = [
    "industrial_fire",
    "persistent_source",
    "natural_fire",
    "agricultural_burning",
    "unknown",
]

# How "close" (km) two observations must be to be treated as the same
# physical hotspot location when computing night_ratio, so it is computed
# over the same location-scoped observation set persistence uses.
#
# NOTE: this constant MUST match whatever radius/matching rule
# persistence_service.calculate_persistence() uses internally to select
# "observations at this location" from combined_observations. That internal
# matching rule was not part of the files provided for this integration.
# 0.5 km is a reasonable default for VIIRS (~375m pixel) but should be
# confirmed against persistence_service.py and adjusted here if different.
NIGHT_RATIO_MATCH_RADIUS_KM = 0.5


class MLModelError(Exception):
    """Raised when the trained model cannot be loaded or cannot produce a
    prediction. Callers must NOT catch this and substitute fake output —
    per project requirement, ML failures must fail clearly."""


class MLFeatureError(MLModelError):
    """Raised when a required model feature is missing, None, or NaN."""


# ---------------------------------------------------------------------------
# Cached loaders — model/feature file are read from disk once per process.
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _load_model():
    if not MODEL_PATH.exists():
        raise MLModelError(
            f"Trained model file not found at {MODEL_PATH}. "
            "Copy industrial_fire_classifier_final.pkl into backend/ml_models/."
        )
    try:
        model = joblib.load(MODEL_PATH)
    except Exception as exc:  # noqa: BLE001 - re-raised with context, not swallowed
        raise MLModelError(f"Failed to load trained model from {MODEL_PATH}: {exc}") from exc

    if not hasattr(model, "predict"):
        raise MLModelError(f"Loaded object from {MODEL_PATH} has no predict() method.")
    return model


@lru_cache(maxsize=1)
def _load_feature_order() -> list[str]:
    if not FEATURES_PATH.exists():
        raise MLModelError(
            f"Feature order file not found at {FEATURES_PATH}. "
            "Copy model_features_final.pkl into backend/ml_models/."
        )
    try:
        order = joblib.load(FEATURES_PATH)
    except Exception as exc:  # noqa: BLE001
        raise MLModelError(f"Failed to load feature order from {FEATURES_PATH}: {exc}") from exc

    order = list(order)
    if order != _EXPECTED_FEATURE_ORDER:
        raise MLModelError(
            "model_features_final.pkl feature order does not match the order "
            f"this integration was built against.\nExpected: {_EXPECTED_FEATURE_ORDER}\n"
            f"Found:    {order}\n"
            "This is a hard stop — silently reordering could feed the model "
            "the wrong column for a given position."
        )
    return order


def get_model_info() -> dict:
    """Small introspection helper, useful for a health-check endpoint and for
    tests. Raises MLModelError if the model isn't loadable."""
    model = _load_model()
    order = _load_feature_order()
    return {
        "model_type": type(model).__name__,
        "classes": list(getattr(model, "classes_", [])),
        "n_features": getattr(model, "n_features_in_", None),
        "feature_order": order,
        "has_predict_proba": hasattr(model, "predict_proba"),
    }


# ---------------------------------------------------------------------------
# Observation field access (observations may be dicts or lightweight objects)
# ---------------------------------------------------------------------------

def _obs_get(obs: Any, field: str) -> Any:
    if isinstance(obs, Mapping):
        return obs.get(field)
    return getattr(obs, field, None)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# night_ratio
# ---------------------------------------------------------------------------

def calculate_night_ratio(
    observations: Iterable[Any],
    current_latitude: float,
    current_longitude: float,
    radius_km: float = NIGHT_RATIO_MATCH_RADIUS_KM,
) -> float:
    """
    night_ratio = (# observations at this location flagged night) / (total
    observations at this location), scoped to the SAME combined
    (historical + current) observation set already used for persistence, so
    the two features stay internally consistent.

    "Night" is determined by the same day_night field FIRMS provides
    ('N' = night), consistent with the daynight encoding used elsewhere in
    this module (daynight -> 1 if 'D' else 0).

    Location scoping uses a haversine radius match rather than exact
    lat/lon equality, since repeat satellite passes over the same physical
    hotspot rarely report identical coordinates. See NIGHT_RATIO_MATCH_RADIUS_KM.

    Returns 0.0 (not NaN) when there are no matching observations, since a
    fresh hotspot with a single detection legitimately has no night history
    yet — this mirrors how persistence_service treats sparse history rather
    than raising for a brand-new detection.
    """
    matched = []
    for obs in observations:
        lat = _obs_get(obs, "latitude")
        lon = _obs_get(obs, "longitude")
        if lat is None or lon is None:
            continue
        if _haversine_km(current_latitude, current_longitude, float(lat), float(lon)) <= radius_km:
            matched.append(obs)

    if not matched:
        return 0.0

    night_count = sum(1 for obs in matched if _obs_get(obs, "day_night") == "N")
    return night_count / len(matched)


# ---------------------------------------------------------------------------
# Feature construction
# ---------------------------------------------------------------------------

def build_feature_row(
    detection: Mapping[str, Any],
    persistence: Mapping[str, Any],
    observations: Iterable[Any],
) -> pd.DataFrame:
    """
    Build the exact 10-column feature row the trained model expects, from
    the existing flat detection dict + persistence_service output +
    combined observations. Raises MLFeatureError (not a silent default) if
    a required value is missing/None/NaN, mirroring the trained inference
    contract: a wrong feature is worse than no prediction.
    """
    raw = {
        "bright_ti4": detection.get("brightness"),
        "frp": detection.get("frp"),
        "confidence": 1 if detection.get("firms_confidence") == "h" else 0,
        "daynight": 1 if detection.get("day_night") == "D" else 0,
        "detections_total": persistence.get("detection_count"),
        "avg_frp": persistence.get("average_frp"),
        "max_frp": persistence.get("maximum_frp"),
        "detection_span_days": persistence.get("duration_days"),
        "night_ratio": calculate_night_ratio(
            observations,
            current_latitude=detection["latitude"],
            current_longitude=detection["longitude"],
        ),
        "persistence_score": (
            persistence["score"] / 100.0 if persistence.get("score") is not None else None
        ),
    }

    order = _load_feature_order()
    missing = [
        f for f in order
        if raw.get(f) is None or (isinstance(raw.get(f), float) and math.isnan(raw[f]))
    ]
    if missing:
        raise MLFeatureError(
            f"Cannot run trained model — missing/invalid features: {missing}. "
            f"Raw feature values were: {raw}"
        )

    return pd.DataFrame([{col: raw[col] for col in order}])


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def predict_classification(
    detection: Mapping[str, Any],
    persistence: Mapping[str, Any],
    context: Optional[Mapping[str, Any]] = None,
    observations: Optional[Iterable[Any]] = None,
) -> dict:
    """
    Classify a single live hotspot using the REAL trained RandomForest
    model. No rule-engine fallback, no fabricated confidence.

    Args:
        detection: flat detection dict (frp, brightness, firms_confidence,
            day_night, latitude, longitude, ...) as produced by firms_service.
        persistence: dict returned by persistence_service.calculate_persistence().
        context: OSM context dict (industrial_area, facility_type,
            facility_name, distance_meters). The model does not consume OSM
            features directly (confirmed: model_features_final.pkl has no
            OSM-derived column) — context is used only to enrich `reasoning`.
        observations: the combined (historical + current) observation list
            already built in hotspots.py, used to compute night_ratio.

    Returns the existing API classification contract:
        {"label": ..., "confidence": ..., "probabilities": {...}, "reasoning": [...]}

    Raises MLModelError / MLFeatureError on any failure. Callers must not
    catch these and substitute fake values.
    """
    context = context or {}
    observations = observations or []

    model = _load_model()
    feature_row = build_feature_row(detection, persistence, observations)

    raw_label = model.predict(feature_row)[0]
    if raw_label not in MODEL_LABEL_TO_API_LABEL:
        raise MLModelError(
            f"Model produced unexpected class '{raw_label}', not in "
            f"{list(MODEL_LABEL_TO_API_LABEL)}. Refusing to map silently."
        )
    api_label = MODEL_LABEL_TO_API_LABEL[raw_label]

    probabilities = {label: 0.0 for label in ALL_API_LABELS}
    confidence: float
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(feature_row)[0]
        for model_class, p in zip(model.classes_, proba):
            mapped = MODEL_LABEL_TO_API_LABEL.get(model_class)
            if mapped is not None:
                probabilities[mapped] = float(p)
        # persistent_source / agricultural_burning stay at 0.0 - the model
        # has no such classes. Probabilities already sum to 1.0 because
        # every model class maps to exactly one API label and proba sums to 1.
        confidence = probabilities[api_label]
    if not hasattr(model, "predict_proba"):
        raise MLModelError(
            "Trained model does not support predict_proba(); "
            "classification confidence cannot be produced."
        )

    proba = model.predict_proba(feature_row)[0]

    for model_class, p in zip(model.classes_, proba):
        mapped = MODEL_LABEL_TO_API_LABEL.get(model_class)

        if mapped is not None:
            probabilities[mapped] = float(p)

    confidence = probabilities[api_label]

    reasoning = [
        f"Trained Random Forest model classified this hotspot as '{raw_label}' "
        f"(mapped to '{api_label}').",
    ]
    if context.get("industrial_area"):
        facility = context.get("facility_name") or context.get("facility_type") or "a facility"
        dist_m = context.get("distance_meters")
        if dist_m is not None:
            reasoning.append(f"OSM context: near {facility} ({dist_m:.0f} m away).")
        else:
            reasoning.append(f"OSM context: near {facility}.")
    else:
        reasoning.append("OSM context: no mapped industrial facility nearby.")

    score = persistence.get("score")
    if score is not None:
        reasoning.append(f"Persistence score: {score:.1f}/100.")
    count = persistence.get("detection_count")
    if count is not None:
        reasoning.append(f"Historical detection count at this location: {count}.")

    return {
        "label": api_label,
        "confidence": confidence,
        "probabilities": probabilities,
        "reasoning": reasoning,
    }