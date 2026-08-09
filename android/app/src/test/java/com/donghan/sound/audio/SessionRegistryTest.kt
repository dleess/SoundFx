package com.donghan.sound.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionRegistryTest {

    @Test
    fun `세션이 없으면 글로벌 믹스로 폴백한다`() {
        val r = SessionRegistry()

        assertEquals(emptyList<Int>(), r.active())
        assertEquals(listOf(GLOBAL_SESSION), r.targets())
    }

    @Test
    fun `open은 새 세션일 때만 true를 반환한다`() {
        val r = SessionRegistry()

        assertTrue(r.open(12))
        assertFalse(r.open(12))
        assertEquals(listOf(12), r.active())
    }

    @Test
    fun `세션이 하나라도 있으면 폴백하지 않는다`() {
        val r = SessionRegistry()
        r.open(12)
        r.open(7)

        assertEquals(listOf(12, 7), r.targets())
    }

    @Test
    fun `close는 마지막 세션이 빠지면 다시 폴백으로 돌아간다`() {
        val r = SessionRegistry()
        r.open(12)

        assertTrue(r.close(12))
        assertEquals(listOf(GLOBAL_SESSION), r.targets())
    }

    @Test
    fun `모르는 세션 close는 상태를 바꾸지 않는다`() {
        val r = SessionRegistry()
        r.open(12)

        assertFalse(r.close(99))
        assertEquals(listOf(12), r.active())
    }

    @Test
    fun `유효하지 않은 세션 ID는 무시한다`() {
        val r = SessionRegistry()

        assertFalse(r.open(0))
        assertFalse(r.open(-1))
        assertEquals(emptyList<Int>(), r.active())
    }

    @Test
    fun `여러 세션의 수신 순서가 유지되고 중간 제거도 반영된다`() {
        val r = SessionRegistry()
        r.open(3)
        r.open(1)
        r.open(2)
        r.close(1)

        assertEquals(listOf(3, 2), r.active())
    }

    @Test
    fun `clear 후에는 폴백 상태로 돌아간다`() {
        val r = SessionRegistry()
        r.open(3)
        r.clear()

        assertEquals(listOf(GLOBAL_SESSION), r.targets())
    }
}
