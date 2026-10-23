import Network
import UIKit

/// O que o iPhone conta sobre si mesmo.
///
/// É bem menos que o Android, e isso é da Apple, não nosso: sinal do Wi-Fi,
/// temperatura e o que o cliente abriu fora da vitrine não são entregues a app
/// nenhum. O que existe vai na batida com os mesmos nomes de campo do Android.
final class Aparelho {
    static let shared = Aparelho()

    private let monitor = NWPathMonitor()
    private let fila = DispatchQueue(label: "com.linka.agent.rede")
    private var _conexao = "none"
    private let trava = NSLock()

    private init() {
        UIDevice.current.isBatteryMonitoringEnabled = true
        monitor.pathUpdateHandler = { [weak self] caminho in
            let c: String
            if caminho.status != .satisfied {
                c = "none"
            } else if caminho.usesInterfaceType(.wifi) {
                c = "wifi"
            } else if caminho.usesInterfaceType(.cellular) {
                c = "cellular"
            } else if caminho.usesInterfaceType(.wiredEthernet) {
                c = "ethernet"
            } else {
                c = "none"
            }
            self?.trava.lock()
            self?._conexao = c
            self?.trava.unlock()
        }
        monitor.start(queue: fila)
    }

    /// wifi | cellular | ethernet | none, os mesmos valores que o servidor aceita.
    var conexao: String {
        trava.lock()
        defer { trava.unlock() }
        return _conexao
    }

    /// Identificador de hardware ("iPhone14,5"). O nome comercial não é exposto pelo
    /// iOS; o painel deixa o operador nomear o modelo, como faz com qualquer outro.
    var modelo: String {
        var info = utsname()
        uname(&info)
        let maquina = withUnsafePointer(to: &info.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) }
        }
        return "Apple \(maquina)"
    }

    var tipo: String {
        UIDevice.current.userInterfaceIdiom == .pad ? "tablet" : "smartphone"
    }

    var sistema: String { UIDevice.current.systemVersion }

    /// IDENTIDADE DO APARELHO, e ela é mais fraca que a do Android.
    ///
    /// No Android, o LINKA dono do aparelho lê uma identidade que sobrevive à
    /// restauração de fábrica. No iPhone, sem MDM, o melhor que existe é o
    /// identificador por fabricante de app: muda se todos os apps da LINKA forem
    /// apagados, e muda na restauração. Vai sem "fonte" de propósito, para o
    /// servidor nunca tratá-la como tão forte quanto a do Android. Com MDM (degrau
    /// 2), o número de série entra no lugar.
    var identidade: String {
        UIDevice.current.identifierForVendor?.uuidString ?? ""
    }

    var bateria: Int? {
        let nivel = UIDevice.current.batteryLevel
        return nivel < 0 ? nil : Int((nivel * 100).rounded())
    }

    var carregando: Bool {
        let estado = UIDevice.current.batteryState
        return estado == .charging || estado == .full
    }

    /// A tela física, em pixels, como no Android: é ela que escolhe o criativo
    /// feito para este formato.
    var tela: (largura: Int, altura: Int) {
        let b = UIScreen.main.nativeBounds
        return (Int(min(b.width, b.height)), Int(max(b.width, b.height)))
    }

    var ligadoHaSegundos: Int { Int(ProcessInfo.processInfo.systemUptime) }
}
