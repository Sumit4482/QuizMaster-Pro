/**
 * Quick script to create categories in the database
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createCategories() {
  console.log('🏗️ Creating categories...');

  const categories = [
    { name: 'Programming', slug: 'programming', description: 'Programming and software development questions' },
    { name: 'Web Development', slug: 'web-development', description: 'HTML, CSS, JavaScript, and web technologies' },
    { name: 'Science', slug: 'science', description: 'General science questions' },
    { name: 'History', slug: 'history', description: 'Historical events and facts' },
    { name: 'Mathematics', slug: 'mathematics', description: 'Math problems and concepts' },
    { name: 'General Knowledge', slug: 'general-knowledge', description: 'Mixed general knowledge questions' },
  ];

  for (const categoryData of categories) {
    try {
      const category = await prisma.category.upsert({
        where: { slug: categoryData.slug },
        update: {},
        create: {
          name: categoryData.name,
          slug: categoryData.slug,
          description: categoryData.description,
          isActive: true
        }
      });
      console.log(`✅ Created/Updated category: ${category.name} (ID: ${category.id})`);
    } catch (error) {
      console.error(`❌ Failed to create category ${categoryData.name}:`, error.message);
    }
  }

  // Count total categories
  const totalCategories = await prisma.category.count();
  console.log(`📊 Total categories in database: ${totalCategories}`);

  await prisma.$disconnect();
}

createCategories().catch(console.error);
