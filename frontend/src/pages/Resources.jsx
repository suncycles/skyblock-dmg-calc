import PageHeader from '../components/PageHeader';

// Community-sourced spreadsheets/threads with data or testing this app's numbers lean on.
export default function Resources() {
  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <PageHeader title="Calculations" />

      <div className="w-full max-w-[700px] flex flex-col gap-4 text-sm text-neutral-200">
        <section className="bg-neutral-800/60 border border-neutral-700 rounded-md p-3">
          <h2 className="font-semibold text-white mb-1">Type-Specific Sword Damage</h2>
          <p>
            Manually tested and verified.{' '}
            <a
              className="underline text-blue-300 hover:text-blue-200"
              href="https://docs.google.com/spreadsheets/d/1ZtE1TW7NhxHzzqlCt44nCUC7-lLZH7I9cCDq5EMxAcY/edit?gid=0#gid=0"
              target="_blank"
              rel="noreferrer"
            >
              Spreadsheet
            </a>
            .
          </p>
        </section>

        <section className="bg-neutral-800/60 border border-neutral-700 rounded-md p-3">
          <h2 className="font-semibold text-white mb-1">Warden vs 1B COA, Hypermax vs Eman&amp;Blaze</h2>
          <p>
            <a
              className="underline text-blue-300 hover:text-blue-200"
              href="https://docs.google.com/spreadsheets/d/1Rw63tQAxVF-vHiIpxubARTFYFiMy98Q63Cp1xHGMlhk/edit?gid=0#gid=0"
              target="_blank"
              rel="noreferrer"
            >
              Spreadsheet
            </a>{' '}
            — also check out the{' '}
            <a
              className="underline text-blue-300 hover:text-blue-200"
              href="https://hypixel.net/threads/warden-or-coa-need-damage-clarification-insane-manifesto.6133326/#post-41844436"
              target="_blank"
              rel="noreferrer"
            >
              forum post
            </a>
            .
          </p>
        </section>

        <section className="bg-neutral-800/60 border border-neutral-700 rounded-md p-3">
          <h2 className="font-semibold text-white mb-1">Ability Damage</h2>
          <p>
            <a
              className="underline text-blue-300 hover:text-blue-200"
              href="https://docs.google.com/spreadsheets/d/1Rw63tQAxVF-vHiIpxubARTFYFiMy98Q63Cp1xHGMlhk/edit?pli=1&gid=47634792#gid=47634792"
              target="_blank"
              rel="noreferrer"
            >
              Spreadsheet
            </a>
            .
          </p>
        </section>

        <section className="bg-neutral-800/60 border border-neutral-700 rounded-md p-3">
          <h2 className="font-semibold text-white mb-1">Pet Levelling Curves</h2>
          <p>
            <a
              className="underline text-blue-300 hover:text-blue-200"
              href="https://docs.google.com/spreadsheets/d/1b8-X2D6HKN5GP30KhZL4Y8NunzaH7fRlzjd98wZJh78/edit?gid=0#gid=0"
              target="_blank"
              rel="noreferrer"
            >
              Spreadsheet
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
