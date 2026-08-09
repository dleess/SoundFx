package com.donghan.sound.audio

// MERGE: M2의 실제 SoundService/TestTonePlayer로 교체하고 이 파일은 삭제할 것.
// M3(UI+DataStore) 컴파일을 위한 임시 스텁 — goal3/PLAN.md M2 공개 API 계약과 동일 시그니처.

import android.content.Context
import com.donghan.sound.settings.SoundSettings

object SoundService {
    fun start(context: Context) {
        // stub — M2가 포그라운드 서비스 시작 로직으로 교체
    }

    fun stop(context: Context) {
        // stub — M2가 포그라운드 서비스 종료 로직으로 교체
    }

    fun updateSettings(context: Context, settings: SoundSettings) {
        // stub — M2가 DynamicsProcessing 파라미터 반영 로직으로 교체
    }
}

object TestTonePlayer {
    fun playQuiet(context: Context) {
        // stub — M2가 조용한 톤 재생으로 교체
    }

    fun playLoud(context: Context) {
        // stub — M2가 시끄러운 톤 재생으로 교체
    }
}
