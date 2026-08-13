import PageHeader from '../components/PageHeader';

// Simple attribution page for third-party data/assets baked into this app at build time.
export default function Credits() {
  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <PageHeader title="Credits" />

      <div className="w-full max-w-[700px] flex flex-col gap-4 text-sm text-neutral-200">
        <p className="text-center text-base text-white">
          Made with <span className="text-red-400">♥</span> by <span className="font-semibold">sammui</span>
        </p>

        <section className="bg-neutral-800/60 border border-neutral-700 rounded-md p-3">
          <h2 className="font-semibold text-white mb-1">Item &amp; Pet Data — NotEnoughUpdates-REPO</h2>
          <p>
            Item, pet, reforge, and enchantment data, plus most icons, come from{' '}
            <a
              className="underline text-blue-300 hover:text-blue-200"
              href="https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO"
              target="_blank"
              rel="noreferrer"
            >
              NotEnoughUpdates-REPO
            </a>
            , licensed under the{' '}
            <a
              className="underline text-blue-300 hover:text-blue-200"
              href="https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO/blob/master/LICENSE"
              target="_blank"
              rel="noreferrer"
            >
              MIT License
            </a>
            .
          </p>
        </section>

        <section className="bg-neutral-800/60 border border-neutral-700 rounded-md p-3">
          <h2 className="font-semibold text-white mb-1">Mob Model Renders — Hypixel SkyBlock Wiki</h2>
          <p>
            Mob render images used in the Target Mob picker are from the{' '}
            <a
              className="underline text-blue-300 hover:text-blue-200"
              href="https://hypixelskyblock.minecraft.wiki/"
              target="_blank"
              rel="noreferrer"
            >
              Hypixel SkyBlock Wiki
            </a>{' '}
            and its contributors, used unmodified (aside from being renamed for internal use) and licensed under{' '}
            <a
              className="underline text-blue-300 hover:text-blue-200"
              href="https://creativecommons.org/licenses/by-nc-sa/3.0/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY-NC-SA 3.0
            </a>
            . This app is a free, non-commercial fan project.
          </p>
        </section>

        <section className="bg-neutral-800/60 border border-neutral-700 rounded-md p-3">
          <h2 className="font-semibold text-white mb-1">Background Images — ALAND's Immersive Skyblock Modpack</h2>
          <p>
            Zone backdrop images are captured using{' '}
            <a
              className="underline text-blue-300 hover:text-blue-200"
              href="https://modrinth.com/modpack/alands-immersive-hypixel-skyblock"
              target="_blank"
              rel="noreferrer"
            >
              ALAND's Immersive Skyblock Modpack
            </a>
            , which bundles a number of shader and resource-pack mods to give SkyBlock this look — full credit to
            that modpack and everything it packages together.
          </p>
        </section>

        <section className="bg-neutral-800/60 border border-neutral-700 rounded-md p-3">
          <h2 className="font-semibold text-white mb-1">Base Assets — Mojang &amp; Hypixel</h2>
          <p>
            Item/block/mob textures and the underlying SkyBlock game content this app calculates around belong to{' '}
            <a className="underline text-blue-300 hover:text-blue-200" href="https://www.minecraft.net/" target="_blank" rel="noreferrer">
              Mojang
            </a>{' '}
            and{' '}
            <a className="underline text-blue-300 hover:text-blue-200" href="https://hypixel.net/" target="_blank" rel="noreferrer">
              Hypixel Inc.
            </a>
            .
          </p>
        </section>

        <p className="text-xs text-neutral-500 italic">
          Minecraft and Hypixel SkyBlock are trademarks of their respective owners. This project is not affiliated
          with or endorsed by Mojang, Microsoft, or Hypixel Inc.
        </p>
      </div>
    </div>
  );
}
