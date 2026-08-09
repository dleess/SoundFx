package com.donghan.sound.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SoundSettingsTest {
    @Test
    fun `defaults match extension contract`() {
        val settings = SoundSettings()

        assertTrue(settings.enabled)
        assertEquals(-24f, settings.targetDb)
        assertEquals(-24f, settings.comp.threshold)
        assertEquals(4f, settings.comp.ratio)
        assertEquals(0.003f, settings.comp.attack)
        assertEquals(0.25f, settings.comp.release)
        assertEquals(0f, settings.eq.low)
        assertEquals(0f, settings.eq.mid)
        assertEquals(0f, settings.eq.high)
    }
}
