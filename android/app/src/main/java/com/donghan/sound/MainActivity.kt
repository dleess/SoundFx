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
    private lateinit var statusText: TextView

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
        statusText = findViewById(R.id.text_status)

        findViewById<View>(R.id.btn_test_quiet).setOnClickListener { TestTonePlayer.playQuiet(this) }
        findViewById<View>(R.id.btn_test_loud).setOnClickListener { TestTonePlayer.playLoud(this) }

        val onSliderChange = Slider.OnChangeListener { _, _, fromUser -> if (fromUser) onSettingsChanged() }
        for (slider in listOf(
            sliderTarget, sliderCompThreshold, sliderCompRatio, sliderCompAttack,
            sliderCompRelease, sliderEqLow, sliderEqMid, sliderEqHigh,
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

    private fun applyToUi(s: SoundSettings) {
        switchEnabled.isChecked = s.enabled
        sliderTarget.value = s.targetDb
        sliderCompThreshold.value = s.comp.threshold
        sliderCompRatio.value = s.comp.ratio
        sliderCompAttack.value = s.comp.attack
        sliderCompRelease.value = s.comp.release
        sliderEqLow.value = s.eq.low
        sliderEqMid.value = s.eq.mid
        sliderEqHigh.value = s.eq.high
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
    )

    private fun onSettingsChanged() {
        val settings = readFromUi()
        updateStatus(settings.enabled)
        SoundService.updateSettings(applicationContext, settings)
        lifecycleScope.launch { repository.save(settings) }
    }

    private fun updateStatus(enabled: Boolean) {
        statusText.setText(if (enabled) R.string.status_running else R.string.status_stopped)
    }
}
