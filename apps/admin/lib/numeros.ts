/**
 * Número com vírgula decimal, porque o painel é em português.
 *
 * Achado em 30/07 vendo as telas no navegador: `toFixed()` estava espalhado pelo
 * painel e produz formato inglês. No relatório eram sete números com ponto
 * (`0.8/h`, `1.2/h`, `18.0`); na ficha do aparelho, `parada: 2.3/h` e
 * `25.0 °C`.
 *
 * Não é só estranho, é AMBÍGUO: em português "1.200" significa mil e duzentos.
 * Num relatório que vai para a marca, um número que pode ser lido de duas formas
 * é um número que não serve.
 *
 * Um lugar só, para o próximo `toFixed` não nascer solto de novo.
 */
export function decimal(valor: number, casas = 1): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

/** Tamanho de arquivo: "13,1 MB" / "1,4 GB". */
export function tamanho(bytes: number | null): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${decimal(mb / 1024)} GB` : `${decimal(mb)} MB`;
}
