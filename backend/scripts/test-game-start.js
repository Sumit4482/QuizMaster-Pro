/**
 * Test Game Start Script - QuizMaster Pro
 * Tests if games can start with current database questions
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testGameQuestionGeneration() {
  console.log('🎮 TESTING GAME QUESTION GENERATION...\n');

  try {
    // Test 1: Check total questions available
    const totalQuestions = await prisma.question.count({
      where: {
        isActive: true,
        isPublished: true
      }
    });
    
    console.log(`✅ Total active published questions: ${totalQuestions}`);

    // Test 2: Check questions by category
    const questionsByCategory = await prisma.question.groupBy({
      by: ['id'],
      where: {
        isActive: true,
        isPublished: true
      },
      _count: true
    });

    console.log(`✅ Available questions for games: ${questionsByCategory.length}`);

    // Test 3: Try to generate questions for a game (no category filter)
    const gameQuestions = await prisma.question.findMany({
      where: {
        isActive: true,
        isPublished: true
      },
      include: {
        categories: {
          include: {
            category: true
          }
        }
      },
      take: 5 // Request 5 questions for test
    });

    console.log(`✅ Successfully fetched ${gameQuestions.length} questions for game`);

    // Test 4: Show question details
    console.log('\n📋 SAMPLE QUESTIONS:');
    gameQuestions.slice(0, 3).forEach((q, index) => {
      console.log(`${index + 1}. ${q.questionText.substring(0, 60)}...`);
      console.log(`   Type: ${q.questionType}, Difficulty: ${q.difficultyLevel}`);
      console.log(`   Categories: ${q.categories.map(cat => cat.category.name).join(', ')}`);
    });

    // Test 5: Check category distribution
    console.log('\n📊 CATEGORY DISTRIBUTION:');
    const categoryStats = await prisma.$queryRaw`
      SELECT c.name, COUNT(qc.question_id) as question_count
      FROM categories c
      LEFT JOIN question_categories qc ON c.id = qc.category_id
      LEFT JOIN questions q ON qc.question_id = q.id
      WHERE q.is_published = true AND q.is_active = true
      GROUP BY c.id, c.name
      HAVING COUNT(qc.question_id) > 0
      ORDER BY question_count DESC
    `;

    categoryStats.forEach(stat => {
      console.log(`   ${stat.name}: ${stat.question_count} questions`);
    });

    // Test 6: Test specific game configuration
    const testConfig = {
      totalQuestions: 5,
      categories: [], // No category filter
      difficultyLevels: [1, 2, 3],
      questionTypes: ['MULTIPLE_CHOICE', 'TRUE_FALSE']
    };

    const whereClause = {
      isActive: true,
      isPublished: true
    };

    if (testConfig.categories.length > 0) {
      whereClause.categories = {
        some: {
          categoryId: {
            in: testConfig.categories
          }
        }
      };
    }

    if (testConfig.difficultyLevels.length > 0) {
      whereClause.difficultyLevel = {
        in: testConfig.difficultyLevels
      };
    }

    if (testConfig.questionTypes.length > 0) {
      whereClause.questionType = {
        in: testConfig.questionTypes
      };
    }

    const testQuestions = await prisma.question.findMany({
      where: whereClause,
      take: testConfig.totalQuestions
    });

    console.log(`\n🎯 GAME TEST RESULT: Found ${testQuestions.length} questions for game`);
    
    if (testQuestions.length >= testConfig.totalQuestions) {
      console.log('✅ SUCCESS: Game can start with current database!');
    } else {
      console.log('❌ ISSUE: Not enough questions for game requirements');
    }

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testGameQuestionGeneration()
  .then(() => {
    console.log('\n✨ Game test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Game test failed:', error);
    process.exit(1);
  });
