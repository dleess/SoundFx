package com.donghan.sound.audio

// ACTION_OPEN/CLOSE_AUDIO_EFFECT_CONTROL_SESSION 브로드캐스트로 들어오는 세션 ID의 상태 머신.
// Android API 의존 없음 → JVM 단위 테스트 대상.

const val GLOBAL_SESSION = 0

class SessionRegistry {
    private val sessions = LinkedHashSet<Int>()

    /** 세션 추가. 새로 추가됐으면 true(= 이펙트 attach 필요). 유효하지 않거나 중복이면 false. */
    fun open(sessionId: Int): Boolean = isValid(sessionId) && sessions.add(sessionId)

    /** 세션 제거. 실제로 지워졌으면 true(= detach 필요). */
    fun close(sessionId: Int): Boolean = sessions.remove(sessionId)

    /** 브로드캐스트로 알려진 활성 세션 (수신 순서 유지). */
    fun active(): List<Int> = sessions.toList()

    /** 이펙트를 붙일 대상. 세션이 하나도 없으면 글로벌 믹스(session 0)로 폴백한다. */
    fun targets(): List<Int> = if (sessions.isEmpty()) listOf(GLOBAL_SESSION) else active()

    fun clear() = sessions.clear()

    // 0은 글로벌 믹스(폴백 전용)이고 음수는 AudioEffect 에러 코드라 실제 세션이 아니다.
    private fun isValid(sessionId: Int) = sessionId > 0
}
