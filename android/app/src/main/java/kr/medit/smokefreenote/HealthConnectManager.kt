package kr.medit.smokefreenote

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import org.json.JSONObject
import java.time.Instant

/**
 * 금연노트 — Health Connect 읽기 (걸음 · 심박 · 수면)
 *
 * 왜 이 셋인가 — 흡연 항목은 Health Connect 에 없습니다 (docs/DEVICES.md 5절).
 * 대신 갈망이 많은 시간대와 수면 부족 · 활동량을 견주어 보여 주려는 것입니다.
 * 값은 기기 안에서만 읽고 계산합니다. 서버로 보내지 않습니다.
 *
 * MediNote 의 HealthConnectManager 와 같은 골격이고, 수면을 더했습니다.
 */
class HealthConnectManager(private val context: Context) {

    val client: HealthConnectClient by lazy { HealthConnectClient.getOrCreate(context) }

    val permissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
    )

    fun isAvailable(): Boolean =
        HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    suspend fun hasAllPermissions(): Boolean =
        client.permissionController.getGrantedPermissions().containsAll(permissions)

    /** 지난 24시간 걸음 합 — aggregate(COUNT_TOTAL).
     *  readRecords 원본을 더하면 폰(삼성 헬스·Google Fit)과 시계가 같은 걸음을 각자 써서 두 배로 세고, 한 번에 1,000건까지만 와서
     *  하루치가 잘립니다. aggregate 는 Health Connect 가 앱 우선순위로 겹친 것을 걸러 준 합계입니다 (MediNote#63 MN-63-1 · QA-tool #21). */
    suspend fun readSteps24h(): Long {
        val now = Instant.now()
        val r = client.aggregate(AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), TimeRangeFilter.between(now.minusSeconds(86_400), now)))
        return r[StepsRecord.COUNT_TOTAL] ?: 0L
    }

    /** 지난 6시간 심박 (bpm 목록) */
    suspend fun readHeartRate6h(): List<Long> {
        val now = Instant.now()
        val r = client.readRecords(ReadRecordsRequest(HeartRateRecord::class, TimeRangeFilter.between(now.minusSeconds(6 * 3_600), now)))
        return r.records.flatMap { rec -> rec.samples.map { it.beatsPerMinute } }
    }

    /** 「깨어 있던」 단계 — 세션 길이에서 이것만 뺍니다 (MediNote#63 MN-63-3 와 같은 기준) */
    private val awakeStages = setOf(
        SleepSessionRecord.STAGE_TYPE_AWAKE, SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED,
        SleepSessionRecord.STAGE_TYPE_OUT_OF_BED)

    /** 지난 24시간 수면 합 (분) — 세션 길이 − 깨어 있던 단계. 단계가 없는 세션은 세션 길이 그대로 */
    suspend fun readSleepMinutes24h(): Long {
        val now = Instant.now()
        val r = client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, TimeRangeFilter.between(now.minusSeconds(86_400), now)))
        return r.records.sumOf { rec ->
            val sessionSec = rec.endTime.epochSecond - rec.startTime.epochSecond
            val awakeSec = rec.stages.filter { it.stage in awakeStages }.sumOf { it.endTime.epochSecond - it.startTime.epochSecond }
            maxOf(0L, sessionSec - awakeSec) / 60
        }
    }

    /** 웹 화면으로 넘길 요약 — {steps, hrAvg, hrN, sleepMin, at} */
    suspend fun readSummary(): JSONObject {
        val hr = readHeartRate6h()
        return JSONObject()
            .put("steps", readSteps24h())
            .put("hrAvg", if (hr.isEmpty()) JSONObject.NULL else hr.average().toInt())
            .put("hrN", hr.size)
            .put("sleepMin", readSleepMinutes24h())
            .put("at", Instant.now().toEpochMilli())
    }
}
