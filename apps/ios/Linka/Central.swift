import CryptoKit
import Foundation

/// Uma peça da campanha: o vídeo e o enquadramento.
struct Peca: Codable, Equatable, Hashable {
    let url: String
    /// "zoom" preenche a tela cortando as bordas; "fit" mostra inteiro.
    let fit: String
}

/// O que o servidor mandou exibir.
struct Conteudo: Codable, Equatable {
    var playlist: [Peca]
    /// Segundos de cada vez no rodízio. Zero ou uma peça só: não gira.
    var rotacao: Int
    /// Ritmo do sinal de vida, definido no painel.
    var batida: Int
    var revisao: String?
}

/// O estado do aparelho e tudo que fala com o servidor.
@MainActor
final class Central: ObservableObject {
    @Published private(set) var pareado = Armazem.token != nil
    @Published private(set) var conteudo: Conteudo?
    /// Peças que já estão inteiras no aparelho. Só elas vão para a tela.
    @Published private(set) var prontas: Set<String> = []
    @Published private(set) var loja: String? = Armazem.loja

    /// O que está na tela agora, informado pela vitrine; vai na batida.
    var noAr: Peca?

    private var baixando: Set<String> = []
    private var relogio: Task<Void, Never>?

    init() {
        if let data = Armazem.conteudo, let c = try? JSONDecoder().decode(Conteudo.self, from: data) {
            conteudo = c
        }
        conferirArquivos()
    }

    // MARK: - Pareamento

    enum ErroDePareamento: Error {
        case codigoNaoEncontrado, lojaNaoEncontrada, tentativasDemais, semRede, outro
    }

    func parear(codigo: String) async -> ErroDePareamento? {
        let limpo = codigo.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let ap = Aparelho.shared
        let r = await Api.post("agent-provision", [
            "provisioning_code": limpo,
            "platform": "ios",
            "device_type": ap.tipo,
            "hardware_model": ap.modelo,
            "os_version": ap.sistema,
            "agent_version": Api.versao,
            "stable_id": ap.identidade,
        ])
        if r.codigo == 0 { return .semRede }
        guard r.ok, let token = r.corpo["device_token"] as? String else {
            switch r.corpo["error"] as? String {
            case "code_not_found": return .codigoNaoEncontrado
            case "store_not_found": return .lojaNaoEncontrada
            case "muitas_tentativas": return .tentativasDemais
            default: return .outro
            }
        }
        Armazem.token = token
        Armazem.recusas = 0
        Armazem.loja = r.corpo["store_name"] as? String
        loja = Armazem.loja
        pareado = true
        await buscarConteudo()
        iniciar()
        return nil
    }

    private func esquecer() {
        Armazem.esquecer()
        relogio?.cancel()
        pareado = false
        conteudo = nil
        loja = nil
    }

    // MARK: - Conteúdo

    func buscarConteudo() async {
        guard let token = Armazem.token else { return }
        let r = await Api.post("agent-content", [:], token: token)
        if r.codigo == 401 { recusado(); return }
        guard r.ok else { return }
        let lista = (r.corpo["playlist"] as? [[String: Any]] ?? []).compactMap { p -> Peca? in
            guard let u = p["url"] as? String, !u.isEmpty else { return nil }
            return Peca(url: u, fit: (p["fit"] as? String) == "fit" ? "fit" : "zoom")
        }
        let novo = Conteudo(
            playlist: lista,
            rotacao: r.corpo["rotation_seconds"] as? Int ?? 0,
            batida: max(60, r.corpo["heartbeat_seconds"] as? Int ?? 300),
            revisao: r.corpo["revisao"] as? String
        )
        if novo != conteudo {
            conteudo = novo
            Armazem.conteudo = try? JSONEncoder().encode(novo)
        }
        baixarTudo()
    }

    // MARK: - Arquivos

    /// Baixar a campanha inteira antes de exibir. Vídeo da nuvem em laço custa a
    /// conta e a rede da loja; do disco não custa nada (lição medida no Android).
    private func baixarTudo() {
        guard let lista = conteudo?.playlist else { return }
        for peca in lista where !prontas.contains(peca.url) && !baixando.contains(peca.url) {
            baixando.insert(peca.url)
            Task { await baixar(peca.url) }
        }
    }

    private func baixar(_ endereco: String) async {
        defer { baixando.remove(endereco) }
        guard let url = URL(string: endereco) else { return }
        do {
            let (temp, resp) = try await URLSession.shared.download(from: url)
            guard ((resp as? HTTPURLResponse)?.statusCode ?? 0) == 200 else { return }
            let destino = Self.arquivo(de: endereco)
            try? FileManager.default.removeItem(at: destino)
            try FileManager.default.moveItem(at: temp, to: destino)
            prontas.insert(endereco)
        } catch {
            // Tenta de novo na próxima busca de conteúdo.
        }
    }

    private func conferirArquivos() {
        guard let lista = conteudo?.playlist else { return }
        prontas = Set(lista.map(\.url).filter {
            FileManager.default.fileExists(atPath: Self.arquivo(de: $0).path)
        })
    }

    static func arquivo(de endereco: String) -> URL {
        let pasta = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("videos", isDirectory: true)
        try? FileManager.default.createDirectory(at: pasta, withIntermediateDirectories: true)
        let nome = SHA256.hash(data: Data(endereco.utf8)).map { String(format: "%02x", $0) }.joined()
        return pasta.appendingPathComponent(nome).appendingPathExtension("mp4")
    }

    // MARK: - Sinal de vida

    /// O relógio do aparelho: bate, sobe os eventos e busca conteúdo quando o
    /// servidor avisa que mudou. Uma passada logo ao abrir, depois no ritmo do painel.
    func iniciar() {
        guard pareado else { return }
        relogio?.cancel()
        relogio = Task { [weak self] in
            while !Task.isCancelled {
                await self?.bater()
                await Eventos.shared.enviar()
                let espera = UInt64(self?.conteudo?.batida ?? 300)
                try? await Task.sleep(nanoseconds: espera * 1_000_000_000)
            }
        }
    }

    func bater() async {
        guard let token = Armazem.token else { return }
        let ap = Aparelho.shared
        let tela = ap.tela
        var corpo: [String: Any] = [
            "status": "online",
            "mode": noAr == nil ? "main_menu" : "show",
            "os_version": ap.sistema,
            "agent_version": Api.versao,
            "hardware_model": ap.modelo,
            "battery_charging": ap.carregando,
            "connection": ap.conexao,
            "uptime_seconds": ap.ligadoHaSegundos,
            "screen_on": true,
            "screen_width": tela.largura,
            "screen_height": tela.altura,
            "synced": conteudo.map { c in c.playlist.allSatisfy { prontas.contains($0.url) } } ?? false,
            // Sem MDM o app não é dono do aparelho, e diz isso: o painel não pode
            // mostrar como protegido o que não está.
            "is_device_owner": false,
            "playing_url": noAr?.url ?? NSNull(),
            "playing_fit": noAr?.fit ?? NSNull(),
            "stable_id": ap.identidade,
        ]
        if let b = ap.bateria { corpo["battery_level"] = b }
        if let rev = conteudo?.revisao { corpo["revisao"] = rev }

        let r = await Api.post("agent-heartbeat", corpo, token: token)
        if r.codigo == 401 { recusado(); return }
        guard r.ok else { return }
        Armazem.recusas = 0
        if (r.corpo["conteudo_mudou"] as? Bool) == true || conteudo == nil {
            await buscarConteudo()
        }
    }

    private func recusado() {
        Armazem.recusas += 1
        if Armazem.recusas >= 5 { esquecer() }
    }
}
