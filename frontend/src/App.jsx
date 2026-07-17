import { Routes, Route } from 'react-router-dom';
import { ItemDataProvider } from './context/ItemDataContext';
import { BuildProvider } from './context/BuildContext';
import { TooltipProvider } from './context/TooltipContext';
import WeaponPicker from './pages/WeaponPicker';
import Hex from './pages/Hex';
import EnchantList from './pages/EnchantList';
import EnchantLevels from './pages/EnchantLevels';
import GemstoneSlots from './pages/GemstoneSlots';
import GemstoneTypePicker from './pages/GemstoneTypePicker';
import GemstoneTierPicker from './pages/GemstoneTierPicker';

export default function App() {
  return (
    <ItemDataProvider>
      <BuildProvider>
        <TooltipProvider>
          <Routes>
            <Route path="/" element={<WeaponPicker />} />
            <Route path="/hex" element={<Hex />} />
            <Route path="/enchants" element={<EnchantList ultimate={false} />} />
            <Route path="/ultimate-enchants" element={<EnchantList ultimate />} />
            <Route path="/enchant-levels/:enchantId" element={<EnchantLevels />} />
            <Route path="/gemstones" element={<GemstoneSlots />} />
            <Route path="/gemstones/:slotIndex" element={<GemstoneTypePicker />} />
            <Route path="/gemstones/:slotIndex/:gemType" element={<GemstoneTierPicker />} />
          </Routes>
        </TooltipProvider>
      </BuildProvider>
    </ItemDataProvider>
  );
}
