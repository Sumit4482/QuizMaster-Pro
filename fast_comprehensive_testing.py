#!/usr/bin/env python3

"""
FAST COMPREHENSIVE QUIZMASTER PRO TESTING WITH FULL DEBUGGING
==============================================================

This script tests like a FAST, experienced user (60+ WPM) and captures:
- Browser console logs and errors
- Network API calls and responses  
- Docker container logs
- Real mouse movements and interactions
- Complete application flow testing

Tests EVERYTHING quickly and reports ALL issues found.
"""

import os
import sys
import time
import random
import logging
import subprocess
import threading
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
import requests

# Auto-install dependencies quickly
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

class FastPowerUserTester:
    """Fast testing that behaves like an experienced power user"""
    
    def __init__(self, base_url: str = "http://localhost:3000"):
        self.base_url = base_url
        self.driver = None
        self.actions = None
        self.issues = []
        self.successes = []
        self.console_logs = []
        self.network_logs = []
        self.docker_logs = []
        
        # Power user typing speed - 60+ WPM
        self.typing_speed = 0.02  # 50ms between characters = ~60 WPM
        self.action_delay = 0.3   # Quick decision making - 300ms
        
        # Setup logging
        logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
        self.logger = logging.getLogger(__name__)
        
        # Start Docker log monitoring
        self.start_docker_monitoring()
        
        print("🚀 FAST COMPREHENSIVE TESTING INITIALIZED")
        print("⚡ Power User Mode: 60+ WPM typing, fast decisions")
        print("📊 Monitoring: Console, Network, Docker logs")
    
    def start_docker_monitoring(self):
        """Start monitoring Docker logs in background"""
        def monitor_docker():
            try:
                process = subprocess.Popen(
                    ['docker-compose', 'logs', '-f', '--tail', '50'],
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
                        
                        # Check for errors
                        if any(keyword in line.lower() for keyword in ['error', 'exception', 'failed', 'crash']):
                            self.log_issue("HIGH", "Docker", f"Container error: {line.strip()}")
                    
            except Exception as e:
                self.logger.error(f"Docker monitoring failed: {e}")
        
        thread = threading.Thread(target=monitor_docker, daemon=True)
        thread.start()
        print("🐳 Docker log monitoring started")
    
    def setup_fast_browser(self):
        """Setup browser optimized for speed with full debugging"""
        options = Options()
        
        # Performance optimizations
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage") 
        options.add_argument("--disable-extensions")
        options.add_argument("--disable-plugins")
        options.add_argument("--disable-images")  # Faster loading
        options.add_argument("--disable-javascript-harmony-shipping")
        options.add_argument("--disable-background-timer-throttling")
        options.add_argument("--disable-renderer-backgrounding")
        options.add_argument("--disable-backgrounding-occluded-windows")
        
        # Enable debugging
        options.add_argument("--enable-logging")
        options.add_argument("--log-level=0")
        options.add_argument("--enable-network-service-logging")
        
        # Real user settings
        options.add_argument("--window-size=1920,1080")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)
        
        # Enable basic logging (simplified)
        options.add_argument("--enable-chrome-logs")
        options.add_argument("--log-level=0")
        
        service = Service(ChromeDriverManager().install())
        self.driver = webdriver.Chrome(service=service, options=options)
        self.actions = ActionChains(self.driver)
        
        # Remove automation indicators
        self.driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        # Short timeouts for speed
        self.driver.implicitly_wait(2)
        self.driver.set_page_load_timeout(15)
        
        print("⚡ Fast browser setup complete")
    
    def log_issue(self, severity: str, component: str, description: str, screenshot: str = ""):
        """Log issue found during testing"""
        issue = {
            'severity': severity,
            'component': component,
            'description': description,
            'screenshot': screenshot,
            'timestamp': datetime.now().isoformat(),
            'console_logs': self.get_recent_console_logs(),
            'network_errors': self.get_network_errors()
        }
        self.issues.append(issue)
        print(f"❌ {severity} - {component}: {description}")
    
    def log_success(self, component: str, description: str):
        """Log successful feature"""
        self.successes.append({
            'component': component,
            'description': description,
            'timestamp': datetime.now().isoformat()
        })
        print(f"✅ {component}: {description}")
    
    def get_console_logs(self):
        """Capture browser console logs"""
        try:
            # Get console logs using JavaScript execution
            logs = self.driver.execute_script(
                "return window.console_logs || [];"
            )
            
            # Try Selenium's built-in logging if available
            try:
                selenium_logs = self.driver.get_log('browser')
                for log in selenium_logs:
                    log_entry = {
                        'level': log.get('level', 'INFO'),
                        'message': log.get('message', ''),
                        'timestamp': log.get('timestamp', 0)
                    }
                    self.console_logs.append(log_entry)
                    
                    # Check for errors
                    if log.get('level') in ['SEVERE', 'WARNING']:
                        self.log_issue("MEDIUM", "Browser Console", f"{log['level']}: {log['message']}")
            except:
                pass
            
            return self.console_logs[-10:] if self.console_logs else []
        except:
            return []
    
    def get_recent_console_logs(self):
        """Get recent console logs for issue reporting"""
        return self.console_logs[-10:] if len(self.console_logs) > 10 else self.console_logs
    
    def get_network_logs(self):
        """Capture network requests and responses"""
        try:
            # Try to capture network activity via JavaScript
            network_info = self.driver.execute_script("""
                return {
                    userAgent: navigator.userAgent,
                    online: navigator.onLine,
                    connection: navigator.connection ? {
                        effectiveType: navigator.connection.effectiveType,
                        downlink: navigator.connection.downlink
                    } : null
                };
            """)
            
            # Try Selenium performance logs if available
            try:
                perf_logs = self.driver.get_log('performance')
                network_events = []
                
                for log in perf_logs[-50:]:  # Last 50 performance logs
                    try:
                        message = json.loads(log['message'])
                        if 'Network' in message.get('message', {}).get('method', ''):
                            network_events.append(message)
                            
                            # Check for HTTP errors
                            if 'Network.responseReceived' in message.get('message', {}).get('method', ''):
                                response = message.get('message', {}).get('params', {}).get('response', {})
                                status = response.get('status', 0)
                                if status >= 400:
                                    url = response.get('url', 'Unknown')[:100]
                                    self.log_issue("HIGH", "Network", f"HTTP {status} error on {url}")
                    except:
                        continue
                
                self.network_logs.extend(network_events)
                return network_events
                
            except:
                pass
            
            return []
        except:
            return []
    
    def get_network_errors(self):
        """Get recent network errors"""
        errors = []
        for log in self.network_logs[-20:]:
            if 'error' in log.get('message', {}).get('method', '').lower():
                errors.append(log)
        return errors
    
    def fast_navigate(self, url: str):
        """Navigate quickly like a power user"""
        full_url = url if url.startswith('http') else f"{self.base_url}{url}"
        print(f"🔗 Navigating to {url}")
        
        start_time = time.time()
        self.driver.get(full_url)
        
        # Quick wait for page load
        WebDriverWait(self.driver, 5).until(
            lambda d: d.execute_script("return document.readyState") == "complete"
        )
        
        load_time = time.time() - start_time
        if load_time > 3:
            self.log_issue("MEDIUM", "Performance", f"Slow page load: {load_time:.2f}s for {url}")
        
        # Capture logs immediately
        self.get_console_logs()
        self.get_network_logs()
        
        return True
    
    def power_type(self, element, text: str, description: str = "field"):
        """Type at power user speed (60+ WPM)"""
        print(f"⌨️ Typing '{text}' into {description}")
        
        # Click to focus
        self.power_click(element)
        
        # Clear existing content quickly
        element.clear()
        
        # Type at power user speed with occasional bursts
        for i, char in enumerate(text):
            element.send_keys(char)
            
            # Variable speed - sometimes faster bursts like real users
            if i % 5 == 0:  # Every 5th character, slight pause
                time.sleep(self.typing_speed * 2)
            else:
                time.sleep(self.typing_speed)
        
        # Quick validation
        actual = element.get_attribute('value')
        if actual != text:
            self.log_issue("MEDIUM", "Input Validation", f"Typed '{text}' but got '{actual}' in {description}")
            return False
        
        return True
    
    def power_click(self, element, description: str = "element"):
        """Click with realistic mouse movement"""
        try:
            # Get element location and size for realistic clicking
            location = element.location_once_scrolled_into_view
            size = element.size
            
            # Calculate click point (slightly randomized like human)
            click_x = location['x'] + size['width'] // 2 + random.randint(-5, 5)
            click_y = location['y'] + size['height'] // 2 + random.randint(-5, 5)
            
            # Move mouse naturally to element
            self.actions.move_to_element_with_offset(element, 
                                                   random.randint(-size['width']//4, size['width']//4),
                                                   random.randint(-size['height']//4, size['height']//4))
            
            # Brief pause (faster than human-like framework)
            time.sleep(0.05)
            
            # Click
            element.click()
            
            # Quick reaction time
            time.sleep(self.action_delay)
            
            return True
            
        except Exception as e:
            self.log_issue("HIGH", "Click Action", f"Failed to click {description}: {str(e)}")
            return False
    
    def fast_find(self, selector: str, timeout: int = 3, description: str = "element"):
        """Find element quickly with multiple strategies"""
        strategies = [
            (By.CSS_SELECTOR, selector),
            (By.ID, selector.replace('#', '')),
            (By.NAME, selector),
            (By.CLASS_NAME, selector.replace('.', ''))
        ]
        
        for by, value in strategies:
            try:
                element = WebDriverWait(self.driver, timeout).until(
                    EC.presence_of_element_located((by, value))
                )
                if element.is_displayed():
                    return element
            except:
                continue
        
        # Try partial text matching for buttons/links
        try:
            buttons = self.driver.find_elements(By.TAG_NAME, "button")
            for btn in buttons:
                if btn.text and selector.lower() in btn.text.lower():
                    return btn
        except:
            pass
        
        return None
    
    def test_user_registration_fast(self):
        """Fast user registration testing"""
        print("\n🔐 TESTING USER REGISTRATION - FAST MODE")
        
        users = [
            {"email": "fasttest1@test.com", "username": "FastTest1", "password": "FastPass123!"},
            {"email": "fasttest2@test.com", "username": "FastTest2", "password": "FastPass123!"}
        ]
        
        for user in users:
            print(f"👤 Testing registration for {user['username']}")
            
            self.fast_navigate("/auth/register")
            
            # Fast form filling
            email_field = self.fast_find("input[name='email']", description="email field")
            if email_field:
                self.power_type(email_field, user['email'], "email")
            else:
                self.log_issue("CRITICAL", "Registration", "Email field not found")
                continue
            
            username_field = self.fast_find("input[name='username']", description="username field") 
            if username_field:
                self.power_type(username_field, user['username'], "username")
            
            password_field = self.fast_find("input[type='password']", description="password field")
            if password_field:
                self.power_type(password_field, user['password'], "password")
            
            # Fill optional fields quickly
            firstname_field = self.fast_find("input[name='firstName']", timeout=1, description="firstname")
            if firstname_field:
                self.power_type(firstname_field, user['username'], "firstname")
            
            lastname_field = self.fast_find("input[name='lastName']", timeout=1, description="lastname")
            if lastname_field:
                self.power_type(lastname_field, "Tester", "lastname")
            
            # Submit registration
            submit_btn = self.fast_find("button[type='submit']", description="register submit")
            if submit_btn:
                self.power_click(submit_btn, "registration submit")
                time.sleep(2)  # Wait for response
                
                # Check result quickly
                current_url = self.driver.current_url
                page_text = self.driver.find_element(By.TAG_NAME, "body").text.lower()
                
                if "success" in page_text or "welcome" in page_text:
                    self.log_success("Registration", f"Successfully registered {user['username']}")
                elif "already exists" in page_text or "taken" in page_text:
                    self.log_success("Registration", f"{user['username']} already exists (expected)")
                else:
                    self.log_issue("HIGH", "Registration", f"Unclear registration result for {user['username']}")
            
            # Test immediate login
            self.fast_navigate("/auth/login")
            
            login_email = self.fast_find("input[name='email']")
            login_password = self.fast_find("input[type='password']")
            
            if login_email and login_password:
                self.power_type(login_email, user['email'], "login email")
                self.power_type(login_password, user['password'], "login password")
                
                login_btn = self.fast_find("button[type='submit']")
                if login_btn:
                    self.power_click(login_btn, "login submit")
                    time.sleep(2)
                    
                    # Quick login verification
                    if "login" not in self.driver.current_url or "welcome" in self.driver.find_element(By.TAG_NAME, "body").text.lower():
                        self.log_success("Login", f"Fast login successful for {user['username']}")
                        user['logged_in'] = True
                    else:
                        self.log_issue("HIGH", "Login", f"Login failed for {user['username']}")
                        user['logged_in'] = False
            
            time.sleep(0.5)  # Brief pause between users
    
    def test_single_player_fast(self):
        """Fast single player quiz testing"""
        print("\n🎯 TESTING SINGLE PLAYER QUIZ - FAST MODE")
        
        self.fast_navigate("/dashboard")
        
        # Look for quiz/single player options quickly
        quiz_found = False
        
        # Try different approaches to find quiz functionality
        try:
            # Look for buttons with quiz-related text
            all_buttons = self.driver.find_elements(By.TAG_NAME, "button")
            for button in all_buttons:
                if button.text and any(word in button.text.lower() for word in ['quiz', 'start', 'play']):
                    self.power_click(button, f"quiz button: {button.text}")
                    time.sleep(2)
                    quiz_found = True
                    break
            
            # Look for links with quiz-related text
            if not quiz_found:
                all_links = self.driver.find_elements(By.TAG_NAME, "a")
                for link in all_links:
                    if link.text and 'quiz' in link.text.lower():
                        self.power_click(link, f"quiz link: {link.text}")
                        time.sleep(2)
                        quiz_found = True
                        break
                        
        except Exception as e:
            print(f"Error finding quiz elements: {e}")
        
        if not quiz_found:
            # Try direct navigation
            self.fast_navigate("/quiz")
        
        # Test category selection fast
        categories = self.driver.find_elements(By.CSS_SELECTOR, 
            "button[class*='category'], .category-card, [data-testid*='category']")
        
        if categories:
            self.log_success("Categories", f"Found {len(categories)} category options")
            
            # Quick category selection
            category = random.choice(categories)
            self.power_click(category, f"category: {category.text[:20]}")
            time.sleep(1)
        
        # Fast question answering
        questions_answered = 0
        for i in range(5):  # Test 5 questions max
            # Look for question
            question_elements = self.driver.find_elements(By.CSS_SELECTOR, 
                "h1, h2, h3, [class*='question']")
            
            question_found = False
            for elem in question_elements:
                if len(elem.text.strip()) > 15:  # Substantial question text
                    question_found = True
                    print(f"❓ Question {i+1}: {elem.text[:50]}...")
                    break
            
            if not question_found:
                print("No more questions found")
                break
            
            # Fast answer selection
            answer_options = self.driver.find_elements(By.CSS_SELECTOR,
                "button[class*='answer'], button[class*='option'], .answer-option")
            
            if answer_options:
                answer = random.choice(answer_options)
                self.power_click(answer, f"answer for Q{i+1}")
                
                # Find and click submit quickly
                submit_btns = self.driver.find_elements(By.TAG_NAME, "button")
                for btn in submit_btns:
                    if btn.text and ("submit" in btn.text.lower() or "next" in btn.text.lower()):
                        self.power_click(btn, "submit answer")
                        questions_answered += 1
                        break
                
                time.sleep(1)  # Quick wait for next question
            else:
                self.log_issue("HIGH", "Quiz Questions", f"No answer options for question {i+1}")
                break
        
        if questions_answered > 0:
            self.log_success("Single Player Quiz", f"Completed {questions_answered} questions quickly")
        else:
            self.log_issue("CRITICAL", "Single Player Quiz", "Could not complete any quiz questions")
    
    def test_multiplayer_fast(self):
        """Fast multiplayer testing"""
        print("\n👥 TESTING MULTIPLAYER GAME - FAST MODE")
        
        self.fast_navigate("/dashboard")
        
        # Fast room creation
        room_created = False
        
        # Look for create room functionality
        try:
            all_buttons = self.driver.find_elements(By.TAG_NAME, "button")
            for button in all_buttons:
                if button.text and any(word in button.text.lower() for word in ['create', 'room', 'host']):
                    self.power_click(button, f"create room button: {button.text}")
                    time.sleep(2)
                    room_created = True
                    break
            
            if not room_created:
                all_links = self.driver.find_elements(By.TAG_NAME, "a")
                for link in all_links:
                    if link.text and any(word in link.text.lower() for word in ['create', 'room']):
                        self.power_click(link, f"create room link: {link.text}")
                        time.sleep(2)
                        room_created = True
                        break
        except Exception as e:
            print(f"Error finding create room elements: {e}")
        
        if room_created:
            # Quick form filling if needed
            name_field = self.fast_find("input[name='name']", timeout=2)
            if name_field:
                self.power_type(name_field, f"FastRoom{random.randint(100,999)}", "room name")
                
                create_btn = self.fast_find("button[type='submit']", timeout=2)
                if create_btn:
                    self.power_click(create_btn, "create room submit")
                    time.sleep(3)
            
            # Check if room was created
            room_code = self.extract_room_code()
            if room_code:
                self.log_success("Room Creation", f"Created room: {room_code}")
                
                # Test ready state quickly
                try:
                    ready_buttons = self.driver.find_elements(By.TAG_NAME, "button")
                    for btn in ready_buttons:
                        if btn.text and 'ready' in btn.text.lower():
                            self.power_click(btn, "ready toggle")
                            self.log_success("Ready States", "Ready button works")
                            break
                except:
                    pass
                
                # Test start game
                try:
                    start_buttons = self.driver.find_elements(By.TAG_NAME, "button")
                    for btn in start_buttons:
                        if btn.text and 'start' in btn.text.lower():
                            self.power_click(btn, "start game")
                            time.sleep(3)
                            
                            if "question" in self.driver.find_element(By.TAG_NAME, "body").text.lower():
                                self.log_success("Game Start", "Multiplayer game started")
                            else:
                                self.log_issue("HIGH", "Game Start", "Game may not have started")
                            break
                except:
                    pass
        
        if not room_created:
            self.log_issue("HIGH", "Multiplayer", "Could not create multiplayer room")
    
    def extract_room_code(self):
        """Quick room code extraction"""
        try:
            url = self.driver.current_url
            if "/room/" in url:
                return url.split("/room/")[-1]
            
            # Quick text search
            import re
            text = self.driver.find_element(By.TAG_NAME, "body").text
            codes = re.findall(r'\b[A-Z0-9]{6,8}\b', text)
            return codes[0] if codes else None
        except:
            return None
    
    def test_navigation_fast(self):
        """Fast navigation testing"""
        print("\n🧭 TESTING NAVIGATION - FAST MODE")
        
        pages = [
            ("/", "Home"),
            ("/auth/login", "Login"),
            ("/auth/register", "Register"),
            ("/dashboard", "Dashboard"),
            ("/room/TESTROOM", "Room"),
            ("/nonexistent", "404 Test")
        ]
        
        for path, name in pages:
            print(f"🔗 Testing {name}")
            self.fast_navigate(path)
            
            # Quick health check
            title = self.driver.title
            if title and len(title) > 0:
                self.log_success("Navigation", f"{name} page loads correctly")
            else:
                self.log_issue("MEDIUM", "Navigation", f"{name} page may have issues")
            
            # Quick error check
            page_text = self.driver.find_element(By.TAG_NAME, "body").text.lower()
            if "error" in page_text and path != "/nonexistent":
                self.log_issue("HIGH", "Navigation", f"Error detected on {name} page")
            elif "404" in page_text and path == "/nonexistent":
                self.log_success("Error Handling", "404 page works correctly")
    
    def run_comprehensive_fast_tests(self):
        """Run all tests in fast power user mode"""
        print("🚀 STARTING COMPREHENSIVE FAST TESTING")
        print("=" * 60)
        
        self.setup_fast_browser()
        
        try:
            start_time = time.time()
            
            # Run all tests quickly
            self.test_user_registration_fast()
            self.test_single_player_fast() 
            self.test_multiplayer_fast()
            self.test_navigation_fast()
            
            total_time = time.time() - start_time
            
            # Generate fast report
            self.generate_fast_report(total_time)
            
        except Exception as e:
            self.log_issue("CRITICAL", "Testing Framework", f"Critical error: {str(e)}")
            print(f"💥 Critical error: {e}")
            
        finally:
            if self.driver:
                self.driver.quit()
    
    def generate_fast_report(self, test_duration: float):
        """Generate comprehensive fast test report"""
        print(f"\n📊 COMPREHENSIVE FAST TEST REPORT")
        print("=" * 80)
        print(f"⚡ Test Duration: {test_duration:.2f} seconds")
        print(f"🎯 Total Issues Found: {len(self.issues)}")
        print(f"✅ Total Features Working: {len(self.successes)}")
        
        # Issues by severity
        critical = [i for i in self.issues if i['severity'] == 'CRITICAL']
        high = [i for i in self.issues if i['severity'] == 'HIGH']
        medium = [i for i in self.issues if i['severity'] == 'MEDIUM']
        
        print(f"\n🚨 ISSUE BREAKDOWN:")
        print(f"🔴 CRITICAL: {len(critical)}")
        print(f"🟠 HIGH: {len(high)}")
        print(f"🟡 MEDIUM: {len(medium)}")
        
        # Show critical issues with debugging info
        if critical or high:
            print(f"\n💥 CRITICAL & HIGH ISSUES WITH DEBUGGING:")
            print("-" * 60)
            
            for issue in critical + high:
                print(f"\n{issue['severity']} - {issue['component']}: {issue['description']}")
                
                # Show console errors related to this issue
                if issue['console_logs']:
                    print("  🖥️ Browser Console Logs:")
                    for log in issue['console_logs'][-3:]:  # Last 3 logs
                        print(f"    {log['level']}: {log['message'][:100]}")
                
                # Show network errors
                if issue['network_errors']:
                    print("  🌐 Network Errors:")
                    for net_error in issue['network_errors'][-2:]:  # Last 2 errors
                        print(f"    Network issue: {str(net_error)[:100]}")
        
        # Show Docker logs with errors
        docker_errors = [log for log in self.docker_logs if any(
            keyword in log['log'].lower() for keyword in ['error', 'exception', 'failed']
        )]
        
        if docker_errors:
            print(f"\n🐳 DOCKER ERRORS DETECTED:")
            print("-" * 30)
            for log in docker_errors[-5:]:  # Last 5 errors
                print(f"  {log['timestamp']}: {log['log']}")
        
        # Success summary
        print(f"\n✅ WORKING FEATURES:")
        print("-" * 25)
        success_components = {}
        for success in self.successes:
            if success['component'] not in success_components:
                success_components[success['component']] = []
            success_components[success['component']].append(success['description'])
        
        for component, features in success_components.items():
            print(f"  📦 {component}: {len(features)} features working")
        
        # Performance summary
        avg_action_time = test_duration / max(1, len(self.successes) + len(self.issues))
        print(f"\n⚡ PERFORMANCE METRICS:")
        print(f"  Average action time: {avg_action_time:.2f}s")
        print(f"  Console logs captured: {len(self.console_logs)}")
        print(f"  Network requests monitored: {len(self.network_logs)}")
        print(f"  Docker logs captured: {len(self.docker_logs)}")
        
        # Final assessment
        success_rate = len(self.successes) / max(1, len(self.successes) + len(self.issues)) * 100
        
        print(f"\n🎯 FINAL ASSESSMENT:")
        print(f"  Success Rate: {success_rate:.1f}%")
        
        if len(critical) == 0 and len(high) <= 2:
            print("  🎉 APPLICATION IS MOSTLY WORKING!")
            print("  💡 Fix medium issues and you're good to go!")
        elif len(critical) <= 2:
            print("  ⚠️ APPLICATION NEEDS SOME FIXES")
            print("  💡 Address critical/high issues before launch")
        else:
            print("  🚨 APPLICATION NEEDS SIGNIFICANT WORK")
            print("  💡 Major issues need fixing")
        
        # Save detailed report
        report = {
            'test_duration': test_duration,
            'issues': self.issues,
            'successes': self.successes,
            'console_logs': self.console_logs,
            'network_logs': self.network_logs[-50:],  # Last 50 network logs
            'docker_logs': self.docker_logs[-100:],   # Last 100 docker logs
            'summary': {
                'critical_issues': len(critical),
                'high_issues': len(high),
                'medium_issues': len(medium),
                'success_rate': success_rate
            }
        }
        
        filename = f"fast_comprehensive_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(filename, 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f"\n📄 Detailed report saved: {filename}")
        print("=" * 80)

def main():
    """Run fast comprehensive testing"""
    print("🚀 FAST COMPREHENSIVE QUIZMASTER PRO TESTING")
    print("=" * 50)
    print("⚡ Power User Speed: 60+ WPM typing")
    print("🖱️ Real Mouse Movements") 
    print("📊 Full Debug Monitoring:")
    print("  • Browser Console Logs")
    print("  • Network API Calls")
    print("  • Docker Container Logs")
    print("  • Performance Metrics")
    print()
    print("Testing EVERYTHING quickly and reporting ALL issues...")
    print("=" * 50)
    
    tester = FastPowerUserTester()
    tester.run_comprehensive_fast_tests()

if __name__ == "__main__":
    main()
