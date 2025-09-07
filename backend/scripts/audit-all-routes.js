#!/usr/bin/env node

/**
 * QuizMaster Pro Route Auditing Script
 * Extracts all API endpoints from route files
 */

const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '..', 'src', 'routes');

function extractRoutesFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const routes = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for router method calls
    if (line.match(/router\.(get|post|put|delete|patch)\(/)) {
      const method = line.match(/router\.(\w+)\(/)[1].toUpperCase();
      
      // Look for the route path in the next few lines
      let routePath = '';
      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        const checkLine = lines[j];
        const pathMatch = checkLine.match(/'([^']*)'/) || checkLine.match(/"([^"]*)"/);
        if (pathMatch && pathMatch[1].startsWith('/')) {
          routePath = pathMatch[1];
          break;
        }
      }
      
      if (routePath) {
        routes.push({
          method,
          path: routePath,
          line: i + 1
        });
      }
    }
  }
  
  return routes;
}

function main() {
  console.log('🔍 QuizMaster Pro Route Audit\n');
  
  const routeFiles = fs.readdirSync(routesDir)
    .filter(file => file.endsWith('.ts') || file.endsWith('.js'));
  
  const allRoutes = [];
  
  routeFiles.forEach(file => {
    console.log(`📄 ${file}:`);
    const filePath = path.join(routesDir, file);
    const routes = extractRoutesFromFile(filePath);
    
    routes.forEach(route => {
      console.log(`   ${route.method.padEnd(6)} ${route.path}`);
      allRoutes.push({
        file: file.replace('.ts', ''),
        method: route.method,
        path: route.path,
        fullPath: `${route.method} ${route.path}`
      });
    });
    
    console.log('');
  });
  
  // Group by prefix
  console.log('\n📊 Route Summary by Prefix:\n');
  
  const prefixGroups = {};
  allRoutes.forEach(route => {
    const prefix = route.path.split('/')[1] || 'root';
    if (!prefixGroups[prefix]) {
      prefixGroups[prefix] = [];
    }
    prefixGroups[prefix].push(route);
  });
  
  Object.keys(prefixGroups).sort().forEach(prefix => {
    console.log(`🏷️  /${prefix}/* (${prefixGroups[prefix].length} routes):`);
    prefixGroups[prefix].forEach(route => {
      console.log(`      ${route.method} ${route.path}`);
    });
    console.log('');
  });
  
  console.log(`\n✅ Total Routes Found: ${allRoutes.length}\n`);
  
  // Check for common missing routes
  console.log('🔍 Coverage Analysis:\n');
  
  const hasRoute = (method, path) => {
    return allRoutes.some(r => r.method === method && r.path === path);
  };
  
  const commonRoutes = [
    ['GET', '/'],
    ['GET', '/health'],
    ['GET', '/ready'],
    ['GET', '/live'],
    ['GET', '/register'],
    ['POST', '/register'],
    ['POST', '/login'],
    ['GET', '/profile'],
    ['GET', '/sessions'],
    ['POST', '/sessions'],
  ];
  
  commonRoutes.forEach(([method, path]) => {
    const exists = hasRoute(method, path);
    console.log(`${exists ? '✅' : '❌'} ${method} ${path}`);
  });
  
  console.log('\n📋 Route Distribution:');
  const methodCounts = {};
  allRoutes.forEach(route => {
    methodCounts[route.method] = (methodCounts[route.method] || 0) + 1;
  });
  
  Object.keys(methodCounts).sort().forEach(method => {
    console.log(`   ${method}: ${methodCounts[method]} routes`);
  });
}

main();
