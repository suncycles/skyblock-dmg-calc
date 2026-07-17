import { Routes, Route } from 'react-router-dom';
import { ItemDataProvider } from './context/ItemDataContext';
import { BuildProvider } from './context/BuildContext';
import { TooltipProvider } from './context/TooltipContext';
import WeaponPicker from './pages/WeaponPicker';
import Hex from './pages/Hex';
import EnchantList from './pages/EnchantList';
import EnchantLevels from './pages/EnchantLevels';

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
          </Routes>
        </TooltipProvider>
      </BuildProvider>
    </ItemDataProvider>
  );
}
