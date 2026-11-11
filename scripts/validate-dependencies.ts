#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const pkgPath = path.join(ROOT_DIR, 'package.json');
const lockPath = path.join(ROOT_DIR, 'package-lock.json');

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface PackageLock {
  packages?: Record<string, any>;
  dependencies?: Record<string, any>;
}

function validateDependencies() {
  const isFix = process.argv.includes('--fix');

  if (!fs.existsSync(pkgPath)) {
    console.error('❌ package.json not found at:', pkgPath);
    process.exit(1);
  }

  if (!fs.existsSync(lockPath)) {
    console.error('❌ package-lock.json not found at:', lockPath);
    if (isFix) {
      console.log('🔄 Regenerating package-lock.json...');
      execSync('corepack npm install --package-lock-only', { cwd: ROOT_DIR, stdio: 'inherit' });
      process.exit(0);
    }
    process.exit(1);
  }

  const pkg: PackageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const lock: PackageLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

  const allDeclared = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {})
  };

  const missing: string[] = [];
  const packages = lock.packages || {};

  for (const dep of Object.keys(allDeclared)) {
    const inNodeModules = Boolean(packages[`node_modules/${dep}`]);
    const inLegacyDeps = Boolean(lock.dependencies?.[dep]);
    if (!inNodeModules && !inLegacyDeps) {
      missing.push(dep);
    }
  }

  if (missing.length > 0) {
    console.error('⚠️ [Dependency Inconsistency Detected]');
    console.error(`Found ${missing.length} package(s) declared in package.json but missing from package-lock.json:`);
    for (const m of missing) {
      console.error(`  - ${m} (required: ${allDeclared[m]})`);
    }

    if (isFix) {
      console.log('🔄 Synchronizing lockfile automatically via corepack npm install --package-lock-only...');
      execSync('corepack npm install --package-lock-only', { cwd: ROOT_DIR, stdio: 'inherit' });
      console.log('✅ Lockfile successfully synchronized!');
      process.exit(0);
    } else {
      console.error('\nTo synchronize automatically, run:');
      console.error('  corepack npm run sync:deps');
      process.exit(1);
    }
  }

  console.log('✅ [Pre-flight Verified] 100% dependency parity between package.json and package-lock.json.');
  process.exit(0);
}

validateDependencies();
