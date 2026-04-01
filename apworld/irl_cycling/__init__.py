from typing import Any, Dict

from BaseClasses import ItemClassification
from worlds.AutoWorld import WebWorld, World
from worlds.generic.Rules import set_rule

from .items import IRLCyclingItem, item_table, ItemData
from .locations import IRLCyclingLocation, location_table, LocationData


class IRLCyclingWeb(WebWorld):
    theme = "ocean"
    setup_en = """
    # IRL Cycling Archipelago Setup

    1. Install the Archipelago client.
    2. Connect to the Archipelago server.
    3. Generate a seed using the Archipelago website.
    4. Play the game!
    """


class IRLCyclingWorld(World):
    """
    IRL Cycling is a web client that uses real-world intersections as Archipelago Locations,
    and players unlock new intersections as Items.
    """

    game = "IRL Cycling"
    web = IRLCyclingWeb()

    item_name_to_id = {name: data.code for name, data in item_table.items()}
    location_name_to_id = {name: data.code for name, data in location_table.items()}

    from .options import irl_cycling_options
    options_dataclass = irl_cycling_options
    options_dict = irl_cycling_options

    def create_items(self) -> None:
        check_count = self.options.check_count.value
        item_pool = []

        for i in range(1, check_count + 1):
            item_name = f"Node Unlock {i}"
            item = self.create_item(item_name)
            item_pool.append(item)

        self.multiworld.itempool += item_pool

    def create_regions(self) -> None:
        check_count = self.options.check_count.value

        from BaseClasses import Region

        menu_region = Region("Menu", self.player, self.multiworld)
        self.multiworld.get_region("Menu", self.player) if self.multiworld.has_region("Menu", self.player) else self.multiworld.regions.append(menu_region)

        map_region = Region("Map", self.player, self.multiworld)
        menu_region.connect(map_region)
        self.multiworld.regions.append(map_region)

        for i in range(1, check_count + 1):
            loc_name = f"Intersection {i}"
            loc = IRLCyclingLocation(
                self.player, loc_name, self.location_name_to_id[loc_name], map_region
            )
            map_region.locations.append(loc)

    def set_rules(self) -> None:
        # All unlocked nodes are physically routable.
        pass

    def generate_basic(self) -> None:
        pass

    def create_item(self, name: str) -> IRLCyclingItem:
        item_data = item_table[name]
        return IRLCyclingItem(
            name, item_data.classification, item_data.code, self.player
        )
