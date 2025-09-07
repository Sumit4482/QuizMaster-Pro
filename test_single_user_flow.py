#!/usr/bin/env python3

"""
SINGLE USER FLOW TESTING WITH NATURAL MOUSE MOVEMENTS
=====================================================

This script tests the complete single user journey:
1. User Registration
2. User Login  
3. Dashboard Access
4. Quiz Navigation
5. Quiz Gameplay
6. Results Viewing

Uses natural mouse movements and human-like interactions.
"""

import os
import sys
import time
import random
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

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

class SingleUserFlowTester:
    """Test complete single user experience with natural interactions"""
    
    def __init__(self, base_url: str = "http://localhost:3000"):
        self.base_url = base_url
        self.driver = None
        self.actions = None
        self.test_results = []
        
        # Generate unique test user
        random_id = random.randint(1000, 9999)
        self.test_user = {
            "email": f"singleuser{random_id}@testflow.com",
            "username": f"SingleUser{random_id}",
            "password": "FlowTest123!",
            "firstName": "Flow",
            "lastName": "Test"
        }
        
        # Setup logging
        logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
        self.logger = logging.getLogger(__name__)
        
        print("🎯 SINGLE USER FLOW TESTING INITIALIZED")
        print(f"👤 Test User: {self.test_user['username']} ({self.test_user['email']})")
    
    def setup_browser(self):
        """Setup browser with real user characteristics"""
        options = Options()
        
        # Real user browser settings - NOT headless for visual feedback
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1366,768")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)
        
        # Real user agent
        options.add_argument("--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36")
        
        service = Service(ChromeDriverManager().install())
        self.driver = webdriver.Chrome(service=service, options=options)
        self.actions = ActionChains(self.driver)
        
        # Remove automation detection
        self.driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        # Real user timeouts
        self.driver.implicitly_wait(3)
        self.driver.set_page_load_timeout(20)
        
        print("🖥️ Browser setup complete - Visual mode enabled for flow testing")
    
    def log_step(self, step: str, status: str, details: str = "", screenshot: bool = False):
        """Log each step of the user flow"""
        result = {
            'step': step,
            'status': status,
            'details': details,
            'timestamp': datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        icon = "✅" if status == "SUCCESS" else "❌" if status == "FAILED" else "⚠️"
        print(f"{icon} {step}: {status}")
        if details:
            print(f"   📝 {details}")
        
        if screenshot:
            self.take_screenshot(step.replace(' ', '_').lower())
    
    def take_screenshot(self, name: str):
        """Take screenshot for documentation"""
        try:
            filename = f"single_user_{name}_{datetime.now().strftime('%H%M%S')}.png"
            self.driver.save_screenshot(filename)
            print(f"   📸 Screenshot: {filename}")
        except Exception as e:
            print(f"   📸 Screenshot failed: {e}")
    
    def natural_navigate(self, url: str, description: str = "page"):
        """Navigate with real user behavior"""
        full_url = url if url.startswith('http') else f"{self.base_url}{url}"
        print(f"🌐 Navigating to {url} ({description})")
        
        start_time = time.time()
        self.driver.get(full_url)
        
        # Wait for page load
        WebDriverWait(self.driver, 10).until(
            lambda d: d.execute_script("return document.readyState") == "complete"
        )
        
        load_time = time.time() - start_time
        
        # Natural page assessment time
        assessment_time = random.uniform(1.0, 2.5)
        print(f"👀 Assessing {description} for {assessment_time:.1f}s...")
        time.sleep(assessment_time)
        
        if load_time > 5:
            self.log_step(f"Page Load ({description})", "WARNING", f"Slow load: {load_time:.2f}s")
        else:
            self.log_step(f"Page Load ({description})", "SUCCESS", f"Loaded in {load_time:.2f}s")
        
        return True
    
    def natural_type(self, element, text: str, description: str = "field"):
        """Type with natural human patterns"""
        print(f"⌨️ Typing '{text}' into {description}...")
        
        # Click to focus
        element.click()
        element.clear()
        
        # Type at natural speed
        for i, char in enumerate(text):
            element.send_keys(char)
            # Variable typing speed
            if i < 2:  # Slower start
                delay = random.uniform(0.05, 0.12)
            else:
                delay = random.uniform(0.02, 0.08)  # Normal speed
            time.sleep(delay)
            
            # Occasional corrections
            if random.random() < 0.03 and i > 2:
                element.send_keys(Keys.BACK_SPACE)
                time.sleep(0.1)
                element.send_keys(char)
        
        # Natural pause after typing
        time.sleep(random.uniform(0.5, 1.0))
        
        return True
    
    def natural_click(self, element, description: str = "element"):
        """Click with natural mouse movement"""
        try:
            # Natural mouse movement
            self.actions.move_to_element(element).perform()
            time.sleep(random.uniform(0.2, 0.5))  # Natural aiming time
            
            element.click()
            
            # Natural reaction time
            time.sleep(random.uniform(0.3, 0.8))
            
            return True
        except Exception as e:
            print(f"❌ Click failed on {description}: {e}")
            return False
    
    def find_element_safely(self, selector: str, timeout: int = 5, description: str = "element"):
        """Find element with multiple strategies"""
        print(f"🔍 Looking for {description}...")
        
        strategies = [
            (By.CSS_SELECTOR, selector),
            (By.ID, selector.replace('#', '') if '#' in selector else ''),
            (By.NAME, selector),
            (By.CLASS_NAME, selector.replace('.', '') if '.' in selector else '')
        ]
        
        for by, value in strategies:
            if not value:  # Skip empty values
                continue
            try:
                element = WebDriverWait(self.driver, timeout).until(
                    EC.element_to_be_clickable((by, value))
                )
                print(f"✅ Found {description}")
                return element
            except:
                continue
        
        # Try text-based search
        try:
            buttons = self.driver.find_elements(By.TAG_NAME, "button")
            for btn in buttons:
                if btn.text and selector.lower() in btn.text.lower():
                    if btn.is_displayed() and btn.is_enabled():
                        print(f"✅ Found {description} by text")
                        return btn
        except:
            pass
        
        print(f"❌ Could not find {description}")
        return None
    
    def step_1_registration(self):
        """Step 1: Test user registration"""
        print(f"\n1️⃣ STEP 1: USER REGISTRATION")
        print("=" * 40)
        
        self.natural_navigate("/auth/register", "registration page")
        
        # Check page loaded correctly
        if "register" not in self.driver.current_url.lower():
            self.log_step("Registration Navigation", "FAILED", "Did not reach registration page")
            return False
        
        self.take_screenshot("registration_page")
        
        # Fill registration form
        print("📝 Filling registration form...")
        
        # Email field
        email_field = self.find_element_safely("input[name='email']", description="email field")
        if not email_field:
            self.log_step("Registration Form", "FAILED", "Email field not found")
            return False
        
        self.natural_type(email_field, self.test_user['email'], "email field")
        
        # Username field
        username_field = self.find_element_safely("input[name='username']", description="username field")
        if username_field:
            self.natural_type(username_field, self.test_user['username'], "username field")
        
        # Password field
        password_field = self.find_element_safely("input[type='password']", description="password field")
        if password_field:
            self.natural_type(password_field, self.test_user['password'], "password field")
        
        # Confirm password field
        confirm_password_field = self.find_element_safely("input[name='confirmPassword']", description="confirm password field")
        if confirm_password_field:
            self.natural_type(confirm_password_field, self.test_user['password'], "confirm password field")
        
        # First name (optional)
        firstname_field = self.find_element_safely("input[name='firstName']", timeout=2, description="first name field")
        if firstname_field:
            self.natural_type(firstname_field, self.test_user['firstName'], "first name field")
        
        # Last name (optional)
        lastname_field = self.find_element_safely("input[name='lastName']", timeout=2, description="last name field")
        if lastname_field:
            self.natural_type(lastname_field, self.test_user['lastName'], "last name field")
        
        self.take_screenshot("registration_form_filled")
        
        # Submit registration
        print("📤 Submitting registration...")
        submit_btn = self.find_element_safely("button[type='submit']", description="registration submit button")
        if not submit_btn:
            self.log_step("Registration Submit", "FAILED", "Submit button not found")
            return False
        
        self.natural_click(submit_btn, "registration submit button")
        
        # Wait for response
        print("⏳ Waiting for registration response...")
        time.sleep(5)
        
        self.take_screenshot("registration_response")
        
        # Check registration result
        current_url = self.driver.current_url
        page_text = self.driver.find_element(By.TAG_NAME, "body").text.lower()
        
        if "dashboard" in current_url or "welcome" in page_text:
            self.log_step("User Registration", "SUCCESS", "Successfully registered and redirected")
            return True
        elif any(error in page_text for error in ["error", "failed", "invalid", "already exists", "taken"]):
            # Extract specific error message
            error_elements = self.driver.find_elements(By.CSS_SELECTOR, 
                "[class*='error'], [role='alert'], .text-red-500, .text-error-600")
            
            error_msg = "Registration failed"
            if error_elements:
                error_msg = error_elements[0].text
            elif "already exists" in page_text or "taken" in page_text:
                error_msg = "User already exists - will try login instead"
            
            self.log_step("User Registration", "FAILED", error_msg)
            
            # If user already exists, we can continue with login
            if "already exists" in error_msg.lower() or "taken" in error_msg.lower():
                print("👤 User already exists - proceeding to login test")
                return True
            
            return False
        else:
            self.log_step("User Registration", "UNCLEAR", "Registration result unclear")
            return False
    
    def step_2_login(self):
        """Step 2: Test user login"""
        print(f"\n2️⃣ STEP 2: USER LOGIN")
        print("=" * 30)
        
        self.natural_navigate("/auth/login", "login page")
        
        # Check page loaded correctly
        if "login" not in self.driver.current_url.lower():
            self.log_step("Login Navigation", "FAILED", "Did not reach login page")
            return False
        
        self.take_screenshot("login_page")
        
        # Fill login form
        print("🔑 Filling login form...")
        
        # Email field
        email_field = self.find_element_safely("input[name='email']", description="login email field")
        if not email_field:
            self.log_step("Login Form", "FAILED", "Email field not found")
            return False
        
        self.natural_type(email_field, self.test_user['email'], "login email field")
        
        # Password field
        password_field = self.find_element_safely("input[type='password']", description="login password field")
        if not password_field:
            self.log_step("Login Form", "FAILED", "Password field not found")
            return False
        
        self.natural_type(password_field, self.test_user['password'], "login password field")
        
        self.take_screenshot("login_form_filled")
        
        # Submit login
        print("🔐 Submitting login...")
        login_btn = self.find_element_safely("button[type='submit']", description="login submit button")
        if not login_btn:
            self.log_step("Login Submit", "FAILED", "Login button not found")
            return False
        
        self.natural_click(login_btn, "login submit button")
        
        # Wait for login response
        print("⏳ Waiting for login authentication...")
        time.sleep(4)
        
        self.take_screenshot("login_response")
        
        # Check login result
        current_url = self.driver.current_url
        page_text = self.driver.find_element(By.TAG_NAME, "body").text.lower()
        
        if "dashboard" in current_url or ("welcome" in page_text and "login" not in current_url):
            self.log_step("User Login", "SUCCESS", "Successfully logged in and redirected to dashboard")
            return True
        elif "login" in current_url:
            # Still on login page - check for error messages
            error_elements = self.driver.find_elements(By.CSS_SELECTOR, 
                "[class*='error'], [role='alert'], .text-red-500, .text-error-600")
            
            error_msg = "Login failed - no specific error message"
            if error_elements:
                error_msg = f"Login error: {error_elements[0].text}"
            elif "invalid" in page_text or "incorrect" in page_text:
                error_msg = "Invalid credentials"
            
            self.log_step("User Login", "FAILED", error_msg)
            return False
        else:
            self.log_step("User Login", "SUCCESS", f"Login successful - redirected to {current_url}")
            return True
    
    def step_3_dashboard_access(self):
        """Step 3: Test dashboard access and functionality"""
        print(f"\n3️⃣ STEP 3: DASHBOARD ACCESS")
        print("=" * 35)
        
        # If not already on dashboard, navigate there
        if "dashboard" not in self.driver.current_url.lower():
            self.natural_navigate("/dashboard", "dashboard")
        
        self.take_screenshot("dashboard_page")
        
        # Check if dashboard loads with user content
        page_text = self.driver.find_element(By.TAG_NAME, "body").text.lower()
        
        # Look for dashboard indicators
        dashboard_indicators = ["welcome", "stats", "quiz", "play", "create", "profile"]
        found_indicators = [indicator for indicator in dashboard_indicators if indicator in page_text]
        
        if found_indicators:
            self.log_step("Dashboard Access", "SUCCESS", f"Dashboard loaded with content: {', '.join(found_indicators)}")
        else:
            self.log_step("Dashboard Access", "WARNING", "Dashboard loaded but minimal content detected")
        
        # Check for authentication-required content
        if any(auth_required in page_text for auth_required in ["login", "sign in", "unauthorized"]):
            self.log_step("Dashboard Authentication", "FAILED", "Dashboard shows authentication required")
            return False
        
        print("👀 Exploring dashboard content...")
        time.sleep(2)  # Natural browsing time
        
        return True
    
    def step_4_quiz_access(self):
        """Step 4: Test quiz access and navigation"""
        print(f"\n4️⃣ STEP 4: QUIZ ACCESS")
        print("=" * 30)
        
        # Look for quiz-related functionality on dashboard
        print("🎯 Looking for quiz functionality...")
        
        # Multiple strategies to find quiz access
        quiz_selectors = [
            "//button[contains(text(), 'Start Quiz')]",
            "//button[contains(text(), 'Quiz')]", 
            "//a[contains(text(), 'Quiz')]",
            "//button[contains(text(), 'Play')]",
            "//a[contains(text(), 'Play')]",
            "[data-testid*='quiz']",
            ".quiz-button",
            "#start-quiz"
        ]
        
        quiz_element = None
        for selector in quiz_selectors:
            try:
                if selector.startswith("//"):
                    element = self.driver.find_element(By.XPATH, selector)
                else:
                    element = self.driver.find_element(By.CSS_SELECTOR, selector)
                
                if element.is_displayed() and element.is_enabled():
                    quiz_element = element
                    print(f"✅ Found quiz access: {selector}")
                    break
            except:
                continue
        
        if not quiz_element:
            # Try direct navigation to quiz page
            print("🔍 No quiz button found - trying direct navigation...")
            self.natural_navigate("/quiz", "quiz page")
            
            # Check if quiz page loaded
            if "quiz" in self.driver.current_url.lower():
                self.log_step("Quiz Access", "SUCCESS", "Accessed quiz via direct navigation")
                return True
            else:
                self.log_step("Quiz Access", "FAILED", "Cannot access quiz functionality")
                return False
        
        # Click quiz element
        print(f"🎮 Accessing quiz functionality...")
        self.natural_click(quiz_element, "quiz access button")
        
        # Wait for quiz to load
        time.sleep(3)
        
        self.take_screenshot("quiz_access")
        
        # Check if we're in quiz mode
        current_url = self.driver.current_url
        page_text = self.driver.find_element(By.TAG_NAME, "body").text.lower()
        
        quiz_indicators = ["question", "category", "start quiz", "select category", "difficulty"]
        found_quiz_indicators = [indicator for indicator in quiz_indicators if indicator in page_text]
        
        if found_quiz_indicators or "quiz" in current_url:
            self.log_step("Quiz Access", "SUCCESS", f"Quiz loaded with: {', '.join(found_quiz_indicators)}")
            return True
        else:
            self.log_step("Quiz Access", "FAILED", "Quiz functionality did not load properly")
            return False
    
    def step_5_quiz_gameplay(self):
        """Step 5: Test actual quiz gameplay"""
        print(f"\n5️⃣ STEP 5: QUIZ GAMEPLAY")
        print("=" * 32)
        
        # Look for category selection first
        print("📚 Looking for quiz categories...")
        
        category_selectors = [
            "button[class*='category']",
            ".category-card", 
            "[data-testid*='category']",
            "//button[contains(@class, 'category')]",
            "//div[contains(@class, 'category')]//button"
        ]
        
        categories = []
        for selector in category_selectors:
            try:
                if selector.startswith("//"):
                    elements = self.driver.find_elements(By.XPATH, selector)
                else:
                    elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                categories.extend([e for e in elements if e.is_displayed()])
            except:
                continue
        
        if categories:
            print(f"📖 Found {len(categories)} quiz categories")
            self.log_step("Quiz Categories", "SUCCESS", f"Found {len(categories)} categories")
            
            # Select a category
            selected_category = random.choice(categories)
            category_text = selected_category.text[:30] if selected_category.text else "Category"
            print(f"🎯 Selecting category: {category_text}")
            
            self.natural_click(selected_category, f"category: {category_text}")
            time.sleep(3)
            
            self.take_screenshot("category_selected")
        else:
            self.log_step("Quiz Categories", "WARNING", "No categories found - may be auto-selected")
        
        # Look for quiz questions
        print("❓ Looking for quiz questions...")
        
        questions_found = 0
        max_questions = 5  # Test up to 5 questions
        
        for question_num in range(max_questions):
            print(f"\n📝 Testing Question {question_num + 1}")
            time.sleep(2)  # Wait for question to load
            
            # Look for question text
            question_selectors = [
                "h1", "h2", "h3", 
                "[class*='question']",
                ".quiz-question",
                "[data-testid*='question']"
            ]
            
            question_element = None
            for selector in question_selectors:
                try:
                    elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                    for elem in elements:
                        if elem.is_displayed() and len(elem.text.strip()) > 15:  # Substantial text
                            question_element = elem
                            break
                    if question_element:
                        break
                except:
                    continue
            
            if not question_element:
                print("❌ No question found")
                break
            
            question_text = question_element.text[:80] + "..." if len(question_element.text) > 80 else question_element.text
            print(f"❓ Question: {question_text}")
            
            # Look for answer options
            answer_selectors = [
                "button[class*='answer']",
                "button[class*='option']", 
                ".answer-option",
                ".quiz-option",
                "input[type='radio'] + label",
                "[data-testid*='answer']"
            ]
            
            answer_options = []
            for selector in answer_selectors:
                try:
                    elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                    answer_options.extend([e for e in elements if e.is_displayed()])
                except:
                    continue
            
            if not answer_options:
                self.log_step(f"Question {question_num + 1}", "FAILED", "No answer options found")
                break
            
            print(f"✅ Found {len(answer_options)} answer options")
            
            # Select an answer
            selected_answer = random.choice(answer_options)
            answer_text = selected_answer.text[:40] if selected_answer.text else f"Option {answer_options.index(selected_answer) + 1}"
            print(f"👆 Selecting answer: {answer_text}")
            
            self.natural_click(selected_answer, f"answer: {answer_text}")
            
            self.take_screenshot(f"question_{question_num + 1}_answered")
            
            # Look for submit/next button
            submit_selectors = [
                "button[type='submit']",
                "//button[contains(text(), 'Submit')]",
                "//button[contains(text(), 'Next')]",
                "//button[contains(text(), 'Continue')]"
            ]
            
            submit_btn = None
            for selector in submit_selectors:
                try:
                    if selector.startswith("//"):
                        element = self.driver.find_element(By.XPATH, selector)
                    else:
                        element = self.driver.find_element(By.CSS_SELECTOR, selector)
                    
                    if element.is_displayed() and element.is_enabled():
                        submit_btn = element
                        break
                except:
                    continue
            
            if submit_btn:
                print("📤 Submitting answer...")
                self.natural_click(submit_btn, "submit answer")
                questions_found += 1
                
                # Wait for feedback or next question
                time.sleep(2)
            else:
                print("⚠️ No submit button found")
                break
        
        if questions_found > 0:
            self.log_step("Quiz Gameplay", "SUCCESS", f"Successfully answered {questions_found} questions")
            return True
        else:
            self.log_step("Quiz Gameplay", "FAILED", "Could not complete any questions")
            return False
    
    def step_6_results_viewing(self):
        """Step 6: Test quiz results and completion"""
        print(f"\n6️⃣ STEP 6: RESULTS VIEWING")
        print("=" * 35)
        
        # Wait for results
        print("⏳ Waiting for quiz results...")
        time.sleep(3)
        
        self.take_screenshot("quiz_results")
        
        # Look for results indicators
        page_text = self.driver.find_element(By.TAG_NAME, "body").text.lower()
        results_indicators = ["score", "result", "complete", "finish", "total", "points", "percentage"]
        
        found_results = [indicator for indicator in results_indicators if indicator in page_text]
        
        if found_results:
            self.log_step("Quiz Results", "SUCCESS", f"Results displayed: {', '.join(found_results)}")
            
            # Look for specific score information
            score_elements = self.driver.find_elements(By.CSS_SELECTOR, 
                "[class*='score'], [class*='result'], .points, [data-testid*='score']")
            
            if score_elements:
                print("📊 Score information found")
                self.log_step("Score Display", "SUCCESS", "Score details are visible")
            else:
                self.log_step("Score Display", "WARNING", "Score details may not be clearly displayed")
            
            return True
        else:
            self.log_step("Quiz Results", "FAILED", "No clear results page found")
            return False
    
    def run_complete_single_user_flow(self):
        """Run the complete single user flow test"""
        self.setup_browser()
        
        try:
            print("🚀 STARTING COMPLETE SINGLE USER FLOW TEST")
            print("=" * 60)
            print(f"🎯 Testing complete user journey for: {self.test_user['username']}")
            print(f"📧 Email: {self.test_user['email']}")
            print("=" * 60)
            
            start_time = time.time()
            
            # Execute all steps
            step_results = []
            
            step_results.append(self.step_1_registration())
            step_results.append(self.step_2_login())
            step_results.append(self.step_3_dashboard_access())
            step_results.append(self.step_4_quiz_access())
            step_results.append(self.step_5_quiz_gameplay())
            step_results.append(self.step_6_results_viewing())
            
            total_time = time.time() - start_time
            
            # Generate comprehensive flow report
            self.generate_flow_report(step_results, total_time)
            
        except Exception as e:
            self.log_step("Critical Error", "FAILED", f"Flow test failed: {str(e)}")
            print(f"💥 Critical error: {e}")
            import traceback
            traceback.print_exc()
            
        finally:
            input("\n⏸️ Press Enter to close browser and complete test...")
            if self.driver:
                self.driver.quit()
    
    def generate_flow_report(self, step_results: List[bool], test_duration: float):
        """Generate comprehensive single user flow report"""
        print(f"\n📊 SINGLE USER FLOW TEST REPORT")
        print("=" * 60)
        print(f"⚡ Test Duration: {test_duration:.2f} seconds")
        print(f"👤 Test User: {self.test_user['username']}")
        
        # Step summary
        successful_steps = sum(1 for result in step_results if result)
        total_steps = len(step_results)
        
        print(f"\n📈 FLOW COMPLETION:")
        print(f"✅ Successful Steps: {successful_steps}/{total_steps}")
        print(f"📊 Success Rate: {(successful_steps/total_steps)*100:.1f}%")
        
        # Detailed step results
        step_names = [
            "User Registration",
            "User Login", 
            "Dashboard Access",
            "Quiz Access",
            "Quiz Gameplay",
            "Results Viewing"
        ]
        
        print(f"\n📋 DETAILED STEP RESULTS:")
        for i, (step_name, result) in enumerate(zip(step_names, step_results)):
            icon = "✅" if result else "❌"
            print(f"{icon} Step {i+1}: {step_name}")
        
        # All logged results
        if self.test_results:
            print(f"\n📝 DETAILED LOG ({len(self.test_results)} entries):")
            for result in self.test_results:
                icon = "✅" if result['status'] == "SUCCESS" else "❌" if result['status'] == "FAILED" else "⚠️"
                print(f"{icon} {result['step']}: {result['status']}")
                if result['details']:
                    print(f"   📝 {result['details']}")
        
        # Overall assessment
        print(f"\n🎯 OVERALL ASSESSMENT:")
        if successful_steps == total_steps:
            print("🎉 PERFECT! Complete single user flow working flawlessly!")
        elif successful_steps >= total_steps - 1:
            print("🎊 EXCELLENT! Single user flow mostly working with minor issues")
        elif successful_steps >= total_steps // 2:
            print("⚠️ PARTIAL SUCCESS - Core functionality works but needs improvement")
        else:
            print("🚨 SIGNIFICANT ISSUES - Single user flow needs major fixes")
        
        print(f"\n📄 Screenshots and logs saved for analysis")
        print("=" * 60)

def main():
    """Run single user flow testing"""
    print("🎯 SINGLE USER FLOW TESTING WITH NATURAL INTERACTIONS")
    print("=" * 55)
    print("This will test the complete single user journey:")
    print("1. Registration → 2. Login → 3. Dashboard → 4. Quiz Access → 5. Gameplay → 6. Results")
    print()
    print("🖥️ Browser will open in visual mode for real-time observation")
    print("🖱️ Using natural mouse movements and human-like typing")
    print("=" * 55)
    
    tester = SingleUserFlowTester()
    tester.run_complete_single_user_flow()

if __name__ == "__main__":
    main()
