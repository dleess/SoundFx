package com.donghan.sound.audio

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.audiofx.AudioEffect
import android.util.Log
import kotlin.math.PI
import kotlin.math.pow
import kotlin.math.sin

/**
 * 검증용 내장 톤 플레이어. 조용한 톤(-30 dBFS)과 시끄러운 톤(-6 dBFS)을 무한 루프 재생하고,
 * 자기 audioSessionId에 대해 표준 이펙트 브로드캐스트를 보내 SoundService가 이펙트를 붙이게 한다.
 *
 * M3 UI의 테스트 버튼, M4 E2E가 공통으로 쓴다: playQuiet/playLoud/stop.
 */
object TestTonePlayer {

    const val QUIET_DBFS = -30f
    const val LOUD_DBFS = -6f

    private const val SAMPLE_RATE = 44100
    // 44100의 약수여야 1초 버퍼가 정수 주기로 끊겨 루프 이음매에 클릭이 안 생긴다.
    private const val TONE_HZ = 441

    private var track: AudioTrack? = null

    fun playQuiet(context: Context) = play(context, QUIET_DBFS)

    fun playLoud(context: Context) = play(context, LOUD_DBFS)

    @Synchronized
    fun play(context: Context, dbfs: Float) {
        stop(context)
        val samples = tone(dbfs)
        val t = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(samples.size * 2)
            .build()
        t.write(samples, 0, samples.size)
        t.setLoopPoints(0, samples.size, -1)
        broadcast(context, AudioEffect.ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION, t.audioSessionId)
        t.play()
        track = t
        Log.i(TAG, "test tone playing ${dbfs}dBFS session=${t.audioSessionId}")
    }

    @Synchronized
    fun stop(context: Context) {
        val t = track ?: return
        track = null
        broadcast(context, AudioEffect.ACTION_CLOSE_AUDIO_EFFECT_CONTROL_SESSION, t.audioSessionId)
        runCatching { t.stop() }
        t.release()
        Log.i(TAG, "test tone stopped session=${t.audioSessionId}")
    }

    @Synchronized
    fun isPlaying(): Boolean = track != null

    /** 재생 중인 톤의 오디오 세션 ID. 없으면 -1. */
    @Synchronized
    fun sessionId(): Int = track?.audioSessionId ?: -1

    /** 1초짜리 사인파. 진폭은 dBFS 기준. */
    private fun tone(dbfs: Float): ShortArray {
        val peak = (Short.MAX_VALUE * 10f.pow(dbfs / 20f))
        return ShortArray(SAMPLE_RATE) { i ->
            (peak * sin(2.0 * PI * TONE_HZ * i / SAMPLE_RATE)).toInt().toShort()
        }
    }

    private fun broadcast(context: Context, action: String, sessionId: Int) {
        context.sendBroadcast(
            Intent(action)
                .putExtra(AudioEffect.EXTRA_AUDIO_SESSION, sessionId)
                .putExtra(AudioEffect.EXTRA_PACKAGE_NAME, context.packageName)
                .putExtra(AudioEffect.EXTRA_CONTENT_TYPE, AudioEffect.CONTENT_TYPE_MUSIC)
        )
        Log.i(TAG, "sent $action session=$sessionId")
    }
}
