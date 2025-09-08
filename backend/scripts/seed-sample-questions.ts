/**
 * Seed Sample Questions Script
 * Adds sample questions to the database for immediate testing
 */

import { PrismaClient, QuestionType } from '@prisma/client';

const prisma = new PrismaClient();

const sampleQuestions = [
  // JavaScript Questions
  {
    questionText: "What is the correct way to declare a variable in JavaScript?",
    questionType: "MULTIPLE_CHOICE" as QuestionType,
    options: ["var myVar;", "variable myVar;", "v myVar;", "declare myVar;"],
    correctAnswer: "var myVar;",
    explanation: "In JavaScript, variables are declared using 'var', 'let', or 'const' keywords.",
    difficultyLevel: 1,
    categoryName: "Programming",
    tags: ["javascript", "variables", "syntax"]
  },
  {
    questionText: "JavaScript is a compiled language.",
    questionType: "TRUE_FALSE" as QuestionType,
    options: ["True", "False"],
    correctAnswer: "False",
    explanation: "JavaScript is an interpreted language, not a compiled language.",
    difficultyLevel: 2,
    categoryName: "Programming",
    tags: ["javascript", "concepts"]
  },
  {
    questionText: "What does 'DOM' stand for in web development?",
    questionType: "MULTIPLE_CHOICE" as QuestionType,
    options: ["Document Object Model", "Data Object Management", "Dynamic Object Method", "Document Oriented Model"],
    correctAnswer: "Document Object Model",
    explanation: "DOM stands for Document Object Model, which represents the structure of HTML documents.",
    difficultyLevel: 2,
    categoryName: "Web Development",
    tags: ["dom", "html", "web"]
  },
  
  // Science Questions
  {
    questionText: "What is the chemical symbol for gold?",
    questionType: "MULTIPLE_CHOICE" as QuestionType,
    options: ["Go", "Gd", "Au", "Ag"],
    correctAnswer: "Au",
    explanation: "Gold's chemical symbol is Au, from the Latin word 'aurum'.",
    difficultyLevel: 2,
    categoryName: "Science",
    tags: ["chemistry", "elements"]
  },
  {
    questionText: "The Earth revolves around the Sun.",
    questionType: "TRUE_FALSE" as QuestionType,
    options: ["True", "False"],
    correctAnswer: "True",
    explanation: "The Earth orbits around the Sun in our solar system.",
    difficultyLevel: 1,
    categoryName: "Science",
    tags: ["astronomy", "solar system"]
  },
  {
    questionText: "How many bones are in an adult human body?",
    questionType: "MULTIPLE_CHOICE" as QuestionType,
    options: ["196", "206", "216", "186"],
    correctAnswer: "206",
    explanation: "An adult human body has 206 bones.",
    difficultyLevel: 3,
    categoryName: "Science",
    tags: ["biology", "anatomy"]
  },

  // History Questions
  {
    questionText: "In which year did World War II end?",
    questionType: "MULTIPLE_CHOICE" as QuestionType,
    options: ["1944", "1945", "1946", "1947"],
    correctAnswer: "1945",
    explanation: "World War II ended in 1945 with the surrender of Japan.",
    difficultyLevel: 2,
    categoryName: "History",
    tags: ["world war", "1940s"]
  },
  {
    questionText: "The Great Wall of China was built in one continuous construction period.",
    questionType: "TRUE_FALSE" as QuestionType,
    options: ["True", "False"],
    correctAnswer: "False",
    explanation: "The Great Wall was built over many centuries by different dynasties.",
    difficultyLevel: 3,
    categoryName: "History",
    tags: ["china", "architecture"]
  },

  // Math Questions
  {
    questionText: "What is 12 × 8?",
    questionType: "MULTIPLE_CHOICE" as QuestionType,
    options: ["84", "96", "104", "112"],
    correctAnswer: "96",
    explanation: "12 multiplied by 8 equals 96.",
    difficultyLevel: 1,
    categoryName: "Mathematics",
    tags: ["multiplication", "basic math"]
  },
  {
    questionText: "Pi (π) is exactly equal to 3.14.",
    questionType: "TRUE_FALSE" as QuestionType,
    options: ["True", "False"],
    correctAnswer: "False",
    explanation: "Pi is approximately 3.14159... and goes on infinitely.",
    difficultyLevel: 2,
    categoryName: "Mathematics",
    tags: ["pi", "constants"]
  },

  // General Knowledge
  {
    questionText: "Which planet is closest to the Sun?",
    questionType: "MULTIPLE_CHOICE" as QuestionType,
    options: ["Venus", "Earth", "Mercury", "Mars"],
    correctAnswer: "Mercury",
    explanation: "Mercury is the closest planet to the Sun in our solar system.",
    difficultyLevel: 2,
    categoryName: "General Knowledge",
    tags: ["planets", "solar system"]
  },
  {
    questionText: "There are 24 hours in a day.",
    questionType: "TRUE_FALSE" as QuestionType,
    options: ["True", "False"],
    correctAnswer: "True",
    explanation: "A day consists of 24 hours.",
    difficultyLevel: 1,
    categoryName: "General Knowledge",
    tags: ["time", "basics"]
  }
];

async function seedQuestions() {
  console.log('🌱 Starting to seed sample questions...');

  try {
    // Create a system user for question creation
    console.log('👤 Creating system user for questions...');
    const systemUser = await prisma.user.upsert({
      where: { email: 'system@quizmaster.com' },
      update: {},
      create: {
        email: 'system@quizmaster.com',
        username: 'system',
        passwordHash: 'system-generated-content', // This won't be used for login
        firstName: 'System',
        lastName: 'Generator',
        role: 'ADMIN'
      }
    });

    // Create categories first
    const categories = ['Programming', 'Web Development', 'Science', 'History', 'Mathematics', 'General Knowledge'];
    
    console.log('📚 Creating categories...');
    for (const categoryName of categories) {
      await prisma.category.upsert({
        where: { slug: categoryName.toLowerCase().replace(/\s+/g, '-') },
        update: {},
        create: {
          name: categoryName,
          slug: categoryName.toLowerCase().replace(/\s+/g, '-'),
          description: `${categoryName} related questions`,
          isActive: true
        }
      });
    }

    console.log('❓ Creating questions...');
    for (const questionData of sampleQuestions) {
      // Get the category
      const category = await prisma.category.findUnique({
        where: { slug: questionData.categoryName.toLowerCase().replace(/\s+/g, '-') }
      });

      if (!category) {
        console.error(`Category not found: ${questionData.categoryName}`);
        continue;
      }

      // Create the question
      const question = await prisma.question.create({
        data: {
          questionText: questionData.questionText,
          questionType: questionData.questionType,
          options: questionData.options,
          correctAnswer: questionData.correctAnswer,
          explanation: questionData.explanation,
          difficultyLevel: questionData.difficultyLevel,
          isActive: true,
          isPublished: true,
          tags: questionData.tags,
          createdById: systemUser.id,
          categories: {
            create: {
              categoryId: category.id
            }
          }
        }
      });

      console.log(`✅ Created question: ${question.questionText.substring(0, 50)}...`);
    }

    console.log(`🎉 Successfully seeded ${sampleQuestions.length} sample questions!`);
    
    // Show summary
    const totalQuestions = await prisma.question.count();
    const totalCategories = await prisma.category.count();
    
    console.log('\n📊 Database Summary:');
    console.log(`   Questions: ${totalQuestions}`);
    console.log(`   Categories: ${totalCategories}`);
    console.log('\n🚀 Your QuizMaster Pro is ready to play!');

  } catch (error) {
    console.error('❌ Error seeding questions:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seeding
seedQuestions()
  .then(() => {
    console.log('✨ Seeding completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Seeding failed:', error);
    process.exit(1);
  });
