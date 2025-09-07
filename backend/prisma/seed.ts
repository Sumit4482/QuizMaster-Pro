import { PrismaClient, UserRole, QuestionType } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create admin user
  const adminPasswordHash = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@quizmaster.pro' },
    update: {
      passwordHash: adminPasswordHash,
    },
    create: {
      email: 'admin@quizmaster.pro',
      username: 'admin',
      passwordHash: adminPasswordHash,
      firstName: 'QuizMaster',
      lastName: 'Admin',
      role: UserRole.ADMIN,
      emailVerified: true,
    },
  });
  console.log('✅ Admin user created:', admin.username);

  // Create host user
  const hostPasswordHash = await bcrypt.hash('Host123!', 12);
  const host = await prisma.user.upsert({
    where: { email: 'host@quizmaster.pro' },
    update: {
      passwordHash: hostPasswordHash,
    },
    create: {
      email: 'host@quizmaster.pro',
      username: 'host',
      passwordHash: hostPasswordHash,
      firstName: 'Quiz',
      lastName: 'Host',
      role: UserRole.HOST,
      emailVerified: true,
    },
  });
  console.log('✅ Host user created:', host.username);

  // Create player user
  const playerPasswordHash = await bcrypt.hash('Player123!', 12);
  const player = await prisma.user.upsert({
    where: { email: 'player@quizmaster.pro' },
    update: {
      passwordHash: playerPasswordHash,
    },
    create: {
      email: 'player@quizmaster.pro',
      username: 'player',
      passwordHash: playerPasswordHash,
      firstName: 'Test',
      lastName: 'Player',
      role: UserRole.PLAYER,
      emailVerified: true,
    },
  });
  console.log('✅ Player user created:', player.username);

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

  console.log('🎉 Database seed completed successfully!');
  console.log('\n📝 Test Users Created:');
  console.log('- Admin: admin@quizmaster.pro / Admin123!');
  console.log('- Host: host@quizmaster.pro / Host123!');
  console.log('- Player: player@quizmaster.pro / Player123!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
