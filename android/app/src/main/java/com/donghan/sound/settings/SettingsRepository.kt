package com.donghan.sound.settings

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.settingsDataStore: DataStore<Preferences> by preferencesDataStore(name = "sound_settings")

// 순수 매핑 로직(직렬화/기본값/클램프) — DataStore/Context 없이도 단위 테스트 가능하도록 분리.
// 슬라이더 범위는 extension/popup.html의 min/max와 패리티 유지.
object SettingsCodec {
    private val KEY_ENABLED = booleanPreferencesKey("enabled")
    private val KEY_TARGET_DB = floatPreferencesKey("target_db")
    private val KEY_COMP_THRESHOLD = floatPreferencesKey("comp_threshold")
    private val KEY_COMP_RATIO = floatPreferencesKey("comp_ratio")
    private val KEY_COMP_ATTACK = floatPreferencesKey("comp_attack")
    private val KEY_COMP_RELEASE = floatPreferencesKey("comp_release")
    private val KEY_EQ_LOW = floatPreferencesKey("eq_low")
    private val KEY_EQ_MID = floatPreferencesKey("eq_mid")
    private val KEY_EQ_HIGH = floatPreferencesKey("eq_high")

    fun clamp(settings: SoundSettings): SoundSettings = SoundSettings(
        enabled = settings.enabled,
        targetDb = settings.targetDb.coerceIn(-60f, 0f),
        comp = SoundSettings.Comp(
            threshold = settings.comp.threshold.coerceIn(-100f, 0f),
            ratio = settings.comp.ratio.coerceIn(1f, 20f),
            attack = settings.comp.attack.coerceIn(0f, 1f),
            release = settings.comp.release.coerceIn(0f, 1f),
        ),
        eq = SoundSettings.Eq(
            low = settings.eq.low.coerceIn(-24f, 24f),
            mid = settings.eq.mid.coerceIn(-24f, 24f),
            high = settings.eq.high.coerceIn(-24f, 24f),
        ),
    )

    fun write(prefs: MutablePreferences, settings: SoundSettings) {
        val c = clamp(settings)
        prefs.set(KEY_ENABLED, c.enabled)
        prefs.set(KEY_TARGET_DB, c.targetDb)
        prefs.set(KEY_COMP_THRESHOLD, c.comp.threshold)
        prefs.set(KEY_COMP_RATIO, c.comp.ratio)
        prefs.set(KEY_COMP_ATTACK, c.comp.attack)
        prefs.set(KEY_COMP_RELEASE, c.comp.release)
        prefs.set(KEY_EQ_LOW, c.eq.low)
        prefs.set(KEY_EQ_MID, c.eq.mid)
        prefs.set(KEY_EQ_HIGH, c.eq.high)
    }

    fun read(prefs: Preferences): SoundSettings {
        val d = SoundSettings()
        return clamp(
            SoundSettings(
                enabled = prefs.get(KEY_ENABLED) ?: d.enabled,
                targetDb = prefs.get(KEY_TARGET_DB) ?: d.targetDb,
                comp = SoundSettings.Comp(
                    threshold = prefs.get(KEY_COMP_THRESHOLD) ?: d.comp.threshold,
                    ratio = prefs.get(KEY_COMP_RATIO) ?: d.comp.ratio,
                    attack = prefs.get(KEY_COMP_ATTACK) ?: d.comp.attack,
                    release = prefs.get(KEY_COMP_RELEASE) ?: d.comp.release,
                ),
                eq = SoundSettings.Eq(
                    low = prefs.get(KEY_EQ_LOW) ?: d.eq.low,
                    mid = prefs.get(KEY_EQ_MID) ?: d.eq.mid,
                    high = prefs.get(KEY_EQ_HIGH) ?: d.eq.high,
                ),
            )
        )
    }
}

class SettingsRepository(private val context: Context) {
    val settingsFlow: Flow<SoundSettings> =
        context.settingsDataStore.data.map { SettingsCodec.read(it) }

    suspend fun save(settings: SoundSettings) {
        context.settingsDataStore.edit { SettingsCodec.write(it, settings) }
    }
}
