package com.linka.agent

import android.app.UiModeManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration

/**
 * QUE TIPO DE APARELHO É ESTE — celular, tablet ou TV.
 *
 * ── POR QUE EXISTE ─────────────────────────────────────────────────────────
 * O provisionamento gravava `smartphone` fixo no código. Enquanto a frota foi
 * só de celular, isso passou despercebido. Deixou de passar em 20/08, quando
 * chegaram um TV box e um tablet Samsung, e a publicação de versão ganhou alvo
 * por tipo de aparelho: um tablet cadastrado como celular receberia a versão
 * mirada em CELULARES e não receberia a mirada em TABLETS — o oposto exato do
 * que quem publicou pediu, e sem nenhum erro na tela para denunciar.
 *
 * ── DE QUEM É A ÚLTIMA PALAVRA ────────────────────────────────────────────
 * Daqui sai um PALPITE, usado uma vez só: no nascimento do registro. Depois
 * disso quem manda é o painel. É de propósito — a pessoa que cadastra sabe
 * coisas que o aparelho não tem como descobrir (um tablet que faz papel de
 * totem, um celular que ficou de vitrine fixa), e um palpite reescrito a cada
 * batida desfaria essa correção todo minuto.
 *
 * ── COMO DECIDE, e por que nesta ordem ────────────────────────────────────
 * Só API pura do Android (ADR-2: nada de SDK de fabricante).
 *
 * 1. TV vem primeiro porque é a mais bem definida: o Android tem um modo de
 *    interface declarado para televisão, e aparelho sem tela de toque não é de
 *    mão — é caixa ligada num monitor.
 * 2. Tablet sai da MENOR largura da tela em dp, que é o mesmo critério que o
 *    Android usa para escolher layout (`sw600dp`). Não é polegada nem pixel:
 *    é densidade-independente, então não erra em tela de muito ponto por
 *    polegada. O Galaxy Tab A7 Lite dá ~800dp; um celular comum fica entre
 *    360 e 420.
 * 3. Celular é o resto — e é o padrão certo, porque é o que a frota é hoje.
 */
object Perfil {

    const val TV = "tv"
    const val TABLET = "tablet"
    const val CELULAR = "smartphone"

    /**
     * Vocabulário do banco (public.device_type).
     *
     * DOIS CRITÉRIOS PARA TABLET, e não um — cada um cobre o furo do outro.
     *
     * O critério de largura em dp é o do próprio Android (`sw600dp`), mas ele
     * depende da densidade, e densidade é AJUSTÁVEL PELO USUÁRIO: o menu
     * "Tamanho da tela" do Android muda esse número. Medido no Galaxy Tab A7
     * Lite: **601 dp** — passa por UM. Um passo no ajuste de tamanho e o tablet
     * se reclassificaria como celular sozinho, herdando as versões erradas.
     *
     * A diagonal em polegadas sai da densidade FÍSICA do painel, que o usuário
     * não mexe. No mesmo tablet dá ~8", contra ~6,8" do maior celular da frota.
     * Em compensação, `xdpi`/`ydpi` são notoriamente mal preenchidos em alguns
     * aparelhos — por isso ela entra como segunda opinião, e não como única.
     *
     * Passando em qualquer um dos dois, é tablet. Dois sinais frouxos que erram
     * por motivos diferentes valem mais que um sinal frouxo sozinho.
     */
    fun tipo(ctx: Context): String {
        if (ehTv(ctx)) return TV
        val menorLargura = ctx.resources?.configuration?.smallestScreenWidthDp ?: 0
        if (menorLargura >= 600) return TABLET
        return if (polegadas(ctx) >= 7.0) TABLET else CELULAR
    }

    /** Diagonal física da tela. 0.0 quando o aparelho não informa direito. */
    private fun polegadas(ctx: Context): Double {
        val dm = ctx.resources?.displayMetrics ?: return 0.0
        val x = dm.xdpi.toDouble()
        val y = dm.ydpi.toDouble()
        // Densidade absurda é aparelho mentindo: melhor não opinar do que opinar errado.
        if (x < 40 || y < 40 || x > 2000 || y > 2000) return 0.0
        val l = dm.widthPixels / x
        val a = dm.heightPixels / y
        return kotlin.math.sqrt(l * l + a * a)
    }

    /** Atalhos de leitura, para o resto do código não comparar texto solto. */
    fun ehTv(ctx: Context): Boolean {
        val ui = ctx.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        if (ui?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION) return true
        val pm = ctx.packageManager ?: return false
        if (pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK)) return true
        // Sem tela de toque: é caixa ligada num monitor. Vem por último porque é
        // o sinal mais indireto dos três — mas é o único que pega o box genérico
        // (AOSP de media box), que não se declara televisão nem tem leanback.
        return !pm.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN)
    }

    /** Tem tela de toque? Decide se a saída de manutenção por 7 toques existe. */
    fun temToque(ctx: Context): Boolean =
        ctx.packageManager?.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN) ?: true
}
