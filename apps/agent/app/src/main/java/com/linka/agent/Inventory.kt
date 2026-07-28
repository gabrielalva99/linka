package com.linka.agent

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import org.json.JSONArray
import org.json.JSONObject

/**
 * O que está instalado no aparelho, do ponto de vista de quem pega ele na loja.
 *
 * Existe porque a faxina dependia de uma lista de nove pacotes escrita à mão
 * dentro do app. Um jogo instalado pelo vendedor ficava invisível, e num modelo
 * novo a câmera podia ter outro nome de pacote e passar batido: a faxina
 * "funcionava" sem limpar nada.
 *
 * O critério é o que o CLIENTE consegue abrir, não o que existe no sistema. Um
 * Android tem perto de 200 pacotes e quase todos são serviço interno, que só
 * geraria ruído no painel.
 */
object Inventory {

    /** Nunca listamos nem limpamos o próprio LINKA. */
    private const val NOSSO_PACOTE = "com.linka.agent"

    data class App(
        val pacote: String,
        val nome: String,
        val sistema: Boolean,
        val versao: String,
    )

    /**
     * Apps com ícone na gaveta. É a definição honesta de "o que dá para abrir":
     * pergunta ao Android quem responde ao gesto de abrir um app, em vez de
     * tentar adivinhar por lista de pacotes conhecidos.
     */
    fun apps(ctx: Context): List<App> {
        val pm = ctx.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val resolvidos = try {
            pm.queryIntentActivities(intent, 0)
        } catch (_: Exception) {
            return emptyList()
        }
        val vistos = HashSet<String>()
        val saida = mutableListOf<App>()
        for (r in resolvidos) {
            val pacote = r.activityInfo?.packageName ?: continue
            if (pacote == NOSSO_PACOTE || !vistos.add(pacote)) continue
            val info = try {
                pm.getApplicationInfo(pacote, 0)
            } catch (_: Exception) {
                continue
            }
            val versao = try {
                pm.getPackageInfo(pacote, 0).versionName ?: ""
            } catch (_: Exception) {
                ""
            }
            // FLAG_UPDATED_SYSTEM_APP conta como sistema: é app de fábrica que
            // recebeu atualização, não algo que alguém instalou na loja.
            val deSistema =
                (info.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0 ||
                    (info.flags and android.content.pm.ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
            saida.add(
                App(
                    pacote = pacote,
                    nome = try {
                        pm.getApplicationLabel(info).toString()
                    } catch (_: Exception) {
                        pacote
                    },
                    sistema = deSistema,
                    versao = versao,
                ),
            )
        }
        return saida.sortedBy { it.nome.lowercase() }
    }

    fun json(ctx: Context): JSONArray {
        val arr = JSONArray()
        for (a in apps(ctx)) {
            arr.put(
                JSONObject()
                    .put("package", a.pacote)
                    .put("label", a.nome)
                    .put("system", a.sistema)
                    .put("version", a.versao),
            )
        }
        return arr
    }

    /**
     * Pacotes que a faxina deve limpar: o que o cliente consegue abrir.
     *
     * Substitui a lista escrita à mão. Limpar o que o aparelho REPORTA ter é o
     * que faz a faxina continuar valendo num modelo que ninguém testou ainda.
     */
    fun paraLimpar(ctx: Context): List<String> = apps(ctx).map { it.pacote }

    /** Remove um app instalado na loja. Só o dono do aparelho consegue. */
    fun desinstalar(ctx: Context, pacote: String): String {
        if (pacote == NOSSO_PACOTE) return "recusado: é o próprio LINKA"
        return try {
            val pm = ctx.packageManager
            // Pacote inexistente não é falha: ou já foi removido antes, ou o
            // comando chegou duas vezes. Dizer "falhou" sobre uma remoção que
            // deu certo é pior do que não dizer nada.
            val info = try {
                pm.getApplicationInfo(pacote, 0)
            } catch (_: PackageManager.NameNotFoundException) {
                return "já não estava instalado"
            }
            val deFabrica =
                (info.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0
            if (deFabrica) {
                // App de fábrica não se desinstala; some da gaveta e continua no ferro.
                Kiosk.esconder(ctx, pacote, true)
                "escondido (app de fábrica, não dá para desinstalar)"
            } else {
                val installer = pm.packageInstaller
                // O intent precisa apontar para o NOSSO app explicitamente.
                // A partir do Android 14 um intent implícito dentro de um
                // PendingIntent mutável é recusado por segurança, e o
                // desinstalar falhava com uma mensagem de meia página.
                // Mutável ele continua sendo: é o sistema que preenche o
                // resultado da desinstalação nele.
                val aviso = Intent("com.linka.agent.UNINSTALL")
                    .setPackage(ctx.packageName)
                installer.uninstall(
                    pacote,
                    android.app.PendingIntent.getBroadcast(
                        ctx,
                        pacote.hashCode(),
                        aviso,
                        android.app.PendingIntent.FLAG_UPDATE_CURRENT or
                            android.app.PendingIntent.FLAG_MUTABLE,
                    ).intentSender,
                )
                "desinstalação solicitada"
            }
        } catch (e: Exception) {
            "falhou: ${e.message}"
        }
    }
}
