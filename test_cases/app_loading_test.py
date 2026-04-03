import unittest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

class TestAppLoading(unittest.TestCase):
    def setUp(self):
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        self.driver = webdriver.Chrome(options=chrome_options)

    def test_app_loads_and_geocoder_visible(self):
        # Navigate to the app
        self.driver.get("http://localhost:5174/game/test-session")
        
        # Wait for the map to load
        wait = WebDriverWait(self.driver, 10)
        
        # Check if the map container is present
        map_container = wait.until(EC.presence_of_element_located((By.ID, "map")))
        self.assertIsNotNone(map_container)
        
        # Open the routing control (it usually starts collapsed or hidden on some layouts, 
        # but the waypoints should be there)
        # In our app, it's usually visible in the sidebar or a panel.
        
        # Check if the geocoder input is present
        # LRM geocoder inputs have class 'leaflet-routing-geocoder'
        geocoder_inputs = wait.until(EC.presence_of_all_elements_located((By.CLASS_NAME, "leaflet-routing-geocoder")))
        self.assertGreater(len(geocoder_inputs), 0)
        
        # Test typing in the first geocoder input
        input_field = geocoder_inputs[0].find_element(By.TAG_NAME, "input")
        input_field.send_keys("1134 4th Street Beaver PA")
        
        # Wait for suggestions to appear
        # The class for suggestions is 'leaflet-control-geocoder-alternatives'
        time.sleep(1) # Wait for debounce
        try:
            suggestions = wait.until(EC.presence_of_element_located((By.CLASS_NAME, "leaflet-control-geocoder-alternatives")))
            items = suggestions.find_elements(By.TAG_NAME, "li")
            self.assertGreater(len(items), 0)
            print(f"Found {len(items)} suggestions")
            for item in items:
                print(f"Suggestion: {item.text}")
        except Exception as e:
            self.fail(f"Suggestions dropdown did not appear: {e}")

    def tearDown(self):
        self.driver.quit()

if __name__ == "__main__":
    unittest.main()
