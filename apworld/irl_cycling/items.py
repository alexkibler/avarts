from typing import Dict, NamedTuple

from BaseClasses import Item, ItemClassification


class ItemData(NamedTuple):
    code: int
    classification: ItemClassification


class IRLCyclingItem(Item):
    game: str = "IRL Cycling"


# We will dynamically generate the items based on check_count, but we need a base mapping.
# For simplicity, we can define a large enough pool or generate it dynamically in __init__.py.
# However, Archipelago expects a static item_name_to_id mapping.
# Let's assume a maximum of 1000 checks for now.

MAX_CHECKS = 1000
START_ID = 800000

item_table: Dict[str, ItemData] = {
    f"Node Unlock {i}": ItemData(START_ID + i, ItemClassification.progression)
    for i in range(1, MAX_CHECKS + 1)
}
item_table["Victory"] = ItemData(START_ID + MAX_CHECKS + 1, ItemClassification.progression)
