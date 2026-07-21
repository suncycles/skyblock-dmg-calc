import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { getUniquePets } from '../lib/petData';
import ItemPicker from './ItemPicker';

// Step 1 of picking a pet: choose the species. Rarity (step 2, which
// together with level determines its real stats) is picked next on
// PetRarityPicker — same 2-step flow as gemstones (type, then tier).
export default function PetPicker() {
  const { itemData, loading, error } = useItemData();
  const navigate = useNavigate();

  const items = useMemo(
    () => getUniquePets(itemData.pets).map((p) => ({ id: p.petId, name: p.name, material: 'BONE' })),
    [itemData.pets],
  );

  function handleSelect(pet) {
    navigate(`/pet/${pet.id}`);
  }

  return (
    <ItemPicker
      items={items}
      title="Pick a Pet"
      placeholder="Search pets..."
      loading={loading}
      error={error}
      onSelect={handleSelect}
      onBack={() => navigate('/')}
    />
  );
}
