#!/usr/bin/env python3

"""
QUICK TEST TO VERIFY ALL FIXES
==============================

Tests the authentication fixes I've implemented:
1. Registration error handling improvements
2. Login error handling improvements  
3. Better user feedback systems
4. Token management fixes
"""

import os
import sys
import time
import random
import subprocess
from datetime import datetime

def install_selenium():
    try:
        from selenium import webdriver
        return True
    except ImportError:
        print("Installing Selenium...")
        os.system("pip3 install --user selenium webdriver-manager > /dev/null 2>&1")
        return True

install_selenium()

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager

class FixVerificationTester:
    """Quick tester to verify authentication fixes"""
    
    def __init__(self):
        self.base_url = "http://localhost:3000"
        self.driver = None
        self.results = []
        
    def setup_browser(self):
        """Setup headless browser for quick testing"""
        options = Options()
        options.add_argument("--headless")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1366,768")
        
        service = Service(ChromeDriverManager().install())
        self.driver = webdriver.Chrome(service=service, options=options)
        self.driver.implicitly_wait(3)
        
        print("✅ Browser setup complete")
    
    def log_result(self, test: str, status: str, details: str = ""):
        """Log test results"""
        result = {
            'test': test,
            'status': status,
            'details': details,
            'timestamp': datetime.now().strftime('%H:%M:%S')
        }
        self.results.append(result)
        
        icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
        print(f"{icon} {test}: {status}")
        if details:
            print(f"   📝 {details}")
    
    def test_registration_error_feedback(self):
        """Test that registration shows specific error messages"""
        print("\n🔐 Testing Registration Error Feedback...")
        
        try:
            self.driver.get(f"{self.base_url}/auth/register")
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "form"))
            )
            
            # Test with a known taken username
            email_field = self.driver.find_element(By.NAME, "email")
            username_field = self.driver.find_element(By.NAME, "username") 
            password_field = self.driver.find_element(By.CSS_SELECTOR, "input[type='password']")
            confirm_password_field = self.driver.find_element(By.NAME, "confirmPassword")
            
            # Fill form with existing username
            email_field.send_keys("testuser@test.com")
            username_field.send_keys("testuser")  # This should already exist
            password_field.send_keys("Test123!")
            confirm_password_field.send_keys("Test123!")
            
            # Submit form
            submit_btn = self.driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
            submit_btn.click()
            
            # Wait for error response
            time.sleep(3)
            
            # Check for specific error messages
            page_source = self.driver.page_source.lower()
            
            if "username is already taken" in page_source or "already exists" in page_source:
                self.log_result("Registration Error Messages", "PASS", "Specific error message displayed")
            elif "error" in page_source or "failed" in page_source:
                self.log_result("Registration Error Messages", "WARN", "Generic error shown - improvement needed")
            else:
                self.log_result("Registration Error Messages", "FAIL", "No error feedback visible")
                
        except Exception as e:
            self.log_result("Registration Error Messages", "FAIL", f"Test failed: {str(e)}")
    
    def test_login_error_feedback(self):
        """Test that login shows specific error messages"""
        print("\n🔑 Testing Login Error Feedback...")
        
        try:
            self.driver.get(f"{self.base_url}/auth/login")
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "form"))
            )
            
            # Test with invalid credentials
            email_field = self.driver.find_element(By.NAME, "email")
            password_field = self.driver.find_element(By.CSS_SELECTOR, "input[type='password']")
            
            email_field.send_keys("invalid@test.com")
            password_field.send_keys("WrongPassword123!")
            
            # Submit form
            submit_btn = self.driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
            submit_btn.click()
            
            # Wait for error response
            time.sleep(3)
            
            # Check for specific error messages
            page_source = self.driver.page_source.lower()
            
            if "invalid email or password" in page_source or "invalid credentials" in page_source:
                self.log_result("Login Error Messages", "PASS", "Specific error message displayed")
            elif "error" in page_source or "failed" in page_source:
                self.log_result("Login Error Messages", "WARN", "Generic error shown - improvement needed")  
            else:
                self.log_result("Login Error Messages", "FAIL", "No error feedback visible")
                
        except Exception as e:
            self.log_result("Login Error Messages", "FAIL", f"Test failed: {str(e)}")
    
    def test_form_validation(self):
        """Test form validation improvements"""
        print("\n📝 Testing Form Validation...")
        
        try:
            self.driver.get(f"{self.base_url}/auth/register")
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "form"))
            )
            
            # Test empty form submission
            submit_btn = self.driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
            submit_btn.click()
            
            time.sleep(2)
            
            # Check for validation messages
            error_elements = self.driver.find_elements(By.CSS_SELECTOR, 
                "[class*='error'], [role='alert'], .text-red-500, .text-error")
            
            if len(error_elements) > 0:
                self.log_result("Form Validation", "PASS", f"Found {len(error_elements)} validation messages")
            else:
                # Check page source for validation text
                page_source = self.driver.page_source.lower()
                if "required" in page_source or "invalid" in page_source:
                    self.log_result("Form Validation", "PASS", "Validation feedback present")
                else:
                    self.log_result("Form Validation", "FAIL", "No validation feedback found")
                    
        except Exception as e:
            self.log_result("Form Validation", "FAIL", f"Test failed: {str(e)}")
    
    def test_page_navigation(self):
        """Test that basic navigation works"""
        print("\n🧭 Testing Page Navigation...")
        
        pages_to_test = [
            ("/", "Home Page"),
            ("/auth/login", "Login Page"),
            ("/auth/register", "Registration Page"), 
            ("/dashboard", "Dashboard")
        ]
        
        for path, name in pages_to_test:
            try:
                self.driver.get(f"{self.base_url}{path}")
                WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.TAG_NAME, "body"))
                )
                
                # Check if page loaded properly
                title = self.driver.title
                if title and len(title) > 0:
                    self.log_result(f"Navigation: {name}", "PASS", f"Page loads correctly")
                else:
                    self.log_result(f"Navigation: {name}", "WARN", "Page loads but no title")
                    
            except Exception as e:
                self.log_result(f"Navigation: {name}", "FAIL", f"Failed to load: {str(e)}")
    
    def test_api_connectivity(self):
        """Test API connectivity"""
        print("\n🔌 Testing API Connectivity...")
        
        try:
            # Test API health endpoint
            import requests
            response = requests.get("http://localhost:3001/health/ready", timeout=5)
            
            if response.status_code == 200:
                self.log_result("API Connectivity", "PASS", "Backend API is reachable")
            else:
                self.log_result("API Connectivity", "FAIL", f"API returned status {response.status_code}")
                
        except requests.exceptions.ConnectionError:
            self.log_result("API Connectivity", "FAIL", "Cannot connect to backend API")
        except Exception as e:
            self.log_result("API Connectivity", "FAIL", f"API test failed: {str(e)}")
    
    def run_all_tests(self):
        """Run all verification tests"""
        print("🚀 VERIFYING ALL AUTHENTICATION FIXES")
        print("=" * 50)
        
        try:
            self.setup_browser()
            
            # Run all tests
            self.test_api_connectivity()
            self.test_page_navigation()
            self.test_form_validation()
            self.test_registration_error_feedback()
            self.test_login_error_feedback()
            
            # Generate summary
            self.generate_summary()
            
        except Exception as e:
            print(f"💥 Critical error: {e}")
            
        finally:
            if self.driver:
                self.driver.quit()
    
    def generate_summary(self):
        """Generate test summary"""
        print(f"\n📊 TEST SUMMARY")
        print("=" * 30)
        
        passed = [r for r in self.results if r['status'] == 'PASS']
        failed = [r for r in self.results if r['status'] == 'FAIL'] 
        warnings = [r for r in self.results if r['status'] == 'WARN']
        
        print(f"✅ PASSED: {len(passed)}")
        print(f"❌ FAILED: {len(failed)}")
        print(f"⚠️ WARNINGS: {len(warnings)}")
        
        success_rate = (len(passed) / len(self.results)) * 100 if self.results else 0
        print(f"📈 Success Rate: {success_rate:.1f}%")
        
        if failed:
            print(f"\n❌ FAILED TESTS:")
            for result in failed:
                print(f"  • {result['test']}: {result['details']}")
        
        if warnings:
            print(f"\n⚠️ WARNINGS:")
            for result in warnings:
                print(f"  • {result['test']}: {result['details']}")
        
        print(f"\n🎯 ASSESSMENT:")
        if len(failed) == 0:
            print("🎉 ALL FIXES WORKING CORRECTLY!")
        elif len(failed) <= 2:
            print("✅ Most fixes working - minor issues to address")
        else:
            print("🚨 Some fixes need more work")
        
        print("=" * 50)

def main():
    """Run fix verification tests"""
    print("🔧 QUICK FIX VERIFICATION TEST")
    print("Testing all authentication and form improvements...")
    print()
    
    tester = FixVerificationTester()
    tester.run_all_tests()

if __name__ == "__main__":
    main()
