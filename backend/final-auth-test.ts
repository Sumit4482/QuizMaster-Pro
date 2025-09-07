// Final comprehensive authentication test
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './src/services/authService';
import { config } from './src/config/environment';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:development_password_change_in_production@localhost:5432/quizmaster'
    }
  }
});

async function comprehensiveTest() {
  console.log('🔬 COMPREHENSIVE AUTH TEST\n');

  // 1. Test environment
  console.log('1️⃣ Environment Check:');
  console.log('   DATABASE_URL:', !!config.DATABASE_URL);
  console.log('   JWT_SECRET:', !!config.JWT.SECRET);
  console.log('   JWT_REFRESH_SECRET:', !!config.JWT.REFRESH_SECRET);

  // 2. Test database connection
  console.log('\n2️⃣ Database Connection:');
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('   ✅ Database connected');
  } catch (error) {
    console.log('   ❌ Database error:', error instanceof Error ? error.message : error);
    return;
  }

  // 3. Test user in database
  console.log('\n3️⃣ User Verification:');
  const user = await prisma.user.findUnique({
    where: { email: 'admin@quizmaster.pro' }
  });
  
  if (!user) {
    console.log('   ❌ User not found');
    return;
  }
  
  console.log('   ✅ User found:', {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    hashLength: user.passwordHash.length
  });

  // 4. Test password hash
  console.log('\n4️⃣ Password Hash Verification:');
  const testPassword = 'Admin123!';
  const isValidHash = await bcrypt.compare(testPassword, user.passwordHash);
  console.log(`   Password "${testPassword}":`, isValidHash ? '✅ VALID' : '❌ INVALID');
  
  if (!isValidHash) {
    console.log('   🔧 Creating new hash...');
    const newHash = await bcrypt.hash(testPassword, 12);
    console.log('   New hash validation:', await bcrypt.compare(testPassword, newHash));
    
    // Update user with new hash
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash }
    });
    console.log('   ✅ Updated user password hash');
  }

  // 5. Test AuthService directly
  console.log('\n5️⃣ AuthService Test:');
  try {
    const authService = new AuthService();
    const result = await authService.login({
      email: 'admin@quizmaster.pro',
      password: 'Admin123!',
      rememberMe: false
    });
    
    console.log('   ✅ AuthService.login() SUCCESS!');
    console.log('   User ID:', result.user.id);
    console.log('   Access Token length:', result.tokens.accessToken.length);
    
  } catch (error) {
    console.log('   ❌ AuthService.login() FAILED:', error instanceof Error ? error.message : error);
  }

  // 6. Test different passwords
  console.log('\n6️⃣ Password Variations Test:');
  const passwords = ['admin123', 'Admin123', 'Admin123!', 'password123'];
  
  const updatedUser = await prisma.user.findUnique({
    where: { email: 'admin@quizmaster.pro' }
  });
  
  if (updatedUser) {
    for (const pwd of passwords) {
      const isValid = await bcrypt.compare(pwd, updatedUser.passwordHash);
      console.log(`   "${pwd}":`, isValid ? '✅ VALID' : '❌ invalid');
    }
  }

  await prisma.$disconnect();
  console.log('\n🎯 Test Complete!');
}

comprehensiveTest().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
