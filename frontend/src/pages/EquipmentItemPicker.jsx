import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { EQUIPMENT_SLOT_LABELS, itemsForEquipmentSlot } from '../lib/equipmentSlots';
import ItemPicker from './ItemPicker';

export default function EquipmentItemPicker() {
  const { slot } = useParams();
  const { itemData, loading, error } = useItemData();
  const { selectItem } = useBuild();
  const navigate = useNavigate();

  const items = useMemo(() => itemsForEquipmentSlot(itemData.equipment, slot), [itemData.equipment, slot]);
  const label = EQUIPMENT_SLOT_LABELS[slot] || 'Equipment';

  function handleSelect(item) {
    selectItem(slot, item);
    navigate(`/hex/${slot}`);
  }

  return (
    <ItemPicker
      items={items}
      title={`Pick a ${label}`}
      placeholder={`Search ${label.toLowerCase()}s...`}
      loading={loading}
      error={error}
      onSelect={handleSelect}
      onBack={() => navigate('/')}
    />
  );
}
