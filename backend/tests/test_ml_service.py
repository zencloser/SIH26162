"""
Tests for the real trained fire-classification model.

Run from project root:
    python -m pytest backend/tests/test_ml_service.py -v
"""

import math
import sys
from pathlib import Path

import pytest

# Allow importing backend/services/ml_service.py
sys.path.insert(
    0,
    str(Path(__file__).resolve().parent.parent / "services")
)

import ml_service as ms


# ---------------------------------------------------------
# Sample data used for testing
# ---------------------------------------------------------

VALID_DETECTION = {
    "id": "cc6805499301d7a2",
    "latitude": 6.18053,
    "longitude": 81.00521,
    "frp": 6.97,
    "brightness": 341.6,
    "firms_confidence": "n",
    "day_night": "D",
}


VALID_PERSISTENCE = {
    "score": 45.0,
    "detection_count": 3,
    "distinct_detection_days": 2,
    "duration_days": 4.5,
    "average_frp": 6.2,
    "maximum_frp": 8.1,
}


VALID_OBSERVATIONS = [
    {
        "latitude": 6.18053,
        "longitude": 81.00521,
        "day_night": "D",
    },
    {
        "latitude": 6.18060,
        "longitude": 81.00530,
        "day_night": "N",
    },
    {
        "latitude": 6.18050,
        "longitude": 81.00520,
        "day_night": "N",
    },
]


VALID_CONTEXT = {
    "industrial_area": True,
    "facility_type": "factory",
    "facility_name": "Test Plant",
    "distance_meters": 120.0,
}


# ---------------------------------------------------------
# TEST 1
# Does the trained model load?
# ---------------------------------------------------------

def test_1_model_loads():
    model = ms._load_model()

    assert type(model).__name__ == "RandomForestClassifier"


# ---------------------------------------------------------
# TEST 2
# Does the feature-order file load correctly?
# ---------------------------------------------------------

def test_2_feature_order_loads():
    order = ms._load_feature_order()

    assert order == ms._EXPECTED_FEATURE_ORDER


# ---------------------------------------------------------
# TEST 3
# Does the feature order match the model?
# ---------------------------------------------------------

def test_3_feature_order_matches_model_input():
    model = ms._load_model()
    order = ms._load_feature_order()

    assert list(
        getattr(model, "feature_names_in_", order)
    ) == order

    assert model.n_features_in_ == len(order)


# ---------------------------------------------------------
# TEST 4
# Can the real model produce a prediction?
# ---------------------------------------------------------

def test_4_valid_feature_vector_produces_real_prediction():

    row = ms.build_feature_row(
        VALID_DETECTION,
        VALID_PERSISTENCE,
        VALID_OBSERVATIONS
    )

    model = ms._load_model()

    prediction = model.predict(row)

    assert prediction[0] in model.classes_


# ---------------------------------------------------------
# TEST 5
# Does the model class map to our API labels?
# ---------------------------------------------------------

def test_5_predicted_class_maps_to_api_label():

    result = ms.predict_classification(
        VALID_DETECTION,
        VALID_PERSISTENCE,
        VALID_CONTEXT,
        VALID_OBSERVATIONS
    )

    assert result["label"] in ms.ALL_API_LABELS

    assert result["label"] in (
        "industrial_fire",
        "natural_fire",
        "unknown"
    )


# ---------------------------------------------------------
# TEST 6
# Do probabilities make sense?
# ---------------------------------------------------------

def test_6_probabilities_sum_to_one_and_unused_classes_zero():

    result = ms.predict_classification(
        VALID_DETECTION,
        VALID_PERSISTENCE,
        VALID_CONTEXT,
        VALID_OBSERVATIONS
    )

    probabilities = result["probabilities"]

    # Probabilities should add up to 1
    assert math.isclose(
        sum(probabilities.values()),
        1.0,
        abs_tol=1e-6
    )

    # These classes do NOT exist in the trained model
    assert probabilities["persistent_source"] == 0.0
    assert probabilities["agricultural_burning"] == 0.0


# ---------------------------------------------------------
# TEST 7
# Does the system reject missing features?
# ---------------------------------------------------------

def test_7_missing_feature_raises_not_fake_fallback():

    bad_persistence = dict(VALID_PERSISTENCE)

    bad_persistence["average_frp"] = None

    with pytest.raises(ms.MLFeatureError):

        ms.build_feature_row(
            VALID_DETECTION,
            bad_persistence,
            VALID_OBSERVATIONS
        )


# ---------------------------------------------------------
# TEST 8
# Does the system fail clearly if model is missing?
# ---------------------------------------------------------

def test_8_missing_model_file_raises_not_fake_fallback(
    monkeypatch
):

    ms._load_model.cache_clear()

    monkeypatch.setattr(
        ms,
        "MODEL_PATH",
        Path("/nonexistent/model.pkl")
    )

    with pytest.raises(ms.MLModelError):

        ms._load_model()

    ms._load_model.cache_clear()