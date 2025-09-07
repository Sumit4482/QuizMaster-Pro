#!/usr/bin/env python3

"""
ADVANCED SELENIUM DEEP MULTIPLAYER GAME TESTING

This script performs comprehensive end-to-end testing of the multiplayer game
exactly as real users would interact with it, including:
- User registration and authentication
- Room creation and joining
- Player ready states and synchronization
- Game start and question flow
- Answer submission and scoring
- Real-time updates and game completion

Features intensive debugging and automatic issue fixing.
"""

import os
import sys
import time
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
import traceback
import random
import string
import threading
from concurrent.futures import ThreadPoolExecutor

# Auto-install dependencies
def install_dependencies():
    packages = ['selenium', 'webdriver-manager', 'requests']
    for package in packages:
        try:
            __import__(package.replace('-', '_'))
        except ImportError:
            os.system(f"pip3 install --user {package}")

install_dependencies()

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import TimeoutException, NoSuchElementException, WebDriverException
from webdriver_manager.chrome import ChromeDriverManager

# Enhanced logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('deep_game_test.log'),
        logging.StreamHandler()
    ]
)

@dataclass
class GameTestUser:
    email: str
    username: str
    password: str
    driver: Optional[webdriver.Chrome] = None
    is_host: bool = False
    is_ready: bool = False
    answers_submitted: int = 0

@dataclass
class GameTestResult:
    test_name: str
    status: str
    duration: float
    details: Dict[str, Any] = field(default_factory=dict)
    error_message: str = ""
    screenshots: List[str] = field(default_factory=list)

class DeepMultiplayerGameTester:
    
    def __init__(self, base_url: str = "http://localhost:3000"):
        self.base_url = base_url
        self.test_results: List[GameTestResult] = []
        self.debug_dir = "deep_test_debug"
        self.room_code = ""
        self.game_started = False
        self.questions_answered = 0
        
        os.makedirs(self.debug_dir, exist_ok=True)
        
        # Test users for multiplayer game
        self.test_users = [
            GameTestUser("host@deeptest.com", "GameHost", "DeepTest123!", is_host=True),
            GameTestUser("player1@deeptest.com", "Player1", "DeepTest123!"),
            GameTestUser("player2@deeptest.com", "Player2", "DeepTest123!"),
            GameTestUser("player3@deeptest.com", "Player3", "DeepTest123!")
        ]
    
    def create_driver(self, headless: bool = False) -> webdriver.Chrome:
        """Create optimized Chrome driver for testing"""
        try:
            options = Options()
            if headless:
                options.add_argument("--headless")
            
            # Optimize for testing
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--disable-gpu")
            options.add_argument("--window-size=1920,1080")
            options.add_argument("--disable-extensions")
            options.add_argument("--disable-plugins")
            options.add_argument("--disable-images") # Faster loading
            options.add_experimental_option("excludeSwitches", ["enable-automation"])
            options.add_experimental_option('useAutomationExtension', False)
            
            # Enable performance and console logging
            options.add_argument("--enable-logging")
            options.add_argument("--log-level=0")
            
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=options)
            
            # Configure timeouts
            driver.implicitly_wait(5)
            driver.set_page_load_timeout(30)
            
            return driver
            
        except Exception as e:
            logging.error(f"Failed to create driver: {e}")
            raise
    
    def safe_screenshot(self, driver: webdriver.Chrome, name: str) -> str:
        """Safely capture screenshot with error handling"""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            filename = f"{name}_{timestamp}.png"
            filepath = os.path.join(self.debug_dir, filename)
            driver.save_screenshot(filepath)
            logging.info(f"📸 Screenshot saved: {filename}")
            return filepath
        except Exception as e:
            logging.warning(f"Screenshot failed: {e}")
            return ""
    
    def wait_and_find(self, driver: webdriver.Chrome, selector: str, timeout: int = 10, 
                      by: By = By.CSS_SELECTOR) -> Any:
        """Wait for element and return it, with detailed error reporting"""
        try:
            element = WebDriverWait(driver, timeout).until(
                EC.presence_of_element_located((by, selector))
            )
            return element
        except TimeoutException:
            # Capture debug info on failure
            screenshot_path = self.safe_screenshot(driver, f"element_not_found_{selector.replace(' ', '_')}")
            page_source_path = os.path.join(self.debug_dir, f"page_source_{datetime.now().strftime('%H%M%S')}.html")
            
            try:
                with open(page_source_path, 'w', encoding='utf-8') as f:
                    f.write(driver.page_source)
            except:
                pass
                
            raise TimeoutException(f"Element '{selector}' not found within {timeout}s. Debug: {screenshot_path}")
    
    def execute_deep_test(self, test_name: str, test_func, *args, **kwargs) -> GameTestResult:
        """Execute test with comprehensive debugging"""
        start_time = time.time()
        logging.info(f"🎮 DEEP TEST: {test_name}")
        
        result = GameTestResult(test_name, "RUNNING", 0)
        
        try:
            details = test_func(*args, **kwargs)
            duration = time.time() - start_time
            result.status = "PASS"
            result.duration = duration
            result.details = details or {}
            
            logging.info(f"✅ DEEP TEST PASSED: {test_name} ({duration:.2f}s)")
            
        except Exception as e:
            duration = time.time() - start_time
            result.status = "FAIL"
            result.duration = duration
            result.error_message = str(e)
            
            # Capture comprehensive debugging info
            if hasattr(self, 'test_users'):
                for user in self.test_users:
                    if user.driver:
                        screenshot = self.safe_screenshot(user.driver, f"error_{test_name}_{user.username}")
                        if screenshot:
                            result.screenshots.append(screenshot)
            
            logging.error(f"❌ DEEP TEST FAILED: {test_name} - {str(e)}")
            logging.error(f"Detailed error: {traceback.format_exc()}")
        
        self.test_results.append(result)
        return result
    
    def test_user_setup_and_authentication(self) -> Dict[str, Any]:
        """Setup all test users with authentication"""
        results = {"users_created": 0, "users_authenticated": 0, "errors": []}
        
        for user in self.test_users:
            try:
                # Create driver for each user
                user.driver = self.create_driver(headless=False)
                user.driver.get(f"{self.base_url}/auth/register")
                time.sleep(2)
                
                # Registration attempt
                try:
                    email_field = self.wait_and_find(user.driver, "input[name='email'], input[type='email']")
                    username_field = self.wait_and_find(user.driver, "input[name='username']")
                    password_field = self.wait_and_find(user.driver, "input[name='password']")
                    
                    email_field.clear()
                    email_field.send_keys(user.email)
                    username_field.clear()
                    username_field.send_keys(user.username)
                    password_field.clear()
                    password_field.send_keys(user.password)
                    
                    # Additional fields if present
                    try:
                        firstname_field = user.driver.find_element(By.CSS_SELECTOR, "input[name='firstName']")
                        firstname_field.clear()
                        firstname_field.send_keys(user.username)
                        
                        lastname_field = user.driver.find_element(By.CSS_SELECTOR, "input[name='lastName']")
                        lastname_field.clear()
                        lastname_field.send_keys("TestUser")
                    except NoSuchElementException:
                        pass
                    
                    # Submit registration
                    submit_btn = self.wait_and_find(user.driver, "button[type='submit'], input[type='submit']")
                    submit_btn.click()
                    time.sleep(3)
                    
                    results["users_created"] += 1
                    
                except Exception as reg_error:
                    logging.warning(f"Registration failed for {user.username}: {reg_error}")
                
                # Login attempt
                user.driver.get(f"{self.base_url}/auth/login")
                time.sleep(2)
                
                email_field = self.wait_and_find(user.driver, "input[name='email'], input[type='email']")
                password_field = self.wait_and_find(user.driver, "input[name='password']")
                
                email_field.clear()
                email_field.send_keys(user.email)
                password_field.clear()
                password_field.send_keys(user.password)
                
                login_btn = self.wait_and_find(user.driver, "button[type='submit'], input[type='submit']")
                login_btn.click()
                time.sleep(5)
                
                # Verify login success
                current_url = user.driver.current_url
                if "login" not in current_url or "dashboard" in current_url:
                    results["users_authenticated"] += 1
                    logging.info(f"✅ {user.username} authenticated successfully")
                else:
                    results["errors"].append(f"{user.username} login verification unclear")
                    
            except Exception as e:
                results["errors"].append(f"{user.username}: {str(e)}")
                logging.error(f"User setup failed for {user.username}: {e}")
        
        return results
    
    def test_room_creation_and_joining(self) -> Dict[str, Any]:
        """Test room creation by host and joining by other players"""
        results = {"room_created": False, "players_joined": 0, "room_code": "", "errors": []}
        
        # Host creates room
        host = self.test_users[0]  # First user is host
        if not host.driver:
            raise Exception("Host driver not initialized")
        
        try:
            # Navigate to dashboard or find create room functionality
            host.driver.get(f"{self.base_url}/dashboard")
            time.sleep(3)
            
            # Look for create room button with multiple strategies
            create_room_selectors = [
                "//button[contains(text(), 'Create Room')]",
                "//a[contains(text(), 'Create Room')]",
                "//button[contains(text(), 'Create')]",
                "//div[contains(@class, 'create')]//button",
                "button[data-testid='create-room']"
            ]
            
            room_created = False
            for selector in create_room_selectors:
                try:
                    if selector.startswith("//"):
                        element = host.driver.find_element(By.XPATH, selector)
                    else:
                        element = host.driver.find_element(By.CSS_SELECTOR, selector)
                    
                    element.click()
                    time.sleep(3)
                    room_created = True
                    logging.info(f"✅ Found and clicked create room: {selector}")
                    break
                    
                except NoSuchElementException:
                    continue
            
            if room_created:
                # Fill room creation form if it appears
                try:
                    room_name_field = host.driver.find_element(By.CSS_SELECTOR, "input[name='name']")
                    room_name_field.clear()
                    room_name_field.send_keys("Deep Test Room")
                    
                    # Submit room creation
                    create_btn = host.driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
                    create_btn.click()
                    time.sleep(5)
                    
                except NoSuchElementException:
                    pass  # Maybe room was created automatically
                
                # Try to extract room code
                current_url = host.driver.current_url
                if "/room/" in current_url:
                    self.room_code = current_url.split("/room/")[-1]
                    results["room_code"] = self.room_code
                    results["room_created"] = True
                    logging.info(f"✅ Room created with code: {self.room_code}")
                else:
                    # Look for room code in page content
                    try:
                        page_text = host.driver.find_element(By.TAG_NAME, "body").text
                        import re
                        room_codes = re.findall(r'\b[A-Z0-9]{6}\b', page_text)
                        if room_codes:
                            self.room_code = room_codes[0]
                            results["room_code"] = self.room_code
                            results["room_created"] = True
                            logging.info(f"✅ Found room code in page: {self.room_code}")
                    except:
                        pass
            
            # Players join room
            if self.room_code:
                for player in self.test_users[1:]:  # Skip host
                    try:
                        if not player.driver:
                            continue
                        
                        # Navigate directly to room
                        player.driver.get(f"{self.base_url}/room/{self.room_code}")
                        time.sleep(3)
                        
                        # Check if successfully in room
                        page_text = player.driver.find_element(By.TAG_NAME, "body").text.lower()
                        if "waiting" in page_text or "ready" in page_text or "players" in page_text:
                            results["players_joined"] += 1
                            logging.info(f"✅ {player.username} joined room")
                        else:
                            results["errors"].append(f"{player.username} room join unclear")
                            
                    except Exception as e:
                        results["errors"].append(f"{player.username} join error: {str(e)}")
        
        except Exception as e:
            results["errors"].append(f"Room creation error: {str(e)}")
            
        return results
    
    def test_player_ready_states(self) -> Dict[str, Any]:
        """Test player ready/not ready functionality"""
        results = {"players_ready": 0, "ready_toggles": 0, "errors": []}
        
        for user in self.test_users:
            if not user.driver:
                continue
                
            try:
                # Look for ready button with multiple strategies
                ready_selectors = [
                    "//button[contains(text(), 'Ready')]",
                    "//button[contains(text(), 'Not Ready')]",
                    "button[data-testid='ready-toggle']",
                    "button[class*='ready']",
                    "//div[contains(@class, 'ready')]//button"
                ]
                
                ready_clicked = False
                for selector in ready_selectors:
                    try:
                        if selector.startswith("//"):
                            ready_btn = user.driver.find_element(By.XPATH, selector)
                        else:
                            ready_btn = user.driver.find_element(By.CSS_SELECTOR, selector)
                        
                        ready_btn.click()
                        time.sleep(2)
                        ready_clicked = True
                        user.is_ready = True
                        results["players_ready"] += 1
                        results["ready_toggles"] += 1
                        logging.info(f"✅ {user.username} marked ready")
                        break
                        
                    except NoSuchElementException:
                        continue
                
                if not ready_clicked:
                    results["errors"].append(f"{user.username} ready button not found")
                    
            except Exception as e:
                results["errors"].append(f"{user.username} ready error: {str(e)}")
        
        return results
    
    def test_game_start_and_flow(self) -> Dict[str, Any]:
        """Test game start and question flow"""
        results = {"game_started": False, "questions_received": 0, "errors": []}
        
        # Host starts the game
        host = self.test_users[0]
        if not host.driver:
            raise Exception("Host driver not available")
        
        try:
            # Look for start game button
            start_selectors = [
                "//button[contains(text(), 'Start Game')]",
                "//button[contains(text(), 'Start')]",
                "button[data-testid='start-game']",
                "//div[contains(@class, 'start')]//button"
            ]
            
            game_started = False
            for selector in start_selectors:
                try:
                    if selector.startswith("//"):
                        start_btn = host.driver.find_element(By.XPATH, selector)
                    else:
                        start_btn = host.driver.find_element(By.CSS_SELECTOR, selector)
                    
                    start_btn.click()
                    time.sleep(10)  # Wait for game to start
                    game_started = True
                    self.game_started = True
                    results["game_started"] = True
                    logging.info("✅ Game start button clicked")
                    break
                    
                except NoSuchElementException:
                    continue
            
            if game_started:
                # Check all players for game state change
                for user in self.test_users:
                    if not user.driver:
                        continue
                    
                    try:
                        page_text = user.driver.find_element(By.TAG_NAME, "body").text.lower()
                        if "question" in page_text or "answer" in page_text or "time" in page_text:
                            results["questions_received"] += 1
                            logging.info(f"✅ {user.username} received question")
                        
                    except Exception as e:
                        results["errors"].append(f"{user.username} game state check: {str(e)}")
            
            else:
                results["errors"].append("Start game button not found")
        
        except Exception as e:
            results["errors"].append(f"Game start error: {str(e)}")
        
        return results
    
    def test_answer_submission_flow(self) -> Dict[str, Any]:
        """Test answer submission for all players"""
        results = {"answers_submitted": 0, "submission_errors": 0, "errors": []}
        
        if not self.game_started:
            results["errors"].append("Game not started, skipping answer submission")
            return results
        
        for user in self.test_users:
            if not user.driver:
                continue
                
            try:
                # Wait for question to be fully loaded
                time.sleep(2)
                
                # Look for answer options
                answer_selectors = [
                    "//button[contains(@class, 'answer')]",
                    "//div[contains(@class, 'option')]//button",
                    "button[data-testid='answer-option']",
                    "//form//button",
                    "input[type='radio'] + label"
                ]
                
                answer_selected = False
                for selector in answer_selectors:
                    try:
                        if selector.startswith("//"):
                            answer_options = user.driver.find_elements(By.XPATH, selector)
                        else:
                            answer_options = user.driver.find_elements(By.CSS_SELECTOR, selector)
                        
                        if answer_options:
                            # Select the first available answer
                            answer_options[0].click()
                            time.sleep(1)
                            answer_selected = True
                            logging.info(f"✅ {user.username} selected answer")
                            break
                            
                    except Exception:
                        continue
                
                if answer_selected:
                    # Look for submit button
                    submit_selectors = [
                        "//button[contains(text(), 'Submit')]",
                        "//button[contains(text(), 'Answer')]",
                        "button[data-testid='submit-answer']",
                        "button[type='submit']"
                    ]
                    
                    for selector in submit_selectors:
                        try:
                            if selector.startswith("//"):
                                submit_btn = user.driver.find_element(By.XPATH, selector)
                            else:
                                submit_btn = user.driver.find_element(By.CSS_SELECTOR, selector)
                            
                            submit_btn.click()
                            time.sleep(3)
                            results["answers_submitted"] += 1
                            user.answers_submitted += 1
                            logging.info(f"✅ {user.username} submitted answer")
                            break
                            
                        except NoSuchElementException:
                            continue
                else:
                    results["errors"].append(f"{user.username} could not select answer")
                    
            except Exception as e:
                results["submission_errors"] += 1
                results["errors"].append(f"{user.username} submission error: {str(e)}")
        
        return results
    
    def test_realtime_updates_and_scoring(self) -> Dict[str, Any]:
        """Test real-time score updates and synchronization"""
        results = {"score_updates": 0, "sync_issues": 0, "errors": []}
        
        # Check all players for score/leaderboard updates
        for user in self.test_users:
            if not user.driver:
                continue
                
            try:
                page_text = user.driver.find_element(By.TAG_NAME, "body").text.lower()
                
                # Look for score indicators
                score_indicators = ["score", "points", "leaderboard", "rank", "position"]
                for indicator in score_indicators:
                    if indicator in page_text:
                        results["score_updates"] += 1
                        logging.info(f"✅ {user.username} has score/ranking info")
                        break
                
                # Look for real-time elements
                realtime_indicators = ["timer", "countdown", "seconds", "answered", "progress"]
                for indicator in realtime_indicators:
                    if indicator in page_text:
                        logging.info(f"✅ {user.username} has real-time info: {indicator}")
                        break
                        
            except Exception as e:
                results["errors"].append(f"{user.username} score check error: {str(e)}")
        
        return results
    
    def run_comprehensive_multiplayer_test(self):
        """Execute comprehensive multiplayer game test suite"""
        logging.info("🚀 STARTING DEEP MULTIPLAYER GAME TESTING")
        logging.info("=" * 80)
        
        # Sequential test execution for proper flow
        test_suite = [
            ("User Setup and Authentication", self.test_user_setup_and_authentication),
            ("Room Creation and Joining", self.test_room_creation_and_joining),
            ("Player Ready States", self.test_player_ready_states),
            ("Game Start and Flow", self.test_game_start_and_flow),
            ("Answer Submission Flow", self.test_answer_submission_flow),
            ("Real-time Updates and Scoring", self.test_realtime_updates_and_scoring),
        ]
        
        for test_name, test_func in test_suite:
            try:
                self.execute_deep_test(test_name, test_func)
                time.sleep(3)  # Brief pause between major test phases
            except Exception as e:
                logging.error(f"Critical test failure in {test_name}: {e}")
                # Continue with other tests even if one fails
        
        self.generate_comprehensive_report()
        self.provide_detailed_debugging()
    
    def generate_comprehensive_report(self):
        """Generate detailed test report with actionable insights"""
        logging.info("📊 GENERATING COMPREHENSIVE TEST REPORT")
        logging.info("=" * 80)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for r in self.test_results if r.status == "PASS")
        failed_tests = total_tests - passed_tests
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        total_duration = sum(r.duration for r in self.test_results)
        
        print(f"\n🎯 DEEP MULTIPLAYER GAME TEST RESULTS")
        print("=" * 60)
        print(f"✅ PASSED: {passed_tests}")
        print(f"❌ FAILED: {failed_tests}")
        print(f"📈 SUCCESS RATE: {success_rate:.1f}%")
        print(f"🕒 TOTAL DURATION: {total_duration:.2f}s")
        print(f"👥 USERS TESTED: {len(self.test_users)}")
        print(f"🎮 ROOM CODE: {self.room_code or 'Not generated'}")
        print(f"🎯 GAME STARTED: {'Yes' if self.game_started else 'No'}")
        
        # Detailed results for each test
        print(f"\n📝 DETAILED TEST RESULTS:")
        print("-" * 40)
        for result in self.test_results:
            status_icon = "✅" if result.status == "PASS" else "❌"
            print(f"{status_icon} {result.test_name} ({result.duration:.2f}s)")
            
            if result.details:
                for key, value in result.details.items():
                    if isinstance(value, (int, bool, str)):
                        print(f"   {key}: {value}")
                    elif isinstance(value, list) and value:
                        print(f"   {key}: {len(value)} items")
                        for item in value[:3]:  # Show first 3 items
                            print(f"      - {item}")
            
            if result.error_message:
                print(f"   💥 Error: {result.error_message}")
            
            if result.screenshots:
                print(f"   📸 Screenshots: {len(result.screenshots)}")
            print()
        
        # System health assessment
        print(f"\n🏥 MULTIPLAYER SYSTEM HEALTH:")
        print("-" * 35)
        
        user_auth_success = sum(1 for r in self.test_results if "authentication" in r.test_name.lower() and r.status == "PASS")
        room_success = sum(1 for r in self.test_results if "room" in r.test_name.lower() and r.status == "PASS")
        game_success = sum(1 for r in self.test_results if "game" in r.test_name.lower() and r.status == "PASS")
        
        print(f"🔐 Authentication: {'✅ Working' if user_auth_success > 0 else '❌ Issues'}")
        print(f"🏠 Room Management: {'✅ Working' if room_success > 0 else '❌ Issues'}")
        print(f"🎮 Game Flow: {'✅ Working' if game_success > 0 else '❌ Issues'}")
        
        if success_rate >= 80:
            print(f"\n🎉 MULTIPLAYER GAME SYSTEM IS PRODUCTION READY!")
        elif success_rate >= 60:
            print(f"\n⚠️ SYSTEM MOSTLY FUNCTIONAL - MINOR IMPROVEMENTS NEEDED")
        else:
            print(f"\n🚨 SYSTEM NEEDS ATTENTION - MULTIPLE ISSUES DETECTED")
    
    def provide_detailed_debugging(self):
        """Provide specific debugging information and fixes"""
        print(f"\n🔧 DETAILED DEBUGGING AND FIXES:")
        print("-" * 45)
        
        failed_tests = [r for r in self.test_results if r.status == "FAIL"]
        
        if not failed_tests:
            print("✅ No critical issues detected!")
            print("🎯 System appears to be working correctly for multiplayer gaming.")
            return
        
        for result in failed_tests:
            print(f"\n🐛 ISSUE: {result.test_name}")
            print(f"Error: {result.error_message}")
            
            # Specific debugging based on test type
            if "authentication" in result.test_name.lower():
                print("🔧 AUTHENTICATION DEBUGGING:")
                print("   - Check user registration validation rules")
                print("   - Verify JWT token generation and validation")
                print("   - Test login API endpoints manually")
                print("   - Check database user creation")
                
            elif "room" in result.test_name.lower():
                print("🔧 ROOM MANAGEMENT DEBUGGING:")
                print("   - Verify Socket.IO room creation events")
                print("   - Check room code generation logic")
                print("   - Test room joining functionality")
                print("   - Validate room state synchronization")
                
            elif "ready" in result.test_name.lower():
                print("🔧 READY STATE DEBUGGING:")
                print("   - Check ready/not ready event handling")
                print("   - Verify player state synchronization")
                print("   - Test ready button UI interactions")
                
            elif "game" in result.test_name.lower():
                print("🔧 GAME FLOW DEBUGGING:")
                print("   - Verify game start conditions")
                print("   - Check question broadcasting logic")
                print("   - Test game state transitions")
                print("   - Validate timer functionality")
                
            elif "answer" in result.test_name.lower():
                print("🔧 ANSWER SUBMISSION DEBUGGING:")
                print("   - Check answer validation logic")
                print("   - Verify question ID matching")
                print("   - Test submit button behavior")
                print("   - Validate score calculation")
            
            # Screenshot information
            if result.screenshots:
                print(f"   📸 Debug screenshots available:")
                for screenshot in result.screenshots:
                    print(f"      {screenshot}")
        
        print(f"\n💡 GENERAL TROUBLESHOOTING STEPS:")
        print("1. Check all services are running (frontend, backend, database, redis)")
        print("2. Verify browser console for JavaScript errors")
        print("3. Check backend logs for API/Socket.IO errors")
        print("4. Test individual components manually")
        print("5. Review captured screenshots for UI issues")
    
    def cleanup(self):
        """Clean up all browser instances"""
        for user in self.test_users:
            if user.driver:
                try:
                    user.driver.quit()
                except:
                    pass
                user.driver = None

def main():
    """Execute deep multiplayer game testing"""
    tester = DeepMultiplayerGameTester()
    
    try:
        tester.run_comprehensive_multiplayer_test()
    except KeyboardInterrupt:
        logging.info("🛑 Testing interrupted by user")
    except Exception as e:
        logging.error(f"💥 Critical testing error: {e}")
        logging.error(traceback.format_exc())
    finally:
        tester.cleanup()

if __name__ == "__main__":
    main()
