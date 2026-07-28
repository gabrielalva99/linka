import { getMessages } from "@/lib/i18n";

/**
 * O que fazer com um aparelho que ainda não se conectou.
 *
 * O código de pareamento existia só como mais um campo entre nove na ficha, e
 * quem tinha o celular na mão não achava. Aparelho novo agora abre com esta
 * instrução ocupando a tela, e ela some sozinha no instante em que o aparelho
 * reporta pela primeira vez: instrução que fica depois de pronta vira ruído.
 */
export function PairingCard({ code }: { code: string | null }) {
  const t = getMessages();
  if (!code) return null;

  return (
    <section className="mt-6 rounded-xl border border-primary/40 bg-primary/5 p-5">
      <h2 className="text-sm font-medium text-primary">{t.device.pairingTitle}</h2>
      <p className="mt-1 text-sm text-muted">{t.device.pairingIntro}</p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <span className="rounded-lg border border-primary/40 bg-surface px-5 py-3 font-mono text-2xl font-semibold tracking-[0.2em] text-primary">
          {code}
        </span>
        <ol className="flex min-w-56 flex-1 list-decimal flex-col gap-1 pl-4 text-sm text-muted">
          <li>{t.device.pairingStep1}</li>
          <li>{t.device.pairingStep2}</li>
          <li>{t.device.pairingStep3}</li>
        </ol>
      </div>
    </section>
  );
}
