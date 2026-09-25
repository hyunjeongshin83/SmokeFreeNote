package kr.medit.smokefreenote

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebViewAssetLoader
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * 금연노트 — Android 셸 (VaccineNote-Park#58 · VN-58-3, 대표님 2026-09-25 결정)
 *
 * 화면은 assets/index.html 에 든 웹앱 그대로입니다. 손으로 만든 파일이 아니라
 * 저장소 맨 위의 index.html 을 tools/build-packaged-app.py 가 복사합니다 (MediNote 와 같은 규칙).
 *
 * MediNote 셸과 다른 점 하나 — file:// 대신 WebViewAssetLoader 로
 * https://appassets.androidplatform.net/assets/index.html 을 띄웁니다.
 * file:// 에서는 서비스워커·Notification API 가 돌지 않아 웹앱과 앱이 갈라졌습니다 (MediNote #20).
 *
 * 네이티브가 더해 주는 것 (window.Native)
 *   healthAvailable()  Health Connect 가 이 폰에 있는지
 *   requestHealth()    걸음·심박·수면 읽기 권한을 OS 화면으로 묻고, 허락되면 바로 읽어
 *                      window.onNativeHealth(json) 으로 돌려줌
 *   readHealth()       이미 권한이 있으면 읽어서 같은 콜백으로
 * 값은 기기 안에서만 씁니다. 서버로 보내지 않습니다 (docs/DESIGN.md 3절).
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private lateinit var health: HealthConnectManager

    private val askHealth = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        if (granted.containsAll(health.permissions)) pushHealth()
        else callback("""{"error":"denied"}""")
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        health = HealthConnectManager(this)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    loader.shouldInterceptRequest(request.url)
            }
            addJavascriptInterface(Bridge(), "Native")
            loadUrl("https://appassets.androidplatform.net/assets/index.html")
        }
        setContentView(web)
    }

    private fun pushHealth() {
        lifecycleScope.launch {
            val json = try { health.readSummary().toString() } catch (e: Exception) { JSONObject().put("error", e.message ?: "read").toString() }
            callback(json)
        }
    }

    private fun callback(json: String) {
        runOnUiThread { web.evaluateJavascript("window.onNativeHealth && window.onNativeHealth($json)", null) }
    }

    inner class Bridge {
        @JavascriptInterface fun platform(): String = "android"
        @JavascriptInterface fun healthAvailable(): Boolean = health.isAvailable()
        @JavascriptInterface fun requestHealth() {
            if (!health.isAvailable()) { callback("""{"error":"unavailable"}"""); return }
            lifecycleScope.launch {
                if (health.hasAllPermissions()) pushHealth()
                else askHealth.launch(health.permissions)
            }
        }
        @JavascriptInterface fun readHealth() {
            lifecycleScope.launch {
                if (health.isAvailable() && health.hasAllPermissions()) pushHealth()
                else callback("""{"error":"no-permission"}""")
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (this::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}
