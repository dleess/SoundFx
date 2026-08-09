package com.donghan.sound.audio

import android.media.audiofx.DynamicsProcessing
import android.util.Log

/** logcat 검증(E2E)용 태그. attach/detach/파라미터 적용을 전부 이 태그로 남긴다. */
const val TAG = "SoundFx"

private const val CHANNEL_COUNT = 2
private const val PRIORITY = 0

/**
 * 세션별 DynamicsProcessing 생성·attach·해제.
 *
 * 구성: preEq(3밴드, 사용자 EQ) → MBC(3밴드 컴프, 밴드별 메이크업 postGain) → 리미터.
 * postEq는 inUse=false. 세션이 하나도 없으면 SessionRegistry가 session 0(글로벌 믹스)을 넘겨준다.
 * 기기에 따라 session 0 attach는 거부될 수 있으므로 실패는 로그만 남기고 삼킨다(크래시 금지).
 */
class EffectEngine {
    private val attached = LinkedHashMap<Int, DynamicsProcessing>()

    /** 대상 세션 목록에 맞춰 attach/detach하고 모든 이펙트에 파라미터를 적용한다. */
    fun sync(targets: List<Int>, params: EffectParams) {
        (attached.keys - targets.toSet()).forEach { detach(it) }
        targets.forEach { session ->
            val fx = attached[session] ?: attach(session, params) ?: return@forEach
            apply(session, fx, params)
        }
    }

    fun attachedSessions(): List<Int> = attached.keys.toList()

    fun release() {
        attached.keys.toList().forEach { detach(it) }
    }

    private fun attach(sessionId: Int, params: EffectParams): DynamicsProcessing? = try {
        val fx = DynamicsProcessing(PRIORITY, sessionId, configOf(params))
        attached[sessionId] = fx
        Log.i(TAG, "attach session=$sessionId${if (sessionId == GLOBAL_SESSION) " (global mix fallback)" else ""}")
        fx
    } catch (t: Throwable) {
        // 세션이 이미 사라졌거나 기기가 글로벌 믹스 attach를 거부하는 경우 — 정규화만 못 할 뿐 앱은 계속 돈다.
        Log.w(TAG, "attach failed session=$sessionId: ${t.javaClass.simpleName}: ${t.message}")
        null
    }

    private fun detach(sessionId: Int) {
        try {
            attached.remove(sessionId)?.release()
            Log.i(TAG, "detach session=$sessionId")
        } catch (t: Throwable) {
            Log.w(TAG, "detach failed session=$sessionId: ${t.message}")
        }
    }

    private fun apply(sessionId: Int, fx: DynamicsProcessing, p: EffectParams) {
        try {
            fx.setInputGainAllChannelsTo(p.inputGainDb)
            p.eqBands.forEachIndexed { i, b ->
                fx.setPreEqBandAllChannelsTo(i, DynamicsProcessing.EqBand(true, b.cutoffHz, b.gainDb))
            }
            p.mbcBands.forEachIndexed { i, b ->
                fx.setMbcBandAllChannelsTo(i, mbcBand(b))
            }
            fx.setLimiterAllChannelsTo(limiter(p.limiter))
            fx.setEnabled(p.enabled)
            Log.i(
                TAG,
                "apply session=$sessionId enabled=${p.enabled} inputGain=${p.inputGainDb}dB " +
                    "eq=${p.eqBands.map { it.gainDb }} thr=${p.mbcBands[0].thresholdDb}dB " +
                    "ratio=${p.mbcBands[0].ratio} atk=${p.mbcBands[0].attackMs}ms " +
                    "rel=${p.mbcBands[0].releaseMs}ms makeup=${p.mbcBands[0].postGainDb}dB " +
                    "limiter=${p.limiter.thresholdDb}dB"
            )
        } catch (t: Throwable) {
            Log.w(TAG, "apply failed session=$sessionId: ${t.message}")
        }
    }

    private fun configOf(p: EffectParams): DynamicsProcessing.Config =
        DynamicsProcessing.Config.Builder(
            DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION,
            CHANNEL_COUNT,
            /* preEqInUse = */ true, BAND_COUNT,
            /* mbcInUse = */ true, BAND_COUNT,
            /* postEqInUse = */ false, BAND_COUNT,
            /* limiterInUse = */ true,
        ).apply {
            setInputGainAllChannelsTo(p.inputGainDb)
            setPreEqAllChannelsTo(DynamicsProcessing.Eq(true, true, BAND_COUNT).also { eq ->
                p.eqBands.forEachIndexed { i, b ->
                    eq.setBand(i, DynamicsProcessing.EqBand(true, b.cutoffHz, b.gainDb))
                }
            })
            setMbcAllChannelsTo(DynamicsProcessing.Mbc(true, true, BAND_COUNT).also { mbc ->
                p.mbcBands.forEachIndexed { i, b -> mbc.setBand(i, mbcBand(b)) }
            })
            setLimiterAllChannelsTo(limiter(p.limiter))
        }.build()

    private fun mbcBand(b: MbcBandParams) = DynamicsProcessing.MbcBand(
        /* enabled = */ true,
        /* cutoffFrequency = */ b.cutoffHz,
        /* attackTime = */ b.attackMs,
        /* releaseTime = */ b.releaseMs,
        /* ratio = */ b.ratio,
        /* threshold = */ b.thresholdDb,
        /* kneeWidth = */ 0f,
        /* noiseGateThreshold = */ -100f,
        /* expanderRatio = */ 1f,
        /* preGain = */ 0f,
        /* postGain = */ b.postGainDb,
    )

    private fun limiter(l: LimiterParams) = DynamicsProcessing.Limiter(
        /* inUse = */ true,
        /* enabled = */ true,
        /* linkGroup = */ 0,
        /* attackTime = */ l.attackMs,
        /* releaseTime = */ l.releaseMs,
        /* ratio = */ l.ratio,
        /* threshold = */ l.thresholdDb,
        /* postGain = */ l.postGainDb,
    )
}
