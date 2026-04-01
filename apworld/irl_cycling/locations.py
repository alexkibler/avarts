from typing import Dict, NamedTuple

from BaseClasses import Location


class LocationData(NamedTuple):
    code: int


class IRLCyclingLocation(Location):
    game: str = "IRL Cycling"


# Similar to items, we need a static location_name_to_id mapping.
MAX_CHECKS = 1000
START_ID = 800000

location_table: Dict[str, LocationData] = {
    f"Intersection {i}": LocationData(START_ID + i)
    for i in range(1, MAX_CHECKS + 1)
}
