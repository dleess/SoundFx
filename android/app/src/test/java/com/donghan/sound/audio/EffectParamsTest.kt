package com.donghan.sound.audio

import com.donghan.sound.settings.SoundSettings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EffectParamsTest {

    @Test
    fun `기본 설정은 3밴드 구성과 중립 게인을 만든다`() {
        val p = EffectParams.from(SoundSettings())

        assertEquals(BAND_COUNT, p.eqBands.size)
        assertEquals(BAND_COUNT, p.mbcBands.size)
        assertEquals(BAND_CUTOFFS_HZ, p.eqBands.map { it.cutoffHz })
        assertEquals(BAND_CUTOFFS_HZ, p.mbcBands.map { it.cutoffHz })
        assertEquals(listOf(0f, 0f, 0f), p.eqBands.map { it.gainDb })
        // targetDb(-24) - 가정 프로그램 레벨(-20) = -4 dB
        assertEquals(-4f, p.inputGainDb, 1e-4f)
        // threshold == targetDb 이면 메이크업 불필요
        assertEquals(0f, p.mbcBands[0].postGainDb, 1e-4f)
        assertTrue(p.enabled)
    }

    @Test
    fun `attack release는 초에서 밀리초로 변환된다`() {
        val p = EffectParams.from(SoundSettings(comp = SoundSettings.Comp(attack = 0.003f, release = 0.25f)))

        assertEquals(3f, p.mbcBands[0].attackMs, 1e-4f)
        assertEquals(250f, p.mbcBands[0].releaseMs, 1e-4f)
        p.mbcBands.forEach { assertEquals(3f, it.attackMs, 1e-4f) }
    }

    @Test
    fun `EQ 3밴드 게인이 저 중 고 순서로 매핑된다`() {
        val p = EffectParams.from(SoundSettings(eq = SoundSettings.Eq(low = 6f, mid = -3f, high = 2f)))

        assertEquals(listOf(6f, -3f, 2f), p.eqBands.map { it.gainDb })
        assertEquals(300f, p.eqBands[0].cutoffHz, 0f)
        assertEquals(3000f, p.eqBands[1].cutoffHz, 0f)
        assertEquals(20000f, p.eqBands[2].cutoffHz, 0f)
    }

    @Test
    fun `범위 밖 설정은 확장과 같은 범위로 클램프된다`() {
        val p = EffectParams.from(
            SoundSettings(
                targetDb = 50f,
                comp = SoundSettings.Comp(threshold = -500f, ratio = 99f, attack = -1f, release = 9f),
                eq = SoundSettings.Eq(low = 100f, mid = -100f, high = 0f),
            )
        )

        assertEquals(-100f, p.mbcBands[0].thresholdDb, 1e-4f)
        assertEquals(20f, p.mbcBands[0].ratio, 1e-4f)
        assertEquals(0f, p.mbcBands[0].attackMs, 1e-4f)
        assertEquals(1000f, p.mbcBands[0].releaseMs, 1e-4f)
        assertEquals(listOf(24f, -24f, 0f), p.eqBands.map { it.gainDb })
    }

    @Test
    fun `입력 게인은 정규화 한계인 ±12dB로 클램프된다`() {
        assertEquals(12f, EffectParams.inputGainDb(0f), 1e-4f)
        assertEquals(-12f, EffectParams.inputGainDb(-60f), 1e-4f)
        assertEquals(0f, EffectParams.inputGainDb(-20f), 1e-4f)
    }

    @Test
    fun `압축이 셀수록 메이크업 게인이 커지고 12dB에서 멈춘다`() {
        val mild = EffectParams.makeupDb(targetDb = -24f, thresholdDb = -30f, ratio = 4f)
        val strong = EffectParams.makeupDb(targetDb = -24f, thresholdDb = -40f, ratio = 4f)

        assertEquals(4.5f, mild, 1e-4f)
        assertTrue(strong > mild)
        assertEquals(12f, EffectParams.makeupDb(-24f, -100f, 20f), 1e-4f)
        // threshold가 타깃보다 높으면 압축이 걸리지 않으므로 메이크업 없음
        assertEquals(0f, EffectParams.makeupDb(-24f, -6f, 4f), 1e-4f)
    }

    @Test
    fun `enabled false도 파라미터는 그대로 계산된다`() {
        val p = EffectParams.from(SoundSettings(enabled = false, eq = SoundSettings.Eq(low = 6f)))

        assertTrue(!p.enabled)
        assertEquals(6f, p.eqBands[0].gainDb, 1e-4f)
    }

    @Test
    fun `리미터는 항상 0dBFS 아래에서 잡는다`() {
        val p = EffectParams.from(SoundSettings())

        assertTrue(p.limiter.thresholdDb < 0f)
        assertTrue(p.limiter.ratio > 1f)
        assertTrue(p.limiter.attackMs < p.limiter.releaseMs)
    }
}
