import Foundation

/// A conversa com o servidor, a MESMA do agente Android.
///
/// O app do iPhone não tem servidor próprio: fala com as mesmas funções
/// (`agent-provision`, `agent-heartbeat`, `agent-content`, `agent-events`), com o
/// mesmo cabeçalho e o mesmo formato. É isso que faz o iPhone aparecer no painel
/// como mais um aparelho da frota, e não como um produto à parte.
enum Api {
    static let base = URL(string: "https://xkzktmsqtvpkxmzftars.supabase.co/functions/v1")!

    /// Chave pública do projeto, a mesma embutida no APK. Não é segredo: sozinha
    /// ela só chega às funções, e cada função exige a credencial do aparelho.
    static let anon =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhremt0bXNxdHZwa3htemZ0YXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NTQ3MzksImV4cCI6MjEwMDQzMDczOX0.SdqYO4RAxNr6Z3s-EJVzHJyAdhzXG7t213YHj7P-9D8"

    static var versao: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
    }

    struct Resposta {
        let codigo: Int
        let corpo: [String: Any]
        var ok: Bool { (200..<300).contains(codigo) }
    }

    /// Código 0 quer dizer "não chegou ao servidor": sem rede, ou tempo esgotado.
    static func post(_ caminho: String, _ corpo: [String: Any], token: String? = nil) async -> Resposta {
        var req = URLRequest(url: base.appendingPathComponent(caminho))
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(anon, forHTTPHeaderField: "apikey")
        if let token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = try? JSONSerialization.data(withJSONObject: corpo)
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            let codigo = (resp as? HTTPURLResponse)?.statusCode ?? 0
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
            return Resposta(codigo: codigo, corpo: json)
        } catch {
            return Resposta(codigo: 0, corpo: [:])
        }
    }
}

/// Data no formato que o servidor grava, com milissegundos.
enum Hora {
    private static let fmt: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static func texto(_ d: Date) -> String { fmt.string(from: d) }
}
