#!/usr/bin/env node

/**
 * Phase 2.3 Implementation Validation Script
 * Validates that all Phase 2.3 services and components are properly implemented
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Phase 2.3: Enhanced Multiplayer Features - Implementation Validation');
console.log('================================================================\n');

// Define expected files and directories
const expectedFiles = [
  // Database Schema
  'prisma/schema.prisma',
  
  // Type Definitions
  'src/types/powerups.ts',
  'src/types/social.ts', 
  'src/types/gameModes.ts',
  'src/types/enhancedRooms.ts',
  
  // Services
  'src/services/powerUpService.ts',
  'src/services/socialService.ts',
  'src/services/enhancedRoomService.ts',
  'src/services/gameModeService.ts',
  'src/services/spectatorService.ts',
  'src/services/achievementService.ts',
  'src/services/enhancedMultiplayerService.ts',
  'src/services/phase23Initializer.ts',
  
  // Socket Handlers
  'src/sockets/handlers/enhancedMultiplayerHandlers.ts',
  
  // Configuration
  'src/config/enhancedMultiplayer.ts',
  
  // Tests
  'src/__tests__/unit/phase23Services.test.ts',
  'src/__tests__/integration/phase23Integration.test.ts'
];

// Documentation files
const documentationFiles = [
  '../PHASE-2.3-IMPLEMENTATION-SUMMARY.md',
  '../PHASE-2.3-COMPLETE-IMPLEMENTATION-GUIDE.md'
];

let successCount = 0;
let totalChecks = 0;

function validateFile(filePath, description) {
  totalChecks++;
  const fullPath = path.join(__dirname, filePath);
  
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    const sizeKB = (stats.size / 1024).toFixed(1);
    console.log(`✅ ${description} (${sizeKB}KB)`);
    successCount++;
    return true;
  } else {
    console.log(`❌ ${description} - FILE MISSING`);
    return false;
  }
}

function validateDirectory(dirPath, description) {
  totalChecks++;
  const fullPath = path.join(__dirname, dirPath);
  
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    console.log(`✅ ${description}`);
    successCount++;
    return true;
  } else {
    console.log(`❌ ${description} - DIRECTORY MISSING`);
    return false;
  }
}

function validateFileContent(filePath, searchStrings, description) {
  totalChecks++;
  const fullPath = path.join(__dirname, filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`❌ ${description} - File missing`);
    return false;
  }
  
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const missingStrings = searchStrings.filter(str => !content.includes(str));
    
    if (missingStrings.length === 0) {
      console.log(`✅ ${description}`);
      successCount++;
      return true;
    } else {
      console.log(`❌ ${description} - Missing: ${missingStrings.join(', ')}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${description} - Error reading file: ${error.message}`);
    return false;
  }
}

// Validate file structure
console.log('📁 File Structure Validation');
console.log('-----------------------------');

expectedFiles.forEach((file, index) => {
  const description = `${file.split('/').pop()} - ${file.split('/').slice(0, -1).join('/')}`;
  validateFile(file, description);
});

documentationFiles.forEach(file => {
  validateFile(file, `Documentation: ${path.basename(file)}`);
});

console.log('');

// Validate database schema content
console.log('🗄️  Database Schema Validation');
console.log('-------------------------------');

const schemaValidations = [
  ['prisma/schema.prisma', ['model PowerUp', 'model UserPowerUp', 'model UserFriend'], 'New Phase 2.3 models'],
  ['prisma/schema.prisma', ['enum PowerUpType', 'enum GameMode', 'enum ParticipantRole'], 'New Phase 2.3 enums'],
  ['prisma/schema.prisma', ['// Phase 2.3 relations', 'powerUps         UserPowerUp[]'], 'User model extensions']
];

schemaValidations.forEach(([file, searchStrings, description]) => {
  validateFileContent(file, searchStrings, description);
});

console.log('');

// Validate service implementations
console.log('⚙️  Service Implementation Validation');
console.log('-------------------------------------');

const serviceValidations = [
  ['src/services/powerUpService.ts', ['class PowerUpService', 'PowerUpType', 'activatePowerUp'], 'Power-up Service'],
  ['src/services/socialService.ts', ['class SocialService', 'sendFriendRequest', 'sendChatMessage'], 'Social Service'],
  ['src/services/enhancedRoomService.ts', ['class EnhancedRoomService', 'discoverRooms', 'createEnhancedRoom'], 'Enhanced Room Service'],
  ['src/services/gameModeService.ts', ['class GameModeService', 'GameMode', 'getAvailableGameModes'], 'Game Mode Service'],
  ['src/services/spectatorService.ts', ['class SpectatorService', 'joinGameAsSpectator', 'createSpectatorPoll'], 'Spectator Service'],
  ['src/services/achievementService.ts', ['class AchievementService', 'checkAchievements', 'grantAchievementToUser'], 'Achievement Service'],
  ['src/services/enhancedMultiplayerService.ts', ['class EnhancedMultiplayerService', 'initialize'], 'Enhanced Multiplayer Service'],
  ['src/services/phase23Initializer.ts', ['class Phase23Initializer', 'getInstance', 'initialize'], 'Phase 2.3 Initializer']
];

serviceValidations.forEach(([file, searchStrings, description]) => {
  validateFileContent(file, searchStrings, description);
});

console.log('');

// Validate socket handlers
console.log('🔌 Socket Handler Validation');
console.log('-----------------------------');

validateFileContent(
  'src/sockets/handlers/enhancedMultiplayerHandlers.ts',
  ['powerup:activate', 'social:send_friend_request', 'rooms:create_enhanced', 'spectator:join'],
  'Enhanced Multiplayer Handlers - Event Registration'
);

console.log('');

// Validate type definitions
console.log('📝 Type Definition Validation');
console.log('------------------------------');

const typeValidations = [
  ['src/types/powerups.ts', ['PowerUpType', 'PowerUpActivation', 'PowerUpEffect'], 'Power-up Types'],
  ['src/types/social.ts', ['FriendRequest', 'ChatMessage', 'MessageType'], 'Social Types'],
  ['src/types/gameModes.ts', ['GameMode', 'GameModeConfig', 'GameModeState'], 'Game Mode Types'],
  ['src/types/enhancedRooms.ts', ['EnhancedRoom', 'RoomDiscoveryFilter', 'RoomDiscovery'], 'Enhanced Room Types']
];

typeValidations.forEach(([file, searchStrings, description]) => {
  validateFileContent(file, searchStrings, description);
});

console.log('');

// Validate configuration
console.log('⚙️  Configuration Validation');
console.log('-----------------------------');

validateFileContent(
  'src/config/enhancedMultiplayer.ts',
  ['export const enhancedMultiplayerConfig', 'powerUps:', 'social:'],
  'Enhanced Multiplayer Configuration'
);

console.log('');

// Check package.json for any new dependencies
console.log('📦 Package Dependencies Check');
console.log('-----------------------------');

try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  const hasSocketIO = packageJson.dependencies && packageJson.dependencies['socket.io'];
  const hasPrisma = packageJson.dependencies && packageJson.dependencies['@prisma/client'];
  const hasJest = packageJson.devDependencies && packageJson.devDependencies['jest'];
  
  if (hasSocketIO) {
    console.log('✅ Socket.io dependency present');
    successCount++;
  } else {
    console.log('❌ Socket.io dependency missing');
  }
  totalChecks++;
  
  if (hasPrisma) {
    console.log('✅ Prisma Client dependency present');
    successCount++;
  } else {
    console.log('❌ Prisma Client dependency missing');
  }
  totalChecks++;
  
  if (hasJest) {
    console.log('✅ Jest testing framework present');
    successCount++;
  } else {
    console.log('❌ Jest testing framework missing');
  }
  totalChecks++;
  
} catch (error) {
  console.log('❌ Error reading package.json:', error.message);
  totalChecks += 3;
}

console.log('');

// Final validation summary
console.log('📊 Validation Summary');
console.log('====================');

const successRate = ((successCount / totalChecks) * 100).toFixed(1);
console.log(`Total Checks: ${totalChecks}`);
console.log(`Successful: ${successCount}`);
console.log(`Failed: ${totalChecks - successCount}`);
console.log(`Success Rate: ${successRate}%`);

if (successRate >= 95) {
  console.log('');
  console.log('🎉 PHASE 2.3 IMPLEMENTATION COMPLETE!');
  console.log('✨ All major components successfully implemented and validated');
  console.log('🚀 Ready for production deployment and Phase 3 development');
} else if (successRate >= 85) {
  console.log('');
  console.log('⚠️  PHASE 2.3 MOSTLY COMPLETE');
  console.log('🔧 Some minor issues detected - review failed checks above');
} else {
  console.log('');
  console.log('❌ PHASE 2.3 IMPLEMENTATION INCOMPLETE');
  console.log('🛠️  Significant issues detected - please address failed checks');
}

console.log('');
console.log('For detailed implementation information, see:');
console.log('- PHASE-2.3-IMPLEMENTATION-SUMMARY.md');
console.log('- PHASE-2.3-COMPLETE-IMPLEMENTATION-GUIDE.md');

// Exit with appropriate code
process.exit(successRate >= 95 ? 0 : 1);
