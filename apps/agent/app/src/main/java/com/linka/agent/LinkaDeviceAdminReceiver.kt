package com.linka.agent

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

/**
 * O componente que recebe o cargo de "dono do aparelho".
 * Sem ele declarado no manifesto, `set-device-owner` não tem em quem investir.
 */
class LinkaDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        // Assumiu o cargo: aplica as travas na hora e reporta ao painel.
        Kiosk.applyPolicies(context)
        Telemetry.beatAsync(context)
    }

    override fun onDisabled(context: Context, intent: Intent) {
        Telemetry.beatAsync(context)
    }
}
