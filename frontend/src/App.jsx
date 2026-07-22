import { Routes, Route } from 'react-router-dom';
import { ItemDataProvider } from './context/ItemDataContext';
import { BuildProvider } from './context/BuildContext';
import { TooltipProvider } from './context/TooltipContext';
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

// __BUILD_TIME__ is injected by vite.config.js's `define` at build time —
// a fixed instant, not "now", so this reads the same on every page load
// until the next deploy.
const deployTime = new Date(__BUILD_TIME__).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function App() {
  return (
    <ItemDataProvider>
      <BuildProvider>
        <TooltipProvider>
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
          </Routes>
          <div className="fixed bottom-1 right-2 text-[10px] text-neutral-500 pointer-events-none select-none">
            Latest deploy: {deployTime}
          </div>
        </TooltipProvider>
      </BuildProvider>
    </ItemDataProvider>
  );
}
