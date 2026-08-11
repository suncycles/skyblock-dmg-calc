import { useNavigate } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import {
  RULER_ATTRIBUTES,
  STRENGTH_ELEMENTAL_ATTRIBUTES,
  INTELLIGENCE_ELEMENTAL_ATTRIBUTES,
  OTHER_ATTRIBUTES,
  getAttributeMaxLevel,
} from '../lib/attributes';
import { MOB_TYPE_SYMBOLS } from '../lib/damageSymbols';
import NumberInput from '../components/NumberInput';
import PageHeader from '../components/PageHeader';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

const ECHO_ATTRIBUTES = [
  { id: 'echo_of_ruler', name: 'Echo of Ruler' },
  { id: 'echo_of_echoes', name: 'Echo of Echoes' },
  { id: 'echo_of_elemental', name: 'Echo of Elemental' },
  { id: 'echo_of_boxes', name: 'Echo of Boxes' },
];

// Small "[max]" text button — maxes a single attribute, one section, or every attribute depending on call site.
function MaxButton({ label, onClick }) {
  return (
    <button
      type="button"
      className="text-[11px] font-bold text-blue-800 hover:underline cursor-pointer whitespace-nowrap"
      onClick={onClick}
    >
      [{label}]
    </button>
  );
}

function LevelInput({ id, level, onChange }) {
  const maxLevel = getAttributeMaxLevel(id);
  return (
    <div className="flex items-center gap-1.5">
      <MaxButton label="max" onClick={() => onChange(maxLevel)} />
      <NumberInput
        id={id}
        max={maxLevel}
        value={level}
        onChange={onChange}
        className="w-14 px-2 py-1 text-sm bg-black text-white border-2 border-neutral-700 text-center"
      />
    </div>
  );
}

function Section({ title, subtitle, maxLabel, onMaxAll, children }) {
  return (
    <div className={`${panel} p-3 flex flex-col gap-1.5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-bold text-black">{title}</div>
        {onMaxAll && <MaxButton label={`max ${maxLabel}`} onClick={onMaxAll} />}
      </div>
      {subtitle && <div className="text-[11px] text-neutral-700 -mt-1 mb-1">{subtitle}</div>}
      {children}
    </div>
  );
}

// Account-wide attribute levels (1-10 each), not tied to any equipped item — reads/writes BuildContext's `attributes` state directly.
export default function Attributes() {
  const navigate = useNavigate();
  const { attributes, setAttributeLevel } = useBuild();

  function setAllTo(ids, level) {
    ids.forEach((id) => setAttributeLevel(id, level));
  }
  function maxAll(ids) {
    ids.forEach((id) => setAttributeLevel(id, getAttributeMaxLevel(id)));
  }
  function minAll(ids) {
    setAllTo(ids, 0);
  }

  const rulerIds = RULER_ATTRIBUTES.map((a) => a.id);
  const echoIds = ECHO_ATTRIBUTES.map((a) => a.id);
  const elementalIds = STRENGTH_ELEMENTAL_ATTRIBUTES.map((a) => a.id);
  const intelligenceElementalIds = INTELLIGENCE_ELEMENTAL_ATTRIBUTES.map((a) => a.id);
  const otherIds = OTHER_ATTRIBUTES.map((a) => a.id);
  const allIds = [...rulerIds, ...echoIds, ...elementalIds, ...intelligenceElementalIds, ...otherIds];

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <PageHeader title="Attributes" />

      <div className="w-full max-w-[500px] flex flex-col gap-3">
        <Section
          title="Ruler Attributes"
          subtitle="+3%–30% more Damage against the listed Mob Type."
          maxLabel="ruler"
          onMaxAll={() => maxAll(rulerIds)}
        >
          {RULER_ATTRIBUTES.map(({ id, name, mobType }) => {
            const meta = MOB_TYPE_SYMBOLS[mobType];
            return (
              <div key={id} className="flex items-center justify-between gap-2">
                <label className="text-sm text-black" htmlFor={id}>
                  <span style={{ color: meta.color }}>{meta.symbol}</span> {name}
                </label>
                <LevelInput id={id} level={attributes[id] || 0} onChange={(v) => setAttributeLevel(id, v)} />
              </div>
            );
          })}
        </Section>

        <Section
          title="Echo Attributes"
          subtitle="Boost every attribute whose name contains the matching keyword."
          maxLabel="echo"
          onMaxAll={() => maxAll(echoIds)}
        >
          {ECHO_ATTRIBUTES.map(({ id, name }) => (
            <div key={id} className="flex items-center justify-between gap-2">
              <label className="text-sm text-black" htmlFor={id}>
                {name}
              </label>
              <LevelInput id={id} level={attributes[id] || 0} onChange={(v) => setAttributeLevel(id, v)} />
            </div>
          ))}
        </Section>

        <Section
          title="Strength Elemental"
          subtitle="Grants Strength +1–10, added directly to base stats."
          maxLabel="elemental"
          onMaxAll={() => maxAll(elementalIds)}
        >
          {STRENGTH_ELEMENTAL_ATTRIBUTES.map(({ id, name }) => (
            <div key={id} className="flex items-center justify-between gap-2">
              <label className="text-sm text-black" htmlFor={id}>
                {name}
              </label>
              <LevelInput id={id} level={attributes[id] || 0} onChange={(v) => setAttributeLevel(id, v)} />
            </div>
          ))}
        </Section>

        <Section
          title="Intelligence Elemental"
          subtitle="Grants Intelligence +1–10, added directly to base stats."
          maxLabel="elemental"
          onMaxAll={() => maxAll(intelligenceElementalIds)}
        >
          {INTELLIGENCE_ELEMENTAL_ATTRIBUTES.map(({ id, name }) => (
            <div key={id} className="flex items-center justify-between gap-2">
              <label className="text-sm text-black" htmlFor={id}>
                {name}
              </label>
              <LevelInput id={id} level={attributes[id] || 0} onChange={(v) => setAttributeLevel(id, v)} />
            </div>
          ))}
        </Section>

        <Section title="Other" maxLabel="other" onMaxAll={() => maxAll(otherIds)}>
          {OTHER_ATTRIBUTES.map(({ id, name, rate, unit }) => (
            <div key={id} className="flex items-center justify-between gap-2">
              <label className="text-sm text-black" htmlFor={id}>
                {name} <span className="text-xs text-neutral-600">({rate}{unit}/level)</span>
              </label>
              <LevelInput id={id} level={attributes[id] || 0} onChange={(v) => setAttributeLevel(id, v)} />
            </div>
          ))}
        </Section>

        <div className="flex items-center gap-3">
          <button
            className="px-4 py-2 bg-neutral-800 text-white cursor-pointer hover:brightness-110"
            onClick={() => navigate('/')}
          >
            Back
          </button>
          <button
            className="px-4 py-2 bg-neutral-800 text-white cursor-pointer hover:brightness-110"
            onClick={() => minAll(allIds)}
          >
            [Min Attributes]
          </button>
          <button
            className="px-4 py-2 bg-neutral-800 text-white cursor-pointer hover:brightness-110"
            onClick={() => maxAll(allIds)}
          >
            [Max Attributes]
          </button>
        </div>
      </div>
    </div>
  );
}
