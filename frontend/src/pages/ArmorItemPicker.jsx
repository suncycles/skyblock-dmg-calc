import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { ARMOR_SLOT_LABELS, itemsForArmorSlot } from '../lib/armorSlots';
import ItemPicker from './ItemPicker';

export default function ArmorItemPicker() {
  const { slot } = useParams();
  const { itemData, loading, error } = useItemData();
  const { selectItem } = useBuild();
  const navigate = useNavigate();

  const items = useMemo(() => itemsForArmorSlot(itemData.armor, slot), [itemData.armor, slot]);
  const label = ARMOR_SLOT_LABELS[slot] || 'Armor';

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
