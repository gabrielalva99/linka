import Foundation

/// A fila de eventos: o que foi exibido, e por quanto tempo.
///
/// Guardada no aparelho antes de subir, como no Android: loja sem rede não pode
/// virar buraco no relatório. O servidor descarta repetidos pelo `event_id`, então
/// reenviar depois de uma queda é seguro.
@MainActor
final class Eventos {
    static let shared = Eventos()

    private var fila: [[String: Any]] = []
    private let teto = 2000

    private init() {
        if let data = Armazem.fila,
           let lista = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] {
            fila = lista
        }
    }

    /// `kind` usa os nomes do servidor: `media_play` (um vídeo no ar) e `showcase`
    /// (a vitrine na tela).
    func registrar(_ kind: String, inicio: Date, fim: Date, midia: String? = nil) {
        let duracao = fim.timeIntervalSince(inicio)
        guard duracao >= 1 else { return }
        var e: [String: Any] = [
            "event_id": UUID().uuidString,
            "kind": kind,
            "started_at": Hora.texto(inicio),
            "ended_at": Hora.texto(fim),
            "duration_seconds": Int(duracao.rounded()),
        ]
        if let midia { e["media_url"] = midia }
        fila.append(e)
        // Sem rede por muito tempo: perde o mais antigo, nunca trava o aparelho.
        if fila.count > teto { fila.removeFirst(fila.count - teto) }
        salvar()
    }

    func enviar() async {
        guard let token = Armazem.token, !fila.isEmpty else { return }
        let lote = Array(fila.prefix(500))
        let r = await Api.post("agent-events", ["events": lote], token: token)
        guard r.ok else { return }
        let enviados = Set(lote.compactMap { $0["event_id"] as? String })
        fila.removeAll { enviados.contains(($0["event_id"] as? String) ?? "") }
        salvar()
    }

    private func salvar() {
        Armazem.fila = try? JSONSerialization.data(withJSONObject: fila)
    }
}
