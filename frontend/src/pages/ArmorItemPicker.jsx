import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useItemData } from '../context/ItemDataContext';
import { useBuild } from '../context/BuildContext';
import { ARMOR_SLOT_LABELS, itemsForArmorSlot } from '../lib/armorSlots';
import { groupArmorVariants } from '../lib/armorVariants';
import ItemPicker from './ItemPicker';

export default function ArmorItemPicker() {
  const { slot } = useParams();
  const { itemData, loading, error } = useItemData();
  const { selectItem } = useBuild();
  const navigate = useNavigate();

  const rawItems = useMemo(() => itemsForArmorSlot(itemData.armor, slot), [itemData.armor, slot]);
  // Collapses each Blaze Slayer variant family's 5 power tiers into one tile; picking opens ArmorVariantTierPicker.
  const items = useMemo(() => groupArmorVariants(rawItems, slot), [rawItems, slot]);
  const label = ARMOR_SLOT_LABELS[slot] || 'Armor';

  function handleSelect(item) {
    if (item.isVariantFamily) {
      navigate(`/armor/${slot}/variant/${item.family}`);
      return;
    }
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
