import { useNavigate } from 'react-router-dom';
import { SLOT_TEXTURES } from '../lib/icons';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// Shared "standalone page" header (Back button + title) — used by every page that isn't part of
// the Hex customization grid (those embed their own Back/Close tile in the grid itself, a
// deliberate separate pattern). One definition instead of several copy-pasted header blocks
// means layout/styling only needs to change in one place. `right` is an optional node rendered
// at the header's far right, opposite Back — most pages leave it unset.
export default function PageHeader({ title, onBack = '/', right }) {
  const navigate = useNavigate();
  return (
    <header className="w-full max-w-[700px] mb-4 flex items-center gap-3">
      <button
        className={`${panel} px-4 py-2 cursor-pointer hover:brightness-110 flex items-center gap-2 text-sm font-bold text-black`}
        onClick={() => (typeof onBack === 'function' ? onBack() : navigate(onBack))}
      >
        <img src={SLOT_TEXTURES.close} alt="" className="w-4 h-4" />
        Back
      </button>
      <h1 className="text-xl font-bold">{title}</h1>
      {right && <div className="ml-auto">{right}</div>}
    </header>
  );
}
