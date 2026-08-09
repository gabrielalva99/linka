/**
 * Descobre a resolução de um vídeo antes de enviá-lo.
 *
 * POR QUE LER DO ARQUIVO E NÃO DO NOME. O primeiro pack real da agência veio com
 * catorze arquivos da mesma peça e o nome de cada um trazendo a resolução — em
 * dois formatos diferentes ("1056 x 1066" com espaços, "1066x1056" sem). Um
 * parser de nome erraria justamente no arquivo de formato incomum, que é o que
 * mais importa acertar. O arquivo sabe o próprio tamanho; é dele que a informação
 * tem que sair.
 *
 * Roda no navegador, antes do upload: o vídeo é carregado só o suficiente para os
 * metadados aparecerem (`preload="metadata"`), sem baixar nem decodificar o
 * conteúdo.
 *
 * Devolve null quando não dá para saber — arquivo que não é vídeo, codec que o
 * navegador não abre, ou metadados ausentes. Null é aceitável de propósito: mídia
 * sem dimensão simplesmente não participa da escolha por formato e continua sendo
 * exibida como sempre foi. Travar o upload porque não deu para medir seria trocar
 * um recurso novo por um caminho que já funcionava.
 */
export function dimensoesDoVideo(
  file: File,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("video/")) {
      resolve(null);
      return;
    }

    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let respondido = false;

    // Uma resposta só, aconteça o que acontecer. Sem isto, o timeout abaixo
    // poderia resolver depois de o metadata já ter resolvido, e o objeto de URL
    // seria revogado duas vezes.
    const responder = (valor: { width: number; height: number } | null) => {
      if (respondido) return;
      respondido = true;
      clearTimeout(prazo);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(valor);
    };

    // Arquivo grande em máquina lenta não pode deixar o upload pendurado para
    // sempre: sem prazo, um vídeo que o navegador não consegue abrir trava a
    // tela num "enviando" que nunca termina.
    const prazo = setTimeout(() => responder(null), 15000);

    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      responder(w > 0 && h > 0 ? { width: w, height: h } : null);
    };
    video.onerror = () => responder(null);
    video.src = url;
  });
}
