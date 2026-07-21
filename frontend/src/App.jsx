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
import BooksPicker from './pages/BooksPicker';
import ReforgesPicker from './pages/ReforgesPicker';
import SpecialPicker from './pages/SpecialPicker';

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
            <Route path="/" element={<WeaponPicker />} />
            <Route path="/hex" element={<Hex />} />
            <Route path="/enchants" element={<EnchantList ultimate={false} />} />
            <Route path="/ultimate-enchants" element={<EnchantList ultimate />} />
            <Route path="/enchant-levels/:enchantId" element={<EnchantLevels />} />
            <Route path="/gemstones" element={<GemstoneSlots />} />
            <Route path="/gemstones/:slotIndex" element={<GemstoneTypePicker />} />
            <Route path="/gemstones/:slotIndex/:gemType" element={<GemstoneTierPicker />} />
            <Route path="/books" element={<BooksPicker />} />
            <Route path="/reforges" element={<ReforgesPicker blacksmith={false} />} />
            <Route path="/reforges/blacksmith" element={<ReforgesPicker blacksmith />} />
            <Route path="/special" element={<SpecialPicker />} />
          </Routes>
          <div className="fixed bottom-1 right-2 text-[10px] text-neutral-500 pointer-events-none select-none">
            Latest deploy: {deployTime}
          </div>
        </TooltipProvider>
      </BuildProvider>
    </ItemDataProvider>
  );
}
