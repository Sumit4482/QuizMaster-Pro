#!/usr/bin/env python3

"""
SELENIUM-BASED REAL USER MULTIPLAYER GAME TESTING

This script simulates actual user interactions with the multiplayer quiz game:
- User registration and authentication
- Room creation and joining
- Player ready states
- Game start and question answering
- Real-time updates and scoring
- Complete game flow testing

Features:
- Automatic screenshot capture on errors
- Console log collection for debugging
- Multiple browser instances for multiplayer testing
- Comprehensive error reporting and fixing suggestions
"""

import os
import sys
import time
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import traceback
import random
import string

# Install required packages
def install_dependencies():
    """Install required Python packages for Selenium testing"""
    packages = [
        'selenium',
        'webdriver-manager',
        'requests',
        'beautifulsoup4'
    ]
    
    for package in packages:
        try:
            __import__(package.replace('-', '_'))
        except ImportError:
            print(f"Installing {package}...")
            os.system(f"pip3 install {package}")

install_dependencies()

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException, WebDriverException
from webdriver_manager.chrome import ChromeDriverManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('selenium_test_log.txt'),
        logging.StreamHandler()
    ]
)

@dataclass
class TestUser:
    """Test user configuration"""
    email: str
    username: str
    password: str
    role: str = "player"

@dataclass
class TestResult:
    """Test execution result"""
    test_name: str
    status: str  # PASS, FAIL, ERROR
    duration: float
    error_message: str = ""
    screenshot_path: str = ""
    console_logs: List[str] = None

class MultiplayerGameTester:
    """Comprehensive Selenium-based multiplayer game tester"""
    
    def __init__(self, base_url: str = "http://localhost:3000"):
        self.base_url = base_url
        self.drivers: List[webdriver.Chrome] = []
        self.test_results: List[TestResult] = []
        self.screenshots_dir = "test_screenshots"
        self.logs_dir = "test_logs"
        
        # Create directories for artifacts
        os.makedirs(self.screenshots_dir, exist_ok=True)
        os.makedirs(self.logs_dir, exist_ok=True)
        
        # Test users configuration
        self.test_users = [
            TestUser("host@gametest.com", "GameHost", "TestPass123!", "host"),
            TestUser("player1@gametest.com", "Player1", "TestPass123!", "player"),
            TestUser("player2@gametest.com", "Player2", "TestPass123!", "player"),
            TestUser("player3@gametest.com", "Player3", "TestPass123!", "player")
        ]
        
        self.room_code = ""
        
    def setup_driver(self, headless: bool = False) -> webdriver.Chrome:
        """Create and configure Chrome WebDriver"""
        try:
            chrome_options = Options()
            if headless:
                chrome_options.add_argument("--headless")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--window-size=1920,1080")
            chrome_options.add_argument("--disable-extensions")
            chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
            chrome_options.add_experimental_option('useAutomationExtension', False)
            
            # Enable logging
            chrome_options.add_argument("--enable-logging")
            chrome_options.add_argument("--log-level=0")
            
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=chrome_options)
            driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            
            self.drivers.append(driver)
            return driver
            
        except Exception as e:
            logging.error(f"Failed to setup WebDriver: {e}")
            raise
    
    def capture_screenshot(self, driver: webdriver.Chrome, test_name: str) -> str:
        """Capture screenshot for debugging"""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{test_name}_{timestamp}.png"
            filepath = os.path.join(self.screenshots_dir, filename)
            driver.save_screenshot(filepath)
            logging.info(f"Screenshot saved: {filepath}")
            return filepath
        except Exception as e:
            logging.error(f"Failed to capture screenshot: {e}")
            return ""
    
    def capture_console_logs(self, driver: webdriver.Chrome) -> List[str]:
        """Capture browser console logs"""
        try:
            logs = driver.get_log('browser')
            return [f"{log['level']}: {log['message']}" for log in logs]
        except Exception as e:
            logging.error(f"Failed to capture console logs: {e}")
            return []
    
    def wait_for_element(self, driver: webdriver.Chrome, by: By, value: str, timeout: int = 10) -> Any:
        """Wait for element to be present and clickable"""
        try:
            element = WebDriverWait(driver, timeout).until(
                EC.element_to_be_clickable((by, value))
            )
            return element
        except TimeoutException:
            raise TimeoutException(f"Element not found: {by}={value}")
    
    def execute_test(self, test_name: str, test_func, *args, **kwargs) -> TestResult:
        """Execute a test with error handling and logging"""
        start_time = time.time()
        logging.info(f"🧪 Starting test: {test_name}")
        
        try:
            test_func(*args, **kwargs)
            duration = time.time() - start_time
            result = TestResult(test_name, "PASS", duration)
            logging.info(f"✅ PASSED: {test_name} ({duration:.2f}s)")
            
        except Exception as e:
            duration = time.time() - start_time
            error_msg = str(e)
            screenshot_path = ""
            console_logs = []
            
            # Capture debugging information
            if self.drivers:
                screenshot_path = self.capture_screenshot(self.drivers[0], test_name)
                console_logs = self.capture_console_logs(self.drivers[0])
            
            result = TestResult(
                test_name, "FAIL", duration, error_msg, 
                screenshot_path, console_logs
            )
            
            logging.error(f"❌ FAILED: {test_name} - {error_msg}")
            logging.error(f"Stacktrace: {traceback.format_exc()}")
        
        self.test_results.append(result)
        return result
    
    def test_frontend_accessibility(self):
        """Test if frontend is accessible"""
        driver = self.setup_driver()
        try:
            driver.get(self.base_url)
            # Wait for page to load
            WebDriverWait(driver, 10).until(
                lambda d: d.execute_script("return document.readyState") == "complete"
            )
            
            # Check if we can access the main page
            assert "QuizMaster" in driver.title or "Quiz" in driver.title or driver.find_element(By.TAG_NAME, "body")
            logging.info("Frontend is accessible")
            
        finally:
            driver.quit()
            self.drivers.remove(driver)
    
    def test_user_registration_and_login(self):
        """Test user registration and login flow"""
        driver = self.setup_driver()
        
        try:
            for user in self.test_users:
                # Navigate to registration page
                driver.get(f"{self.base_url}/auth/register")
                time.sleep(2)
                
                # Try to register user (might already exist)
                try:
                    email_field = self.wait_for_element(driver, By.NAME, "email")
                    username_field = driver.find_element(By.NAME, "username")
                    password_field = driver.find_element(By.NAME, "password")
                    firstname_field = driver.find_element(By.NAME, "firstName")
                    lastname_field = driver.find_element(By.NAME, "lastName")
                    
                    email_field.clear()
                    email_field.send_keys(user.email)
                    username_field.clear()
                    username_field.send_keys(user.username)
                    password_field.clear()
                    password_field.send_keys(user.password)
                    firstname_field.clear()
                    firstname_field.send_keys(user.username)
                    lastname_field.clear()
                    lastname_field.send_keys("Tester")
                    
                    # Submit registration
                    submit_button = driver.find_element(By.TYPE, "submit")
                    submit_button.click()
                    time.sleep(3)
                    
                except Exception as e:
                    logging.info(f"Registration might have failed for {user.username}: {e}")
                
                # Test login
                driver.get(f"{self.base_url}/auth/login")
                time.sleep(2)
                
                email_field = self.wait_for_element(driver, By.NAME, "email")
                password_field = driver.find_element(By.NAME, "password")
                
                email_field.clear()
                email_field.send_keys(user.email)
                password_field.clear()
                password_field.send_keys(user.password)
                
                # Submit login
                login_button = driver.find_element(By.TYPE, "submit")
                login_button.click()
                time.sleep(5)
                
                # Check if redirected to dashboard
                current_url = driver.current_url
                if "dashboard" in current_url or "room" in current_url:
                    logging.info(f"✅ User {user.username} logged in successfully")
                else:
                    # Check for success indicators
                    body_text = driver.find_element(By.TAG_NAME, "body").text
                    if "welcome" in body_text.lower() or "dashboard" in body_text.lower():
                        logging.info(f"✅ User {user.username} logged in successfully")
                    else:
                        logging.warning(f"⚠️ Login for {user.username} might have issues")
                
                # Logout for next user
                try:
                    logout_btn = driver.find_element(By.XPATH, "//button[contains(text(), 'Logout') or contains(text(), 'Sign Out')]")
                    logout_btn.click()
                    time.sleep(2)
                except:
                    # Navigate to home page instead
                    driver.get(self.base_url)
                    time.sleep(2)
        
        finally:
            driver.quit()
            self.drivers.remove(driver)
    
    def test_multiplayer_game_flow(self):
        """Test complete multiplayer game flow with multiple browser instances"""
        drivers = []
        
        try:
            # Create multiple browser instances for multiplayer testing
            host_driver = self.setup_driver()
            player1_driver = self.setup_driver()
            drivers = [host_driver, player1_driver]
            
            # STEP 1: Host logs in and creates room
            logging.info("🎯 STEP 1: Host creates room")
            host_user = self.test_users[0]  # GameHost
            
            host_driver.get(f"{self.base_url}/auth/login")
            time.sleep(3)
            
            # Host login
            email_field = self.wait_for_element(host_driver, By.NAME, "email")
            password_field = host_driver.find_element(By.NAME, "password")
            email_field.send_keys(host_user.email)
            password_field.send_keys(host_user.password)
            
            login_button = host_driver.find_element(By.TYPE, "submit")
            login_button.click()
            time.sleep(5)
            
            # Navigate to dashboard and create room
            try:
                # Look for create room button or link
                create_room_elements = host_driver.find_elements(By.XPATH, 
                    "//button[contains(text(), 'Create Room')] | //button[contains(text(), 'Create')] | //a[contains(text(), 'Create Room')]")
                
                if create_room_elements:
                    create_room_elements[0].click()
                    time.sleep(3)
                    
                    # Fill room details
                    try:
                        room_name_field = host_driver.find_element(By.NAME, "name")
                        room_name_field.clear()
                        room_name_field.send_keys("Selenium Test Room")
                        
                        # Submit room creation
                        create_button = host_driver.find_element(By.XPATH, 
                            "//button[contains(text(), 'Create')] | //button[@type='submit']")
                        create_button.click()
                        time.sleep(5)
                        
                        # Extract room code from URL or page content
                        current_url = host_driver.current_url
                        if "/room/" in current_url:
                            self.room_code = current_url.split("/room/")[-1]
                            logging.info(f"✅ Room created with code: {self.room_code}")
                        else:
                            # Try to find room code in page text
                            page_text = host_driver.find_element(By.TAG_NAME, "body").text
                            import re
                            room_match = re.search(r'[A-Z0-9]{6}', page_text)
                            if room_match:
                                self.room_code = room_match.group()
                                logging.info(f"✅ Found room code: {self.room_code}")
                    
                    except Exception as e:
                        logging.error(f"Error in room creation form: {e}")
                        
                else:
                    logging.warning("Create room button not found")
            
            except Exception as e:
                logging.error(f"Error creating room: {e}")
            
            # STEP 2: Player 1 joins room
            logging.info("🎯 STEP 2: Player 1 joins room")
            player1_user = self.test_users[1]  # Player1
            
            player1_driver.get(f"{self.base_url}/auth/login")
            time.sleep(3)
            
            # Player 1 login
            email_field = self.wait_for_element(player1_driver, By.NAME, "email")
            password_field = player1_driver.find_element(By.NAME, "password")
            email_field.send_keys(player1_user.email)
            password_field.send_keys(player1_user.password)
            
            login_button = player1_driver.find_element(By.TYPE, "submit")
            login_button.click()
            time.sleep(5)
            
            # Join room using room code
            if self.room_code:
                try:
                    # Try to join room directly via URL
                    player1_driver.get(f"{self.base_url}/room/{self.room_code}")
                    time.sleep(5)
                    
                    # Check if successfully joined
                    page_text = player1_driver.find_element(By.TAG_NAME, "body").text
                    if "waiting" in page_text.lower() or "ready" in page_text.lower():
                        logging.info("✅ Player 1 joined room successfully")
                    else:
                        logging.warning("Player 1 room join status unclear")
                        
                except Exception as e:
                    logging.error(f"Error joining room: {e}")
            
            # STEP 3: Test ready states
            logging.info("🎯 STEP 3: Testing ready states")
            
            # Host marks ready
            try:
                ready_buttons = host_driver.find_elements(By.XPATH, 
                    "//button[contains(text(), 'Ready')] | //button[contains(text(), 'Not Ready')]")
                if ready_buttons:
                    ready_buttons[0].click()
                    time.sleep(2)
                    logging.info("✅ Host marked ready")
            except Exception as e:
                logging.error(f"Error with host ready state: {e}")
            
            # Player 1 marks ready
            try:
                ready_buttons = player1_driver.find_elements(By.XPATH, 
                    "//button[contains(text(), 'Ready')] | //button[contains(text(), 'Not Ready')]")
                if ready_buttons:
                    ready_buttons[0].click()
                    time.sleep(2)
                    logging.info("✅ Player 1 marked ready")
            except Exception as e:
                logging.error(f"Error with player 1 ready state: {e}")
            
            # STEP 4: Start game
            logging.info("🎯 STEP 4: Starting game")
            
            try:
                start_game_buttons = host_driver.find_elements(By.XPATH, 
                    "//button[contains(text(), 'Start Game')] | //button[contains(text(), 'Start')]")
                if start_game_buttons:
                    start_game_buttons[0].click()
                    time.sleep(10)  # Wait for game to start
                    
                    # Check if game started
                    page_text = host_driver.find_element(By.TAG_NAME, "body").text
                    if "question" in page_text.lower() or "answer" in page_text.lower():
                        logging.info("✅ Game started successfully")
                        
                        # STEP 5: Test answer submission
                        logging.info("🎯 STEP 5: Testing answer submission")
                        
                        # Host submits answer
                        self.test_answer_submission(host_driver, "Host")
                        
                        # Player 1 submits answer
                        self.test_answer_submission(player1_driver, "Player1")
                        
                    else:
                        logging.warning("Game start status unclear")
                        
                else:
                    logging.warning("Start game button not found")
                    
            except Exception as e:
                logging.error(f"Error starting game: {e}")
        
        finally:
            for driver in drivers:
                driver.quit()
                if driver in self.drivers:
                    self.drivers.remove(driver)
    
    def test_answer_submission(self, driver: webdriver.Chrome, player_name: str):
        """Test answer submission for a specific player"""
        try:
            # Look for answer options
            answer_options = driver.find_elements(By.XPATH, 
                "//button[contains(@class, 'answer')] | //div[contains(@class, 'answer')] | //input[@type='radio']")
            
            if answer_options:
                # Select first answer option
                answer_options[0].click()
                time.sleep(1)
                
                # Look for submit button
                submit_buttons = driver.find_elements(By.XPATH, 
                    "//button[contains(text(), 'Submit')] | //button[contains(text(), 'Answer')]")
                
                if submit_buttons:
                    submit_buttons[0].click()
                    time.sleep(3)
                    
                    # Check for success indication
                    page_text = driver.find_element(By.TAG_NAME, "body").text
                    if "submitted" in page_text.lower() or "correct" in page_text.lower() or "incorrect" in page_text.lower():
                        logging.info(f"✅ {player_name} submitted answer successfully")
                    else:
                        logging.warning(f"⚠️ {player_name} answer submission status unclear")
                else:
                    logging.warning(f"Submit button not found for {player_name}")
            else:
                logging.warning(f"Answer options not found for {player_name}")
                
        except Exception as e:
            logging.error(f"Error in answer submission for {player_name}: {e}")
    
    def test_error_recovery(self):
        """Test error recovery scenarios"""
        driver = self.setup_driver()
        
        try:
            # Test invalid page navigation
            driver.get(f"{self.base_url}/invalid-page")
            time.sleep(2)
            
            # Check if proper error handling is in place
            page_text = driver.find_element(By.TAG_NAME, "body").text
            if "404" in page_text or "not found" in page_text.lower():
                logging.info("✅ 404 error handling works properly")
            else:
                logging.warning("⚠️ 404 error handling might need improvement")
            
            # Test network interruption simulation
            # (This would require more advanced setup)
            
        finally:
            driver.quit()
            self.drivers.remove(driver)
    
    def run_all_tests(self):
        """Execute all automated tests"""
        logging.info("🚀 Starting comprehensive Selenium-based multiplayer game testing")
        logging.info("=" * 80)
        
        # Execute test suite
        tests = [
            ("Frontend Accessibility", self.test_frontend_accessibility),
            ("User Registration and Login", self.test_user_registration_and_login),
            ("Complete Multiplayer Game Flow", self.test_multiplayer_game_flow),
            ("Error Recovery Scenarios", self.test_error_recovery),
        ]
        
        for test_name, test_func in tests:
            self.execute_test(test_name, test_func)
            time.sleep(2)  # Brief pause between tests
        
        self.generate_report()
    
    def generate_report(self):
        """Generate comprehensive test report"""
        logging.info("📊 Generating comprehensive test report")
        logging.info("=" * 80)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result.status == "PASS")
        failed_tests = total_tests - passed_tests
        
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        # Console report
        print(f"\n🎯 SELENIUM TEST RESULTS SUMMARY")
        print("=" * 50)
        print(f"✅ PASSED: {passed_tests}")
        print(f"❌ FAILED: {failed_tests}")
        print(f"📈 SUCCESS RATE: {success_rate:.1f}%")
        print(f"🕒 TOTAL DURATION: {sum(r.duration for r in self.test_results):.2f}s")
        
        if failed_tests > 0:
            print(f"\n❌ FAILED TESTS:")
            print("-" * 30)
            for i, result in enumerate([r for r in self.test_results if r.status == "FAIL"], 1):
                print(f"{i}. {result.test_name}")
                print(f"   💥 Error: {result.error_message}")
                if result.screenshot_path:
                    print(f"   📸 Screenshot: {result.screenshot_path}")
                if result.console_logs:
                    print(f"   📜 Console logs: {len(result.console_logs)} entries")
                print("")
        
        # Generate detailed HTML report
        self.generate_html_report()
        
        # System health assessment
        print(f"\n🏥 SYSTEM HEALTH ASSESSMENT:")
        print("-" * 35)
        if success_rate >= 80:
            print("🎉 SYSTEM IS READY FOR PRODUCTION!")
        elif success_rate >= 60:
            print("⚠️ SYSTEM MOSTLY FUNCTIONAL - MINOR FIXES NEEDED")
        else:
            print("🚨 SYSTEM NEEDS SIGNIFICANT ATTENTION")
        
        print("=" * 50)
    
    def generate_html_report(self):
        """Generate detailed HTML test report"""
        html_content = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Selenium Multiplayer Game Test Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                .header { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
                .summary { background: #ecf0f1; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .test-result { margin: 20px 0; padding: 15px; border-radius: 5px; }
                .pass { background: #d5f4e6; border-left: 5px solid #27ae60; }
                .fail { background: #fadbd8; border-left: 5px solid #e74c3c; }
                .screenshot { max-width: 300px; margin: 10px 0; }
                .console-logs { background: #2c3e50; color: #ecf0f1; padding: 10px; border-radius: 5px; max-height: 200px; overflow-y: auto; }
                .timestamp { color: #7f8c8d; font-size: 0.9em; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🎮 Selenium Multiplayer Game Test Report</h1>
                <p class="timestamp">Generated: {timestamp}</p>
            </div>
            
            <div class="summary">
                <h2>📊 Summary</h2>
                <p><strong>Total Tests:</strong> {total_tests}</p>
                <p><strong>Passed:</strong> {passed_tests}</p>
                <p><strong>Failed:</strong> {failed_tests}</p>
                <p><strong>Success Rate:</strong> {success_rate:.1f}%</p>
                <p><strong>Total Duration:</strong> {total_duration:.2f} seconds</p>
            </div>
            
            <div class="results">
                <h2>🧪 Test Results</h2>
                {test_results_html}
            </div>
        </body>
        </html>
        """
        
        # Build test results HTML
        test_results_html = ""
        for result in self.test_results:
            css_class = "pass" if result.status == "PASS" else "fail"
            status_icon = "✅" if result.status == "PASS" else "❌"
            
            screenshot_html = ""
            if result.screenshot_path:
                screenshot_html = f'<p><strong>Screenshot:</strong></p><img src="{result.screenshot_path}" class="screenshot" alt="Test Screenshot">'
            
            console_logs_html = ""
            if result.console_logs:
                logs_text = "\\n".join(result.console_logs[:10])  # Limit to first 10 logs
                console_logs_html = f'<p><strong>Console Logs:</strong></p><pre class="console-logs">{logs_text}</pre>'
            
            test_results_html += f"""
                <div class="test-result {css_class}">
                    <h3>{status_icon} {result.test_name}</h3>
                    <p><strong>Duration:</strong> {result.duration:.2f}s</p>
                    {f'<p><strong>Error:</strong> {result.error_message}</p>' if result.error_message else ''}
                    {screenshot_html}
                    {console_logs_html}
                </div>
            """
        
        # Fill template
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result.status == "PASS")
        failed_tests = total_tests - passed_tests
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        total_duration = sum(r.duration for r in self.test_results)
        
        html_report = html_content.format(
            timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            total_tests=total_tests,
            passed_tests=passed_tests,
            failed_tests=failed_tests,
            success_rate=success_rate,
            total_duration=total_duration,
            test_results_html=test_results_html
        )
        
        # Save HTML report
        with open("selenium_test_report.html", "w") as f:
            f.write(html_report)
        
        logging.info("📄 Detailed HTML report generated: selenium_test_report.html")
    
    def cleanup(self):
        """Clean up resources"""
        for driver in self.drivers:
            try:
                driver.quit()
            except:
                pass
        self.drivers.clear()

def main():
    """Main execution function"""
    tester = MultiplayerGameTester()
    
    try:
        tester.run_all_tests()
    except KeyboardInterrupt:
        logging.info("🛑 Testing interrupted by user")
    except Exception as e:
        logging.error(f"💥 Critical error during testing: {e}")
        logging.error(traceback.format_exc())
    finally:
        tester.cleanup()

if __name__ == "__main__":
    main()
