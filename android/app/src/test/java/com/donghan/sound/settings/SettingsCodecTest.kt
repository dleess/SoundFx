package com.donghan.sound.settings

import androidx.datastore.preferences.core.mutablePreferencesOf
import org.junit.Assert.assertEquals
import org.junit.Test

// SettingsCodec의 순수 매핑 로직(직렬화/기본값/클램프)만 테스트한다. DataStore 자체는 다루지 않는다.
// datastore-preferences-core는 순수 JVM 아티팩트라 Robolectric 없이 plain JUnit으로 검증 가능.
class SettingsCodecTest {
    @Test
    fun `clamp leaves in-range values untouched`() {
        val settings = SoundSettings(
            enabled = false,
            targetDb = -30f,
            comp = SoundSettings.Comp(threshold = -20f, ratio = 6f, attack = 0.01f, release = 0.5f),
            eq = SoundSettings.Eq(low = 5f, mid = -5f, high = 12f),
        )

        assertEquals(settings, SettingsCodec.clamp(settings))
    }

    @Test
    fun `clamp bounds targetDb and compressor fields to slider ranges`() {
        val settings = SoundSettings(
            targetDb = -999f,
            comp = SoundSettings.Comp(threshold = 999f, ratio = -5f, attack = -1f, release = 99f),
        )

        val clamped = SettingsCodec.clamp(settings)

        assertEquals(-60f, clamped.targetDb)
        assertEquals(0f, clamped.comp.threshold)
        assertEquals(1f, clamped.comp.ratio)
        assertEquals(0f, clamped.comp.attack)
        assertEquals(1f, clamped.comp.release)
    }

    @Test
    fun `clamp bounds eq bands to plus minus 24`() {
        val settings = SoundSettings(eq = SoundSettings.Eq(low = 100f, mid = -100f, high = 24.5f))

        val clamped = SettingsCodec.clamp(settings)

        assertEquals(24f, clamped.eq.low)
        assertEquals(-24f, clamped.eq.mid)
        assertEquals(24f, clamped.eq.high)
    }

    @Test
    fun `write then read round-trips through preferences`() {
        val prefs = mutablePreferencesOf()
        val settings = SoundSettings(
            enabled = false,
            targetDb = -18f,
            comp = SoundSettings.Comp(threshold = -12f, ratio = 3f, attack = 0.02f, release = 0.4f),
            eq = SoundSettings.Eq(low = 3f, mid = -2f, high = 6f),
            balance = -0.4f,
        )

        SettingsCodec.write(prefs, settings)
        val result = SettingsCodec.read(prefs)

        assertEquals(settings, result)
    }

    @Test
    fun `clamp bounds balance to minus one to one`() {
        assertEquals(1f, SettingsCodec.clamp(SoundSettings(balance = 5f)).balance)
        assertEquals(-1f, SettingsCodec.clamp(SoundSettings(balance = -5f)).balance)
    }

    @Test
    fun `read returns defaults when preferences are empty`() {
        val empty = mutablePreferencesOf()

        assertEquals(SoundSettings(), SettingsCodec.read(empty))
    }
}
