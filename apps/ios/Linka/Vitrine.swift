import AVFoundation
import SwiftUI

/// A vitrine: o vídeo da vez, em tela cheia, sem nada por cima.
struct Vitrine: View {
    @EnvironmentObject var central: Central
    @StateObject private var tocador = Tocador()

    private let relogio = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if tocador.peca != nil {
                CamadaDeVideo(player: tocador.player, preencher: tocador.peca?.fit != "fit")
                    .ignoresSafeArea()
            } else {
                Text("Preparando a vitrine…")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundColor(.white.opacity(0.6))
            }
        }
        .onReceive(relogio) { _ in escolher() }
        .onAppear { escolher() }
        .onDisappear { tocador.parar() }
    }

    /// O MESMO RODÍZIO DO ANDROID: `floor(epoch / período) % total`.
    ///
    /// Ninguém troca mensagem com ninguém: dois aparelhos com a hora certa caem na
    /// mesma peça sozinhos, então um iPhone ao lado de um Motorola vira junto. Peça
    /// que ainda não desceu é pulada pela próxima que já está no aparelho, para a
    /// vitrine nunca tocar da nuvem em laço.
    private func escolher() {
        guard let c = central.conteudo, !c.playlist.isEmpty else {
            tocador.trocar(para: nil)
            central.noAr = nil
            return
        }
        let total = c.playlist.count
        let vez = (c.rotacao > 0 && total > 1)
            ? Int((Date().timeIntervalSince1970 / Double(c.rotacao)).rounded(.down)) % total
            : 0
        let ordem = (0..<total).map { c.playlist[(vez + $0) % total] }
        let escolhida = ordem.first { central.prontas.contains($0.url) }
        tocador.trocar(para: escolhida)
        central.noAr = escolhida
    }
}

/// Segura o tocador e conta cada exibição.
@MainActor
final class Tocador: ObservableObject {
    let player = AVQueuePlayer()
    @Published private(set) var peca: Peca?
    private var laco: AVPlayerLooper?
    private var desde: Date?

    init() {
        // Vitrine é muda: som só quando o painel liberar, como no Android.
        player.isMuted = true
        player.preventsDisplaySleepDuringVideoPlayback = true
    }

    func trocar(para nova: Peca?) {
        guard nova != peca else { return }
        fecharExibicao()
        peca = nova
        laco = nil
        player.removeAllItems()
        guard let nova else { return }
        let item = AVPlayerItem(url: Central.arquivo(de: nova.url))
        laco = AVPlayerLooper(player: player, templateItem: item)
        player.play()
        desde = Date()
        alinhar(item)
    }

    func parar() {
        fecharExibicao()
        player.pause()
    }

    /// PEÇA ÚNICA: mesma posição em todos os aparelhos, `epoch % duração`. Sem
    /// virada de rodízio, cada aparelho começaria o laço na hora em que abriu, e a
    /// bancada ficaria fora de sincronia para sempre. Falha fechada: sem duração
    /// conhecida, toca do começo.
    private func alinhar(_ item: AVPlayerItem) {
        Task { [weak self] in
            guard let duracao = try? await item.asset.load(.duration) else { return }
            let s = CMTimeGetSeconds(duracao)
            guard s.isFinite, s > 1 else { return }
            let pos = Date().timeIntervalSince1970.truncatingRemainder(dividingBy: s)
            await self?.player.seek(to: CMTime(seconds: pos, preferredTimescale: 600))
        }
    }

    private func fecharExibicao() {
        if let desde, let atual = peca {
            Eventos.shared.registrar("media_play", inicio: desde, fim: Date(), midia: atual.url)
        }
        desde = nil
    }
}

/// A camada de vídeo do iOS, embrulhada para o SwiftUI.
struct CamadaDeVideo: UIViewRepresentable {
    let player: AVPlayer
    let preencher: Bool

    func makeUIView(context: Context) -> Tela {
        let v = Tela()
        v.backgroundColor = .black
        v.camada.player = player
        return v
    }

    func updateUIView(_ v: Tela, context: Context) {
        v.camada.videoGravity = preencher ? .resizeAspectFill : .resizeAspect
    }

    final class Tela: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var camada: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}
