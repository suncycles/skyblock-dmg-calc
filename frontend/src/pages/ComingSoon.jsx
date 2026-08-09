import PageHeader from '../components/PageHeader';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// Generic placeholder for the side-menu's Guides/Tutorial/Examples sections (see TopBar.jsx) —
// none of those have real content yet, so one shared component covers all three routes until
// each gets written for real.
export default function ComingSoon({ title }) {
  return (
    <div className="min-h-screen flex flex-col items-center p-4 relative">
      <PageHeader title={title} />
      <div className={`${panel} w-full max-w-[700px] p-10 flex flex-col items-center gap-2 text-center`}>
        <span className="text-3xl">🚧</span>
        <p className="text-lg font-bold text-black">Coming soon</p>
        <p className="text-sm text-black/70">{title} hasn't been written yet — check back later.</p>
      </div>
    </div>
  );
}
