import PageHeader from '../components/PageHeader';
import UpgradesPanel from '../components/UpgradesPanel';

// Damage Optimizer - the full-page view of the same Recommended Upgrades panel docked beside the
// gear board on Landing. One component serves both (components/UpgradesPanel.jsx); see
// lib/optimizer.js for the evaluation engine and lib/pricing.js for how costs are looked up.
export default function Optimizer() {
  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <PageHeader title="Damage Optimizer" />
      <div className="w-full max-w-[700px]">
        <UpgradesPanel variant="page" />
      </div>
    </div>
  );
}
