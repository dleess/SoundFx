package com.donghan.sound.audio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.audiofx.AudioEffect
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.content.ContextCompat
import com.donghan.sound.R
import com.donghan.sound.settings.SettingsRepository
import com.donghan.sound.settings.SoundSettings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * 상주 포그라운드 서비스. 다른 앱의 오디오 세션 브로드캐스트를 받아 이펙트를 붙인다.
 *
 * 서비스 타입은 mediaPlayback이 아니라 specialUse — 이 앱은 재생하지 않고 남의 세션에 이펙트만 붙인다.
 * M3(UI)는 companion object의 start/stop/updateSettings만 쓰면 된다.
 */
class SoundService : Service() {

    private val registry = SessionRegistry()
    private val engine = EffectEngine()
    private var settings = SoundSettings()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var restoreJob: Job? = null // 인텐트 설정이 먼저 도착하면 취소 — 늦은 DataStore 복원이 덮어쓰지 않게

    private val sessionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val action = intent?.action ?: return
            val session = intent.getIntExtra(AudioEffect.EXTRA_AUDIO_SESSION, -1)
            val pkg = intent.getStringExtra(AudioEffect.EXTRA_PACKAGE_NAME) ?: "?"
            val changed = when (action) {
                AudioEffect.ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION -> registry.open(session)
                AudioEffect.ACTION_CLOSE_AUDIO_EFFECT_CONTROL_SESSION -> registry.close(session)
                else -> false
            }
            Log.i(TAG, "broadcast $action session=$session pkg=$pkg changed=$changed active=${registry.active()}")
            if (changed) syncEffects()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startForegroundNotification()
        val filter = IntentFilter().apply {
            addAction(AudioEffect.ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION)
            addAction(AudioEffect.ACTION_CLOSE_AUDIO_EFFECT_CONTROL_SESSION)
        }
        ContextCompat.registerReceiver(this, sessionReceiver, filter, ContextCompat.RECEIVER_EXPORTED)
        Log.i(TAG, "service started, receiver registered")
        // START_STICKY 재시작은 intent가 null이라 설정이 안 온다 — 기본값(enabled=true)으로
        // 이펙트를 붙이면 사용자가 꺼둔 처리가 몰래 되살아난다. DataStore에서 복원 후 sync.
        restoreJob = scope.launch {
            settings = SettingsRepository(applicationContext).settingsFlow.first()
            syncEffects()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_UPDATE_SETTINGS) {
            restoreJob?.cancel()
            settings = settingsFrom(intent, settings)
            Log.i(TAG, "settings updated: $settings")
            syncEffects()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        runCatching { unregisterReceiver(sessionReceiver) }
        engine.release()
        Log.i(TAG, "service stopped")
        super.onDestroy()
    }

    /** 현재 대상 세션(없으면 session 0 폴백)에 이펙트를 맞추고 활성 목록을 알린다. */
    private fun syncEffects() {
        val targets = registry.targets()
        engine.sync(targets, EffectParams.from(settings))
        val attached = engine.attachedSessions()
        Log.i(TAG, "sync targets=$targets attached=$attached")
        sendBroadcast(
            Intent(ACTION_SESSIONS_CHANGED)
                .setPackage(packageName)
                .putExtra(EXTRA_SESSIONS, registry.active().toIntArray())
                .putExtra(EXTRA_ATTACHED, attached.toIntArray())
        )
    }

    private fun startForegroundNotification() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, getString(R.string.notification_channel_name), NotificationManager.IMPORTANCE_LOW)
        )
        val notification: Notification = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notification_content_title))
            .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    companion object {
        // --- M3(UI)용 공개 API ---
        const val ACTION_UPDATE_SETTINGS = "com.donghan.sound.action.UPDATE_SETTINGS"
        /** 서비스가 활성/attach된 세션 목록을 알리는 브로드캐스트. */
        const val ACTION_SESSIONS_CHANGED = "com.donghan.sound.action.SESSIONS_CHANGED"
        const val EXTRA_SESSIONS = "sessions"
        const val EXTRA_ATTACHED = "attached"

        private const val CHANNEL_ID = "sound_fx"
        private const val NOTIFICATION_ID = 1

        // SoundSettings는 읽기 전용 계약이라 Serializable/Parcelable을 붙이지 않는다. 필드를 개별 extra로 전달.
        private const val EXTRA_ENABLED = "enabled"
        private const val EXTRA_TARGET_DB = "targetDb"
        private const val EXTRA_THRESHOLD = "comp.threshold"
        private const val EXTRA_RATIO = "comp.ratio"
        private const val EXTRA_ATTACK = "comp.attack"
        private const val EXTRA_RELEASE = "comp.release"
        private const val EXTRA_EQ_LOW = "eq.low"
        private const val EXTRA_EQ_MID = "eq.mid"
        private const val EXTRA_EQ_HIGH = "eq.high"
        private const val EXTRA_BALANCE = "balance"

        fun start(context: Context) {
            ContextCompat.startForegroundService(context, Intent(context, SoundService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, SoundService::class.java))
        }

        /** 설정 변경 즉시 반영. 서비스가 안 떠 있으면 이 호출로 뜬다. */
        fun updateSettings(context: Context, settings: SoundSettings) {
            val intent = Intent(context, SoundService::class.java)
                .setAction(ACTION_UPDATE_SETTINGS)
                .putExtra(EXTRA_ENABLED, settings.enabled)
                .putExtra(EXTRA_TARGET_DB, settings.targetDb)
                .putExtra(EXTRA_THRESHOLD, settings.comp.threshold)
                .putExtra(EXTRA_RATIO, settings.comp.ratio)
                .putExtra(EXTRA_ATTACK, settings.comp.attack)
                .putExtra(EXTRA_RELEASE, settings.comp.release)
                .putExtra(EXTRA_EQ_LOW, settings.eq.low)
                .putExtra(EXTRA_EQ_MID, settings.eq.mid)
                .putExtra(EXTRA_EQ_HIGH, settings.eq.high)
                .putExtra(EXTRA_BALANCE, settings.balance)
            ContextCompat.startForegroundService(context, intent)
        }

        private fun settingsFrom(intent: Intent, current: SoundSettings) = SoundSettings(
            enabled = intent.getBooleanExtra(EXTRA_ENABLED, current.enabled),
            targetDb = intent.getFloatExtra(EXTRA_TARGET_DB, current.targetDb),
            comp = SoundSettings.Comp(
                threshold = intent.getFloatExtra(EXTRA_THRESHOLD, current.comp.threshold),
                ratio = intent.getFloatExtra(EXTRA_RATIO, current.comp.ratio),
                attack = intent.getFloatExtra(EXTRA_ATTACK, current.comp.attack),
                release = intent.getFloatExtra(EXTRA_RELEASE, current.comp.release),
            ),
            eq = SoundSettings.Eq(
                low = intent.getFloatExtra(EXTRA_EQ_LOW, current.eq.low),
                mid = intent.getFloatExtra(EXTRA_EQ_MID, current.eq.mid),
                high = intent.getFloatExtra(EXTRA_EQ_HIGH, current.eq.high),
            ),
            balance = intent.getFloatExtra(EXTRA_BALANCE, current.balance),
        )
    }
}
