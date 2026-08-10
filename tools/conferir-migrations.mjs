#!/usr/bin/env node
/**
 * O banco e o repositório contam a mesma história?
 *
 * POR QUE ISTO EXISTE. Aplicar uma migration direto no banco e esquecer de
 * versioná-la não dá erro nenhum — tudo funciona, e a divergência só aparece no
 * dia em que alguém publica a partir do repositório e o ambiente volta no tempo.
 * Aconteceu três vezes em dois dias: uma pegou por varredura, e duas eu repeti
 * DEPOIS de corrigir a primeira. Memória não resolve isto; verificação resolve.
 *
 * Compara as duas listas nos dois sentidos:
 *   - no banco e não no repo  → alguém aplicou à mão; a próxima instalação limpa
 *     nasce sem aquilo, e o defeito só aparece longe daqui
 *   - no repo e não no banco  → o arquivo nunca foi aplicado, ou o carimbo do
 *     nome não bate com o que ficou registrado, e `db push` vai tentar reaplicar
 *
 * Uso:
 *   node tools/conferir-migrations.mjs                 (lista as versões locais)
 *   node tools/conferir-migrations.mjs versoes.json    (compara com o banco)
 *
 * O arquivo de comparação é a saída de `list_migrations` — um JSON com
 * { migrations: [{ version, name }] }. Sai assim porque a conferência precisa
 * rodar sem credencial de banco: quem tem acesso gera o arquivo, o script compara.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(raiz, "supabase", "migrations");

const locais = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => ({ version: f.slice(0, 14), name: f.slice(15, -4), arquivo: f }))
  .sort((a, b) => a.version.localeCompare(b.version));

const alvo = process.argv[2];
if (!alvo) {
  console.log(`${locais.length} migrations no repositório. A última:`);
  console.log(`  ${locais.at(-1)?.arquivo}`);
  console.log("\nPara comparar com o banco, passe o JSON de list_migrations:");
  console.log("  node tools/conferir-migrations.mjs versoes.json");
  process.exit(0);
}

const bruto = JSON.parse(readFileSync(alvo, "utf8"));
const remotas = (bruto.migrations ?? bruto).map((m) => ({
  version: String(m.version),
  name: String(m.name ?? ""),
}));

const vLocais = new Set(locais.map((m) => m.version));
const vRemotas = new Set(remotas.map((m) => m.version));

const soNoBanco = remotas.filter((m) => !vLocais.has(m.version));
const soNoRepo = locais.filter((m) => !vRemotas.has(m.version));

if (soNoBanco.length === 0 && soNoRepo.length === 0) {
  console.log(`OK — ${locais.length} migrations, banco e repositório iguais.`);
  process.exit(0);
}

if (soNoBanco.length > 0) {
  console.log(`\nAPLICADAS NO BANCO E AUSENTES DO REPOSITÓRIO (${soNoBanco.length}):`);
  console.log("  Uma instalação limpa nasce sem isto. Crie o arquivo com o mesmo carimbo.");
  for (const m of soNoBanco) console.log(`  - ${m.version}_${m.name}.sql`);
}

if (soNoRepo.length > 0) {
  console.log(`\nNO REPOSITÓRIO E NÃO REGISTRADAS NO BANCO (${soNoRepo.length}):`);
  console.log("  Ou nunca foram aplicadas, ou o carimbo do nome não bate com o registro.");
  console.log("  `db push` vai tentar reaplicar — e recriar o que já existe costuma abortar.");
  for (const m of soNoRepo) console.log(`  - ${m.arquivo}`);
}

process.exit(1);
