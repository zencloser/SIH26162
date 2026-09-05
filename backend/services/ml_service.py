def predict_classification(features: dict):
    """
    Temporary ML prediction interface.

    This is a mock classifier for backend integration.
    The real ML model will replace this implementation later.
    """

    frp = features.get("frp", 0)
    brightness = features.get("brightness", 0)
    industrial_area = features.get("industrial_area", False)

    # Temporary rule-based prediction.
    # This is NOT the final ML model.

    if industrial_area and frp >= 50:
        label = "industrial_fire"
        confidence = 0.85

    elif industrial_area:
        label = "persistent_source"
        confidence = 0.75

    elif frp >= 80:
        label = "natural_fire"
        confidence = 0.70

    else:
        label = "unknown"
        confidence = 0.50

    probabilities = {
        "industrial_fire": 0.0,
        "persistent_source": 0.0,
        "natural_fire": 0.0,
        "agricultural_burning": 0.0,
        "unknown": 0.0
    }

    probabilities[label] = confidence

    remaining_probability = 1.0 - confidence

    other_labels = [
        name for name in probabilities
        if name != label
    ]

    for name in other_labels:
        probabilities[name] = round(
            remaining_probability / len(other_labels),
            4
        )

    reasoning = []

    if industrial_area:
        reasoning.append(
            "Industrial OSM feature detected nearby"
        )

    if frp >= 50:
        reasoning.append(
            "High fire radiative power"
        )

    if brightness >= 330:
        reasoning.append(
            "High thermal brightness"
        )

    if not reasoning:
        reasoning.append(
            "Insufficient contextual evidence"
        )

    return {
        "label": label,
        "confidence": confidence,
        "probabilities": probabilities,
        "reasoning": reasoning
    }