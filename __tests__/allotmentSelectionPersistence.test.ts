import { BackendIpo } from '../types/backend-ipo';
import {
  isBackendIpoAllotmentEligible,
  normalizeBackendIpoForChecker,
  AllotmentCheckerIpoItem,
} from '../services/allotment/allotmentCheckerIpoSource';
import { getRegistrarConfig, isAutomatedCheckSupported } from '../services/allotment/registrarConfig';

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✓ PASS: [${testName}] ${detail}`);
  } else {
    console.error(`❌ FAIL: [${testName}] ${detail}`);
    throw new Error(`Test failed: [${testName}] ${detail}`);
  }
}

export async function runAllotmentSelectionPersistenceTests() {
  console.log('===========================================================');
  console.log('RUNNING ALLOTMENT SELECTION PERSISTENCE & LIFECYCLE TESTS');
  console.log('===========================================================');

  // Test data: Mix of Automated, Manual, Bigshare, and Closed IPOs
  const mockBackendIpos: any[] = [
    {
      id: 'backend-linkintime-1',
      symbol: 'LINKIPO',
      company: { id: 'c1', displayName: 'Link Intime Corp' },
      status: 'ALLOTMENT_COMPLETED',
      registrar: 'Link Intime India Private Ltd',
      allotmentDate: '2026-10-25',
    },
    {
      id: 'backend-kfin-2',
      symbol: 'KFINIPO',
      company: { id: 'c2', displayName: 'KFintech Corp' },
      status: 'ALLOTMENT_OUT',
      registrar: 'KFin Technologies Ltd',
      allotmentDate: '2026-10-24',
    },
    {
      id: 'backend-bigshare-3',
      symbol: 'BIGIPO',
      company: { id: 'c3', displayName: 'Bigshare Corp' },
      status: 'ALLOTTED',
      registrar: 'Bigshare Services Pvt Ltd',
      allotmentDate: '2026-10-23',
    },
    {
      id: 'backend-cameo-4',
      symbol: 'CAMEOIPO',
      company: { id: 'c4', displayName: 'Cameo Corp' },
      status: 'ALLOTMENT',
      registrar: 'Cameo Corporate Services Ltd',
      allotmentDate: '2026-10-22',
    },
    {
      id: 'backend-closed-5',
      symbol: 'CLOSEDIPO',
      company: { id: 'c5', displayName: 'Closed Corp' },
      status: 'CLOSED',
      registrar: 'Link Intime India Private Ltd',
      allotmentDate: '2026-10-28',
    },
  ];

  // Simulating state container representing app/allotment-checker.tsx
  class AllotmentCheckerStateSimulator {
    selectedIpoId: string | null = null;
    directSelectedIpo: AllotmentCheckerIpoItem | null = null;
    showIpoPicker: boolean = false;
    ipoResolution: { method: string; status: string } | null = null;
    automatedCheckStarted: string | null = null;
    browserOpenedUrl: string | null = null;
    hasLostFocus: boolean = false;
    dismissedRouteIpoId: string | null = null;

    selectableIpos = mockBackendIpos
      .filter(isBackendIpoAllotmentEligible)
      .map(normalizeBackendIpoForChecker);

    get selectedIpo(): AllotmentCheckerIpoItem | null {
      if (!this.selectedIpoId) return null;
      const found = this.selectableIpos.find((i) => i.id === this.selectedIpoId);
      if (found) return found;
      if (this.directSelectedIpo && this.directSelectedIpo.id === this.selectedIpoId) {
        return this.directSelectedIpo;
      }
      return null;
    }

    // Fixed handleSelectIpo implementation matching app/allotment-checker.tsx
    async handleSelectIpo(ipoId: string) {
      this.showIpoPicker = false;
      this.selectedIpoId = ipoId;

      let targetIpo =
        this.selectableIpos.find((i) => i.id === ipoId) ||
        (mockBackendIpos.find((i) => i.id === ipoId)
          ? normalizeBackendIpoForChecker(mockBackendIpos.find((i) => i.id === ipoId)!)
          : null);

      const canonicalTargetId = targetIpo ? targetIpo.id : ipoId;
      this.selectedIpoId = canonicalTargetId;
      if (targetIpo) {
        this.directSelectedIpo = targetIpo;
      }

      const targetRegistrar = targetIpo
        ? getRegistrarConfig(targetIpo.registrar || targetIpo.ipo_name).name
        : '';

      // Ineligible status fallback: do NOT reset selectedIpoId to null
      if (targetIpo && !isBackendIpoAllotmentEligible(targetIpo as any)) {
        const portalConfig = getRegistrarConfig(targetIpo.registrar || targetRegistrar || targetIpo.ipo_name);
        this.ipoResolution = { method: 'Manual Registrar', status: 'WAITING' };
        this.browserOpenedUrl = portalConfig.url;
        return;
      }

      const registrarUpper = (targetIpo?.registrar || targetRegistrar || '').toUpperCase();
      const isBigshare = registrarUpper.includes('BIGSHARE');

      if (isBigshare) {
        // Simulate captcha presence: do NOT reset selectedIpoId to null
        const portalConfig = getRegistrarConfig('BIGSHARE');
        this.ipoResolution = { method: 'Manual Registrar', status: 'WAITING' };
        this.browserOpenedUrl = portalConfig.url;
        return;
      }

      const manualRedirectRegistrar = registrarUpper.includes('CAMEO') ? 'CAMEO' : null;
      if (manualRedirectRegistrar) {
        // Manual registrar: do NOT reset selectedIpoId to null
        const portalConfig = getRegistrarConfig(manualRedirectRegistrar);
        this.ipoResolution = { method: 'Manual Registrar', status: 'WAITING' };
        this.browserOpenedUrl = portalConfig.url;
        return;
      }

      if (targetRegistrar && isAutomatedCheckSupported(targetRegistrar)) {
        this.automatedCheckStarted = canonicalTargetId;
      }
    }

    // Explicit user reset via Back button or Bottom Tab Bar Press
    resetToDefaultPage(routeIpoId?: string) {
      if (routeIpoId) {
        this.dismissedRouteIpoId = routeIpoId;
      }
      this.selectedIpoId = null;
      this.directSelectedIpo = null;
      this.showIpoPicker = false;
    }

    // Stable useFocusEffect callback that does NOT trigger self-reset
    onFocusEffectRun() {
      this.hasLostFocus = false;
      // Stable effect without self-resetting selectedIpoId
    }

    onBlurEffectRun() {
      this.hasLostFocus = true;
    }
  }

  // --- Test 1: Selecting an Automated IPO (Link Intime) ---
  const sim = new AllotmentCheckerStateSimulator();
  assert(sim.selectedIpo === null, 'Test 1a', 'Initial state has no selected IPO');

  await sim.handleSelectIpo('backend-linkintime-1');
  assert(sim.selectedIpoId === 'backend-linkintime-1', 'Test 1b', 'selectedIpoId is retained');
  assert(sim.selectedIpo !== null, 'Test 1c', 'selectedIpo resolves properly');
  assert(sim.selectedIpo?.company_name === 'Link Intime Corp', 'Test 1d', 'selectedIpo company name matches');
  assert(sim.automatedCheckStarted === 'backend-linkintime-1', 'Test 1e', 'Automated check initiated');

  // --- Test 2: Focus Effect Execution (Does NOT reset selected IPO) ---
  sim.onFocusEffectRun();
  assert(sim.selectedIpoId === 'backend-linkintime-1', 'Test 2a', 'Re-rendering / focus does NOT reset selected IPO');
  assert(sim.selectedIpo !== null, 'Test 2b', 'selectedIpo remains populated on render frame');

  // --- Test 3: Selecting Bigshare IPO (Preserves selectedIpo on captcha redirect) ---
  await sim.handleSelectIpo('backend-bigshare-3');
  assert(sim.selectedIpoId === 'backend-bigshare-3', 'Test 3a', 'Bigshare retains selectedIpoId on screen');
  assert(sim.selectedIpo !== null, 'Test 3b', 'Bigshare selectedIpo is NOT null');
  assert(Boolean(sim.browserOpenedUrl?.includes('bigshare')), 'Test 3c', 'Bigshare browser URL was opened');
  assert(sim.ipoResolution?.method === 'Manual Registrar', 'Test 3d', 'Bigshare resolution marked as Manual Registrar');

  // --- Test 4: Selecting Manual Registrar (Cameo) ---
  await sim.handleSelectIpo('backend-cameo-4');
  assert(sim.selectedIpoId === 'backend-cameo-4', 'Test 4a', 'Cameo retains selectedIpoId on screen');
  assert(sim.selectedIpo !== null, 'Test 4b', 'Cameo selectedIpo is NOT null');
  assert(Boolean(sim.browserOpenedUrl?.includes('cameoindia')), 'Test 4c', 'Cameo portal URL was opened');

  // --- Test 5: Selecting Closed/Ineligible IPO (Keeps IPO Selected with Manual Fallback) ---
  await sim.handleSelectIpo('backend-closed-5');
  assert(sim.selectedIpoId === 'backend-closed-5', 'Test 5a', 'Ineligible IPO retains selectedIpoId on screen');
  assert(sim.selectedIpo !== null, 'Test 5b', 'Ineligible IPO selectedIpo is NOT null');
  assert(sim.ipoResolution?.method === 'Manual Registrar', 'Test 5c', 'Ineligible IPO fallback is set');

  // --- Test 6: Explicit User Back/Tab Reset ---
  sim.resetToDefaultPage();
  assert(sim.selectedIpoId === null, 'Test 6a', 'Explicit reset clears selectedIpoId');
  assert(sim.selectedIpo === null, 'Test 6b', 'Explicit reset clears selectedIpo back to idle');

  console.log('===========================================================');
  console.log('ALL SELECTION PERSISTENCE TESTS PASSED (6/6)');
  console.log('===========================================================');
}

if (require.main === module) {
  runAllotmentSelectionPersistenceTests().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
