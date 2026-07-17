import { Routes, Route } from 'react-router-dom';
import { ItemDataProvider } from './context/ItemDataContext';
import { BuildProvider } from './context/BuildContext';
import { TooltipProvider } from './context/TooltipContext';
import WeaponPicker from './pages/WeaponPicker';
import Hex from './pages/Hex';
import Enchants from './pages/Enchants';

export default function App() {
  return (
    <ItemDataProvider>
      <BuildProvider>
        <TooltipProvider>
          <Routes>
            <Route path="/" element={<WeaponPicker />} />
            <Route path="/hex" element={<Hex />} />
            <Route path="/enchants" element={<Enchants />} />
          </Routes>
        </TooltipProvider>
      </BuildProvider>
    </ItemDataProvider>
  );
}
