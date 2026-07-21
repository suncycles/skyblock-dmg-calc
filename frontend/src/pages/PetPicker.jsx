import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { getFlattenedPets } from '../lib/petData';
import ItemPicker from './ItemPicker';

export default function PetPicker() {
  const { itemData, loading, error } = useItemData();
  const { selectItem } = useBuild();
  const navigate = useNavigate();

  const items = useMemo(() => getFlattenedPets(itemData.pets), [itemData.pets]);

  function handleSelect(pet) {
    selectItem('pet', pet);
    navigate('/pet/detail');
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
