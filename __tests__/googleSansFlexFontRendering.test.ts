import fs from 'fs';
import path from 'path';
import { fontFamily, typography } from '../theme/typography';
import { DesignSystem } from '../constants/DesignSystem';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: [${testName}] ${detail}`);
    failCount++;
    throw new Error(`Test failed: [${testName}] ${detail}`);
  }
}

export async function runFontRenderingTestSuite() {
  console.log('===============================================================');
  console.log('RUNNING GOOGLE SANS FLEX FONT RENDERING & TYPOGRAPHY AUDIT');
  console.log('===============================================================\n');

  const rootDir = path.resolve(__dirname, '..');

  // 1. Verify Local Font Asset Files
  console.log('--- 1. Checking Font Assets in node_modules ---');
  const pkgDir = path.join(rootDir, 'node_modules', '@expo-google-fonts', 'google-sans-flex');
  assert(fs.existsSync(pkgDir), 'Asset Package', 'google-sans-flex package exists');

  const expectedTtfFiles = [
    '400Regular/GoogleSansFlex_400Regular.ttf',
    '500Medium/GoogleSansFlex_500Medium.ttf',
    '600SemiBold/GoogleSansFlex_600SemiBold.ttf',
    '700Bold/GoogleSansFlex_700Bold.ttf',
  ];

  for (const relTtf of expectedTtfFiles) {
    const fullPath = path.join(pkgDir, relTtf);
    assert(fs.existsSync(fullPath), 'TTF Asset Exists', `Found font binary: ${relTtf}`);
  }

  // 2. Verify Typography Design Tokens
  console.log('\n--- 2. Checking Theme Typography Tokens ---');
  assert(fontFamily.sans === 'GoogleSansFlex_400Regular', 'Typography Token', 'fontFamily.sans maps to GoogleSansFlex_400Regular');
  assert(fontFamily.sansMedium === 'GoogleSansFlex_500Medium', 'Typography Token', 'fontFamily.sansMedium maps to GoogleSansFlex_500Medium');
  assert(fontFamily.sansSemiBold === 'GoogleSansFlex_600SemiBold', 'Typography Token', 'fontFamily.sansSemiBold maps to GoogleSansFlex_600SemiBold');
  assert(fontFamily.sansBold === 'GoogleSansFlex_700Bold', 'Typography Token', 'fontFamily.sansBold maps to GoogleSansFlex_700Bold');
  assert(fontFamily.mono === 'GoogleSansFlex_500Medium', 'Typography Token', 'fontFamily.mono maps to GoogleSansFlex_500Medium');

  // Verify no conflicting fontWeights in typography preset styles that would trigger Android font synthesis
  for (const [presetName, styleObj] of Object.entries(typography)) {
    assert(
      (styleObj as any).fontWeight === undefined,
      'Android Font Synthesis Prevention',
      `Typography preset '${presetName}' relies solely on fontFamily and does not declare conflicting fontWeight`
    );
  }

  // 3. Verify DesignSystem Typography Constants
  console.log('\n--- 3. Checking DesignSystem Constants ---');
  assert(DesignSystem.typography.fontRegular === 'GoogleSansFlex_400Regular', 'DesignSystem', 'fontRegular is GoogleSansFlex_400Regular');
  assert(DesignSystem.typography.fontMedium === 'GoogleSansFlex_500Medium', 'DesignSystem', 'fontMedium is GoogleSansFlex_500Medium');
  assert(DesignSystem.typography.fontSemiBold === 'GoogleSansFlex_600SemiBold', 'DesignSystem', 'fontSemiBold is GoogleSansFlex_600SemiBold');
  assert(DesignSystem.typography.fontBold === 'GoogleSansFlex_700Bold', 'DesignSystem', 'fontBold is GoogleSansFlex_700Bold');
  assert(DesignSystem.tabs.fontActive === 'GoogleSansFlex_700Bold', 'DesignSystem', 'tabs.fontActive is GoogleSansFlex_700Bold');
  assert(DesignSystem.tabs.fontInactive === 'GoogleSansFlex_600SemiBold', 'DesignSystem', 'tabs.fontInactive is GoogleSansFlex_600SemiBold');

  // 4. Verify RootLayout Registration and Fallback Safety
  console.log('\n--- 4. Checking RootLayout Font Registration & Safety ---');
  const layoutPath = path.join(rootDir, 'app', '_layout.tsx');
  const layoutContent = fs.readFileSync(layoutPath, 'utf8');

  assert(layoutContent.includes('GoogleSansFlex: GoogleSansFlex_400Regular'), 'Layout Registration', 'Registered GoogleSansFlex base alias in useFonts');
  assert(layoutContent.includes('GoogleSansFlex_400Regular'), 'Layout Registration', 'Registered GoogleSansFlex_400Regular in useFonts');
  assert(layoutContent.includes('GoogleSansFlex_500Medium'), 'Layout Registration', 'Registered GoogleSansFlex_500Medium in useFonts');
  assert(layoutContent.includes('GoogleSansFlex_600SemiBold'), 'Layout Registration', 'Registered GoogleSansFlex_600SemiBold in useFonts');
  assert(layoutContent.includes('GoogleSansFlex_700Bold'), 'Layout Registration', 'Registered GoogleSansFlex_700Bold in useFonts');

  assert(layoutContent.includes('fontTimeout'), 'Splash Safety', 'Safety timeout exists for font loading stalls');
  assert(layoutContent.includes('SplashScreen.hideAsync()'), 'Splash Safety', 'Guarantees splash screen is dismissed even if fonts fail');

  // 5. Codebase Scan for Font Family and Weight Synthesis Hygiene
  console.log('\n--- 5. Scanning Codebase for Font Family Hygiene & Weight Synthesis ---');
  const registeredFonts = new Set([
    'GoogleSansFlex',
    'GoogleSansFlex_400Regular',
    'GoogleSansFlex_500Medium',
    'GoogleSansFlex_600SemiBold',
    'GoogleSansFlex_700Bold',
    'SpaceGrotesk_700Bold',
    'SpaceMono',
    'SpaceMono_400Regular',
    'SpaceMono_700Bold',
  ]);

  const usedFonts = new Set<string>();
  const synthesisConflicts: string[] = [];

  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (['node_modules', '.git', '.expo', 'dist', '__tests__'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(full);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        const fileContent = fs.readFileSync(full, 'utf8');

        // Extract font families
        const matches = fileContent.matchAll(/fontFamily:\s*['"]([^'"]+)['"]/g);
        for (const m of matches) {
          usedFonts.add(m[1]);
        }

        // Check for Android font synthesis conflicts: fontFamily + fontWeight in same style block
        const objMatches = fileContent.matchAll(/\{[^{}]*fontFamily:[^{}]*fontWeight:[^{}]*\}|\{[^{}]*fontWeight:[^{}]*fontFamily:[^{}]*\}/gs);
        for (const m of objMatches) {
          if (m[0].includes('GoogleSansFlex')) {
            synthesisConflicts.push(`${path.relative(rootDir, full)}: ${m[0].replace(/\s+/g, ' ')}`);
          }
        }
      }
    }
  }

  scanDir(rootDir);

  for (const font of usedFonts) {
    assert(
      registeredFonts.has(font),
      'Font Registration Coverage',
      `Font '${font}' used in code is registered in RootLayout useFonts`
    );
  }

  assert(
    synthesisConflicts.length === 0,
    'Android Weight Synthesis Hygiene',
    `Found 0 conflicting fontFamily + fontWeight pairs on GoogleSansFlex across the codebase (Conflicts: ${synthesisConflicts.length})`
  );

  console.log('\n===============================================================');
  console.log(`ALL FONT RENDERING TESTS PASSED (${passCount} passed, ${failCount} failed)`);
  console.log('===============================================================\n');
}

if (require.main === module) {
  runFontRenderingTestSuite().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
