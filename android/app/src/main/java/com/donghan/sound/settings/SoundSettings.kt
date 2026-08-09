package com.donghan.sound.settings

// M2(이펙트 파라미터 매핑)/M3(UI+영속화) 공용 설정 계약.
// extension/settings-logic.js의 DEFAULT_SETTINGS와 개념적으로 패리티 유지 — 필드 추가/삭제 시 양쪽 동기화.
data class SoundSettings(
    val enabled: Boolean = true,
    val targetDb: Float = -24f,
    val comp: Comp = Comp(),
    val eq: Eq = Eq(),
) {
    data class Comp(
        val threshold: Float = -24f,
        val ratio: Float = 4f,
        val attack: Float = 0.003f,
        val release: Float = 0.25f,
    )

    data class Eq(
        val low: Float = 0f,
        val mid: Float = 0f,
        val high: Float = 0f,
    )
}
