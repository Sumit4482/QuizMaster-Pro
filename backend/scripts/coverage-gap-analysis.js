#!/usr/bin/env node

/**
 * Coverage Gap Analysis - Compare discovered routes vs tested routes
 */

// All discovered routes from the audit
const allRoutes = [
  // Health Routes (6)
  { method: 'GET', path: '/health/', file: 'healthRoutes', tested: false },
  { method: 'GET', path: '/health/ready', file: 'healthRoutes', tested: true },
  { method: 'GET', path: '/health/live', file: 'healthRoutes', tested: true },
  { method: 'GET', path: '/health/detailed', file: 'healthRoutes', tested: false },
  { method: 'GET', path: '/health/test-log', file: 'healthRoutes', tested: false },
  { method: 'GET', path: '/health/room/:code', file: 'healthRoutes', tested: false },
  
  // Auth Routes (13)
  { method: 'POST', path: '/api/auth/register', file: 'authRoutes', tested: true },
  { method: 'POST', path: '/api/auth/login', file: 'authRoutes', tested: true },
  { method: 'POST', path: '/api/auth/refresh', file: 'authRoutes', tested: false },
  { method: 'GET', path: '/api/auth/check-email', file: 'authRoutes', tested: false },
  { method: 'POST', path: '/api/auth/forgot-password', file: 'authRoutes', tested: false },
  { method: 'POST', path: '/api/auth/reset-password', file: 'authRoutes', tested: false },
  { method: 'POST', path: '/api/auth/logout', file: 'authRoutes', tested: false },
  { method: 'POST', path: '/api/auth/logout-all', file: 'authRoutes', tested: false },
  { method: 'GET', path: '/api/auth/profile', file: 'authRoutes', tested: true },
  { method: 'PUT', path: '/api/auth/profile', file: 'authRoutes', tested: false },
  { method: 'PUT', path: '/api/auth/change-password', file: 'authRoutes', tested: false },
  { method: 'GET', path: '/api/auth/sessions', file: 'authRoutes', tested: false },
  { method: 'DELETE', path: '/api/auth/sessions/:sessionId', file: 'authRoutes', tested: false },
  
  // Category Routes (11)
  { method: 'GET', path: '/api/categories/', file: 'categoryRoutes', tested: true },
  { method: 'GET', path: '/api/categories/tree', file: 'categoryRoutes', tested: true },
  { method: 'GET', path: '/api/categories/root', file: 'categoryRoutes', tested: true },
  { method: 'GET', path: '/api/categories/search', file: 'categoryRoutes', tested: false },
  { method: 'GET', path: '/api/categories/statistics', file: 'categoryRoutes', tested: false },
  { method: 'GET', path: '/api/categories/:id', file: 'categoryRoutes', tested: false },
  { method: 'GET', path: '/api/categories/slug/:slug', file: 'categoryRoutes', tested: false },
  { method: 'POST', path: '/api/categories/', file: 'categoryRoutes', tested: false },
  { method: 'PUT', path: '/api/categories/:id', file: 'categoryRoutes', tested: false },
  { method: 'DELETE', path: '/api/categories/:id', file: 'categoryRoutes', tested: false },
  { method: 'POST', path: '/api/categories/reorder', file: 'categoryRoutes', tested: false },
  
  // Question Routes (11)
  { method: 'GET', path: '/api/questions/search', file: 'questionRoutes', tested: true },
  { method: 'GET', path: '/api/questions/statistics', file: 'questionRoutes', tested: false },
  { method: 'GET', path: '/api/questions/:id', file: 'questionRoutes', tested: false },
  { method: 'POST', path: '/api/questions/', file: 'questionRoutes', tested: false },
  { method: 'PUT', path: '/api/questions/:id', file: 'questionRoutes', tested: false },
  { method: 'DELETE', path: '/api/questions/:id', file: 'questionRoutes', tested: false },
  { method: 'POST', path: '/api/questions/:id/publish', file: 'questionRoutes', tested: false },
  { method: 'POST', path: '/api/questions/:id/unpublish', file: 'questionRoutes', tested: false },
  { method: 'POST', path: '/api/questions/bulk', file: 'questionRoutes', tested: false },
  { method: 'POST', path: '/api/questions/import', file: 'questionRoutes', tested: false },
  { method: 'GET', path: '/api/questions/export', file: 'questionRoutes', tested: false },
  
  // Quiz Routes (14)
  { method: 'GET', path: '/api/quiz/health', file: 'quizRoutes', tested: false },
  { method: 'POST', path: '/api/quiz/sessions', file: 'quizRoutes', tested: true },
  { method: 'GET', path: '/api/quiz/sessions', file: 'quizRoutes', tested: false },
  { method: 'GET', path: '/api/quiz/sessions/:sessionId', file: 'quizRoutes', tested: true },
  { method: 'POST', path: '/api/quiz/sessions/:sessionId/start', file: 'quizRoutes', tested: true },
  { method: 'POST', path: '/api/quiz/sessions/:sessionId/pause', file: 'quizRoutes', tested: false },
  { method: 'POST', path: '/api/quiz/sessions/:sessionId/resume', file: 'quizRoutes', tested: false },
  { method: 'GET', path: '/api/quiz/sessions/:sessionId/current-question', file: 'quizRoutes', tested: true },
  { method: 'POST', path: '/api/quiz/sessions/:sessionId/submit-answer', file: 'quizRoutes', tested: true },
  { method: 'GET', path: '/api/quiz/sessions/:sessionId/results', file: 'quizRoutes', tested: false },
  { method: 'POST', path: '/api/quiz/sessions/:sessionId/generate-results', file: 'quizRoutes', tested: false },
  { method: 'GET', path: '/api/quiz/history', file: 'quizRoutes', tested: true },
  { method: 'GET', path: '/api/quiz/statistics', file: 'quizRoutes', tested: false },
  { method: 'POST', path: '/api/quiz/admin/cleanup-sessions', file: 'quizRoutes', tested: false }
];

function analyzeCoverage() {
  console.log('🔍 API Coverage Gap Analysis\n');
  console.log('='*50);
  
  const totalRoutes = allRoutes.length;
  const testedRoutes = allRoutes.filter(r => r.tested).length;
  const untestedRoutes = allRoutes.filter(r => !r.tested);
  
  console.log(`📊 COVERAGE SUMMARY:`);
  console.log(`   Total API Endpoints: ${totalRoutes}`);
  console.log(`   Currently Tested: ${testedRoutes}`);
  console.log(`   Not Tested: ${untestedRoutes.length}`);
  console.log(`   Coverage Rate: ${(testedRoutes/totalRoutes*100).toFixed(1)}%\n`);
  
  // Group untested by file
  const untestedByFile = {};
  untestedRoutes.forEach(route => {
    if (!untestedByFile[route.file]) {
      untestedByFile[route.file] = [];
    }
    untestedByFile[route.file].push(route);
  });
  
  console.log('❌ UNTESTED ENDPOINTS BY CATEGORY:\n');
  
  Object.keys(untestedByFile).sort().forEach(file => {
    const routes = untestedByFile[file];
    console.log(`🏷️  ${file.replace('Routes', '').toUpperCase()} (${routes.length} untested):`);
    routes.forEach(route => {
      console.log(`      ${route.method.padEnd(6)} ${route.path}`);
    });
    console.log('');
  });
  
  console.log('✅ CURRENTLY TESTED ENDPOINTS:\n');
  
  const testedByFile = {};
  allRoutes.filter(r => r.tested).forEach(route => {
    if (!testedByFile[route.file]) {
      testedByFile[route.file] = [];
    }
    testedByFile[route.file].push(route);
  });
  
  Object.keys(testedByFile).sort().forEach(file => {
    const routes = testedByFile[file];
    console.log(`🏷️  ${file.replace('Routes', '').toUpperCase()} (${routes.length} tested):`);
    routes.forEach(route => {
      console.log(`      ${route.method.padEnd(6)} ${route.path}`);
    });
    console.log('');
  });
  
  console.log('🎯 PRIORITY GAPS TO ADDRESS:\n');
  
  const criticalUntested = [
    'POST /api/auth/logout',
    'PUT /api/auth/profile', 
    'PUT /api/auth/change-password',
    'GET /api/categories/:id',
    'POST /api/categories/',
    'GET /api/questions/:id',
    'POST /api/questions/',
    'GET /api/quiz/sessions',
    'GET /api/quiz/sessions/:sessionId/results'
  ];
  
  criticalUntested.forEach(endpoint => {
    const found = untestedRoutes.find(r => `${r.method} ${r.path}`.includes(endpoint.replace('/api', '')));
    console.log(`${found ? '❌' : '✅'} ${endpoint}`);
  });
  
  console.log('\n📋 RECOMMENDATIONS:\n');
  console.log('1. 🔥 HIGH PRIORITY: Test core CRUD operations (CREATE, READ, UPDATE, DELETE)');
  console.log('2. 🔒 MEDIUM PRIORITY: Test authentication flows (logout, password change)');
  console.log('3. 📊 LOW PRIORITY: Test admin and utility endpoints');
  console.log('4. 🏥 INFO PRIORITY: Health/debug endpoints (working but not critical for business logic)');
}

analyzeCoverage();
