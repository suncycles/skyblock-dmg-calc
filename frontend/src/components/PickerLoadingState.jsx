// Shared loading placeholder for the 9x6 chest-GUI-grid picker pages (ArmorVariantTierPicker,
// PetRarityPicker, ReforgesPicker) — same "pulsing empty shell, not a plain 'Loading...' line"
// philosophy as ItemPicker.jsx's own skeleton, just shaped like this family's grid instead of a
// flat item list, so the layout doesn't jump once the real content (which needs itemData from the
// Worker's /api/items) arrives.
export default function PickerLoadingState({ title }) {
  return (
    <div className="min-h-screen flex flex-col items-center p-4 relative">
      <header className="w-full max-w-[700px] mb-4">
        <h1 className="text-xl font-bold">{title}</h1>
      </header>
      <div className="w-full max-w-[700px] overflow-x-auto">
        <div className="grid grid-cols-9 grid-rows-6 gap-[3px] w-full min-w-[380px] aspect-[9/6] bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black p-2">
          {Array.from({ length: 54 }).map((_, i) => (
            <div key={i} className="bg-[#8b8b8b]/80 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
