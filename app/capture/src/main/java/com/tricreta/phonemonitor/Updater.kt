package com.tricreta.phonemonitor

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * In-app updater. Reads the private repo's `capture-latest` release with an
 * embedded read-only token, compares versionCode, and downloads + installs the
 * signed release APK. Same applicationId + signing key + higher versionCode =>
 * Android updates in place, keeping all data.
 *
 * All network calls block — call [check]/[download] from a background thread.
 */
object Updater {

    data class Update(
        val versionCode: Int,
        val versionName: String,
        val assetUrl: String,
        val apkName: String,
        val notes: String,
    )

    sealed class Result {
        object UpToDate : Result()
        /** No token baked in (local build) — the check is disabled. */
        object NotConfigured : Result()
        data class Available(val update: Update) : Result()
        data class Failed(val reason: String) : Result()
    }

    private const val RELEASE_TAG = "capture-latest"

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    private fun authed(url: String, octet: Boolean = false): Request =
        Request.Builder()
            .url(url)
            .header("Authorization", "Bearer ${BuildConfig.RELEASES_TOKEN}")
            .header("Accept", if (octet) "application/octet-stream" else "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .build()

    fun check(): Result {
        if (BuildConfig.RELEASES_TOKEN.isEmpty()) return Result.NotConfigured
        return try {
            val relUrl = "https://api.github.com/repos/${BuildConfig.UPDATE_REPO}/releases/tags/$RELEASE_TAG"
            client.newCall(authed(relUrl)).execute().use { resp ->
                if (!resp.isSuccessful) return Result.Failed("server ${resp.code}")
                val assets = JSONObject(resp.body?.string() ?: return Result.Failed("empty response"))
                    .optJSONArray("assets") ?: return Result.Failed("no assets")

                val assetUrlByName = HashMap<String, String>()
                for (i in 0 until assets.length()) {
                    val a = assets.getJSONObject(i)
                    assetUrlByName[a.getString("name")] = a.getString("url")
                }
                val feedUrl = assetUrlByName["latest.json"] ?: return Result.Failed("no update feed")

                val feed = readAsset(feedUrl) ?: return Result.Failed("feed unreachable")
                val j = JSONObject(feed)
                val vc = j.getInt("versionCode")
                if (vc <= BuildConfig.VERSION_CODE) return Result.UpToDate
                val apkName = j.getString("apk")
                val apkUrl = assetUrlByName[apkName] ?: return Result.Failed("update APK missing")
                Result.Available(
                    Update(vc, j.getString("versionName"), apkUrl, apkName, j.optString("notes", "")),
                )
            }
        } catch (e: Exception) {
            Result.Failed(e.message ?: "network error")
        }
    }

    private fun readAsset(assetApiUrl: String): String? =
        client.newCall(authed(assetApiUrl, octet = true)).execute().use { r ->
            if (r.isSuccessful) r.body?.string() else null
        }

    /** Downloads the update APK into cacheDir/updates. Blocking. */
    fun download(context: Context, update: Update): File? {
        val dir = File(context.cacheDir, "updates").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        val out = File(dir, update.apkName)
        return try {
            // GitHub asset URLs 302 to a storage host; OkHttp follows and strips
            // the Authorization header on the cross-host hop (as required).
            client.newCall(authed(update.assetUrl, octet = true)).execute().use { r ->
                if (!r.isSuccessful) return null
                val body = r.body ?: return null
                out.outputStream().use { os -> body.byteStream().copyTo(os) }
            }
            out
        } catch (e: Exception) {
            null
        }
    }

    fun installIntent(context: Context, apk: File): Intent {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apk)
        return Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }
}
