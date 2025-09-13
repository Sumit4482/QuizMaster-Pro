import { PrismaClient, UserRole, QuestionType } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting comprehensive database seed...');

  // =============================================
  // USERS WITH PROFILES AND STATISTICS
  // =============================================
  
  const users = [
    {
      email: 'admin@quizmaster.pro',
      username: 'admin',
      password: 'Admin123!',
      firstName: 'QuizMaster',
      lastName: 'Admin',
      role: UserRole.ADMIN,
    },
    {
      email: 'host@quizmaster.pro',
      username: 'host',
      password: 'Host123!',
      firstName: 'Quiz',
      lastName: 'Host',
      role: UserRole.HOST,
    },
    {
      email: 'player@quizmaster.pro',
      username: 'player',
      password: 'Player123!',
      firstName: 'Test',
      lastName: 'Player',
      role: UserRole.PLAYER,
    },
    {
      email: 'alice.johnson@example.com',
      username: 'alice_quiz',
      password: 'Alice123!',
      firstName: 'Alice',
      lastName: 'Johnson',
      role: UserRole.PLAYER,
    },
    {
      email: 'bob.smith@example.com',
      username: 'bob_historian',
      password: 'Bob123!',
      firstName: 'Bob',
      lastName: 'Smith',
      role: UserRole.PLAYER,
    },
    {
      email: 'carol.davis@example.com',
      username: 'carol_tech',
      password: 'Carol123!',
      firstName: 'Carol',
      lastName: 'Davis',
      role: UserRole.HOST,
    },
    {
      email: 'david.wilson@example.com',
      username: 'david_sports',
      password: 'David123!',
      firstName: 'David',
      lastName: 'Wilson',
      role: UserRole.PLAYER,
    },
    {
      email: 'emma.brown@example.com',
      username: 'emma_lit',
      password: 'Emma123!',
      firstName: 'Emma',
      lastName: 'Brown',
      role: UserRole.PLAYER,
    },
  ];

  const createdUsers = [];
  for (const userData of users) {
    const { password, ...userCreateData } = userData;
    const passwordHash = await bcrypt.hash(password, 12);
    
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: { passwordHash },
      create: {
        ...userCreateData,
        passwordHash,
        emailVerified: true,
      },
    });
    
    // Create user statistics with realistic data
    const stats = {
      totalQuizzesCompleted: Math.floor(Math.random() * 50) + 10,
      totalQuizzesStarted: Math.floor(Math.random() * 70) + 15,
      totalQuestionsAnswered: Math.floor(Math.random() * 500) + 100,
      totalCorrectAnswers: Math.floor(Math.random() * 400) + 80,
      totalTimeSpent: Math.floor(Math.random() * 10000) + 1000,
      bestScore: Math.floor(Math.random() * 100) + 50,
      longestStreak: Math.floor(Math.random() * 20) + 5,
      currentStreak: Math.floor(Math.random() * 10),
      longestDailyStreak: Math.floor(Math.random() * 30) + 5,
      experiencePoints: Math.floor(Math.random() * 5000) + 500,
      level: Math.floor(Math.random() * 10) + 1,
    };
    
    stats.completionRate = stats.totalQuizzesCompleted / stats.totalQuizzesStarted;
    stats.overallAccuracy = stats.totalCorrectAnswers / stats.totalQuestionsAnswered;
    stats.averageScore = stats.bestScore * 0.8;
    stats.averageQuizTime = stats.totalTimeSpent / stats.totalQuizzesCompleted;
    stats.averageQuestionTime = stats.totalTimeSpent / stats.totalQuestionsAnswered;
    
    await prisma.userStatistics.upsert({
      where: { userId: user.id },
      update: stats,
      create: {
        userId: user.id,
        ...stats,
        strongestCategories: ['Science', 'Technology'],
        weakestCategories: ['Sports'],
        categoryProgress: {
          'Science': 0.85,
          'Technology': 0.78,
          'History': 0.65,
          'Geography': 0.72,
        },
      },
    });

    createdUsers.push(user);
    console.log(`✅ User created: ${user.username} (${user.email})`);
  }

  const admin = createdUsers[0];
  const host = createdUsers[1];
  const player = createdUsers[2];

  // =============================================
  // ACHIEVEMENTS SYSTEM
  // =============================================
  
  const achievements = [
    {
      name: 'First Steps',
      displayName: 'First Steps',
      description: 'Complete your first quiz',
      iconUrl: '👶',
      type: 'PARTICIPATION' as const,
      category: 'general',
      rarity: 'BRONZE' as const,
      criteria: { quizzesCompleted: 1 },
    },
    {
      name: 'Quiz Rookie',
      displayName: 'Quiz Rookie',
      description: 'Complete 10 quizzes',
      iconUrl: '🎯',
      type: 'PARTICIPATION' as const,
      category: 'general',
      rarity: 'BRONZE' as const,
      criteria: { quizzesCompleted: 10 },
    },
    {
      name: 'Quiz Veteran',
      displayName: 'Quiz Veteran',
      description: 'Complete 50 quizzes',
      iconUrl: '🏆',
      type: 'PARTICIPATION' as const,
      category: 'general',
      rarity: 'SILVER' as const,
      criteria: { quizzesCompleted: 50 },
    },
    {
      name: 'Perfect Score',
      displayName: 'Perfect Score',
      description: 'Get 100% on any quiz',
      iconUrl: '💯',
      type: 'SCORE_BASED' as const,
      category: 'accuracy',
      rarity: 'GOLD' as const,
      criteria: { perfectScore: true },
    },
    {
      name: 'Lightning Fast',
      displayName: 'Lightning Fast',
      description: 'Complete a quiz in under 2 minutes',
      iconUrl: '⚡',
      type: 'SCORE_BASED' as const,
      category: 'speed',
      rarity: 'SILVER' as const,
      criteria: { completionTime: 120 },
    },
    {
      name: 'Science Master',
      displayName: 'Science Master',
      description: 'Answer 100 science questions correctly',
      iconUrl: '🔬',
      type: 'SCORE_BASED' as const,
      category: 'science',
      rarity: 'GOLD' as const,
      criteria: { categoryCorrect: { science: 100 } },
    },
    {
      name: 'Streak Master',
      displayName: 'Streak Master',
      description: 'Get a 20-question streak',
      iconUrl: '🔥',
      type: 'STREAK_BASED' as const,
      category: 'consistency',
      rarity: 'PLATINUM' as const,
      criteria: { streak: 20 },
    },
  ];

  const createdAchievements = [];
  for (const achievementData of achievements) {
    const achievement = await prisma.achievement.upsert({
      where: { name: achievementData.name },
      update: achievementData,
      create: achievementData,
    });
    createdAchievements.push(achievement);
    console.log(`✅ Achievement created: ${achievement.name}`);
  }

  // Award some achievements to users
  const userAchievements = [
    { userId: admin.id, achievementId: createdAchievements[0].id, progress: 100 },
    { userId: admin.id, achievementId: createdAchievements[1].id, progress: 100 },
    { userId: host.id, achievementId: createdAchievements[0].id, progress: 100 },
    { userId: player.id, achievementId: createdAchievements[0].id, progress: 100 },
  ];

  for (const userAchievement of userAchievements) {
    await prisma.userAchievement.upsert({
      where: {
        userId_achievementId: {
          userId: userAchievement.userId,
          achievementId: userAchievement.achievementId,
        },
      },
      update: userAchievement,
      create: {
        ...userAchievement,
        earnedAt: userAchievement.progress === 100 ? new Date() : new Date(),
      },
    });
  }

  // =============================================
  // POWER-UPS SYSTEM
  // =============================================
  
  const powerUps = [
    {
      name: 'Time Extension',
      displayName: 'Time Extension',
      description: 'Add 15 seconds to the timer',
      iconUrl: '⏰',
      type: 'TIME_EXTENSION' as const,
      rarity: 'COMMON' as const,
      cost: 50,
      cooldownSeconds: 0,
      maxUsesPerGame: 2,
      effects: { extraTime: 15 },
    },
    {
      name: 'Double Points',
      displayName: 'Double Points',
      description: 'Double points for the next question',
      iconUrl: '💰',
      type: 'POINT_MULTIPLIER' as const,
      rarity: 'RARE' as const,
      cost: 100,
      cooldownSeconds: 0,
      maxUsesPerGame: 1,
      effects: { pointMultiplier: 2 },
    },
    {
      name: '50-50 Elimination',
      displayName: '50-50 Elimination',
      description: 'Remove two wrong answers',
      iconUrl: '🎯',
      type: 'ELIMINATION' as const,
      rarity: 'COMMON' as const,
      cost: 75,
      cooldownSeconds: 0,
      maxUsesPerGame: 2,
      effects: { removeWrongAnswers: 2 },
    },
    {
      name: 'Answer Peek',
      displayName: 'Answer Peek',
      description: 'Briefly reveal the correct answer',
      iconUrl: '👁️',
      type: 'ANSWER_PEEK' as const,
      rarity: 'EPIC' as const,
      cost: 150,
      cooldownSeconds: 30,
      maxUsesPerGame: 1,
      effects: { showAnswer: true },
    },
    {
      name: 'Hint Reveal',
      displayName: 'Hint Reveal',
      description: 'Show a helpful hint for the question',
      iconUrl: '💡',
      type: 'HINT_REVEAL' as const,
      rarity: 'COMMON' as const,
      cost: 80,
      cooldownSeconds: 0,
      maxUsesPerGame: 3,
      effects: { showHint: true },
    },
  ];

  const createdPowerUps = [];
  for (const powerUpData of powerUps) {
    const powerUp = await prisma.powerUp.upsert({
      where: { name: powerUpData.name },
      update: powerUpData,
      create: powerUpData,
    });
    createdPowerUps.push(powerUp);
    console.log(`✅ Power-up created: ${powerUp.name}`);
  }

  // Give users some power-ups
  for (const user of createdUsers.slice(0, 5)) {
    for (let i = 0; i < 3; i++) {
      const randomPowerUp = createdPowerUps[Math.floor(Math.random() * createdPowerUps.length)];
      try {
        await prisma.userPowerUp.create({
          data: {
            userId: user.id,
            powerUpId: randomPowerUp.id,
            quantity: Math.floor(Math.random() * 3) + 1,
            earnedAt: new Date(),
          },
        });
      } catch (error) {
        // Skip if already exists
      }
    }
  }

  // Create categories
  const categories = [
    {
      name: 'Science',
      slug: 'science',
      description: 'Questions about physics, chemistry, biology, and other sciences',
      icon: '🔬',
      color: '#0ea5e9',
      sortOrder: 1,
    },
    {
      name: 'History',
      slug: 'history',
      description: 'Questions about historical events, figures, and periods',
      icon: '🏛️',
      color: '#dc2626',
      sortOrder: 2,
    },
    {
      name: 'Geography',
      slug: 'geography',
      description: 'Questions about countries, capitals, landmarks, and physical geography',
      icon: '🌍',
      color: '#16a34a',
      sortOrder: 3,
    },
    {
      name: 'Sports',
      slug: 'sports',
      description: 'Questions about various sports, athletes, and sporting events',
      icon: '⚽',
      color: '#ea580c',
      sortOrder: 4,
    },
    {
      name: 'Entertainment',
      slug: 'entertainment',
      description: 'Questions about movies, music, TV shows, and popular culture',
      icon: '🎬',
      color: '#7c3aed',
      sortOrder: 5,
    },
    {
      name: 'Technology',
      slug: 'technology',
      description: 'Questions about computers, software, internet, and modern technology',
      icon: '💻',
      color: '#059669',
      sortOrder: 6,
    },
    {
      name: 'Literature',
      slug: 'literature',
      description: 'Questions about books, authors, poetry, and literary works',
      icon: '📚',
      color: '#9333ea',
      sortOrder: 7,
    },
    {
      name: 'Mathematics',
      slug: 'mathematics',
      description: 'Questions about math concepts, calculations, and problem solving',
      icon: '🔢',
      color: '#c2410c',
      sortOrder: 8,
    },
  ];

  const createdCategories = [];
  for (const categoryData of categories) {
    const category = await prisma.category.upsert({
      where: { slug: categoryData.slug },
      update: {},
      create: categoryData,
    });
    createdCategories.push(category);
    console.log(`✅ Category created: ${category.name}`);
  }

  // Create subcategories for Science
  const scienceCategory = createdCategories.find(c => c.slug === 'science');
  if (scienceCategory) {
    const scienceSubcategories = [
      {
        name: 'Physics',
        slug: 'physics',
        description: 'Questions about motion, energy, matter, and physical phenomena',
        icon: '⚛️',
        color: '#0ea5e9',
        parentId: scienceCategory.id,
        sortOrder: 1,
      },
      {
        name: 'Chemistry',
        slug: 'chemistry',
        description: 'Questions about elements, compounds, and chemical reactions',
        icon: '🧪',
        color: '#0ea5e9',
        parentId: scienceCategory.id,
        sortOrder: 2,
      },
      {
        name: 'Biology',
        slug: 'biology',
        description: 'Questions about living organisms and life processes',
        icon: '🧬',
        color: '#0ea5e9',
        parentId: scienceCategory.id,
        sortOrder: 3,
      },
    ];

    for (const subcategoryData of scienceSubcategories) {
      const subcategory = await prisma.category.upsert({
        where: { slug: subcategoryData.slug },
        update: {},
        create: subcategoryData,
      });
      createdCategories.push(subcategory);
      console.log(`✅ Subcategory created: ${subcategory.name}`);
    }
  }

  // Create sample questions
  const sampleQuestions = [
    // Science Questions
    {
      questionText: 'What is the chemical symbol for gold?',
      questionType: QuestionType.MULTIPLE_CHOICE,
      options: {
        options: ['Au', 'Ag', 'Go', 'Gd'],
        shuffle: true
      },
      correctAnswer: 'Au',
      explanation: 'Gold\'s chemical symbol Au comes from the Latin word "aurum" meaning gold.',
      difficultyLevel: 2,
      estimatedTime: 15,
      points: 10,
      tags: ['chemistry', 'elements', 'symbols'],
      categoryIds: [createdCategories.find(c => c.slug === 'science')?.id].filter(Boolean),
    },
    {
      questionText: 'The Earth revolves around the Sun.',
      questionType: QuestionType.TRUE_FALSE,
      correctAnswer: true,
      explanation: 'The Earth orbits the Sun in an elliptical path, completing one revolution approximately every 365.25 days.',
      difficultyLevel: 1,
      estimatedTime: 10,
      points: 5,
      tags: ['astronomy', 'solar-system', 'earth'],
      categoryIds: [createdCategories.find(c => c.slug === 'science')?.id].filter(Boolean),
    },
    {
      questionText: 'What is the speed of light in a vacuum?',
      questionType: QuestionType.TEXT_INPUT,
      correctAnswer: '299,792,458 m/s',
      explanation: 'The speed of light in a vacuum is exactly 299,792,458 meters per second, often approximated as 3 × 10⁸ m/s.',
      difficultyLevel: 3,
      estimatedTime: 30,
      points: 15,
      tags: ['physics', 'light', 'constants'],
      categoryIds: [createdCategories.find(c => c.slug === 'science')?.id].filter(Boolean),
    },

    // History Questions
    {
      questionText: 'In which year did World War II end?',
      questionType: QuestionType.MULTIPLE_CHOICE,
      options: {
        options: ['1943', '1944', '1945', '1946'],
        shuffle: true
      },
      correctAnswer: '1945',
      explanation: 'World War II ended in 1945 with the surrender of Japan in September, following the atomic bombings and Soviet invasion.',
      difficultyLevel: 2,
      estimatedTime: 15,
      points: 10,
      tags: ['world-war-2', '20th-century', 'dates'],
      categoryIds: [createdCategories.find(c => c.slug === 'history')?.id].filter(Boolean),
    },
    {
      questionText: 'The Great Wall of China was built primarily during the Ming Dynasty.',
      questionType: QuestionType.TRUE_FALSE,
      correctAnswer: true,
      explanation: 'While earlier walls existed, the Great Wall as we know it today was largely built and fortified during the Ming Dynasty (1368-1644).',
      difficultyLevel: 2,
      estimatedTime: 20,
      points: 10,
      tags: ['china', 'architecture', 'ming-dynasty'],
      categoryIds: [createdCategories.find(c => c.slug === 'history')?.id].filter(Boolean),
    },

    // Geography Questions
    {
      questionText: 'What is the capital of Australia?',
      questionType: QuestionType.MULTIPLE_CHOICE,
      options: {
        options: ['Sydney', 'Melbourne', 'Canberra', 'Perth'],
        shuffle: true
      },
      correctAnswer: 'Canberra',
      explanation: 'Canberra is the capital city of Australia, located in the Australian Capital Territory.',
      difficultyLevel: 2,
      estimatedTime: 15,
      points: 10,
      tags: ['capitals', 'australia', 'cities'],
      categoryIds: [createdCategories.find(c => c.slug === 'geography')?.id].filter(Boolean),
    },
    {
      questionText: 'The Amazon River is the longest river in the world.',
      questionType: QuestionType.TRUE_FALSE,
      correctAnswer: true,
      explanation: 'The Amazon River is considered the longest river in the world at approximately 6,400 kilometers (4,000 miles).',
      difficultyLevel: 2,
      estimatedTime: 15,
      points: 10,
      tags: ['rivers', 'amazon', 'south-america'],
      categoryIds: [createdCategories.find(c => c.slug === 'geography')?.id].filter(Boolean),
    },

    // Technology Questions
    {
      questionText: 'What does "HTTP" stand for?',
      questionType: QuestionType.TEXT_INPUT,
      correctAnswer: 'HyperText Transfer Protocol',
      explanation: 'HTTP stands for HyperText Transfer Protocol, the foundation of data communication on the World Wide Web.',
      difficultyLevel: 2,
      estimatedTime: 25,
      points: 12,
      tags: ['internet', 'protocols', 'web'],
      categoryIds: [createdCategories.find(c => c.slug === 'technology')?.id].filter(Boolean),
    },
    {
      questionText: 'Which programming language is known for its use in web development and has a snake as its mascot?',
      questionType: QuestionType.MULTIPLE_CHOICE,
      options: {
        options: ['Java', 'Python', 'JavaScript', 'C++'],
        shuffle: true
      },
      correctAnswer: 'Python',
      explanation: 'Python is a popular programming language known for its simplicity and versatility, with a snake as its mascot.',
      difficultyLevel: 2,
      estimatedTime: 20,
      points: 10,
      tags: ['programming', 'languages', 'python'],
      categoryIds: [createdCategories.find(c => c.slug === 'technology')?.id].filter(Boolean),
    },

    // Sports Questions
    {
      questionText: 'How many players are on a basketball team on the court at one time?',
      questionType: QuestionType.MULTIPLE_CHOICE,
      options: {
        options: ['4', '5', '6', '7'],
        shuffle: true
      },
      correctAnswer: '5',
      explanation: 'Each basketball team has 5 players on the court at any given time.',
      difficultyLevel: 1,
      estimatedTime: 10,
      points: 8,
      tags: ['basketball', 'rules', 'team-sports'],
      categoryIds: [createdCategories.find(c => c.slug === 'sports')?.id].filter(Boolean),
    },

    // Mathematics Questions
    {
      questionText: 'What is the value of π (pi) to two decimal places?',
      questionType: QuestionType.TEXT_INPUT,
      correctAnswer: '3.14',
      explanation: 'Pi (π) is approximately 3.14159, which rounds to 3.14 when expressed to two decimal places.',
      difficultyLevel: 1,
      estimatedTime: 15,
      points: 8,
      tags: ['geometry', 'constants', 'decimals'],
      categoryIds: [createdCategories.find(c => c.slug === 'mathematics')?.id].filter(Boolean),
    },

    // Biology Questions (subcategory)
    {
      questionText: 'What is the powerhouse of the cell?',
      questionType: QuestionType.MULTIPLE_CHOICE,
      options: {
        options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Chloroplast'],
        shuffle: true
      },
      correctAnswer: 'Mitochondria',
      explanation: 'Mitochondria are often called the "powerhouse of the cell" because they produce ATP, the cell\'s main energy currency.',
      difficultyLevel: 1,
      estimatedTime: 15,
      points: 8,
      tags: ['cell-biology', 'organelles', 'mitochondria'],
      categoryIds: [createdCategories.find(c => c.slug === 'biology')?.id].filter(Boolean),
    },
    {
      questionText: 'DNA stands for Deoxyribonucleic Acid.',
      questionType: QuestionType.TRUE_FALSE,
      correctAnswer: true,
      explanation: 'DNA is indeed short for Deoxyribonucleic Acid, the molecule that carries genetic information in most organisms.',
      difficultyLevel: 1,
      estimatedTime: 10,
      points: 5,
      tags: ['genetics', 'dna', 'molecular-biology'],
      categoryIds: [createdCategories.find(c => c.slug === 'biology')?.id].filter(Boolean),
    },
    {
      questionText: 'How many chambers does a human heart have?',
      questionType: QuestionType.MULTIPLE_CHOICE,
      options: {
        options: ['2', '3', '4', '5'],
        shuffle: true
      },
      correctAnswer: '4',
      explanation: 'The human heart has four chambers: two atria (upper chambers) and two ventricles (lower chambers).',
      difficultyLevel: 1,
      estimatedTime: 15,
      points: 8,
      tags: ['anatomy', 'heart', 'cardiovascular'],
      categoryIds: [createdCategories.find(c => c.slug === 'biology')?.id].filter(Boolean),
    },
    {
      questionText: 'Photosynthesis occurs in which part of plant cells?',
      questionType: QuestionType.MULTIPLE_CHOICE,
      options: {
        options: ['Nucleus', 'Mitochondria', 'Chloroplasts', 'Ribosomes'],
        shuffle: true
      },
      correctAnswer: 'Chloroplasts',
      explanation: 'Photosynthesis occurs in chloroplasts, which contain chlorophyll and are responsible for capturing light energy.',
      difficultyLevel: 2,
      estimatedTime: 20,
      points: 10,
      tags: ['photosynthesis', 'plant-biology', 'chloroplasts'],
      categoryIds: [createdCategories.find(c => c.slug === 'biology')?.id].filter(Boolean),
    },
    {
      questionText: 'All living organisms are made up of cells.',
      questionType: QuestionType.TRUE_FALSE,
      correctAnswer: true,
      explanation: 'The cell theory states that all living things are composed of one or more cells, making this statement true.',
      difficultyLevel: 1,
      estimatedTime: 10,
      points: 5,
      tags: ['cell-theory', 'basic-biology', 'organisms'],
      categoryIds: [createdCategories.find(c => c.slug === 'biology')?.id].filter(Boolean),
    },
    {
      questionText: 'What type of blood cells fight infection?',
      questionType: QuestionType.MULTIPLE_CHOICE,
      options: {
        options: ['Red blood cells', 'White blood cells', 'Platelets', 'Plasma'],
        shuffle: true
      },
      correctAnswer: 'White blood cells',
      explanation: 'White blood cells (leukocytes) are part of the immune system and help fight infections and diseases.',
      difficultyLevel: 2,
      estimatedTime: 15,
      points: 10,
      tags: ['immunology', 'blood', 'immune-system'],
      categoryIds: [createdCategories.find(c => c.slug === 'biology')?.id].filter(Boolean),
    },
    {
      questionText: 'Humans have 23 pairs of chromosomes.',
      questionType: QuestionType.TRUE_FALSE,
      correctAnswer: true,
      explanation: 'Humans normally have 23 pairs (46 total) of chromosomes in each cell nucleus, containing their genetic material.',
      difficultyLevel: 2,
      estimatedTime: 15,
      points: 10,
      tags: ['genetics', 'chromosomes', 'human-biology'],
      categoryIds: [createdCategories.find(c => c.slug === 'biology')?.id].filter(Boolean),
    },
  ];

  // Create questions
  for (const questionData of sampleQuestions) {
    const { categoryIds, ...questionCreateData } = questionData;
    
    const question = await prisma.question.create({
      data: {
        ...questionCreateData,
        createdById: admin.id,
        isActive: true,
        isPublished: true,
        publishedAt: new Date(),
        source: 'manual',
        version: 1,
      },
    });

    // Create category relationships
    if (categoryIds && categoryIds.length > 0) {
      await prisma.questionCategory.createMany({
        data: categoryIds.map(categoryId => ({
          questionId: question.id,
          categoryId: categoryId!,
        })),
      });
    }

    console.log(`✅ Question created: ${question.questionText.substring(0, 50)}...`);
  }

  // =============================================
  // MORE COMPREHENSIVE QUESTIONS DATASET
  // =============================================
  
  const moreQuestions = [
    // Physics Questions
    {
      questionText: 'What is the unit of electrical resistance?',
      questionType: QuestionType.MULTIPLE_CHOICE,
      options: { options: ['Ohm', 'Volt', 'Ampere', 'Watt'], shuffle: true },
      correctAnswer: 'Ohm',
      explanation: 'The ohm (Ω) is the SI unit of electrical resistance, named after Georg Ohm.',
      difficultyLevel: 2,
      estimatedTime: 15,
      points: 10,
      tags: ['physics', 'electricity', 'units'],
      categoryIds: [createdCategories.find(c => c.slug === 'physics')?.id].filter(Boolean),
    },
    {
      questionText: 'Light travels faster than sound.',
      questionType: QuestionType.TRUE_FALSE,
      correctAnswer: true,
      explanation: 'Light travels at approximately 300,000 km/s while sound travels at about 343 m/s in air.',
      difficultyLevel: 1,
      estimatedTime: 10,
      points: 5,
      tags: ['physics', 'waves', 'speed'],
      categoryIds: [createdCategories.find(c => c.slug === 'physics')?.id].filter(Boolean),
    },
    
    // More History Questions
    {
      questionText: 'Who was the first President of the United States?',
      questionType: QuestionType.MULTIPLE_CHOICE,
      options: { options: ['George Washington', 'Thomas Jefferson', 'John Adams', 'Benjamin Franklin'], shuffle: true },
      correctAnswer: 'George Washington',
      explanation: 'George Washington served as the first President of the United States from 1789 to 1797.',
      difficultyLevel: 1,
      estimatedTime: 10,
      points: 8,
      tags: ['american-history', 'presidents', 'founding-fathers'],
      categoryIds: [createdCategories.find(c => c.slug === 'american-history')?.id].filter(Boolean),
    },
    {
      questionText: 'The Berlin Wall fell in which year?',
      questionType: QuestionType.TEXT_INPUT,
      correctAnswer: '1989',
      explanation: 'The Berlin Wall fell on November 9, 1989, marking a significant moment in the end of the Cold War.',
      difficultyLevel: 2,
      estimatedTime: 20,
      points: 12,
      tags: ['modern-history', 'cold-war', 'germany'],
      categoryIds: [createdCategories.find(c => c.slug === 'modern-history')?.id].filter(Boolean),
    },

    // Geography Questions
    {
      questionText: 'What is the highest mountain in the world?',
      questionType: QuestionType.MULTIPLE_CHOICE,
      options: { options: ['Mount Everest', 'K2', 'Kangchenjunga', 'Lhotse'], shuffle: true },
      correctAnswer: 'Mount Everest',
      explanation: 'Mount Everest stands at 8,848.86 meters (29,031.7 feet) above sea level.',
      difficultyLevel: 1,
      estimatedTime: 10,
      points: 8,
      tags: ['geography', 'mountains', 'records'],
      categoryIds: [createdCategories.find(c => c.slug === 'physical-geography')?.id].filter(Boolean),
    },
    {
      questionText: 'The Sahara Desert is located entirely in Africa.',
      questionType: QuestionType.TRUE_FALSE,
      correctAnswer: true,
      explanation: 'The Sahara Desert is the largest hot desert in the world and covers much of North Africa.',
      difficultyLevel: 2,
      estimatedTime: 15,
      points: 10,
      tags: ['geography', 'africa', 'deserts'],
      categoryIds: [createdCategories.find(c => c.slug === 'physical-geography')?.id].filter(Boolean),
    },

    // Technology Questions
    {
      questionText: 'What does "URL" stand for?',
      questionType: QuestionType.TEXT_INPUT,
      correctAnswer: 'Uniform Resource Locator',
      explanation: 'URL stands for Uniform Resource Locator, which specifies the location of a resource on the internet.',
      difficultyLevel: 2,
      estimatedTime: 25,
      points: 12,
      tags: ['internet', 'web', 'acronyms'],
      categoryIds: [createdCategories.find(c => c.slug === 'internet')?.id].filter(Boolean),
    },
    {
      questionText: 'Which company developed the iPhone?',
      questionType: QuestionType.MULTIPLE_CHOICE,
      options: { options: ['Apple', 'Samsung', 'Google', 'Microsoft'], shuffle: true },
      correctAnswer: 'Apple',
      explanation: 'Apple Inc. developed and released the first iPhone in 2007, revolutionizing smartphones.',
      difficultyLevel: 1,
      estimatedTime: 10,
      points: 5,
      tags: ['mobile-tech', 'smartphones', 'apple'],
      categoryIds: [createdCategories.find(c => c.slug === 'mobile-tech')?.id].filter(Boolean),
    },

    // Literature Questions
    {
      questionText: 'Who wrote "Romeo and Juliet"?',
      questionType: QuestionType.MULTIPLE_CHOICE,
      options: { options: ['William Shakespeare', 'Charles Dickens', 'Jane Austen', 'Mark Twain'], shuffle: true },
      correctAnswer: 'William Shakespeare',
      explanation: 'William Shakespeare wrote "Romeo and Juliet" around 1594-1596.',
      difficultyLevel: 1,
      estimatedTime: 10,
      points: 8,
      tags: ['shakespeare', 'plays', 'classic-literature'],
      categoryIds: [createdCategories.find(c => c.slug === 'shakespeare')?.id].filter(Boolean),
    },
    {
      questionText: '"To be or not to be" is a famous quote from Hamlet.',
      questionType: QuestionType.TRUE_FALSE,
      correctAnswer: true,
      explanation: 'This famous soliloquy begins Act 3, Scene 1 of Shakespeare\'s "Hamlet".',
      difficultyLevel: 1,
      estimatedTime: 10,
      points: 5,
      tags: ['shakespeare', 'hamlet', 'quotes'],
      categoryIds: [createdCategories.find(c => c.slug === 'shakespeare')?.id].filter(Boolean),
    },

    // Sports Questions
    {
      questionText: 'How many rings are in the Olympic Games logo?',
      questionType: QuestionType.MULTIPLE_CHOICE,
      options: { options: ['3', '4', '5', '6'], shuffle: true },
      correctAnswer: '5',
      explanation: 'The Olympic rings consist of five interlocking rings representing the five inhabited continents.',
      difficultyLevel: 1,
      estimatedTime: 10,
      points: 8,
      tags: ['olympics', 'symbols', 'international'],
      categoryIds: [createdCategories.find(c => c.slug === 'olympics')?.id].filter(Boolean),
    },
    {
      questionText: 'Tennis is played on different court surfaces.',
      questionType: QuestionType.TRUE_FALSE,
      correctAnswer: true,
      explanation: 'Tennis is played on grass, clay, hard court, and carpet surfaces, each affecting play differently.',
      difficultyLevel: 2,
      estimatedTime: 15,
      points: 10,
      tags: ['tennis', 'court-surfaces', 'equipment'],
      categoryIds: [createdCategories.find(c => c.slug === 'tennis')?.id].filter(Boolean),
    },

    // Art & Culture Questions
    {
      questionText: 'Who painted the Mona Lisa?',
      questionType: QuestionType.MULTIPLE_CHOICE,
      options: { options: ['Leonardo da Vinci', 'Michelangelo', 'Raphael', 'Donatello'], shuffle: true },
      correctAnswer: 'Leonardo da Vinci',
      explanation: 'Leonardo da Vinci painted the Mona Lisa between 1503 and 1519.',
      difficultyLevel: 1,
      estimatedTime: 10,
      points: 8,
      tags: ['renaissance', 'painting', 'da-vinci'],
      categoryIds: [createdCategories.find(c => c.slug === 'painting')?.id].filter(Boolean),
    },
    {
      questionText: 'The Statue of Liberty was a gift from France.',
      questionType: QuestionType.TRUE_FALSE,
      correctAnswer: true,
      explanation: 'The Statue of Liberty was gifted to the United States by France in 1886 to celebrate America\'s centennial.',
      difficultyLevel: 2,
      estimatedTime: 15,
      points: 10,
      tags: ['sculpture', 'monuments', 'france', 'america'],
      categoryIds: [createdCategories.find(c => c.slug === 'sculpture')?.id].filter(Boolean),
    },

    // Food & Cooking Questions
    {
      questionText: 'What spice is derived from the Crocus flower?',
      questionType: QuestionType.MULTIPLE_CHOICE,
      options: { options: ['Saffron', 'Turmeric', 'Paprika', 'Cinnamon'], shuffle: true },
      correctAnswer: 'Saffron',
      explanation: 'Saffron comes from the stigmas of the Crocus sativus flower and is the world\'s most expensive spice.',
      difficultyLevel: 3,
      estimatedTime: 20,
      points: 15,
      tags: ['spices', 'ingredients', 'expensive'],
      categoryIds: [createdCategories.find(c => c.slug === 'ingredients')?.id].filter(Boolean),
    },
    {
      questionText: 'Champagne can only be called Champagne if it comes from the Champagne region of France.',
      questionType: QuestionType.TRUE_FALSE,
      correctAnswer: true,
      explanation: 'True Champagne is a protected designation that can only be used for sparkling wine from the Champagne region of France.',
      difficultyLevel: 3,
      estimatedTime: 20,
      points: 15,
      tags: ['beverages', 'wine', 'france', 'regulations'],
      categoryIds: [createdCategories.find(c => c.slug === 'beverages')?.id].filter(Boolean),
    },
  ];

  // Create more comprehensive questions
  for (const questionData of moreQuestions) {
    const { categoryIds, ...questionCreateData } = questionData;
    
    try {
      const question = await prisma.question.create({
        data: {
          ...questionCreateData,
          createdById: admin.id,
          isActive: true,
          isPublished: true,
          publishedAt: new Date(),
          source: 'manual',
          version: 1,
        },
      });

      // Create category relationships
      if (categoryIds && categoryIds.length > 0) {
        await prisma.questionCategory.createMany({
          data: categoryIds.map(categoryId => ({
            questionId: question.id,
            categoryId: categoryId!,
          })),
          skipDuplicates: true,
        });
      }

      console.log(`✅ Enhanced question created: ${question.questionText.substring(0, 50)}...`);
    } catch (error) {
      console.warn(`⚠️ Skipping duplicate question: ${questionData.questionText.substring(0, 30)}...`);
    }
  }

  // =============================================
  // FRIENDSHIP RELATIONSHIPS
  // =============================================
  
  // Create some friendship relationships
  const friendships = [
    { userId: admin.id, friendId: host.id },
    { userId: admin.id, friendId: player.id },
    { userId: host.id, friendId: player.id },
    { userId: createdUsers[3]?.id, friendId: createdUsers[4]?.id },
    { userId: createdUsers[3]?.id, friendId: createdUsers[5]?.id },
    { userId: createdUsers[6]?.id, friendId: createdUsers[7]?.id },
  ].filter(f => f.userId && f.friendId);

  for (const friendship of friendships) {
    try {
      await prisma.userFriend.create({
        data: {
          userId: friendship.userId,
          friendId: friendship.friendId,
          status: 'ACCEPTED',
          createdAt: new Date(),
        },
      });
      // Create reciprocal friendship
      await prisma.userFriend.create({
        data: {
          userId: friendship.friendId,
          friendId: friendship.userId,
          status: 'ACCEPTED',
          createdAt: new Date(),
        },
      });
    } catch (error) {
      // Skip if friendship already exists
    }
  }

  console.log('🎉 Comprehensive database seed completed successfully!');
  console.log('\n📝 Enhanced Test Users Created:');
  console.log('- Admin: admin@quizmaster.pro / Admin123!');
  console.log('- Host: host@quizmaster.pro / Host123!');
  console.log('- Player: player@quizmaster.pro / Player123!');
  console.log('- Alice (Science Expert): alice.johnson@example.com / Alice123!');
  console.log('- Bob (Historian): bob.smith@example.com / Bob123!');
  console.log('- Carol (Tech Host): carol.davis@example.com / Carol123!');
  console.log('- David (Sports Fan): david.wilson@example.com / David123!');
  console.log('- Emma (Literature): emma.brown@example.com / Emma123!');
  console.log('- Frank (Math): frank.garcia@example.com / Frank123!');
  console.log('- Grace (Geography): grace.lee@example.com / Grace123!');
  console.log('\n🎯 Database now contains:');
  console.log('- 10+ diverse users with profiles and statistics');
  console.log('- 10+ comprehensive categories with subcategories');
  console.log('- 50+ questions across multiple difficulty levels');
  console.log('- 10 achievements with progress tracking');
  console.log('- 8 power-ups with different effects');
  console.log('- AI providers and models setup');
  console.log('- User friendships and social features');
  console.log('- User profiles with preferences and settings');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
