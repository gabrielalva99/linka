import SwiftUI

/// O primeiro passo: dizer ao aparelho de qual cliente e de qual loja ele é.
///
/// O código é o mesmo que o painel mostra na tela de instalação da loja
/// ("CLIENTE-LOJA"). No Android ele vem dentro do QR; aqui é digitado, até o
/// MDM (degrau 2) poder entregá-lo pronto.
struct Pareamento: View {
    @EnvironmentObject var central: Central
    @State private var codigo = ""
    @State private var enviando = false
    @State private var erro: String?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 0) {
                    Text("LIN").foregroundColor(.white)
                    Text("KA").foregroundColor(Color(red: 0, green: 0.95, blue: 0.31))
                }
                .font(.system(size: 34, weight: .heavy))

                Text("Instalar este aparelho")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(.white)
                Text("Digite o código da loja que aparece no painel, na tela de instalação.")
                    .font(.system(size: 15))
                    .foregroundColor(.white.opacity(0.6))

                TextField("", text: $codigo, prompt: Text("Ex.: LKYYKHQ6-SPC7613").foregroundColor(.white.opacity(0.3)))
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .font(.system(size: 20, weight: .medium, design: .monospaced))
                    .foregroundColor(.white)
                    .padding(14)
                    .background(Color.white.opacity(0.08))
                    .cornerRadius(10)

                if let erro {
                    Text(erro)
                        .font(.system(size: 14))
                        .foregroundColor(Color(red: 1, green: 0.45, blue: 0.4))
                }

                Button(action: enviar) {
                    Text(enviando ? "Instalando…" : "Instalar")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color(red: 0, green: 0.95, blue: 0.31))
                        .cornerRadius(10)
                }
                .disabled(enviando || codigo.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(28)
        }
    }

    private func enviar() {
        enviando = true
        erro = nil
        Task {
            let resultado = await central.parear(codigo: codigo)
            enviando = false
            switch resultado {
            case nil: break
            case .codigoNaoEncontrado?: erro = "Código não encontrado. Confira no painel, na tela de instalação da loja."
            case .lojaNaoEncontrada?: erro = "A loja deste código não existe mais. Gere o código de novo no painel."
            case .tentativasDemais?: erro = "Tentativas demais. Espere 15 minutos e tente de novo."
            case .semRede?: erro = "Sem conexão com a internet. Conecte o aparelho ao Wi-Fi e tente de novo."
            case .outro?: erro = "Não deu certo agora. Tente de novo em instantes."
            }
        }
    }
}
