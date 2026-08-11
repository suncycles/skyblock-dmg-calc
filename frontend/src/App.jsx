import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ItemDataProvider } from './context/ItemDataContext';
import { BuildProvider } from './context/BuildContext';
import { TooltipProvider } from './context/TooltipContext';
import { ThemeProvider } from './context/ThemeContext';
import { ConfirmDialogProvider } from './context/ConfirmDialogContext';
import PageBackground from './components/PageBackground';
import TopBar from './components/TopBar';
import GlobalFooter from './components/GlobalFooter';
import Landing from './pages/Landing';
import WeaponPicker from './pages/WeaponPicker';
import ArmorItemPicker from './pages/ArmorItemPicker';
import ArmorVariantTierPicker from './pages/ArmorVariantTierPicker';
import EquipmentItemPicker from './pages/EquipmentItemPicker';
import PetPicker from './pages/PetPicker';
import PetRarityPicker from './pages/PetRarityPicker';
import PetDetail from './pages/PetDetail';
import PetItemPicker from './pages/PetItemPicker';
import Hex from './pages/Hex';
import EnchantList from './pages/EnchantList';
import EnchantLevels from './pages/EnchantLevels';
import GemstoneSlots from './pages/GemstoneSlots';
import GemstoneTypePicker from './pages/GemstoneTypePicker';
import GemstoneTierPicker from './pages/GemstoneTierPicker';
import BooksPicker from './pages/BooksPicker';
import ReforgesPicker from './pages/ReforgesPicker';
import SpecialPicker from './pages/SpecialPicker';
import StarringPicker from './pages/StarringPicker';
import DamageSources from './pages/DamageSources';
import Compare from './pages/Compare';
import AccessoryPowerPicker from './pages/AccessoryPowerPicker';
import AccessoryTuning from './pages/AccessoryTuning';
import PlayerLevels from './pages/PlayerLevels';
import TargetMobPicker from './pages/TargetMobPicker';
import Attributes from './pages/Attributes';
import LoadoutLoader from './pages/LoadoutLoader';
import HypixelImport from './pages/HypixelImport';
import Credits from './pages/Credits';
import Resources from './pages/Resources';
import Tutorial from './pages/Tutorial';
import Examples from './pages/Examples';
import ComingSoon from './pages/ComingSoon';
import ErrorBoundary from './components/ErrorBoundary';

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
