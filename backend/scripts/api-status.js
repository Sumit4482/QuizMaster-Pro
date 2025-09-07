#!/usr/bin/env node

/**
 * QuizMaster Pro API Status & Command Summary
 * Quick overview of API health and available commands
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

class APIStatus {
  constructor() {
    this.api = axios.create({
      baseURL: BASE_URL,
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async checkHealth() {
    try {
      const response = await this.api.get('/health/ready');
      return {
        status: 'healthy',
        database: response.data.data.services.database,
        redis: response.data.data.services.redis,
        uptime: response.data.data.uptime || 'N/A'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async checkSwagger() {
    try {
      await this.api.get('/api-docs');
      return { available: true };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }

  getLastTestResults() {
    const reportPath = path.join(__dirname, '..', 'COMPREHENSIVE_API_TEST_REPORT.md');
    try {
      if (fs.existsSync(reportPath)) {
        const content = fs.readFileSync(reportPath, 'utf8');
        
        // Extract key metrics from the report
        const successRateMatch = content.match(/\*\*🎯 Success Rate\*\* \| ([\d.]+)%/);
        const totalTestsMatch = content.match(/\*\*Total Tests\*\* \| (\d+)/);
        const passedTestsMatch = content.match(/\*\*✅ Passed\*\* \| (\d+)/);
        const failedTestsMatch = content.match(/\*\*❌ Failed\*\* \| (\d+)/);
        const durationMatch = content.match(/\*\*⏱️ Total Duration\*\* \| ([\d.]+)s/);
        
        return {
          available: true,
          successRate: successRateMatch ? successRateMatch[1] : 'N/A',
          totalTests: totalTestsMatch ? parseInt(totalTestsMatch[1]) : 0,
          passedTests: passedTestsMatch ? parseInt(passedTestsMatch[1]) : 0,
          failedTests: failedTestsMatch ? parseInt(failedTestsMatch[1]) : 0,
          duration: durationMatch ? durationMatch[1] : 'N/A',
          lastRun: fs.statSync(reportPath).mtime.toISOString()
        };
      }
      return { available: false };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }

  displayStatus() {
    console.log('🎯 QuizMaster Pro API Status Dashboard');
    console.log('==========================================\n');
  }

  displayHealthStatus(health) {
    console.log('🏥 Server Health:');
    if (health.status === 'healthy') {
      console.log(`   ✅ Status: ${health.status.toUpperCase()}`);
      console.log(`   💾 Database: ${health.database}`);
      console.log(`   🔴 Redis: ${health.redis}`);
      if (health.uptime !== 'N/A') {
        const uptimeHours = (parseFloat(health.uptime) / 3600).toFixed(2);
        console.log(`   ⏰ Uptime: ${uptimeHours}h`);
      }
    } else {
      console.log(`   ❌ Status: ${health.status.toUpperCase()}`);
      console.log(`   💥 Error: ${health.error}`);
    }
    console.log();
  }

  displaySwaggerStatus(swagger) {
    console.log('📚 API Documentation:');
    if (swagger.available) {
      console.log(`   ✅ Swagger UI: Available at ${BASE_URL}/api-docs`);
      console.log(`   📖 Command: npm run docs:dev`);
    } else {
      console.log(`   ❌ Swagger UI: Not available`);
      console.log(`   💥 Error: ${swagger.error || 'Unknown'}`);
    }
    console.log();
  }

  displayTestResults(results) {
    console.log('🧪 Last Test Results:');
    if (results.available) {
      const statusIcon = parseFloat(results.successRate) === 100 ? '✅' : 
                        parseFloat(results.successRate) >= 90 ? '⚠️' : '❌';
      
      console.log(`   ${statusIcon} Success Rate: ${results.successRate}%`);
      console.log(`   📊 Tests: ${results.passedTests}/${results.totalTests} passed`);
      if (results.failedTests > 0) {
        console.log(`   ❌ Failed: ${results.failedTests}`);
      }
      console.log(`   ⏱️ Duration: ${results.duration}s`);
      console.log(`   📅 Last Run: ${new Date(results.lastRun).toLocaleString()}`);
      console.log(`   📄 Report: COMPREHENSIVE_API_TEST_REPORT.md`);
    } else {
      console.log('   ⚪ No test results available');
      console.log('   💡 Run: npm run test:api:comprehensive:dev');
    }
    console.log();
  }

  displayCommands() {
    console.log('🚀 Available Commands:');
    console.log('');
    
    console.log('📊 Testing:');
    console.log('   npm run test:api:dev                    # Quick API tests');
    console.log('   npm run test:api:comprehensive:dev      # Full test suite (recommended)');
    console.log('   npm run test:api:prod                   # Test production API');
    console.log('');
    
    console.log('📖 Documentation:');
    console.log('   npm run docs:dev                        # Open Swagger UI');
    console.log('   npm run docs:prod                       # Open production docs');
    console.log('');
    
    console.log('🔧 Development:');
    console.log('   npm start                               # Start production server');
    console.log('   npm run dev                             # Start development server');
    console.log('   npm run build                           # Build application');
    console.log('');
    
    console.log('💾 Database:');
    console.log('   npm run db:reset                        # Reset database');
    console.log('   npm run db:seed                         # Seed with test data');
    console.log('   npm run db:studio                       # Open Prisma Studio');
    console.log('');
  }

  displayRecommendations(health, results) {
    console.log('💡 Recommendations:');
    
    if (health.status !== 'healthy') {
      console.log('   🔧 Start the server: npm start');
    }
    
    if (!results.available) {
      console.log('   🧪 Run tests to verify API functionality: npm run test:api:comprehensive:dev');
    } else if (results.failedTests > 0) {
      console.log(`   🔧 Fix ${results.failedTests} failing test${results.failedTests > 1 ? 's' : ''} - check report for details`);
    } else {
      console.log('   ✅ All systems operational! API is ready for use');
    }
    
    if (health.status === 'healthy' && (!results.available || results.failedTests === 0)) {
      console.log('   🚀 Deploy with confidence - all checks passed');
    }
    
    console.log();
  }

  displayFooter() {
    console.log('═══════════════════════════════════════════');
    console.log('📋 For detailed information:');
    console.log(`   API Base URL: ${BASE_URL}`);
    console.log('   Test Reports: COMPREHENSIVE_API_TEST_REPORT.md');
    console.log('   Documentation: API_TESTING_README.md');
    console.log('   Swagger UI: /api-docs');
    console.log('');
    console.log('🔄 Refresh status: npm run api:status');
  }

  async run() {
    this.displayStatus();
    
    console.log('Checking server health...');
    const health = await this.checkHealth();
    this.displayHealthStatus(health);
    
    if (health.status === 'healthy') {
      console.log('Checking documentation...');
      const swagger = await this.checkSwagger();
      this.displaySwaggerStatus(swagger);
    }
    
    const results = this.getLastTestResults();
    this.displayTestResults(results);
    
    this.displayCommands();
    this.displayRecommendations(health, results);
    this.displayFooter();
  }
}

// Run the status check
const statusChecker = new APIStatus();
statusChecker.run().catch(error => {
  console.error('Error running status check:', error.message);
  process.exit(1);
});
