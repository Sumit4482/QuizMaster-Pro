#!/usr/bin/env node

/**
 * Open Swagger Documentation in Browser
 * Utility script to launch API documentation
 */

const { exec } = require('child_process');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const SWAGGER_URL = `${BASE_URL}/api-docs`;

console.log('🚀 Opening QuizMaster Pro API Documentation...');
console.log(`📖 URL: ${SWAGGER_URL}`);

// Check if server is running
const axios = require('axios');

async function checkServer() {
  try {
    const response = await axios.get(`${BASE_URL}/health/ready`, { timeout: 5000 });
    if (response.data.success) {
      console.log('✅ Server is running and healthy');
      openBrowser();
    } else {
      console.log('⚠️ Server is running but not ready');
      console.log('💡 Try: npm start');
    }
  } catch (error) {
    console.log('❌ Server is not running or not accessible');
    console.log(`💡 Start the server first: npm start`);
    console.log(`📍 Then access: ${SWAGGER_URL}`);
    process.exit(1);
  }
}

function openBrowser() {
  let command;
  
  switch (process.platform) {
    case 'darwin': // macOS
      command = `open "${SWAGGER_URL}"`;
      break;
    case 'win32': // Windows
      command = `start "${SWAGGER_URL}"`;
      break;
    default: // Linux
      command = `xdg-open "${SWAGGER_URL}"`;
      break;
  }

  exec(command, (error) => {
    if (error) {
      console.log(`⚠️ Could not open browser automatically: ${error.message}`);
      console.log(`📖 Please open this URL manually: ${SWAGGER_URL}`);
    } else {
      console.log('🌐 Browser opened successfully!');
      console.log('📚 You can now explore the QuizMaster Pro API documentation');
    }
  });
}

checkServer();
