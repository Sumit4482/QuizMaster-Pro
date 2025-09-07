// Direct test of the login functionality
const fetch = require('node-fetch');

async function testLogin() {
  console.log('🔍 Testing login API directly...');
  
  try {
    const response = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'admin@quizmaster.pro',
        password: 'Admin123!'
      })
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const data = await response.json();
    console.log('Response body:', JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
}

testLogin();
