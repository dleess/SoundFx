package com.donghan.sound

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

// M3: UI — 온/오프, 타깃, 컴프레서, EQ 슬라이더, 활성 세션 목록으로 교체 예정.
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
    }
}
