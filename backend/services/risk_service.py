def calculate_risk(
    frp: float,
    brightness: float,
    classification: dict,
    context: dict
):
    """
    Temporary rule-based risk calculation.

    This is a backend integration baseline.
    It is NOT the final scientific risk model.
    """

    score = 0.0

    # Fire intensity
    if frp >= 100:
        score += 40
    elif frp >= 50:
        score += 30
    elif frp >= 20:
        score += 20
    elif frp >= 5:
        score += 10

    # Thermal brightness
    if brightness >= 350:
        score += 20
    elif brightness >= 330:
        score += 10

    # Classification
    label = classification.get("label")

    if label == "industrial_fire":
        score += 20
    elif label == "natural_fire":
        score += 10
    elif label == "persistent_source":
        score += 5

    # Nearby industrial facility
    if context.get("industrial_area"):
        score += 10

    # Keep score within 0-100
    score = min(score, 100)

    if score >= 80:
        severity = "critical"
    elif score >= 60:
        severity = "high"
    elif score >= 30:
        severity = "medium"
    else:
        severity = "low"

    return {
        "score": score,
        "severity": severity
    }