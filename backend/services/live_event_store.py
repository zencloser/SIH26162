_live_events = {}


def save_event(event: dict):
    """
    Store a live hotspot event in memory.
    """

    event_id = event["id"]

    _live_events[event_id] = event


def get_event(event_id: str):
    """
    Retrieve a live hotspot event by ID.
    """

    return _live_events.get(event_id)