package com.donghan.sound.audio

import com.donghan.sound.settings.SoundSettings

// SoundSettings → DynamicsProcessing 파라미터 매핑. Android API 의존 없음(순수 Kotlin) → JVM 단위 테스트 대상.
// 체인 순서는 확장(extension/content.js)과 동일: EQ → 컴프레서 → 메이크업 게인 → 리미터.
//   preEq(3밴드, 사용자 EQ) → MBC(3밴드 컴프) → 밴드별 postGain(메이크업) → 리미터
// postEq는 사용하지 않는다(inUse=false) — 확장 체인에 대응물이 없다.

/** 3밴드 크로스오버의 각 밴드 상단 컷오프(Hz). 밴드 0=저역, 1=중역, 2=고역. */
val BAND_CUTOFFS_HZ = listOf(300f, 3000f, 20000f)

const val BAND_COUNT = 3

// extension/gain-logic.js와 수치 패리티. 여기를 고치면 확장 쪽도 같이 본다.
private const val GAIN_MIN_DB = -12f
private const val GAIN_MAX_DB = 12f

/** 정규화 기준으로 가정하는 프로그램 라우드니스(dBFS). extension worklet의 TARGET_LUFS_DEFAULT와 동일. */
private const val ASSUMED_PROGRAM_DB = -20f

// extension/settings-logic.js RANGES와 동일한 클램프 범위 (설정은 인텐트 extra로 들어오므로 신뢰 경계).
private val TARGET_RANGE = -60f..0f
private val THRESHOLD_RANGE = -100f..0f
private val RATIO_RANGE = 1f..20f
private val TIME_RANGE = 0f..1f
private val EQ_RANGE = -24f..24f

data class EqBandParams(val cutoffHz: Float, val gainDb: Float)

data class MbcBandParams(
    val cutoffHz: Float,
    val attackMs: Float,
    val releaseMs: Float,
    val ratio: Float,
    val thresholdDb: Float,
    val postGainDb: Float,
)

data class LimiterParams(
    val attackMs: Float = 1f,
    val releaseMs: Float = 60f,
    val ratio: Float = 20f,
    val thresholdDb: Float = -1f,
    val postGainDb: Float = 0f,
)

data class EffectParams(
    val enabled: Boolean,
    val inputGainDb: Float,
    val eqBands: List<EqBandParams>,
    val mbcBands: List<MbcBandParams>,
    val limiter: LimiterParams,
) {
    companion object {
        fun from(s: SoundSettings): EffectParams {
            val target = s.targetDb.coerceIn(TARGET_RANGE)
            val threshold = s.comp.threshold.coerceIn(THRESHOLD_RANGE)
            val ratio = s.comp.ratio.coerceIn(RATIO_RANGE)
            val attackMs = s.comp.attack.coerceIn(TIME_RANGE) * 1000f
            val releaseMs = s.comp.release.coerceIn(TIME_RANGE) * 1000f
            val eqGains = listOf(s.eq.low, s.eq.mid, s.eq.high).map { it.coerceIn(EQ_RANGE) }

            return EffectParams(
                enabled = s.enabled,
                inputGainDb = inputGainDb(target),
                eqBands = BAND_CUTOFFS_HZ.mapIndexed { i, hz -> EqBandParams(hz, eqGains[i]) },
                mbcBands = BAND_CUTOFFS_HZ.map { hz ->
                    MbcBandParams(
                        cutoffHz = hz,
                        attackMs = attackMs,
                        releaseMs = releaseMs,
                        ratio = ratio,
                        thresholdDb = threshold,
                        postGainDb = makeupDb(target, threshold, ratio),
                    )
                },
                limiter = LimiterParams(),
            )
        }

        /** 타깃 라우드니스까지의 정적 입력 게인. 실시간 측정이 없으므로 가정 프로그램 레벨 기준. */
        fun inputGainDb(targetDb: Float): Float =
            (targetDb - ASSUMED_PROGRAM_DB).coerceIn(GAIN_MIN_DB, GAIN_MAX_DB)

        /** 컴프레션으로 잃은 레벨을 되돌리는 자동 메이크업. 압축이 셀수록(=threshold 낮고 ratio 클수록) 크다. */
        fun makeupDb(targetDb: Float, thresholdDb: Float, ratio: Float): Float =
            ((targetDb - thresholdDb) * (1f - 1f / ratio)).coerceIn(0f, GAIN_MAX_DB)
    }
}
