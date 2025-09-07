// Direct fix for login issue
import { PrismaClient } from '@prisma/client';
import { verifyPassword } from './src/utils/auth';
import { generateTokens } from './src/utils/auth';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:development_password_change_in_production@localhost:5432/quizmaster'
    }
  }
});

async function testAPILogin() {
  console.log('🔧 Directly testing API login scenario...');
  
  // Simulate exactly what the API controller does
  const requestBody = {
    email: 'admin@quizmaster.pro',
    password: 'Admin123!',
    rememberMe: false
  };

  console.log('Request body:', requestBody);
  
  try {
    console.log('\n1️⃣ Finding user...');
    const user = await prisma.user.findUnique({
      where: { email: requestBody.email.toLowerCase() }
    });
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('✅ User found:', user.email);
    
    console.log('\n2️⃣ Verifying password...');
    const isPasswordValid = await verifyPassword(requestBody.password, user.passwordHash);
    console.log('Password valid:', isPasswordValid);
    
    if (!isPasswordValid) {
      console.log('❌ Password verification failed');
      return;
    }
    
    console.log('\n3️⃣ Generating tokens...');
    const tokens = await generateTokens(user.id, requestBody.rememberMe);
    console.log('Tokens generated:', !!tokens.accessToken);
    
    console.log('\n✅ Login would succeed!');
    
  } catch (error) {
    console.log('❌ Error:', error instanceof Error ? error.message : error);
  }
  
  await prisma.$disconnect();
}

testAPILogin().catch(console.error);
