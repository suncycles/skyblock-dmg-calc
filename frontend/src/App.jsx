import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ItemDataProvider } from './context/ItemDataContext';
import { BuildProvider } from './context/BuildContext';
import { TooltipProvider } from './context/TooltipContext';
import { ThemeProvider } from './context/ThemeContext';
import { ConfirmDialogProvider } from './context/ConfirmDialogContext';
import PageBackground from './components/PageBackground';
import TopBar from './components/TopBar';
import GlobalFooter from './components/GlobalFooter';
import ErrorBoundary from './components/ErrorBoundary';
// Landing is the highest-traffic route (every fresh visit hits it) — kept as a normal eager
// import so there's zero Suspense-fallback flash on first load. Every other page is only reached
// by clicking into it from Landing (or a direct deep link), so Vite code-splits each one into its
// own chunk fetched on demand instead of bundling all 30+ pages' code into a single JS payload
// every visitor downloads regardless of which page they actually use — the previous shape was a
// single ~520KB bundle with zero splitting.
import Landing from './pages/Landing';
const WeaponPicker = lazy(() => import('./pages/WeaponPicker'));
const ArmorItemPicker = lazy(() => import('./pages/ArmorItemPicker'));
const ArmorVariantTierPicker = lazy(() => import('./pages/ArmorVariantTierPicker'));
const EquipmentItemPicker = lazy(() => import('./pages/EquipmentItemPicker'));
const PetPicker = lazy(() => import('./pages/PetPicker'));
const PetRarityPicker = lazy(() => import('./pages/PetRarityPicker'));
const PetDetail = lazy(() => import('./pages/PetDetail'));
const PetItemPicker = lazy(() => import('./pages/PetItemPicker'));
const Hex = lazy(() => import('./pages/Hex'));
const EnchantList = lazy(() => import('./pages/EnchantList'));
const EnchantLevels = lazy(() => import('./pages/EnchantLevels'));
const GemstoneSlots = lazy(() => import('./pages/GemstoneSlots'));
const GemstoneTypePicker = lazy(() => import('./pages/GemstoneTypePicker'));
const GemstoneTierPicker = lazy(() => import('./pages/GemstoneTierPicker'));
const BooksPicker = lazy(() => import('./pages/BooksPicker'));
const ReforgesPicker = lazy(() => import('./pages/ReforgesPicker'));
const SpecialPicker = lazy(() => import('./pages/SpecialPicker'));
const StarringPicker = lazy(() => import('./pages/StarringPicker'));
const DamageSources = lazy(() => import('./pages/DamageSources'));
const Compare = lazy(() => import('./pages/Compare'));
const Optimizer = lazy(() => import('./pages/Optimizer'));
const AccessoryOptimizer = lazy(() => import('./pages/AccessoryOptimizer'));
const AccessoryPowerPicker = lazy(() => import('./pages/AccessoryPowerPicker'));
const AccessoryTuning = lazy(() => import('./pages/AccessoryTuning'));
const PlayerLevels = lazy(() => import('./pages/PlayerLevels'));
const TargetMobPicker = lazy(() => import('./pages/TargetMobPicker'));
const Attributes = lazy(() => import('./pages/Attributes'));
const LoadoutLoader = lazy(() => import('./pages/LoadoutLoader'));
const HypixelImport = lazy(() => import('./pages/HypixelImport'));
const Credits = lazy(() => import('./pages/Credits'));
const Resources = lazy(() => import('./pages/Resources'));
const Tutorial = lazy(() => import('./pages/Tutorial'));
const Examples = lazy(() => import('./pages/Examples'));
const ComingSoon = lazy(() => import('./pages/ComingSoon'));

// Matches LoadoutLoader's own "Loading..." panel style — only visible on a slow connection
// (fast chunk loads resolve before this would ever paint), so it stays a plain, cheap fallback
// rather than a full skeleton.
function RouteFallback() {
  return <div className="min-h-screen flex items-center justify-center text-sm text-neutral-400">Loading...</div>;
}

export default function App() {
  const location = useLocation();
  return (
    <ItemDataProvider>
      <BuildProvider>
        <ThemeProvider>
          <TooltipProvider>
            <ConfirmDialogProvider>
              <PageBackground />
              <TopBar />
              {/* pt-12 matches TopBar's fixed h-12 — TopBar no longer reserves this space in
                  normal flow (see its own comment for why it switched from sticky to fixed).
                  ErrorBoundary is keyed by pathname so a crash on one page doesn't stay stuck
                  once the user navigates elsewhere (Back to Home) — a fresh key remounts it. */}
              <div className="pt-12">
                <ErrorBoundary key={location.pathname}>
                  <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route path="/" element={<Landing />} />
                    <Route path="/weapon" element={<WeaponPicker />} />
                    <Route path="/armor/:slot" element={<ArmorItemPicker />} />
                    <Route path="/armor/:slot/variant/:family" element={<ArmorVariantTierPicker />} />
                    <Route path="/equipment/:slot" element={<EquipmentItemPicker />} />
                    <Route path="/pet" element={<PetPicker />} />
                    <Route path="/pet/detail" element={<PetDetail />} />
                    <Route path="/pet/:petId" element={<PetRarityPicker />} />
                    <Route path="/pet/item" element={<PetItemPicker />} />
                    <Route path="/hex/:slot" element={<Hex />} />
                    <Route path="/enchants/:slot" element={<EnchantList ultimate={false} />} />
                    <Route path="/ultimate-enchants/:slot" element={<EnchantList ultimate />} />
                    <Route path="/enchant-levels/:slot/:enchantId" element={<EnchantLevels />} />
                    <Route path="/gemstones/:slot" element={<GemstoneSlots />} />
                    <Route path="/gemstones/:slot/:slotIndex" element={<GemstoneTypePicker />} />
                    <Route path="/gemstones/:slot/:slotIndex/:gemType" element={<GemstoneTierPicker />} />
                    <Route path="/books/:slot" element={<BooksPicker />} />
                    <Route path="/reforges/:slot" element={<ReforgesPicker blacksmith={false} />} />
                    <Route path="/reforges/:slot/blacksmith" element={<ReforgesPicker blacksmith />} />
                    <Route path="/special/:slot" element={<SpecialPicker />} />
                    <Route path="/stars/:slot" element={<StarringPicker />} />
                    <Route path="/damage-sources" element={<DamageSources />} />
                    <Route path="/compare" element={<Compare />} />
                    <Route path="/optimizer" element={<Optimizer />} />
                    <Route path="/accessory-optimizer" element={<AccessoryOptimizer />} />
                    <Route path="/accessory" element={<AccessoryPowerPicker />} />
                    <Route path="/accessory/tuning" element={<AccessoryTuning />} />
                    <Route path="/player-levels" element={<PlayerLevels />} />
                    <Route path="/target-mob" element={<TargetMobPicker />} />
                    <Route path="/attributes" element={<Attributes />} />
                    <Route path="/loadout/:code" element={<LoadoutLoader />} />
                    <Route path="/hypixel-import" element={<HypixelImport />} />
                    <Route path="/credits" element={<Credits />} />
                    <Route path="/guides" element={<ComingSoon title="Guides" />} />
                    <Route path="/tutorial" element={<Tutorial />} />
                    <Route path="/examples" element={<Examples />} />
                    <Route path="/resources" element={<Resources />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                  </Suspense>
                </ErrorBoundary>
              </div>
              <GlobalFooter />
            </ConfirmDialogProvider>
          </TooltipProvider>
        </ThemeProvider>
      </BuildProvider>
    </ItemDataProvider>
  );
}
