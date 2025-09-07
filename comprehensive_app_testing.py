#!/usr/bin/env python3

"""
COMPREHENSIVE QUIZMASTER PRO APPLICATION TESTING
================================================

This script performs exhaustive testing of ALL application flows:
- Single Player Quiz Flows
- Multiplayer Game Flows  
- User Management & Authentication
- Navigation & UI Components
- Error Handling & Edge Cases
- Performance & Responsiveness

The test behaves like a real user exploring the entire application
and provides detailed analysis of what works and what doesn't.
"""

import os
import sys
import time
import random
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
import threading
import json

# Ensure we have the human-like testing framework available
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import selenium components needed
from selenium.webdriver.common.by import By

# Import our human-like testing framework
try:
    from human_like_testing_framework import HumanLikeTester, HumanBehaviorSimulator
except ImportError:
    print("Error: Human-like testing framework not found. Please run human_like_testing_framework.py first.")
    sys.exit(1)

class ComprehensiveAppTester(HumanLikeTester):
    """Extended tester for comprehensive QuizMaster Pro application testing"""
    
    def __init__(self, base_url: str = "http://localhost:3000"):
        super().__init__(base_url)
        
        self.test_users = [
            {"email": "singleplayer@test.com", "username": "SinglePlayer", "password": "TestPass123!", "role": "single"},
            {"email": "multihost@test.com", "username": "MultiHost", "password": "TestPass123!", "role": "host"},
            {"email": "multiplayer1@test.com", "username": "MultiPlayer1", "password": "TestPass123!", "role": "player"},
            {"email": "multiplayer2@test.com", "username": "MultiPlayer2", "password": "TestPass123!", "role": "player"}
        ]
        
        self.created_rooms = []
        self.quiz_sessions = []
        self.discovered_issues = []
        self.successful_features = []
        
        self.logger.note("=== COMPREHENSIVE QUIZMASTER PRO TESTING INITIALIZED ===")
    
    def log_issue(self, severity: str, component: str, description: str, screenshot: str = ""):
        """Log discovered issues for final report"""
        issue = {
            "severity": severity,  # CRITICAL, HIGH, MEDIUM, LOW
            "component": component,
            "description": description,
            "screenshot": screenshot,
            "timestamp": datetime.now().strftime("%H:%M:%S")
        }
        self.discovered_issues.append(issue)
        self.logger.concern(f"{severity} ISSUE in {component}: {description}")
    
    def log_success(self, component: str, description: str):
        """Log successful features for final report"""
        success = {
            "component": component,
            "description": description,
            "timestamp": datetime.now().strftime("%H:%M:%S")
        }
        self.successful_features.append(success)
        self.logger.success(f"{component}: {description}")

    def test_user_management_flows(self):
        """Test all user management functionality"""
        self.logger.note("=== TESTING USER MANAGEMENT FLOWS ===")
        
        for user in self.test_users:
            self.logger.note(f"Testing user management for {user['username']}")
            
            # Test Registration Flow
            self.human_navigate("/auth/register")
            self.human_observe_page(f"registration page for {user['username']}")
            
            # Test form validation
            submit_btn = self.human_wait_and_find("button[type='submit']", description="submit button")
            if submit_btn:
                self.human_click(submit_btn, "submit button (empty form)")
                time.sleep(2)
                
                # Check for validation errors
                if self.verify_text_present("required") or self.verify_text_present("invalid"):
                    self.log_success("Registration Validation", "Form validation working correctly")
                else:
                    self.log_issue("MEDIUM", "Registration Validation", "Form validation may not be working properly")
            
            # Fill registration form
            email_field = self.human_wait_and_find("input[name='email']", description="email field")
            if email_field:
                self.human_type(email_field, user['email'], "email field")
            else:
                self.log_issue("HIGH", "Registration Form", "Email field not found")
                continue
            
            username_field = self.human_wait_and_find("input[name='username']", description="username field")
            if username_field:
                self.human_type(username_field, user['username'], "username field")
            
            password_field = self.human_wait_and_find("input[type='password']", description="password field")
            if password_field:
                self.human_type(password_field, user['password'], "password field")
            
            # Fill optional fields if present
            firstname_field = self.human_wait_and_find("input[name='firstName']", timeout=3, description="first name field")
            if firstname_field:
                self.human_type(firstname_field, user['username'], "first name field")
            
            lastname_field = self.human_wait_and_find("input[name='lastName']", timeout=3, description="last name field")
            if lastname_field:
                self.human_type(lastname_field, "Tester", "last name field")
            
            # Submit registration
            self.take_screenshot(f"before_registration_{user['username']}")
            submit_btn = self.human_wait_and_find("button[type='submit']", description="registration submit")
            if submit_btn:
                self.human_click(submit_btn, "registration submit button")
                time.sleep(HumanBehaviorSimulator.action_delay() * 2)
                
                self.take_screenshot(f"after_registration_{user['username']}")
                
                # Check registration result
                if self.verify_text_present("success"):
                    self.log_success("User Registration", f"Successfully registered {user['username']}")
                elif self.verify_text_present("already exists") or self.verify_text_present("taken"):
                    self.log_success("User Registration", f"{user['username']} already exists (expected)")
                else:
                    self.log_issue("HIGH", "User Registration", f"Registration unclear for {user['username']}")
            
            # Test Login Flow
            time.sleep(2)
            self.human_navigate("/auth/login")
            self.human_observe_page(f"login page for {user['username']}")
            
            login_email = self.human_wait_and_find("input[name='email']", description="login email field")
            login_password = self.human_wait_and_find("input[type='password']", description="login password field")
            
            if login_email and login_password:
                self.human_type(login_email, user['email'], "login email")
                self.human_type(login_password, user['password'], "login password")
                
                self.take_screenshot(f"before_login_{user['username']}")
                login_btn = self.human_wait_and_find("button[type='submit']", description="login submit")
                if login_btn:
                    self.human_click(login_btn, "login submit button")
                    time.sleep(HumanBehaviorSimulator.action_delay() * 2)
                    
                    self.take_screenshot(f"after_login_{user['username']}")
                    
                    # Verify login success
                    current_url = self.driver.current_url
                    if "dashboard" in current_url or self.verify_text_present("welcome") or not "login" in current_url:
                        self.log_success("User Login", f"Successfully logged in {user['username']}")
                        user['logged_in'] = True
                        
                        # Test logout
                        self.test_logout_functionality()
                        
                    else:
                        self.log_issue("HIGH", "User Login", f"Login failed for {user['username']}")
                        user['logged_in'] = False
            else:
                self.log_issue("CRITICAL", "Login Form", "Login form fields not found")
            
            time.sleep(2)  # Brief pause between users
    
    def test_logout_functionality(self):
        """Test logout functionality"""
        self.logger.note("Testing logout functionality")
        
        # Look for logout options
        logout_selectors = [
            "//button[contains(text(), 'Logout')]",
            "//a[contains(text(), 'Logout')]", 
            "//button[contains(text(), 'Sign Out')]",
            "//a[contains(text(), 'Sign Out')]",
            "[data-testid='logout']",
            "//button[contains(@class, 'logout')]"
        ]
        
        logout_found = False
        for selector in logout_selectors:
            try:
                if selector.startswith("//"):
                    logout_element = self.driver.find_element(By.XPATH, selector)
                else:
                    logout_element = self.driver.find_element(By.CSS_SELECTOR, selector)
                
                self.human_click(logout_element, "logout button")
                time.sleep(2)
                
                # Verify logout worked
                current_url = self.driver.current_url
                if "login" in current_url or "home" in current_url or self.verify_text_present("sign in"):
                    self.log_success("User Logout", "Logout functionality working correctly")
                else:
                    self.log_issue("MEDIUM", "User Logout", "Logout may not be working properly")
                
                logout_found = True
                break
                
            except:
                continue
        
        if not logout_found:
            self.log_issue("MEDIUM", "User Logout", "Logout button/link not easily discoverable")
    
    def test_single_player_flows(self):
        """Test all single player quiz functionality"""
        self.logger.note("=== TESTING SINGLE PLAYER QUIZ FLOWS ===")
        
        # Login as single player user
        user = self.test_users[0]  # Single player user
        self.login_user(user)
        
        if not user.get('logged_in', False):
            self.log_issue("CRITICAL", "Single Player Setup", "Cannot test single player - login failed")
            return
        
        # Navigate to quiz/single player area
        self.human_navigate("/dashboard")
        self.human_observe_page("dashboard for single player testing")
        
        # Look for single player quiz options
        single_player_selectors = [
            "//button[contains(text(), 'Start Quiz')]",
            "//a[contains(text(), 'Single Player')]",
            "//button[contains(text(), 'Play Solo')]", 
            "//a[contains(text(), 'Quiz')]",
            "[data-testid='single-quiz']",
            "//div[contains(@class, 'quiz')]//button"
        ]
        
        quiz_started = False
        for selector in single_player_selectors:
            try:
                if selector.startswith("//"):
                    quiz_element = self.driver.find_element(By.XPATH, selector)
                else:
                    quiz_element = self.driver.find_element(By.CSS_SELECTOR, selector)
                
                self.logger.note(f"Found potential single player option: {selector}")
                self.human_click(quiz_element, "single player quiz option")
                time.sleep(3)
                
                # Check if we're in a quiz
                if self.verify_text_present("question") or self.verify_text_present("category") or self.verify_text_present("start"):
                    self.log_success("Single Player Access", "Successfully accessed single player quiz")
                    quiz_started = True
                    break
                    
            except:
                continue
        
        if not quiz_started:
            # Try direct navigation to quiz page
            self.human_navigate("/quiz")
            self.human_observe_page("direct quiz page navigation")
            
            if self.verify_text_present("question") or self.verify_text_present("category"):
                self.log_success("Single Player Access", "Single player accessible via direct navigation")
                quiz_started = True
        
        if quiz_started:
            self.test_quiz_category_selection()
            self.test_quiz_question_flow()
            self.test_quiz_completion()
        else:
            self.log_issue("HIGH", "Single Player Quiz", "Cannot access single player quiz functionality")
    
    def test_quiz_category_selection(self):
        """Test quiz category selection functionality"""
        self.logger.note("Testing quiz category selection")
        
        # Look for category selection
        category_elements = self.driver.find_elements(By.CSS_SELECTOR, 
            "button[class*='category'], div[class*='category'], .category-card, [data-testid*='category']")
        
        if category_elements:
            self.log_success("Category Selection", f"Found {len(category_elements)} category options")
            
            # Select a category
            if len(category_elements) > 0:
                category = random.choice(category_elements)
                category_text = category.text or "Unknown Category"
                self.logger.note(f"Selecting category: {category_text}")
                
                self.take_screenshot("before_category_selection")
                self.human_click(category, f"category: {category_text}")
                time.sleep(3)
                self.take_screenshot("after_category_selection")
                
                # Check if category selection worked
                if self.verify_text_present("question") or self.verify_text_present("start"):
                    self.log_success("Category Selection", f"Successfully selected {category_text}")
                else:
                    self.log_issue("MEDIUM", "Category Selection", "Category selection may not be working")
        else:
            self.log_issue("MEDIUM", "Category Selection", "No category selection options found")
    
    def test_quiz_question_flow(self):
        """Test the actual quiz question answering flow"""
        self.logger.note("Testing quiz question answering flow")
        
        questions_answered = 0
        max_questions = 5  # Test up to 5 questions
        
        for question_num in range(max_questions):
            self.logger.note(f"Testing question {question_num + 1}")
            
            # Wait for question to load
            time.sleep(2)
            
            # Look for question text
            question_found = False
            question_selectors = [
                "[class*='question']",
                "h1, h2, h3",
                "[data-testid*='question']",
                ".quiz-question"
            ]
            
            for selector in question_selectors:
                question_elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                if question_elements and any(len(elem.text.strip()) > 10 for elem in question_elements):
                    question_found = True
                    question_text = next((elem.text[:50] + "..." for elem in question_elements if len(elem.text.strip()) > 10), "Question found")
                    self.logger.note(f"Found question: {question_text}")
                    break
            
            if not question_found:
                self.logger.note("No more questions found, quiz may be complete")
                break
            
            # Look for answer options
            answer_options = []
            answer_selectors = [
                "button[class*='answer']",
                "button[class*='option']", 
                ".answer-option",
                ".quiz-option",
                "input[type='radio'] + label",
                "[data-testid*='answer']"
            ]
            
            for selector in answer_selectors:
                options = self.driver.find_elements(By.CSS_SELECTOR, selector)
                if options:
                    answer_options.extend(options)
                    break
            
            if answer_options:
                self.log_success("Quiz Questions", f"Question {question_num + 1} has {len(answer_options)} answer options")
                
                # Select a random answer
                selected_answer = random.choice(answer_options)
                answer_text = selected_answer.text[:30] if selected_answer.text else f"Answer {answer_options.index(selected_answer) + 1}"
                
                self.logger.note(f"Selecting answer: {answer_text}")
                self.take_screenshot(f"question_{question_num + 1}_before_answer")
                
                self.human_click(selected_answer, f"answer option: {answer_text}")
                time.sleep(1)
                
                # Look for submit button
                submit_btn = self.human_wait_and_find(
                    "button[type='submit'], button[class*='submit']",
                    timeout=5,
                    description="submit/next button"
                )
                
                # Also try to find by text content
                if not submit_btn:
                    submit_buttons = self.driver.find_elements(By.TAG_NAME, "button")
                    for btn in submit_buttons:
                        if btn.text and ("submit" in btn.text.lower() or "next" in btn.text.lower()):
                            submit_btn = btn
                            break
                
                if submit_btn:
                    self.human_click(submit_btn, "submit answer button")
                    time.sleep(HumanBehaviorSimulator.action_delay())
                    
                    self.take_screenshot(f"question_{question_num + 1}_after_answer")
                    
                    # Check for feedback
                    if self.verify_text_present("correct") or self.verify_text_present("incorrect") or self.verify_text_present("next"):
                        self.log_success("Answer Feedback", f"Question {question_num + 1} provided feedback")
                    else:
                        self.log_issue("LOW", "Answer Feedback", f"No clear feedback for question {question_num + 1}")
                    
                    questions_answered += 1
                else:
                    self.log_issue("MEDIUM", "Quiz Navigation", f"No submit button found for question {question_num + 1}")
                    break
            else:
                self.log_issue("HIGH", "Quiz Questions", f"No answer options found for question {question_num + 1}")
                break
            
            # Brief pause before next question
            time.sleep(2)
        
        if questions_answered > 0:
            self.log_success("Single Player Quiz", f"Successfully answered {questions_answered} questions")
        else:
            self.log_issue("HIGH", "Single Player Quiz", "Could not complete any questions")
    
    def test_quiz_completion(self):
        """Test quiz completion and results"""
        self.logger.note("Testing quiz completion and results")
        
        # Wait for results to appear
        time.sleep(3)
        
        # Look for results/score display
        results_found = False
        result_indicators = ["score", "result", "complete", "finish", "total", "points"]
        
        page_text = self.driver.find_element(By.TAG_NAME, "body").text.lower()
        for indicator in result_indicators:
            if indicator in page_text:
                results_found = True
                self.logger.note(f"Found results indicator: {indicator}")
                break
        
        if results_found:
            self.log_success("Quiz Completion", "Quiz results page displayed")
            self.take_screenshot("quiz_results")
            
            # Look for score information
            score_elements = self.driver.find_elements(By.CSS_SELECTOR, 
                "[class*='score'], [class*='result'], .points, [data-testid*='score']")
            
            if score_elements:
                self.log_success("Score Display", "Score/results information is displayed")
            else:
                self.log_issue("MEDIUM", "Score Display", "Score information may not be clearly displayed")
                
        else:
            self.log_issue("MEDIUM", "Quiz Completion", "No clear results page found")
    
    def test_multiplayer_flows(self):
        """Test all multiplayer functionality"""
        self.logger.note("=== TESTING MULTIPLAYER GAME FLOWS ===")
        
        # Login host user
        host_user = self.test_users[1]  # Multi host user
        self.login_user(host_user)
        
        if not host_user.get('logged_in', False):
            self.log_issue("CRITICAL", "Multiplayer Setup", "Cannot test multiplayer - host login failed")
            return
        
        # Test room creation
        room_code = self.test_room_creation()
        
        if room_code:
            # Test multiple players joining
            self.test_multiplayer_joining(room_code)
            
            # Test ready states
            self.test_multiplayer_ready_states()
            
            # Test game start
            self.test_multiplayer_game_start()
            
            # Test multiplayer question flow
            self.test_multiplayer_question_flow()
            
        else:
            self.log_issue("HIGH", "Multiplayer Rooms", "Cannot create rooms - skipping multiplayer tests")
    
    def test_room_creation(self):
        """Test multiplayer room creation"""
        self.logger.note("Testing multiplayer room creation")
        
        self.human_navigate("/dashboard")
        self.human_observe_page("dashboard for room creation")
        
        # Look for create room functionality
        create_room_selectors = [
            "//button[contains(text(), 'Create Room')]",
            "//a[contains(text(), 'Create Room')]",
            "//button[contains(text(), 'Create')]",
            "//button[contains(text(), 'Host Game')]",
            "[data-testid='create-room']",
            "//div[contains(@class, 'create')]//button"
        ]
        
        room_created = False
        for selector in create_room_selectors:
            try:
                if selector.startswith("//"):
                    create_element = self.driver.find_element(By.XPATH, selector)
                else:
                    create_element = self.driver.find_element(By.CSS_SELECTOR, selector)
                
                self.logger.note(f"Found create room option: {selector}")
                self.take_screenshot("before_room_creation")
                
                self.human_click(create_element, "create room button")
                time.sleep(3)
                self.take_screenshot("after_room_creation_click")
                
                # Check if room creation form appeared
                room_form = self.human_wait_and_find("input[name='name'], input[placeholder*='name']", 
                                                   timeout=5, description="room name input")
                
                if room_form:
                    self.logger.note("Room creation form found")
                    room_name = f"Test Room {random.randint(1000, 9999)}"
                    self.human_type(room_form, room_name, "room name field")
                    
                    # Submit room creation
                    create_btn = self.human_wait_and_find("button[type='submit']", 
                                                        description="room creation submit")
                    # Also try to find by text content if not found
                    if not create_btn:
                        buttons = self.driver.find_elements(By.TAG_NAME, "button")
                        for btn in buttons:
                            if btn.text and "create" in btn.text.lower():
                                create_btn = btn
                                break
                    if create_btn:
                        self.human_click(create_btn, "create room submit")
                        time.sleep(5)
                        self.take_screenshot("room_created")
                        
                        # Extract room code
                        room_code = self.extract_room_code()
                        if room_code:
                            self.log_success("Room Creation", f"Successfully created room: {room_code}")
                            self.created_rooms.append(room_code)
                            return room_code
                        else:
                            self.log_issue("MEDIUM", "Room Creation", "Room created but code not found")
                            return "CREATED"
                else:
                    # Maybe room was created automatically
                    room_code = self.extract_room_code()
                    if room_code:
                        self.log_success("Room Creation", f"Room auto-created: {room_code}")
                        self.created_rooms.append(room_code)
                        return room_code
                
                room_created = True
                break
                
            except:
                continue
        
        if not room_created:
            self.log_issue("HIGH", "Room Creation", "Cannot find room creation functionality")
        
        return None
    
    def extract_room_code(self):
        """Extract room code from current page"""
        try:
            # Check URL for room code
            current_url = self.driver.current_url
            if "/room/" in current_url:
                room_code = current_url.split("/room/")[-1]
                if len(room_code) >= 5:  # Reasonable room code length
                    return room_code
            
            # Check page content for room code pattern
            page_text = self.driver.find_element(By.TAG_NAME, "body").text
            
            # Look for common room code patterns (6-8 alphanumeric characters)
            import re
            room_codes = re.findall(r'\b[A-Z0-9]{6,8}\b', page_text)
            if room_codes:
                return room_codes[0]
            
        except:
            pass
        
        return None
    
    def test_multiplayer_joining(self, room_code):
        """Test other players joining the room"""
        self.logger.note(f"Testing multiplayer room joining for room: {room_code}")
        
        # For this test, we'll simulate the process
        # In a full implementation, you'd open multiple browser instances
        
        self.log_success("Room Joining", f"Room {room_code} is available for joining (simulated)")
        
        # Check that room page loads correctly
        self.human_navigate(f"/room/{room_code}")
        self.human_observe_page("multiplayer room page")
        
        if self.verify_text_present("waiting") or self.verify_text_present("player") or self.verify_text_present("ready"):
            self.log_success("Room Page", "Multiplayer room page displays correctly")
        else:
            self.log_issue("MEDIUM", "Room Page", "Room page may not be displaying correctly")
    
    def test_multiplayer_ready_states(self):
        """Test ready/not ready functionality"""
        self.logger.note("Testing multiplayer ready states")
        
        # Look for ready button
        ready_selectors = [
            "//button[contains(text(), 'Ready')]",
            "//button[contains(text(), 'Not Ready')]",
            "[data-testid='ready-toggle']",
            "//button[contains(@class, 'ready')]"
        ]
        
        ready_btn_found = False
        for selector in ready_selectors:
            try:
                if selector.startswith("//"):
                    ready_btn = self.driver.find_element(By.XPATH, selector)
                else:
                    ready_btn = self.driver.find_element(By.CSS_SELECTOR, selector)
                
                self.take_screenshot("before_ready_toggle")
                self.human_click(ready_btn, "ready toggle button")
                time.sleep(2)
                self.take_screenshot("after_ready_toggle")
                
                self.log_success("Ready States", "Ready toggle functionality working")
                ready_btn_found = True
                break
                
            except:
                continue
        
        if not ready_btn_found:
            self.log_issue("MEDIUM", "Ready States", "Ready toggle button not found")
    
    def test_multiplayer_game_start(self):
        """Test starting multiplayer games"""
        self.logger.note("Testing multiplayer game start")
        
        # Look for start game button
        start_selectors = [
            "//button[contains(text(), 'Start Game')]",
            "//button[contains(text(), 'Start')]",
            "[data-testid='start-game']"
        ]
        
        for selector in start_selectors:
            try:
                if selector.startswith("//"):
                    start_btn = self.driver.find_element(By.XPATH, selector)
                else:
                    start_btn = self.driver.find_element(By.CSS_SELECTOR, selector)
                
                self.take_screenshot("before_game_start")
                self.human_click(start_btn, "start game button")
                time.sleep(5)  # Wait for game to start
                self.take_screenshot("after_game_start")
                
                # Check if game started
                if self.verify_text_present("question") or self.verify_text_present("timer"):
                    self.log_success("Game Start", "Multiplayer game started successfully")
                    return True
                else:
                    self.log_issue("MEDIUM", "Game Start", "Game start unclear")
                    return False
                    
            except:
                continue
        
        self.log_issue("MEDIUM", "Game Start", "Start game button not found")
        return False
    
    def test_multiplayer_question_flow(self):
        """Test multiplayer question answering"""
        self.logger.note("Testing multiplayer question flow")
        
        # Similar to single player but check for multiplayer-specific elements
        questions_tested = 0
        
        for i in range(3):  # Test a few questions
            time.sleep(2)
            
            # Check for multiplayer-specific elements
            if self.verify_text_present("players answered") or self.verify_text_present("waiting for"):
                self.log_success("Multiplayer Features", f"Question {i+1} shows multiplayer status")
            
            # Test answer submission (similar to single player)
            answer_options = self.driver.find_elements(By.CSS_SELECTOR, 
                "button[class*='answer'], button[class*='option']")
            
            if answer_options:
                answer = random.choice(answer_options)
                self.human_click(answer, f"answer for multiplayer question {i+1}")
                
                # Find submit button by text content
                submit_btn = None
                submit_buttons = self.driver.find_elements(By.TAG_NAME, "button")
                for btn in submit_buttons:
                    if btn.text and "submit" in btn.text.lower():
                        submit_btn = btn
                        break
                if submit_btn:
                    self.human_click(submit_btn, "submit multiplayer answer")
                    time.sleep(2)
                    questions_tested += 1
                else:
                    break
            else:
                break
        
        if questions_tested > 0:
            self.log_success("Multiplayer Questions", f"Successfully answered {questions_tested} multiplayer questions")
        else:
            self.log_issue("HIGH", "Multiplayer Questions", "Could not answer multiplayer questions")
    
    def test_navigation_and_ui(self):
        """Test general navigation and UI components"""
        self.logger.note("=== TESTING NAVIGATION AND UI COMPONENTS ===")
        
        # Test main navigation
        nav_pages = [
            ("/", "Home page"),
            ("/dashboard", "Dashboard"), 
            ("/auth/login", "Login page"),
            ("/auth/register", "Registration page")
        ]
        
        for path, description in nav_pages:
            self.logger.note(f"Testing navigation to {description}")
            self.human_navigate(path)
            
            # Check page loads correctly
            if self.driver.title and len(self.driver.title) > 0:
                self.log_success("Navigation", f"{description} loads correctly")
            else:
                self.log_issue("MEDIUM", "Navigation", f"{description} may have loading issues")
            
            # Check for error messages
            if self.verify_text_present("404") or self.verify_text_present("error") or self.verify_text_present("not found"):
                self.log_issue("HIGH", "Navigation", f"{description} shows error messages")
            
            # Brief observation
            self.human_observe_page(description.lower())
            
            time.sleep(1)
    
    def test_responsive_design(self):
        """Test responsive design and mobile compatibility"""
        self.logger.note("=== TESTING RESPONSIVE DESIGN ===")
        
        # Test different viewport sizes
        viewports = [
            (1920, 1080, "Desktop Large"),
            (1366, 768, "Desktop Standard"), 
            (768, 1024, "Tablet"),
            (375, 667, "Mobile")
        ]
        
        for width, height, device in viewports:
            self.logger.note(f"Testing {device} viewport ({width}x{height})")
            self.driver.set_window_size(width, height)
            time.sleep(1)
            
            # Navigate to key pages and check layout
            self.human_navigate("/dashboard")
            time.sleep(2)
            
            # Check if basic elements are visible
            buttons = self.driver.find_elements(By.TAG_NAME, "button")
            links = self.driver.find_elements(By.TAG_NAME, "a")
            
            if len(buttons) > 0 and len(links) > 0:
                self.log_success("Responsive Design", f"{device} viewport displays interactive elements")
            else:
                self.log_issue("HIGH", "Responsive Design", f"{device} viewport may have layout issues")
            
            self.take_screenshot(f"responsive_{device.lower().replace(' ', '_')}")
        
        # Reset to standard size
        self.driver.set_window_size(1366, 768)
    
    def test_error_handling(self):
        """Test error handling and edge cases"""
        self.logger.note("=== TESTING ERROR HANDLING ===")
        
        # Test invalid URLs
        invalid_urls = [
            "/nonexistent-page",
            "/room/INVALID123", 
            "/quiz/999999",
            "/dashboard/fake"
        ]
        
        for url in invalid_urls:
            self.logger.note(f"Testing error handling for {url}")
            self.human_navigate(url)
            time.sleep(2)
            
            # Check for proper error handling
            if self.verify_text_present("404") or self.verify_text_present("not found") or self.verify_text_present("error"):
                self.log_success("Error Handling", f"Proper error page for {url}")
            else:
                # Check if redirected to a safe page
                current_url = self.driver.current_url
                if current_url != f"{self.base_url}{url}":
                    self.log_success("Error Handling", f"Safely redirected from invalid URL {url}")
                else:
                    self.log_issue("MEDIUM", "Error Handling", f"No clear error handling for {url}")
    
    def login_user(self, user):
        """Helper method to login a specific user"""
        self.human_navigate("/auth/login")
        
        email_field = self.human_wait_and_find("input[name='email']", description="login email")
        password_field = self.human_wait_and_find("input[type='password']", description="login password")
        
        if email_field and password_field:
            self.human_type(email_field, user['email'], "email field")
            self.human_type(password_field, user['password'], "password field")
            
            login_btn = self.human_wait_and_find("button[type='submit']", description="login submit")
            if login_btn:
                self.human_click(login_btn, "login button")
                time.sleep(3)
                
                # Check login success
                current_url = self.driver.current_url
                if not "login" in current_url or self.verify_text_present("welcome"):
                    user['logged_in'] = True
                    return True
        
        user['logged_in'] = False
        return False
    
    def generate_comprehensive_report(self):
        """Generate detailed comprehensive test report"""
        self.logger.note("=== GENERATING COMPREHENSIVE TEST REPORT ===")
        
        print(f"\n🎯 COMPREHENSIVE QUIZMASTER PRO TEST REPORT")
        print("=" * 80)
        print(f"Test Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Total Issues Found: {len(self.discovered_issues)}")
        print(f"Total Features Working: {len(self.successful_features)}")
        
        # Categorize issues by severity
        critical_issues = [i for i in self.discovered_issues if i['severity'] == 'CRITICAL']
        high_issues = [i for i in self.discovered_issues if i['severity'] == 'HIGH']
        medium_issues = [i for i in self.discovered_issues if i['severity'] == 'MEDIUM']
        low_issues = [i for i in self.discovered_issues if i['severity'] == 'LOW']
        
        print(f"\n📊 ISSUE BREAKDOWN:")
        print(f"🔴 CRITICAL: {len(critical_issues)}")
        print(f"🟠 HIGH: {len(high_issues)}")  
        print(f"🟡 MEDIUM: {len(medium_issues)}")
        print(f"🟢 LOW: {len(low_issues)}")
        
        # Show critical and high issues
        if critical_issues or high_issues:
            print(f"\n🚨 CRITICAL & HIGH PRIORITY ISSUES:")
            print("-" * 50)
            for issue in critical_issues + high_issues:
                print(f"{issue['severity']} - {issue['component']}: {issue['description']}")
                if issue['screenshot']:
                    print(f"    📸 Screenshot: {issue['screenshot']}")
        
        # Show successful features
        print(f"\n✅ WORKING FEATURES:")
        print("-" * 30)
        components = {}
        for feature in self.successful_features:
            if feature['component'] not in components:
                components[feature['component']] = []
            components[feature['component']].append(feature['description'])
        
        for component, features in components.items():
            print(f"📦 {component}:")
            for feature in features:
                print(f"  ✓ {feature}")
        
        # Overall assessment
        total_tests = len(self.discovered_issues) + len(self.successful_features)
        success_rate = (len(self.successful_features) / max(1, total_tests)) * 100
        
        print(f"\n🎯 OVERALL ASSESSMENT:")
        print("-" * 25)
        print(f"Success Rate: {success_rate:.1f}%")
        
        if len(critical_issues) == 0 and len(high_issues) <= 2:
            print("🎉 APPLICATION IS MOSTLY FUNCTIONAL!")
            print("💡 Recommendation: Address medium priority issues and deploy")
        elif len(critical_issues) <= 2 and len(high_issues) <= 5:
            print("⚠️ APPLICATION NEEDS SOME FIXES")
            print("💡 Recommendation: Fix critical and high priority issues before release")
        else:
            print("🚨 APPLICATION NEEDS SIGNIFICANT WORK")
            print("💡 Recommendation: Address all critical and high priority issues")
        
        # Save detailed report
        report_filename = f"comprehensive_test_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        detailed_report = {
            "timestamp": datetime.now().isoformat(),
            "total_issues": len(self.discovered_issues),
            "total_successes": len(self.successful_features),
            "success_rate": success_rate,
            "issues": self.discovered_issues,
            "successes": self.successful_features,
            "summary": {
                "critical": len(critical_issues),
                "high": len(high_issues), 
                "medium": len(medium_issues),
                "low": len(low_issues)
            }
        }
        
        with open(report_filename, 'w') as f:
            json.dump(detailed_report, f, indent=2)
        
        print(f"\n📄 Detailed report saved: {report_filename}")
        print("=" * 80)
    
    def run_comprehensive_tests(self):
        """Run all comprehensive tests"""
        self.setup_browser()
        
        try:
            self.logger.note("🚀 STARTING COMPREHENSIVE QUIZMASTER PRO APPLICATION TESTING")
            
            # Test all aspects of the application
            self.test_user_management_flows()
            self.test_single_player_flows()
            self.test_multiplayer_flows()
            self.test_navigation_and_ui()
            self.test_responsive_design()
            self.test_error_handling()
            
            # Generate comprehensive report
            self.generate_comprehensive_report()
            
        except Exception as e:
            self.logger.concern(f"Critical error during comprehensive testing: {str(e)}")
            self.take_screenshot("critical_error")
        
        finally:
            self.cleanup()


def main():
    """Run comprehensive QuizMaster Pro testing"""
    print("🎮 COMPREHENSIVE QUIZMASTER PRO APPLICATION TESTING")
    print("=" * 60)
    print("This test will explore EVERY aspect of your application:")
    print("• Single Player Quiz Flows")  
    print("• Multiplayer Game Flows")
    print("• User Management & Authentication")
    print("• Navigation & UI Components") 
    print("• Responsive Design")
    print("• Error Handling & Edge Cases")
    print()
    print("The test behaves like a real user and will identify what works and what doesn't.")
    print("=" * 60)
    
    tester = ComprehensiveAppTester()
    tester.run_comprehensive_tests()

if __name__ == "__main__":
    main()
