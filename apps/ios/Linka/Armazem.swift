import Foundation
import Security

/// O que o app guarda entre uma abertura e outra.
///
/// A credencial do aparelho mora no Chaveiro, e não nas preferências: é ela que
/// abre o servidor em nome deste aparelho, e o Chaveiro é o lugar do iOS feito
/// para isso. O resto é estado simples.
enum Armazem {
    private static let d = UserDefaults.standard

    static var token: String? {
        get { Chaveiro.ler("device_token") }
        set {
            if let v = newValue { Chaveiro.gravar("device_token", v) } else { Chaveiro.apagar("device_token") }
        }
    }

    /// Recusas seguidas do servidor (401). Com cinco, o app esquece a credencial e
    /// volta para o pareamento, igual ao Android: um 401 isolado durante uma
    /// publicação não pode custar a credencial de um aparelho que estava bem.
    static var recusas: Int {
        get { d.integer(forKey: "recusas") }
        set { d.set(newValue, forKey: "recusas") }
    }

    static var conteudo: Data? {
        get { d.data(forKey: "conteudo") }
        set { d.set(newValue, forKey: "conteudo") }
    }

    static var loja: String? {
        get { d.string(forKey: "loja") }
        set { d.set(newValue, forKey: "loja") }
    }

    static var fila: Data? {
        get { d.data(forKey: "fila_de_eventos") }
        set { d.set(newValue, forKey: "fila_de_eventos") }
    }

    static func esquecer() {
        token = nil
        recusas = 0
        conteudo = nil
        loja = nil
    }
}

enum Chaveiro {
    private static let servico = "com.linka.agent"

    private static func consulta(_ chave: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: servico,
            kSecAttrAccount as String: chave,
        ]
    }

    static func gravar(_ chave: String, _ valor: String) {
        apagar(chave)
        var q = consulta(chave)
        q[kSecValueData as String] = Data(valor.utf8)
        // Disponível depois do primeiro desbloqueio: aparelho de vitrine reinicia
        // sozinho e precisa voltar a falar com o servidor sem ninguém digitar nada.
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    static func ler(_ chave: String) -> String? {
        var q = consulta(chave)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var saida: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &saida) == errSecSuccess,
              let data = saida as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func apagar(_ chave: String) {
        SecItemDelete(consulta(chave) as CFDictionary)
    }
}
