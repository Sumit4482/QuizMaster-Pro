// Simulate the exact API call flow
import { AuthService } from './src/services/authService';

async function simulateAPICall() {
  console.log('🎯 Simulating exact API call flow...');
  
  // Create auth service instance (like the controller does)
  const authService = new AuthService();
  
  // Prepare request data (exactly like the API receives)
  const loginData = {
    email: 'admin@quizmaster.pro',
    password: 'Admin123!',
    rememberMe: false
  };
  
  console.log('📤 Request data:', { 
    email: loginData.email, 
    password: '***HIDDEN***',
    rememberMe: loginData.rememberMe 
  });
  
  try {
    console.log('\n🔍 Calling authService.login()...');
    const result = await authService.login(loginData);
    
    console.log('✅ SUCCESS! Login completed');
    console.log('👤 User:', {
      id: result.user.id,
      email: result.user.email,
      username: result.user.username,
      role: result.user.role
    });
    console.log('🎫 Tokens:', {
      accessTokenLength: result.tokens.accessToken.length,
      refreshTokenLength: result.tokens.refreshToken.length,
      expiresAt: result.tokens.expiresAt
    });
    
    console.log('\n🎉 API simulation completely successful!');
    
    return {
      success: true,
      data: result,
      message: 'Login successful'
    };
    
  } catch (error) {
    console.log('\n❌ FAILED - AuthService.login() error:', error instanceof Error ? error.message : error);
    
    if (error instanceof Error && error.stack) {
      console.log('📋 Stack trace:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
    
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password'
      }
    };
  }
}

simulateAPICall().then(result => {
  console.log('\n📊 Final result:', JSON.stringify(result, null, 2));
}).catch(console.error);
