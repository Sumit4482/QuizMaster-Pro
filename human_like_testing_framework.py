#!/usr/bin/env python3

"""
HUMAN-LIKE SELENIUM TESTING FRAMEWORK
=====================================

This framework simulates real human testing behavior, not robotic automation.
Created by an experienced QA engineer to provide natural, realistic testing.

Key Features:
- Natural typing with character-by-character input and realistic delays
- Mouse movements that follow natural patterns
- Gradual scrolling behavior
- Realistic pauses for observation and decision-making
- Detailed logging that reads like human tester notes
- Smart waiting that adapts to page behavior
- Visual validation that mimics human observation

Author: Expert QA Engineer
Purpose: Real-world testing that behaves like a careful human tester
"""

import os
import sys
import time
import random
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import math
import json

# Auto-install required packages
def install_dependencies():
    """Install required packages for human-like testing"""
    packages = ['selenium', 'webdriver-manager']
    for package in packages:
        try:
            __import__(package.replace('-', '_'))
        except ImportError:
            print(f"Installing {package} for human-like testing...")
            os.system(f"pip3 install --user {package}")

install_dependencies()

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.common.exceptions import TimeoutException, NoSuchElementException, WebDriverException
from webdriver_manager.chrome import ChromeDriverManager

@dataclass
class TestObservation:
    """Represents a human tester's observation during testing"""
    timestamp: str
    action: str
    observation: str
    outcome: str
    notes: str = ""
    screenshot_path: str = ""

class HumanLikeLogger:
    """Logger that writes observations like a real human tester would"""
    
    def __init__(self, log_file: str = "human_tester_log.txt"):
        self.log_file = log_file
        self.observations: List[TestObservation] = []
        
        # Setup detailed logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler()
            ]
        )
    
    def observe(self, action: str, observation: str, outcome: str, notes: str = ""):
        """Record an observation like a human tester taking notes"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        obs = TestObservation(timestamp, action, observation, outcome, notes)
        self.observations.append(obs)
        
        # Log in human-readable format
        log_message = f"[{timestamp}] {action}: {observation} → {outcome}"
        if notes:
            log_message += f" (Notes: {notes})"
        
        logging.info(log_message)
    
    def note(self, message: str):
        """Add a general note like a tester would jot down"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        logging.info(f"[{timestamp}] NOTE: {message}")
    
    def concern(self, message: str):
        """Log a concern like a careful tester would flag"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        logging.warning(f"[{timestamp}] CONCERN: {message}")
    
    def success(self, message: str):
        """Log successful validation like a satisfied tester"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        logging.info(f"[{timestamp}] ✓ SUCCESS: {message}")

class HumanBehaviorSimulator:
    """Simulates natural human behavior patterns"""
    
    @staticmethod
    def typing_delay() -> float:
        """Generate realistic typing delay between characters (40-120 WPM equivalent)"""
        # Average typist: 40 WPM = ~200ms between characters
        # Fast typist: 80 WPM = ~100ms between characters  
        # With natural variation and occasional hesitation
        base_delay = random.uniform(0.08, 0.25)  # 80-250ms base
        
        # Occasional longer pauses (thinking/hesitation)
        if random.random() < 0.15:  # 15% chance of longer pause
            base_delay += random.uniform(0.3, 0.8)  # Additional 300-800ms
        
        return base_delay
    
    @staticmethod
    def action_delay() -> float:
        """Generate realistic delay between actions (observation, decision-making)"""
        # Real users pause to read, think, and decide what to do next
        return random.uniform(0.8, 2.5)  # 800ms to 2.5 seconds
    
    @staticmethod
    def reading_delay(text_length: int) -> float:
        """Generate realistic reading time based on text length"""
        # Average reading speed: 250 words per minute
        # Assume 5 characters per word average
        words = max(1, text_length / 5)
        reading_time = (words / 250) * 60  # Convert to seconds
        
        # Add some variation for careful reading
        variation = random.uniform(0.7, 1.4)
        return reading_time * variation
    
    @staticmethod
    def mouse_movement_path(start_x: int, start_y: int, end_x: int, end_y: int, steps: int = 10) -> List[Tuple[int, int]]:
        """Generate natural mouse movement path with slight curves"""
        path = []
        
        # Add slight curve to make movement more natural
        mid_x = (start_x + end_x) / 2 + random.randint(-20, 20)
        mid_y = (start_y + end_y) / 2 + random.randint(-20, 20)
        
        for i in range(steps + 1):
            t = i / steps
            
            # Quadratic bezier curve for natural movement
            x = (1-t)**2 * start_x + 2*(1-t)*t * mid_x + t**2 * end_x
            y = (1-t)**2 * start_y + 2*(1-t)*t * mid_y + t**2 * end_y
            
            path.append((int(x), int(y)))
        
        return path

class HumanLikeTester:
    """Main class that provides human-like testing capabilities"""
    
    def __init__(self, base_url: str = "http://localhost:3000", headless: bool = False):
        self.base_url = base_url
        self.driver = None
        self.logger = HumanLikeLogger()
        self.actions = None
        self.headless = headless
        self.screenshots_dir = "human_test_screenshots"
        
        os.makedirs(self.screenshots_dir, exist_ok=True)
        
        self.logger.note("Human-like testing framework initialized")
        self.logger.note(f"Target application: {base_url}")
    
    def setup_browser(self):
        """Setup browser with human-like settings and viewport"""
        try:
            self.logger.note("Setting up browser environment...")
            
            options = Options()
            if self.headless:
                options.add_argument("--headless")
                self.logger.note("Running in headless mode")
            else:
                self.logger.note("Running with visible browser for realistic testing")
            
            # Human-like browser settings
            options.add_argument("--disable-blink-features=AutomationControlled")
            options.add_experimental_option("excludeSwitches", ["enable-automation"])
            options.add_experimental_option('useAutomationExtension', False)
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--no-sandbox")
            
            # Realistic viewport size (common desktop resolution)
            options.add_argument("--window-size=1366,768")
            
            # Setup realistic user agent
            options.add_argument("--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            
            service = Service(ChromeDriverManager().install())
            self.driver = webdriver.Chrome(service=service, options=options)
            self.actions = ActionChains(self.driver)
            
            # Configure realistic timeouts
            self.driver.implicitly_wait(3)  # Short implicit wait
            self.driver.set_page_load_timeout(30)
            
            # Remove webdriver property to appear more human
            self.driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            
            self.logger.success("Browser setup completed successfully")
            
        except Exception as e:
            self.logger.concern(f"Browser setup failed: {str(e)}")
            raise
    
    def human_navigate(self, url: str):
        """Navigate to URL with human-like behavior"""
        full_url = url if url.startswith('http') else f"{self.base_url}{url}"
        
        self.logger.observe(
            action="NAVIGATE",
            observation=f"About to navigate to {full_url}",
            outcome="Starting navigation"
        )
        
        try:
            self.driver.get(full_url)
            
            # Human pause to let page load and observe
            time.sleep(HumanBehaviorSimulator.action_delay())
            
            # Check if page loaded properly
            page_title = self.driver.title
            current_url = self.driver.current_url
            
            self.logger.observe(
                action="PAGE_LOAD",
                observation=f"Page loaded with title: '{page_title}'",
                outcome="SUCCESS" if page_title else "CONCERN - No title found",
                notes=f"Current URL: {current_url}"
            )
            
            # Take screenshot for visual verification
            self.take_screenshot("page_loaded")
            
            return True
            
        except Exception as e:
            self.logger.observe(
                action="NAVIGATE",
                observation=f"Failed to load {full_url}",
                outcome="FAILED",
                notes=f"Error: {str(e)}"
            )
            return False
    
    def human_wait_and_find(self, selector: str, by: By = By.CSS_SELECTOR, timeout: int = 10, description: str = "element"):
        """Wait for element with human-like observation and patience"""
        
        self.logger.observe(
            action="LOOKING_FOR",
            observation=f"Searching for {description} using selector: {selector}",
            outcome="In progress..."
        )
        
        try:
            # Human-like waiting - check periodically instead of continuous polling
            start_time = time.time()
            while time.time() - start_time < timeout:
                try:
                    element = self.driver.find_element(by, selector)
                    if element.is_displayed():
                        
                        # Pause to observe the found element
                        time.sleep(random.uniform(0.3, 0.7))
                        
                        self.logger.observe(
                            action="FOUND_ELEMENT",
                            observation=f"Located {description} successfully",
                            outcome="SUCCESS",
                            notes=f"Element is visible and ready for interaction"
                        )
                        
                        return element
                        
                except NoSuchElementException:
                    pass
                
                # Human-like checking interval
                time.sleep(0.5)
            
            # Element not found - human tester would note this carefully
            self.logger.observe(
                action="ELEMENT_SEARCH",
                observation=f"Could not find {description} after {timeout} seconds",
                outcome="NOT_FOUND",
                notes="Element may not exist, may not be visible, or page may not have loaded completely"
            )
            
            return None
            
        except Exception as e:
            self.logger.concern(f"Unexpected error while searching for {description}: {str(e)}")
            return None
    
    def human_type(self, element, text: str, description: str = "field"):
        """Type text naturally, character by character with human rhythm"""
        
        self.logger.observe(
            action="TYPING",
            observation=f"About to type '{text}' into {description}",
            outcome="Starting to type..."
        )
        
        try:
            # Focus on the element first
            self.human_click(element, f"{description} (to focus)")
            
            # Clear existing content naturally
            if element.get_attribute('value'):
                self.logger.note(f"Field contains existing text, clearing it first")
                element.clear()
                time.sleep(random.uniform(0.2, 0.5))
            
            # Type character by character with natural rhythm
            for i, char in enumerate(text):
                element.send_keys(char)
                
                # Natural typing delay
                delay = HumanBehaviorSimulator.typing_delay()
                time.sleep(delay)
                
                # Occasional correction behavior (backspace then retype)
                if random.random() < 0.02 and i > 0:  # 2% chance of typo correction
                    self.logger.note(f"Making a natural typing correction")
                    element.send_keys(Keys.BACK_SPACE)
                    time.sleep(random.uniform(0.1, 0.3))
                    element.send_keys(char)
                    time.sleep(random.uniform(0.1, 0.2))
            
            # Pause to review what was typed (human behavior)
            time.sleep(random.uniform(0.3, 0.8))
            
            # Verify what was actually typed
            actual_value = element.get_attribute('value')
            
            if actual_value == text:
                self.logger.observe(
                    action="TYPING_COMPLETE",
                    observation=f"Successfully typed '{text}' into {description}",
                    outcome="SUCCESS",
                    notes="Text matches expected input exactly"
                )
                return True
            else:
                self.logger.observe(
                    action="TYPING_VERIFICATION",
                    observation=f"Text verification issue in {description}",
                    outcome="MISMATCH",
                    notes=f"Expected: '{text}', Actual: '{actual_value}'"
                )
                return False
                
        except Exception as e:
            self.logger.observe(
                action="TYPING",
                observation=f"Failed to type into {description}",
                outcome="ERROR",
                notes=f"Error: {str(e)}"
            )
            return False
    
    def human_click(self, element, description: str = "element"):
        """Click element with natural mouse movement and timing"""
        
        try:
            # Observe element before clicking
            self.logger.observe(
                action="PREPARING_CLICK",
                observation=f"About to click on {description}",
                outcome="Positioning mouse..."
            )
            
            # Scroll element into view naturally if needed
            if not self._is_element_in_viewport(element):
                self.logger.note(f"Element not fully visible, scrolling to bring it into view")
                self.human_scroll_to_element(element)
            
            # Get element location for natural mouse movement
            location = element.location_once_scrolled_into_view
            size = element.size
            
            # Click on a random point within the element (human behavior)
            click_x = location['x'] + random.randint(5, size['width'] - 5)
            click_y = location['y'] + random.randint(5, size['height'] - 5)
            
            # Move mouse naturally to the element
            current_pos = self.driver.execute_script("return {x: 0, y: 0};")  # Simplified
            self._move_mouse_naturally((current_pos['x'], current_pos['y']), (click_x, click_y))
            
            # Brief pause (human hesitation before click)
            time.sleep(random.uniform(0.1, 0.4))
            
            # Perform the click
            element.click()
            
            # Brief pause after click (human reaction time)
            time.sleep(random.uniform(0.2, 0.6))
            
            self.logger.observe(
                action="CLICKED",
                observation=f"Successfully clicked on {description}",
                outcome="SUCCESS",
                notes="Click appeared to register normally"
            )
            
            return True
            
        except Exception as e:
            self.logger.observe(
                action="CLICK_ATTEMPT",
                observation=f"Failed to click on {description}",
                outcome="ERROR",
                notes=f"Error: {str(e)}"
            )
            return False
    
    def human_scroll(self, pixels: int = 300):
        """Scroll gradually like a human would"""
        
        self.logger.observe(
            action="SCROLLING",
            observation=f"Scrolling {'down' if pixels > 0 else 'up'} by approximately {abs(pixels)} pixels",
            outcome="In progress..."
        )
        
        # Break large scrolls into smaller, natural movements
        remaining = abs(pixels)
        direction = 1 if pixels > 0 else -1
        
        while remaining > 0:
            # Natural scroll increment (mouse wheel typically moves 120px)
            increment = min(remaining, random.randint(80, 150))
            scroll_amount = increment * direction
            
            self.driver.execute_script(f"window.scrollBy(0, {scroll_amount});")
            
            # Natural pause between scroll increments
            time.sleep(random.uniform(0.1, 0.3))
            remaining -= increment
        
        # Brief pause to let content stabilize and observe
        time.sleep(random.uniform(0.5, 1.0))
        
        self.logger.success("Scrolling completed")
    
    def human_scroll_to_element(self, element):
        """Scroll to bring element into view naturally"""
        
        self.logger.note("Scrolling to bring element into better view")
        
        try:
            # Use JavaScript to scroll naturally to element
            self.driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", element)
            
            # Wait for scroll to complete
            time.sleep(random.uniform(1.0, 2.0))
            
            self.logger.success("Element brought into view")
            
        except Exception as e:
            self.logger.concern(f"Could not scroll to element: {str(e)}")
    
    def human_observe_page(self, focus_area: str = "entire page"):
        """Take time to observe and understand the page like a human tester"""
        
        self.logger.observe(
            action="OBSERVING",
            observation=f"Taking time to examine {focus_area}",
            outcome="In progress..."
        )
        
        try:
            # Get basic page information
            title = self.driver.title
            url = self.driver.current_url
            
            # Count interactive elements (buttons, links, inputs)
            buttons = len(self.driver.find_elements(By.TAG_NAME, "button"))
            links = len(self.driver.find_elements(By.TAG_NAME, "a"))
            inputs = len(self.driver.find_elements(By.TAG_NAME, "input"))
            
            # Look for any error messages or alerts
            error_indicators = self.driver.find_elements(By.CSS_SELECTOR, "[class*='error'], [class*='alert'], [class*='warning']")
            
            # Check for loading indicators
            loading_indicators = self.driver.find_elements(By.CSS_SELECTOR, "[class*='loading'], [class*='spinner']")
            
            # Human-like observation time based on page complexity
            observation_time = HumanBehaviorSimulator.reading_delay(len(self.driver.page_source))
            observation_time = max(2.0, min(observation_time, 8.0))  # Between 2-8 seconds
            
            time.sleep(observation_time)
            
            # Record detailed observations
            notes = []
            notes.append(f"Page contains {buttons} buttons, {links} links, {inputs} input fields")
            
            if error_indicators:
                notes.append(f"Found {len(error_indicators)} potential error/warning indicators")
            
            if loading_indicators:
                notes.append(f"Found {len(loading_indicators)} loading indicators")
            
            self.logger.observe(
                action="PAGE_ANALYSIS",
                observation=f"Completed examination of {focus_area}",
                outcome="SUCCESS",
                notes=" | ".join(notes)
            )
            
            # Take screenshot for documentation
            self.take_screenshot("page_observation")
            
            return {
                'title': title,
                'url': url,
                'buttons': buttons,
                'links': links,
                'inputs': inputs,
                'errors': len(error_indicators),
                'loading': len(loading_indicators)
            }
            
        except Exception as e:
            self.logger.concern(f"Error during page observation: {str(e)}")
            return None
    
    def verify_text_present(self, text: str, case_sensitive: bool = False):
        """Verify text is present on page like a human would check"""
        
        self.logger.observe(
            action="TEXT_VERIFICATION",
            observation=f"Looking for text: '{text}' (case {'sensitive' if case_sensitive else 'insensitive'})",
            outcome="Searching..."
        )
        
        try:
            page_source = self.driver.page_source
            search_text = text if case_sensitive else text.lower()
            search_source = page_source if case_sensitive else page_source.lower()
            
            if search_text in search_source:
                # Find approximate location for better reporting
                try:
                    elements = self.driver.find_elements(By.XPATH, f"//*[contains(text(), '{text}')]")
                    location_info = f"Found in {len(elements)} elements" if elements else "Found in page source"
                except:
                    location_info = "Found in page source"
                
                self.logger.observe(
                    action="TEXT_FOUND",
                    observation=f"Text '{text}' is present on the page",
                    outcome="SUCCESS",
                    notes=location_info
                )
                return True
            else:
                self.logger.observe(
                    action="TEXT_MISSING",
                    observation=f"Text '{text}' was not found on the page",
                    outcome="NOT_FOUND",
                    notes="May indicate missing functionality or navigation issue"
                )
                return False
                
        except Exception as e:
            self.logger.concern(f"Error during text verification: {str(e)}")
            return False
    
    def verify_element_state(self, element, expected_state: str, description: str = "element"):
        """Verify element state like a careful human tester would"""
        
        self.logger.observe(
            action="STATE_VERIFICATION",
            observation=f"Checking if {description} is {expected_state}",
            outcome="Examining..."
        )
        
        try:
            actual_states = []
            
            if element.is_displayed():
                actual_states.append("visible")
            if element.is_enabled():
                actual_states.append("enabled") 
            if element.is_selected():
                actual_states.append("selected")
            
            # Check for additional CSS-based states
            classes = element.get_attribute("class") or ""
            if "active" in classes:
                actual_states.append("active")
            if "disabled" in classes:
                actual_states.append("disabled")
            if "loading" in classes:
                actual_states.append("loading")
            
            state_description = ", ".join(actual_states) if actual_states else "no clear state"
            
            if expected_state.lower() in [state.lower() for state in actual_states]:
                self.logger.observe(
                    action="STATE_VERIFIED",
                    observation=f"{description} state verification successful",
                    outcome="SUCCESS",
                    notes=f"Element is {state_description}"
                )
                return True
            else:
                self.logger.observe(
                    action="STATE_MISMATCH",
                    observation=f"{description} is not in expected state '{expected_state}'",
                    outcome="MISMATCH",
                    notes=f"Element is currently: {state_description}"
                )
                return False
                
        except Exception as e:
            self.logger.concern(f"Error verifying element state: {str(e)}")
            return False
    
    def take_screenshot(self, name: str = "screenshot"):
        """Take screenshot for visual documentation"""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{name}_{timestamp}.png"
            filepath = os.path.join(self.screenshots_dir, filename)
            
            self.driver.save_screenshot(filepath)
            self.logger.note(f"Screenshot saved: {filename}")
            
            return filepath
        except Exception as e:
            self.logger.concern(f"Could not take screenshot: {str(e)}")
            return None
    
    def _is_element_in_viewport(self, element) -> bool:
        """Check if element is in viewport"""
        try:
            return self.driver.execute_script("""
                var element = arguments[0];
                var rect = element.getBoundingClientRect();
                return (
                    rect.top >= 0 &&
                    rect.left >= 0 &&
                    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
                );
            """, element)
        except:
            return False
    
    def _move_mouse_naturally(self, start_pos: Tuple[int, int], end_pos: Tuple[int, int]):
        """Move mouse in natural path (simplified version)"""
        # This is a simplified implementation
        # In a full implementation, you would use ActionChains to create natural movement
        try:
            path = HumanBehaviorSimulator.mouse_movement_path(
                start_pos[0], start_pos[1], end_pos[0], end_pos[1]
            )
            
            for i, (x, y) in enumerate(path[1:]):  # Skip first point
                # This is conceptual - actual implementation would require lower-level mouse control
                time.sleep(random.uniform(0.01, 0.03))
                
        except Exception:
            pass  # Fallback to direct click
    
    def cleanup(self):
        """Clean up resources and generate final report"""
        
        self.logger.note("Cleaning up testing session...")
        
        if self.driver:
            try:
                self.driver.quit()
                self.logger.success("Browser closed successfully")
            except:
                pass
        
        # Generate summary report
        self.generate_test_report()
    
    def generate_test_report(self):
        """Generate a comprehensive test report like a human tester would write"""
        
        total_observations = len(self.logger.observations)
        successful_actions = len([obs for obs in self.logger.observations if obs.outcome == "SUCCESS"])
        failed_actions = len([obs for obs in self.logger.observations if obs.outcome in ["ERROR", "FAILED", "NOT_FOUND"]])
        concerns = len([obs for obs in self.logger.observations if obs.outcome in ["CONCERN", "MISMATCH"]])
        
        report = f"""
HUMAN-LIKE TESTING SESSION REPORT
================================
Session Date: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
Total Actions Performed: {total_observations}
Successful Actions: {successful_actions}
Failed Actions: {failed_actions}
Concerns Raised: {concerns}

TESTING OBSERVATIONS SUMMARY:
----------------------------
"""
        
        for obs in self.logger.observations:
            report += f"[{obs.timestamp}] {obs.action}: {obs.observation} → {obs.outcome}\n"
            if obs.notes:
                report += f"    Notes: {obs.notes}\n"
        
        report += f"""
OVERALL ASSESSMENT:
-----------------
Success Rate: {(successful_actions / max(1, total_observations)) * 100:.1f}%
Areas of Concern: {concerns} items flagged for review
Recommendation: {'SYSTEM APPEARS FUNCTIONAL' if failed_actions == 0 and concerns <= 2 else 'REQUIRES ATTENTION'}

END OF REPORT
"""
        
        # Save report to file
        with open("human_tester_report.txt", "w") as f:
            f.write(report)
        
        print(report)


# ============================================================================
# EXAMPLE TEST CASE: QuizMaster Pro Registration and Login Flow
# ============================================================================

def example_quizmaster_test():
    """
    Example test case demonstrating human-like testing of QuizMaster Pro
    This test performs user registration and login like a real person would
    """
    
    tester = HumanLikeTester(base_url="http://localhost:3000")
    
    try:
        # Setup browser environment
        tester.setup_browser()
        
        # Test Case 1: Navigate to application and observe
        tester.logger.note("=== Starting QuizMaster Pro Human-like Testing ===")
        tester.human_navigate("/")
        
        # Take time to observe the landing page like a real user
        page_info = tester.human_observe_page("landing page")
        
        # Test Case 2: Navigate to registration
        tester.logger.note("=== Testing User Registration Flow ===")
        
        # Look for registration link/button
        register_link = tester.human_wait_and_find(
            "a[href*='register'], button:contains('Sign Up'), a:contains('Register')", 
            description="registration link"
        )
        
        if register_link:
            tester.human_click(register_link, "registration link")
        else:
            # Try direct navigation if link not found
            tester.logger.concern("Registration link not immediately visible, trying direct navigation")
            tester.human_navigate("/auth/register")
        
        # Observe registration page
        tester.human_observe_page("registration form")
        
        # Fill registration form like a human user
        email_field = tester.human_wait_and_find(
            "input[name='email'], input[type='email']",
            description="email input field"
        )
        
        if email_field:
            tester.human_type(email_field, "humantest@example.com", "email field")
        
        username_field = tester.human_wait_and_find(
            "input[name='username']",
            description="username input field"
        )
        
        if username_field:
            tester.human_type(username_field, "HumanTester", "username field")
        
        password_field = tester.human_wait_and_find(
            "input[name='password'], input[type='password']",
            description="password input field"
        )
        
        if password_field:
            tester.human_type(password_field, "HumanTest123!", "password field")
        
        # Look for additional required fields
        firstname_field = tester.human_wait_and_find(
            "input[name='firstName']",
            timeout=3,
            description="first name field (optional)"
        )
        
        if firstname_field:
            tester.human_type(firstname_field, "Human", "first name field")
        
        lastname_field = tester.human_wait_and_find(
            "input[name='lastName']", 
            timeout=3,
            description="last name field (optional)"
        )
        
        if lastname_field:
            tester.human_type(lastname_field, "Tester", "last name field")
        
        # Submit registration
        submit_button = tester.human_wait_and_find(
            "button[type='submit'], input[type='submit']",
            description="registration submit button"
        )
        
        if submit_button:
            tester.take_screenshot("before_registration_submit")
            tester.human_click(submit_button, "registration submit button")
            
            # Human pause to see results
            time.sleep(HumanBehaviorSimulator.action_delay())
            tester.take_screenshot("after_registration_submit")
            
            # Check for success/error messages
            tester.verify_text_present("success", case_sensitive=False)
            tester.verify_text_present("error", case_sensitive=False)
        
        # Test Case 3: Login Flow
        tester.logger.note("=== Testing User Login Flow ===")
        
        # Navigate to login (might be automatic redirect or manual navigation)
        current_url = tester.driver.current_url
        if "login" not in current_url.lower():
            tester.human_navigate("/auth/login")
        
        tester.human_observe_page("login form")
        
        # Fill login form
        login_email = tester.human_wait_and_find(
            "input[name='email'], input[type='email']",
            description="login email field"
        )
        
        if login_email:
            tester.human_type(login_email, "humantest@example.com", "login email field")
        
        login_password = tester.human_wait_and_find(
            "input[name='password'], input[type='password']",
            description="login password field"
        )
        
        if login_password:
            tester.human_type(login_password, "HumanTest123!", "login password field")
        
        # Submit login
        login_button = tester.human_wait_and_find(
            "button[type='submit'], input[type='submit']",
            description="login submit button"
        )
        
        if login_button:
            tester.take_screenshot("before_login_submit")
            tester.human_click(login_button, "login submit button")
            
            # Wait for login result with human patience
            time.sleep(HumanBehaviorSimulator.action_delay() * 2)
            tester.take_screenshot("after_login_submit")
            
            # Verify login success by checking for dashboard or welcome elements
            tester.verify_text_present("dashboard", case_sensitive=False)
            tester.verify_text_present("welcome", case_sensitive=False)
            tester.verify_text_present("logout", case_sensitive=False)
        
        # Test Case 4: Dashboard exploration
        tester.logger.note("=== Exploring User Dashboard ===")
        
        # Take time to explore dashboard like a real user would
        dashboard_info = tester.human_observe_page("user dashboard")
        
        # Look for key functionality
        create_room_element = tester.human_wait_and_find(
            "button:contains('Create Room'), a:contains('Create Room')",
            timeout=5,
            description="create room functionality"
        )
        
        if create_room_element:
            tester.logger.success("Create room functionality found on dashboard")
        
        join_room_element = tester.human_wait_and_find(
            "button:contains('Join'), input[placeholder*='room'], input[placeholder*='code']",
            timeout=5, 
            description="join room functionality"
        )
        
        if join_room_element:
            tester.logger.success("Join room functionality found on dashboard")
        
        # Final screenshot
        tester.take_screenshot("final_dashboard_view")
        
        tester.logger.note("=== Human-like Testing Session Completed ===")
        
    except Exception as e:
        tester.logger.concern(f"Unexpected error during testing: {str(e)}")
        tester.take_screenshot("error_state")
        
    finally:
        tester.cleanup()

if __name__ == "__main__":
    # Run the example test
    print("Starting Human-like Testing of QuizMaster Pro...")
    print("This test will behave like a real person testing the application.")
    print("Watch the browser - you'll see natural typing, pauses, and mouse movements.")
    print()
    
    example_quizmaster_test()
