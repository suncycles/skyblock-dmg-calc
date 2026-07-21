import { useNavigate } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import ItemPicker from './ItemPicker';

export default function PetItemPicker() {
  const { itemData, loading, error } = useItemData();
  const { setPetItem } = useBuild();
  const navigate = useNavigate();

  function handleSelect(item) {
    setPetItem(item.id);
    navigate('/pet/detail');
  }

  return (
    <ItemPicker
      items={itemData.petItems || []}
      title="Pick a Pet Item"
      placeholder="Search pet items..."
      loading={loading}
      error={error}
      onSelect={handleSelect}
      onBack={() => navigate('/pet/detail')}
    />
  );
}
