#!/usr/bin/env python3

"""
ENHANCED REAL USER TESTING WITH NATURAL MOUSE MOVEMENTS
========================================================

This enhanced framework behaves EXACTLY like a real user:
- Natural mouse movements with curves and momentum
- Human-like pauses and decision making
- Real scrolling behavior with inertia
- Proper focus and attention patterns
- Detailed debugging of auth token issues

FIXES TOKEN EXPIRATION ISSUES BY TESTING LIKE REAL USER
"""

import os
import sys
import time
import random
import logging
import subprocess
import threading
import json
import math
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

# Auto-install dependencies
def quick_install():
    packages = ['selenium', 'webdriver-manager']
    for pkg in packages:
        try:
            __import__(pkg.replace('-', '_'))
        except ImportError:
            os.system(f"pip3 install --user {pkg} > /dev/null 2>&1")

quick_install()

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from webdriver_manager.chrome import ChromeDriverManager

class RealMouseMovements:
    """Simulates natural human mouse movements with curves and momentum"""
    
    @staticmethod
    def calculate_bezier_curve(start: Tuple[float, float], end: Tuple[float, float], 
                              control1: Tuple[float, float], control2: Tuple[float, float], 
                              steps: int = 20) -> List[Tuple[int, int]]:
        """Calculate bezier curve points for natural mouse movement"""
        points = []
        for i in range(steps + 1):
            t = i / steps
            # Cubic Bezier curve formula
            x = (1-t)**3 * start[0] + 3*(1-t)**2*t * control1[0] + 3*(1-t)*t**2 * control2[0] + t**3 * end[0]
            y = (1-t)**3 * start[1] + 3*(1-t)**2*t * control1[1] + 3*(1-t)*t**2 * control2[1] + t**3 * end[1]
            points.append((int(x), int(y)))
        return points
    
    @staticmethod
    def human_mouse_path(driver, start_x: int, start_y: int, target_x: int, target_y: int) -> List[Tuple[int, int]]:
        """Generate human-like mouse movement path with natural curves"""
        distance = math.sqrt((target_x - start_x)**2 + (target_y - start_y)**2)
        
        # Add natural curve control points
        mid_x = (start_x + target_x) / 2
        mid_y = (start_y + target_y) / 2
        
        # Add random curve deviation (more curve for longer distances)
        curve_strength = min(distance * 0.2, 50)
        
        # Perpendicular offset for curve
        dx = target_x - start_x
        dy = target_y - start_y
        perp_x = -dy / (distance + 0.01)  # Avoid division by zero
        perp_y = dx / (distance + 0.01)
        
        offset_x = perp_x * curve_strength * random.uniform(-0.5, 0.5)
        offset_y = perp_y * curve_strength * random.uniform(-0.5, 0.5)
        
        control1 = (start_x + dx/3 + offset_x, start_y + dy/3 + offset_y)
        control2 = (start_x + 2*dx/3 - offset_x, start_y + 2*dy/3 - offset_y)
        
        steps = max(10, int(distance / 10))  # More steps for longer distances
        
        return RealMouseMovements.calculate_bezier_curve(
            (start_x, start_y), (target_x, target_y), control1, control2, steps
        )

class EnhancedRealUserTester:
    """Enhanced testing with natural user behaviors and token debugging"""
    
    def __init__(self, base_url: str = "http://localhost:3000"):
        self.base_url = base_url
        self.driver = None
        self.actions = None
        self.issues = []
        self.successes = []
        self.console_logs = []
        self.network_logs = []
        self.docker_logs = []
        self.session_tokens = {}
        
        # Real user speeds and behaviors
        self.typing_speed = 0.015  # 70+ WPM like power user
        self.mouse_speed = 0.8     # Natural mouse movement speed
        self.decision_time = (0.5, 2.0)  # Real thinking time range
        
        # Setup logging
        logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
        self.logger = logging.getLogger(__name__)
        
        # Start Docker log monitoring
        self.start_docker_monitoring()
        
        print("🎯 ENHANCED REAL USER TESTING WITH NATURAL MOUSE MOVEMENTS")
        print("⚡ 70+ WPM typing, curved mouse paths, human decision patterns")
        print("🔍 Advanced token debugging and session management testing")
    
    def start_docker_monitoring(self):
        """Monitor Docker logs for auth and session issues"""
        def monitor_docker():
            try:
                process = subprocess.Popen(
                    ['docker-compose', 'logs', '-f', '--tail', '100'],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    universal_newlines=True,
                    cwd='/Users/igdclt0379/Downloads/QuizMaster-Pro'
                )
                
                while True:
                    line = process.stdout.readline()
                    if line:
                        self.docker_logs.append({
                            'timestamp': datetime.now().isoformat(),
                            'log': line.strip()
                        })
                        
                        # Check for auth/token related errors
                        auth_keywords = ['token', 'auth', 'session', 'unauthorized', '401', 'jwt', 'login', 'expire']
                        if any(keyword in line.lower() for keyword in auth_keywords):
                            self.log_issue("HIGH", "Authentication", f"Auth-related log: {line.strip()}")
                    
            except Exception as e:
                self.logger.error(f"Docker monitoring failed: {e}")
        
        thread = threading.Thread(target=monitor_docker, daemon=True)
        thread.start()
        print("🐳 Enhanced Docker monitoring for auth issues started")
    
    def setup_enhanced_browser(self):
        """Setup browser with real user characteristics"""
        options = Options()
        
        # Real user browser settings
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1366,768")  # Common real user resolution
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)
        
        # Add real user headers
        options.add_argument("--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36")
        
        service = Service(ChromeDriverManager().install())
        self.driver = webdriver.Chrome(service=service, options=options)
        self.actions = ActionChains(self.driver)
        
        # Remove automation detection
        self.driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        self.driver.execute_script("Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]})")
        
        # Timeouts for real user patience
        self.driver.implicitly_wait(3)
        self.driver.set_page_load_timeout(20)
        
        print("🖥️ Enhanced browser with real user characteristics setup complete")
    
    def log_issue(self, severity: str, component: str, description: str, screenshot: str = ""):
        """Enhanced issue logging with token debugging"""
        issue = {
            'severity': severity,
            'component': component,
            'description': description,
            'screenshot': screenshot,
            'timestamp': datetime.now().isoformat(),
            'session_data': self.get_session_debug_info(),
            'console_logs': self.get_recent_console_logs(),
            'network_errors': self.get_network_errors()
        }
        self.issues.append(issue)
        print(f"❌ {severity} - {component}: {description}")
    
    def log_success(self, component: str, description: str):
        """Log successful operations"""
        self.successes.append({
            'component': component,
            'description': description,
            'timestamp': datetime.now().isoformat()
        })
        print(f"✅ {component}: {description}")
    
    def get_session_debug_info(self):
        """Capture current session and token information"""
        try:
            # Get localStorage tokens
            local_storage = self.driver.execute_script("return window.localStorage;")
            session_storage = self.driver.execute_script("return window.sessionStorage;") 
            
            # Get cookies
            cookies = self.driver.get_cookies()
            
            # Check for common auth tokens
            auth_info = {
                'localStorage': local_storage,
                'sessionStorage': session_storage, 
                'cookies': cookies,
                'current_url': self.driver.current_url,
                'page_title': self.driver.title
            }
            
            return auth_info
        except Exception as e:
            return {'error': str(e)}
    
    def natural_mouse_move_to_element(self, element, description: str = "element"):
        """Move mouse naturally to element with bezier curves"""
        try:
            # Get current mouse position (approximate)
            current_pos = (random.randint(100, 800), random.randint(100, 600))
            
            # Get target element position
            location = element.location_once_scrolled_into_view
            size = element.size
            
            # Target center with slight randomization
            target_x = location['x'] + size['width'] // 2 + random.randint(-10, 10)
            target_y = location['y'] + size['height'] // 2 + random.randint(-5, 5)
            
            # Generate natural mouse path
            path = RealMouseMovements.human_mouse_path(
                self.driver, current_pos[0], current_pos[1], target_x, target_y
            )
            
            # Execute natural mouse movement
            print(f"🖱️ Natural mouse movement to {description}...")
            
            for i, (x, y) in enumerate(path):
                # Natural movement speed variation
                speed_variation = random.uniform(0.8, 1.2)
                delay = (0.005 + (i * 0.001)) * speed_variation
                
                try:
                    # Move to point (using action chains for smooth movement)
                    self.actions.move_by_offset(x - current_pos[0], y - current_pos[1]).perform()
                    current_pos = (x, y)
                    time.sleep(delay)
                except:
                    continue
            
            # Final positioning on element
            self.actions.move_to_element(element).perform()
            
            # Natural pause before click (human recognition time)
            human_pause = random.uniform(0.2, 0.8)
            time.sleep(human_pause)
            
            return True
            
        except Exception as e:
            self.log_issue("MEDIUM", "Mouse Movement", f"Failed natural mouse movement to {description}: {str(e)}")
            return False
    
    def human_click_with_natural_mouse(self, element, description: str = "element"):
        """Click element with natural mouse movement and timing"""
        try:
            print(f"👆 Clicking {description} with natural mouse movement...")
            
            # Natural mouse movement to element
            if not self.natural_mouse_move_to_element(element, description):
                # Fallback to direct movement
                self.actions.move_to_element(element).perform()
                time.sleep(0.3)
            
            # Pre-click micro-pause (real users don't click instantly)
            time.sleep(random.uniform(0.1, 0.3))
            
            # Natural click with slight position variance
            offset_x = random.randint(-3, 3)
            offset_y = random.randint(-2, 2)
            
            self.actions.move_to_element_with_offset(element, offset_x, offset_y).click().perform()
            
            # Post-click pause (human reaction time)
            time.sleep(random.uniform(0.3, 0.7))
            
            self.log_success("User Interaction", f"Successfully clicked {description}")
            return True
            
        except Exception as e:
            self.log_issue("HIGH", "Click Action", f"Failed to click {description}: {str(e)}")
            return False
    
    def natural_typing_with_corrections(self, element, text: str, description: str = "field"):
        """Type text with natural human patterns including corrections"""
        try:
            print(f"⌨️ Natural typing '{text}' into {description}...")
            
            # Click to focus element with natural mouse movement
            self.human_click_with_natural_mouse(element, f"{description} input")
            
            # Clear existing content
            element.clear()
            
            # Natural typing with variations
            for i, char in enumerate(text):
                # Variable typing speed (humans aren't perfectly consistent)
                if i < 3:  # Slower start as humans locate keys
                    speed = self.typing_speed * random.uniform(1.5, 2.0)
                elif i > len(text) - 3:  # Slower end as humans double-check
                    speed = self.typing_speed * random.uniform(1.2, 1.5)
                else:  # Normal speed in middle
                    speed = self.typing_speed * random.uniform(0.8, 1.2)
                
                element.send_keys(char)
                time.sleep(speed)
                
                # Occasional natural corrections (humans make typos)
                if random.random() < 0.03 and i > 2:  # 3% chance after a few chars
                    print("  💭 Making natural typing correction...")
                    element.send_keys(Keys.BACK_SPACE)
                    time.sleep(random.uniform(0.1, 0.3))
                    element.send_keys(char)
                    time.sleep(speed)
                
                # Occasional natural pauses (humans think)
                if random.random() < 0.08:  # 8% chance of brief pause
                    time.sleep(random.uniform(0.2, 0.6))
            
            # Verify typing accuracy
            actual_value = element.get_attribute('value')
            if actual_value == text:
                self.log_success("Text Input", f"Accurately typed '{text}' into {description}")
            else:
                self.log_issue("MEDIUM", "Text Input", f"Typed '{text}' but got '{actual_value}' in {description}")
            
            # Natural post-typing pause (humans review what they typed)
            time.sleep(random.uniform(0.5, 1.2))
            
            return True
            
        except Exception as e:
            self.log_issue("HIGH", "Text Input", f"Failed to type in {description}: {str(e)}")
            return False
    
    def natural_scroll_behavior(self, pixels: int):
        """Scroll with natural human inertia and momentum"""
        try:
            print(f"📜 Natural scrolling {pixels} pixels...")
            
            # Humans scroll in bursts, not smoothly
            remaining = abs(pixels)
            direction = 1 if pixels > 0 else -1
            
            while remaining > 0:
                # Natural scroll burst size
                burst_size = min(remaining, random.randint(100, 300))
                scroll_amount = burst_size * direction
                
                self.driver.execute_script(f"window.scrollBy(0, {scroll_amount});")
                
                # Natural pause between scroll bursts
                time.sleep(random.uniform(0.1, 0.4))
                
                remaining -= burst_size
            
            # Post-scroll pause (humans assess new content)
            time.sleep(random.uniform(0.8, 1.5))
            
        except Exception as e:
            self.log_issue("LOW", "Scrolling", f"Scroll behavior error: {str(e)}")
    
    def enhanced_navigate(self, url: str, description: str = "page"):
        """Navigate with real user timing and session debugging"""
        full_url = url if url.startswith('http') else f"{self.base_url}{url}"
        print(f"🌐 Navigating to {url} ({description})")
        
        # Pre-navigation session check
        pre_session = self.get_session_debug_info()
        
        start_time = time.time()
        self.driver.get(full_url)
        
        # Wait for page load like real user
        WebDriverWait(self.driver, 10).until(
            lambda d: d.execute_script("return document.readyState") == "complete"
        )
        
        load_time = time.time() - start_time
        
        # Post-navigation session check
        post_session = self.get_session_debug_info()
        
        # Check for session/token changes
        self.analyze_session_changes(pre_session, post_session, description)
        
        # Natural page assessment time (humans scan content)
        assessment_time = random.uniform(1.5, 3.0)
        print(f"👀 Naturally assessing {description} for {assessment_time:.1f}s...")
        time.sleep(assessment_time)
        
        # Capture logs
        self.get_console_logs()
        
        if load_time > 5:
            self.log_issue("MEDIUM", "Performance", f"Slow page load: {load_time:.2f}s for {description}")
        
        return True
    
    def analyze_session_changes(self, pre_session: dict, post_session: dict, page_context: str):
        """Analyze session/token changes during navigation"""
        try:
            pre_tokens = pre_session.get('localStorage', {})
            post_tokens = post_session.get('localStorage', {})
            
            # Check for token changes
            if pre_tokens != post_tokens:
                print(f"🔍 Session tokens changed during {page_context} navigation")
                
                # Look for auth tokens specifically
                auth_keys = ['token', 'accessToken', 'authToken', 'jwt', 'session']
                for key in auth_keys:
                    if key in pre_tokens and key not in post_tokens:
                        self.log_issue("HIGH", "Session Management", f"Auth token '{key}' lost during {page_context} navigation")
                    elif key not in pre_tokens and key in post_tokens:
                        self.log_success("Session Management", f"Auth token '{key}' acquired during {page_context}")
                    elif key in both and pre_tokens[key] != post_tokens[key]:
                        print(f"🔄 Auth token '{key}' changed during {page_context}")
                        
        except Exception as e:
            print(f"Session analysis error: {e}")
    
    def get_console_logs(self):
        """Enhanced console log capture with auth focus"""
        try:
            logs = self.driver.get_log('browser')
            
            for log in logs:
                log_entry = {
                    'level': log.get('level', 'INFO'),
                    'message': log.get('message', ''),
                    'timestamp': log.get('timestamp', 0)
                }
                self.console_logs.append(log_entry)
                
                # Check for auth-related errors
                auth_keywords = ['token', 'unauthorized', '401', 'login', 'auth', 'session', 'expire']
                if any(keyword in log['message'].lower() for keyword in auth_keywords):
                    if log.get('level') in ['SEVERE', 'WARNING']:
                        self.log_issue("HIGH", "Auth Console Error", f"Auth-related: {log['message'][:200]}")
            
            return self.console_logs[-20:]
        except:
            return []
    
    def get_recent_console_logs(self):
        """Get recent console logs for debugging"""
        return self.console_logs[-10:] if len(self.console_logs) > 10 else self.console_logs
    
    def get_network_errors(self):
        """Placeholder for network error detection"""
        return []
    
    def enhanced_find_element(self, selector: str, timeout: int = 5, description: str = "element"):
        """Enhanced element finding with natural scanning behavior"""
        print(f"🔍 Looking for {description}...")
        
        # Humans scan the page before interacting
        time.sleep(random.uniform(0.5, 1.2))
        
        strategies = [
            (By.CSS_SELECTOR, selector),
            (By.ID, selector.replace('#', '') if '#' in selector else selector),
            (By.NAME, selector),
            (By.CLASS_NAME, selector.replace('.', '') if '.' in selector else selector)
        ]
        
        for by, value in strategies:
            try:
                element = WebDriverWait(self.driver, timeout).until(
                    EC.element_to_be_clickable((by, value))
                )
                print(f"✅ Found {description}")
                return element
            except:
                continue
        
        # Try finding by text content
        try:
            xpath_text = f"//*[contains(text(), '{selector}')]"
            element = self.driver.find_element(By.XPATH, xpath_text)
            if element.is_displayed():
                print(f"✅ Found {description} by text")
                return element
        except:
            pass
        
        print(f"❌ Could not find {description}")
        return None
    
    def test_registration_with_session_debugging(self):
        """Enhanced registration testing with session tracking"""
        print("\n🔐 ENHANCED REGISTRATION TESTING WITH SESSION DEBUG")
        
        test_user = {
            "email": f"realuser{random.randint(1000,9999)}@test.com",
            "username": f"RealUser{random.randint(1000,9999)}",
            "password": "RealPass123!",
            "firstName": "Real",
            "lastName": "User"
        }
        
        print(f"👤 Creating account for {test_user['username']}")
        
        # Navigate to registration
        self.enhanced_navigate("/auth/register", "registration page")
        
        # Pre-registration session state
        pre_reg_session = self.get_session_debug_info()
        
        # Fill form with natural behavior
        email_field = self.enhanced_find_element("input[name='email']", description="email field")
        if email_field:
            self.natural_typing_with_corrections(email_field, test_user['email'], "email")
        else:
            self.log_issue("CRITICAL", "Registration Form", "Email field not found")
            return False
        
        username_field = self.enhanced_find_element("input[name='username']", description="username field")
        if username_field:
            self.natural_typing_with_corrections(username_field, test_user['username'], "username")
        
        password_field = self.enhanced_find_element("input[type='password']", description="password field")
        if password_field:
            self.natural_typing_with_corrections(password_field, test_user['password'], "password")
        
        # Optional fields
        firstname_field = self.enhanced_find_element("input[name='firstName']", timeout=2, description="first name")
        if firstname_field:
            self.natural_typing_with_corrections(firstname_field, test_user['firstName'], "first name")
        
        lastname_field = self.enhanced_find_element("input[name='lastName']", timeout=2, description="last name")
        if lastname_field:
            self.natural_typing_with_corrections(lastname_field, test_user['lastName'], "last name")
        
        # Submit registration
        print("📋 Submitting registration...")
        submit_btn = self.enhanced_find_element("button[type='submit']", description="registration submit")
        if submit_btn:
            self.human_click_with_natural_mouse(submit_btn, "registration submit button")
            
            # Wait for response with real user patience
            print("⏳ Waiting for registration response...")
            time.sleep(5)
            
            # Post-registration session analysis
            post_reg_session = self.get_session_debug_info()
            self.analyze_session_changes(pre_reg_session, post_reg_session, "registration")
            
            # Check for success indicators
            page_text = self.driver.find_element(By.TAG_NAME, "body").text.lower()
            current_url = self.driver.current_url
            
            if any(indicator in page_text for indicator in ['success', 'welcome', 'created', 'registered']):
                self.log_success("Registration", f"Successfully registered {test_user['username']}")
                return test_user
            elif "error" in page_text or "fail" in page_text:
                self.log_issue("HIGH", "Registration", f"Registration failed for {test_user['username']}: error in page")
            elif current_url != f"{self.base_url}/auth/register":  # Redirect indicates success
                self.log_success("Registration", f"Registration appears successful - redirected from form")
                return test_user
            else:
                self.log_issue("HIGH", "Registration", f"Unclear registration result for {test_user['username']}")
        
        return False
    
    def test_login_with_token_debugging(self, user_info: dict):
        """Enhanced login testing with detailed token tracking"""
        print(f"\n🔑 ENHANCED LOGIN TESTING FOR {user_info['username']}")
        
        # Navigate to login
        self.enhanced_navigate("/auth/login", "login page")
        
        # Pre-login session state
        pre_login_session = self.get_session_debug_info()
        print("📋 Pre-login session state captured")
        
        # Fill login form
        email_field = self.enhanced_find_element("input[name='email']", description="login email")
        if email_field:
            self.natural_typing_with_corrections(email_field, user_info['email'], "login email")
        else:
            self.log_issue("CRITICAL", "Login Form", "Email field not found")
            return False
        
        password_field = self.enhanced_find_element("input[type='password']", description="login password")
        if password_field:
            self.natural_typing_with_corrections(password_field, user_info['password'], "login password")
        
        # Submit login
        print("🔐 Submitting login...")
        login_btn = self.enhanced_find_element("button[type='submit']", description="login submit")
        if login_btn:
            self.human_click_with_natural_mouse(login_btn, "login submit button")
            
            # Wait for login processing
            print("⏳ Waiting for login authentication...")
            time.sleep(4)
            
            # Post-login session analysis
            post_login_session = self.get_session_debug_info()
            
            # Detailed session comparison
            print("🔍 Analyzing login session changes...")
            self.analyze_detailed_session_changes(pre_login_session, post_login_session)
            
            # Check login success
            current_url = self.driver.current_url
            page_text = self.driver.find_element(By.TAG_NAME, "body").text.lower()
            
            if "login" not in current_url and "auth" not in current_url:
                self.log_success("Login", f"Successfully logged in {user_info['username']} - redirected from login")
                return True
            elif any(indicator in page_text for indicator in ['welcome', 'dashboard', 'profile']):
                self.log_success("Login", f"Login successful - welcome message detected")
                return True
            elif any(error in page_text for error in ['invalid', 'incorrect', 'failed', 'error']):
                self.log_issue("HIGH", "Login", f"Login failed - error message in page")
                return False
            else:
                self.log_issue("HIGH", "Login", f"Login result unclear for {user_info['username']}")
                return False
        
        return False
    
    def analyze_detailed_session_changes(self, pre: dict, post: dict):
        """Detailed analysis of session changes during login"""
        try:
            print("📊 Session Change Analysis:")
            
            # localStorage analysis
            pre_ls = pre.get('localStorage', {})
            post_ls = post.get('localStorage', {})
            
            print(f"  📝 localStorage before: {len(pre_ls)} items")
            print(f"  📝 localStorage after: {len(post_ls)} items")
            
            # Look for auth tokens
            auth_patterns = ['token', 'access', 'jwt', 'auth', 'session', 'user']
            for pattern in auth_patterns:
                pre_matches = [k for k in pre_ls.keys() if pattern in k.lower()]
                post_matches = [k for k in post_ls.keys() if pattern in k.lower()]
                
                if pre_matches != post_matches:
                    print(f"  🔄 {pattern.upper()} keys changed: {pre_matches} → {post_matches}")
                    
                for key in post_matches:
                    if key not in pre_matches:
                        print(f"  ✅ New {pattern} token: {key}")
                        self.log_success("Token Management", f"Auth token '{key}' created during login")
            
            # Cookie analysis
            pre_cookies = {c['name']: c['value'] for c in pre.get('cookies', [])}
            post_cookies = {c['name']: c['value'] for c in post.get('cookies', [])}
            
            new_cookies = set(post_cookies.keys()) - set(pre_cookies.keys())
            if new_cookies:
                print(f"  🍪 New cookies: {list(new_cookies)}")
            
            # URL analysis
            if pre.get('current_url') != post.get('current_url'):
                print(f"  🌐 URL changed: {pre.get('current_url')} → {post.get('current_url')}")
            
        except Exception as e:
            print(f"Session analysis error: {e}")
    
    def test_authenticated_features_access(self):
        """Test access to features that require authentication"""
        print("\n🎯 TESTING AUTHENTICATED FEATURES ACCESS")
        
        # Test dashboard access
        print("🏠 Testing dashboard access...")
        self.enhanced_navigate("/dashboard", "dashboard")
        
        # Look for auth-required content
        page_text = self.driver.find_element(By.TAG_NAME, "body").text.lower()
        
        if any(indicator in page_text for indicator in ['welcome', 'stats', 'quiz', 'play']):
            self.log_success("Dashboard Access", "Dashboard loads with authenticated content")
        elif any(error in page_text for error in ['login', 'sign in', 'unauthorized']):
            self.log_issue("CRITICAL", "Dashboard Access", "Dashboard redirects to login - auth not working")
        else:
            self.log_issue("HIGH", "Dashboard Access", "Dashboard content unclear")
        
        # Test quiz access
        print("🎮 Testing quiz functionality access...")
        
        # Look for quiz-related buttons or links
        quiz_elements = []
        
        # Try multiple approaches to find quiz functionality
        quiz_selectors = [
            "button[class*='quiz']", "a[href*='quiz']", "button:contains('Quiz')",
            "button:contains('Play')", "button:contains('Start')", "[data-testid*='quiz']"
        ]
        
        for selector in quiz_selectors:
            try:
                if "contains" in selector:
                    # Handle text-based selectors
                    text_elements = self.driver.find_elements(By.XPATH, f"//*[contains(text(), 'Quiz') or contains(text(), 'Play') or contains(text(), 'Start')]")
                    quiz_elements.extend(text_elements)
                else:
                    elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                    quiz_elements.extend(elements)
            except:
                continue
        
        # Filter for visible elements
        visible_quiz_elements = [elem for elem in quiz_elements if elem.is_displayed()]
        
        if visible_quiz_elements:
            self.log_success("Quiz Access", f"Found {len(visible_quiz_elements)} quiz-related interactive elements")
            
            # Try to interact with first quiz element
            first_quiz_elem = visible_quiz_elements[0]
            if self.human_click_with_natural_mouse(first_quiz_elem, "quiz functionality"):
                time.sleep(3)
                
                # Check if quiz loaded
                quiz_page_text = self.driver.find_element(By.TAG_NAME, "body").text.lower()
                if any(indicator in quiz_page_text for indicator in ['question', 'category', 'answer', 'option']):
                    self.log_success("Quiz Functionality", "Quiz interface loaded successfully")
                else:
                    self.log_issue("HIGH", "Quiz Functionality", "Quiz click didn't lead to quiz interface")
        else:
            self.log_issue("CRITICAL", "Quiz Access", "No visible quiz functionality found on dashboard")
    
    def run_enhanced_comprehensive_test(self):
        """Run the complete enhanced test suite"""
        self.setup_enhanced_browser()
        
        try:
            print("🚀 STARTING ENHANCED COMPREHENSIVE REAL USER TESTING")
            print("=" * 80)
            
            start_time = time.time()
            
            # Phase 1: Registration with session debugging
            user_info = self.test_registration_with_session_debugging()
            
            if user_info:
                # Phase 2: Login with token debugging
                login_success = self.test_login_with_token_debugging(user_info)
                
                if login_success:
                    # Phase 3: Test authenticated features
                    self.test_authenticated_features_access()
                else:
                    self.log_issue("CRITICAL", "Authentication Flow", "Cannot test authenticated features - login failed")
            else:
                self.log_issue("CRITICAL", "User Registration", "Cannot test login/features - registration failed")
            
            total_time = time.time() - start_time
            
            # Generate enhanced report
            self.generate_enhanced_report(total_time)
            
        except Exception as e:
            self.log_issue("CRITICAL", "Testing Framework", f"Critical testing error: {str(e)}")
            print(f"💥 Critical error: {e}")
            import traceback
            traceback.print_exc()
            
        finally:
            if self.driver:
                self.driver.quit()
    
    def generate_enhanced_report(self, test_duration: float):
        """Generate comprehensive enhanced test report"""
        print(f"\n📊 ENHANCED COMPREHENSIVE TEST REPORT")
        print("=" * 100)
        print(f"⚡ Test Duration: {test_duration:.2f} seconds")
        print(f"🎯 Total Issues Found: {len(self.issues)}")
        print(f"✅ Total Features Working: {len(self.successes)}")
        
        # Categorize issues
        critical = [i for i in self.issues if i['severity'] == 'CRITICAL']
        high = [i for i in self.issues if i['severity'] == 'HIGH']
        medium = [i for i in self.issues if i['severity'] == 'MEDIUM']
        
        print(f"\n🚨 DETAILED ISSUE BREAKDOWN:")
        print(f"🔴 CRITICAL (App Blocking): {len(critical)}")
        print(f"🟠 HIGH (User Experience): {len(high)}")
        print(f"🟡 MEDIUM (Minor Issues): {len(medium)}")
        
        # Show critical and high issues with session debug info
        if critical or high:
            print(f"\n💥 DETAILED ISSUE ANALYSIS:")
            print("-" * 80)
            
            for issue in (critical + high)[:5]:  # Show top 5 most critical
                print(f"\n{issue['severity']} - {issue['component']}")
                print(f"  🔍 Issue: {issue['description']}")
                print(f"  📅 Time: {issue['timestamp']}")
                
                # Show session debugging info
                session_data = issue.get('session_data', {})
                if session_data and not session_data.get('error'):
                    ls_items = len(session_data.get('localStorage', {}))
                    cookie_count = len(session_data.get('cookies', []))
                    print(f"  🔐 Session: {ls_items} localStorage items, {cookie_count} cookies")
                    print(f"  🌐 URL: {session_data.get('current_url', 'Unknown')}")
                
                # Show recent console errors
                console_logs = issue.get('console_logs', [])
                if console_logs:
                    print(f"  🖥️ Console Errors:")
                    for log in console_logs[-2:]:  # Last 2 logs
                        print(f"    {log.get('level', 'INFO')}: {log.get('message', '')[:100]}...")
        
        # Auth-specific analysis
        auth_issues = [i for i in self.issues if 'auth' in i['component'].lower() or 'login' in i['component'].lower() or 'session' in i['component'].lower()]
        
        if auth_issues:
            print(f"\n🔐 AUTHENTICATION ANALYSIS:")
            print(f"  📊 Total auth-related issues: {len(auth_issues)}")
            for auth_issue in auth_issues:
                print(f"    • {auth_issue['severity']}: {auth_issue['description']}")
        
        # Docker log analysis for auth issues
        auth_docker_logs = [log for log in self.docker_logs if any(
            keyword in log['log'].lower() for keyword in ['auth', 'token', 'login', '401', 'unauthorized']
        )]
        
        if auth_docker_logs:
            print(f"\n🐳 DOCKER AUTH LOGS ({len(auth_docker_logs)} relevant):")
            for log in auth_docker_logs[-3:]:  # Last 3 auth-related logs
                print(f"    {log['timestamp']}: {log['log'][:120]}")
        
        # Success summary
        print(f"\n✅ WORKING FEATURES:")
        success_components = {}
        for success in self.successes:
            comp = success['component']
            if comp not in success_components:
                success_components[comp] = []
            success_components[comp].append(success['description'])
        
        for component, features in success_components.items():
            print(f"  📦 {component}: {len(features)} features")
            for feature in features[:3]:  # Show first 3 features
                print(f"    ✓ {feature}")
        
        # Performance metrics
        print(f"\n⚡ PERFORMANCE & BEHAVIOR METRICS:")
        print(f"  🎯 Average action time: {test_duration / max(1, len(self.successes) + len(self.issues)):.2f}s")
        print(f"  🖥️ Console logs captured: {len(self.console_logs)}")
        print(f"  🐳 Docker logs monitored: {len(self.docker_logs)}")
        print(f"  🖱️ Natural mouse movements: Enabled")
        print(f"  ⌨️ Human typing patterns: 70+ WPM with corrections")
        
        # Final assessment with specific recommendations
        success_rate = len(self.successes) / max(1, len(self.successes) + len(self.issues)) * 100
        
        print(f"\n🎯 FINAL ASSESSMENT & RECOMMENDATIONS:")
        print(f"  📊 Success Rate: {success_rate:.1f}%")
        
        if len(critical) == 0 and len(high) <= 2:
            print("  🎉 EXCELLENT: Application is mostly functional!")
            print("  💡 Recommendation: Address remaining medium issues and deploy")
        elif len(critical) <= 1 and len(high) <= 3:
            print("  ⚠️ GOOD: Application needs minor fixes")
            print("  💡 Recommendation: Fix critical/high issues, then deploy")
        elif len(critical) <= 3:
            print("  🚨 NEEDS WORK: Application has significant issues")
            print("  💡 Recommendation: Fix authentication/session management first")
        else:
            print("  🆘 MAJOR ISSUES: Application needs substantial work")
            print("  💡 Recommendation: Focus on critical authentication and user flow issues")
        
        # Specific next steps
        print(f"\n📋 IMMEDIATE ACTION ITEMS:")
        if auth_issues:
            print("  1. 🔐 Fix authentication/session management (highest priority)")
            print("     • Check token storage in localStorage/sessionStorage")
            print("     • Verify API calls include auth headers")
            print("     • Test cross-origin authentication between ports")
        
        quiz_issues = [i for i in self.issues if 'quiz' in i['component'].lower()]
        if quiz_issues:
            print("  2. 🎮 Fix quiz functionality")
            print("     • Ensure quiz questions have answer options")
            print("     • Verify database seeding with quiz data")
        
        if [i for i in self.issues if 'registration' in i['component'].lower()]:
            print("  3. 📝 Improve user feedback systems")
            print("     • Add clear success/error messages")
            print("     • Implement proper loading states")
        
        # Save detailed report
        report_filename = f"enhanced_real_user_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        detailed_report = {
            'test_duration': test_duration,
            'testing_approach': 'Enhanced Real User with Natural Mouse Movements',
            'issues': self.issues,
            'successes': self.successes,
            'console_logs': self.console_logs[-100:],  # Last 100 console logs
            'docker_logs': self.docker_logs[-200:],   # Last 200 docker logs
            'session_analysis': 'Enhanced token and session debugging enabled',
            'summary': {
                'critical_issues': len(critical),
                'high_issues': len(high),
                'medium_issues': len(medium),
                'success_rate': success_rate,
                'auth_issues': len(auth_issues)
            },
            'recommendations': [
                "Fix authentication/session management system",
                "Implement proper quiz question/answer rendering",
                "Add clear user feedback and error messaging",
                "Test cross-origin authentication between services"
            ]
        }
        
        with open(report_filename, 'w') as f:
            json.dump(detailed_report, f, indent=2)
        
        print(f"\n📄 Detailed report saved: {report_filename}")
        print("=" * 100)

def main():
    """Run enhanced comprehensive testing with natural user behavior"""
    print("🎯 ENHANCED REAL USER TESTING WITH NATURAL MOUSE MOVEMENTS")
    print("=" * 70)
    print("🖱️ Curved mouse paths with momentum")
    print("⌨️ 70+ WPM typing with natural corrections")
    print("🧠 Human decision-making patterns and pauses")
    print("🔍 Advanced session and token debugging")
    print("🐳 Real-time Docker log monitoring for auth issues")
    print()
    print("🚀 Testing like a REAL power user to identify all issues...")
    print("=" * 70)
    
    tester = EnhancedRealUserTester()
    tester.run_enhanced_comprehensive_test()

if __name__ == "__main__":
    main()
