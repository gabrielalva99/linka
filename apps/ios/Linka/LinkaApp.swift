import SwiftUI

@main
struct LinkaApp: App {
    @StateObject private var central = Central()
    @Environment(\.scenePhase) private var fase
    @State private var vitrineDesde: Date?

    var body: some Scene {
        WindowGroup {
            Group {
                if central.pareado {
                    Vitrine()
                } else {
                    Pareamento()
                }
            }
            .environmentObject(central)
            .statusBarHidden(true)
            .persistentSystemOverlays(.hidden)
            .preferredColorScheme(.dark)
            .onAppear {
                // Vitrine não apaga a tela sozinha.
                UIApplication.shared.isIdleTimerDisabled = true
                central.iniciar()
            }
        }
        .onChange(of: fase) { nova in
            // TEMPO DE VITRINE NA TELA, o `showcase` do Android: do momento em que
            // o app aparece até ele sair. Sem MDM o iOS não diz o que o cliente
            // abriu depois; diz só que a vitrine saiu da frente.
            switch nova {
            case .active:
                vitrineDesde = Date()
                central.iniciar()
            case .background, .inactive:
                if let desde = vitrineDesde, central.pareado {
                    Eventos.shared.registrar("showcase", inicio: desde, fim: Date())
                }
                vitrineDesde = nil
            @unknown default:
                break
            }
        }
    }
}
