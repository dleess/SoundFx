package com.donghan.sound

import android.os.Bundle
import android.view.View
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.donghan.sound.audio.SoundService
import com.donghan.sound.audio.TestTonePlayer
import com.donghan.sound.settings.SettingsRepository
import com.donghan.sound.settings.SoundSettings
import com.google.android.material.slider.Slider
import com.google.android.material.switchmaterial.SwitchMaterial
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

// 확장 팝업(extension/popup.html)과 개념 패리티: 온/오프, 타깃, 컴프레서, EQ.
// 값 변경 시 즉시 DataStore 저장 + SoundService.updateSettings 호출 (수동 저장 버튼 없음).
class MainActivity : AppCompatActivity() {
    private lateinit var repository: SettingsRepository

    private lateinit var switchEnabled: SwitchMaterial
    private lateinit var sliderTarget: Slider
    private lateinit var sliderCompThreshold: Slider
    private lateinit var sliderCompRatio: Slider
    private lateinit var sliderCompAttack: Slider
    private lateinit var sliderCompRelease: Slider
    private lateinit var sliderEqLow: Slider
    private lateinit var sliderEqMid: Slider
    private lateinit var sliderEqHigh: Slider
    private lateinit var sliderBalance: Slider
    private lateinit var statusText: TextView
    private var binding = false // applyToUi의 프로그램적 UI 변경이 리스너를 통해 저장으로 되돌아오지 않게

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        repository = SettingsRepository(applicationContext)

        switchEnabled = findViewById(R.id.switch_enabled)
        sliderTarget = findViewById(R.id.slider_target)
        sliderCompThreshold = findViewById(R.id.slider_comp_threshold)
        sliderCompRatio = findViewById(R.id.slider_comp_ratio)
        sliderCompAttack = findViewById(R.id.slider_comp_attack)
        sliderCompRelease = findViewById(R.id.slider_comp_release)
        sliderEqLow = findViewById(R.id.slider_eq_low)
        sliderEqMid = findViewById(R.id.slider_eq_mid)
        sliderEqHigh = findViewById(R.id.slider_eq_high)
        sliderBalance = findViewById(R.id.slider_balance)
        statusText = findViewById(R.id.text_status)

        findViewById<View>(R.id.btn_test_quiet).setOnClickListener { TestTonePlayer.playQuiet(this) }
        findViewById<View>(R.id.btn_test_loud).setOnClickListener { TestTonePlayer.playLoud(this) }

        val onSliderChange = Slider.OnChangeListener { _, _, fromUser -> if (fromUser) onSettingsChanged() }
        for (slider in listOf(
            sliderTarget, sliderCompThreshold, sliderCompRatio, sliderCompAttack,
            sliderCompRelease, sliderEqLow, sliderEqMid, sliderEqHigh, sliderBalance,
        )) {
            slider.addOnChangeListener(onSliderChange)
        }
        switchEnabled.setOnCheckedChangeListener { _, _ -> onSettingsChanged() }

        lifecycleScope.launch {
            val loaded = repository.settingsFlow.first()
            applyToUi(loaded)
            updateStatus(loaded.enabled)
            SoundService.start(applicationContext)
            SoundService.updateSettings(applicationContext, loaded)
        }
    }

    override fun onStop() {
        super.onStop()
        // 정지 버튼이 없는 무한 루프 톤 — 화면을 떠나면 반드시 멈춘다 (세션 CLOSE 브로드캐스트 포함)
        TestTonePlayer.stop(this)
    }

    private fun applyToUi(s: SoundSettings) {
        // binding 중 리스너 발화(특히 switch는 fromUser 구분이 없다)가 readFromUi()로
        // 반쯤 복원된 폼을 저장하는 것을 막는다.
        binding = true
        switchEnabled.isChecked = s.enabled
        sliderTarget.value = s.targetDb
        sliderCompThreshold.value = s.comp.threshold
        sliderCompRatio.value = s.comp.ratio
        sliderCompAttack.value = s.comp.attack
        sliderCompRelease.value = s.comp.release
        sliderEqLow.value = s.eq.low
        sliderEqMid.value = s.eq.mid
        sliderEqHigh.value = s.eq.high
        sliderBalance.value = s.balance
        binding = false
    }

    private fun readFromUi(): SoundSettings = SoundSettings(
        enabled = switchEnabled.isChecked,
        targetDb = sliderTarget.value,
        comp = SoundSettings.Comp(
            threshold = sliderCompThreshold.value,
            ratio = sliderCompRatio.value,
            attack = sliderCompAttack.value,
            release = sliderCompRelease.value,
        ),
        eq = SoundSettings.Eq(
            low = sliderEqLow.value,
            mid = sliderEqMid.value,
            high = sliderEqHigh.value,
        ),
        balance = sliderBalance.value,
    )

    private fun onSettingsChanged() {
        if (binding) return
        val settings = readFromUi()
        updateStatus(settings.enabled)
        SoundService.updateSettings(applicationContext, settings)
        repository.save(settings)
    }

    private fun updateStatus(enabled: Boolean) {
        statusText.setText(if (enabled) R.string.status_running else R.string.status_stopped)
    }
}
