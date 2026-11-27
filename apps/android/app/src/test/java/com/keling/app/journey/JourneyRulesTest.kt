package com.keling.app.journey

import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class JourneyRulesTest {
 private val catalog=Json{ignoreUnknownKeys=true}.decodeFromString<JourneyCatalog>(javaClass.classLoader!!.getResourceAsStream("journey/catalog.json")!!.bufferedReader().use{it.readText()})
 private fun profile(minutes:Int=0)=JourneyRules.profile(catalog,JourneyState(),mapOf("studyMinutes" to minutes))
 @Test fun catalogsHaveTenMatchingAchievementRewards(){
  assertEquals(10,catalog.avatars.size);assertEquals(10,catalog.frames.size);assertEquals(10,catalog.titles.size);assertEquals(10,catalog.furniture.size)
  assertEquals(10,catalog.achievements.map{it.id}.distinct().size)
  catalog.achievements.forEach{a->assertEquals(a.id,catalog.frames.first{it.id==a.frameId}.achievementId);assertEquals(a.id,catalog.furniture.first{it.id==a.furnitureId}.achievementId)}
 }
 @Test fun hundredHoursRequiresSixThousandRecordedMinutes(){
  assertFalse(profile(5999).achievements.first{it.id=="hundred_hours"}.unlocked)
  val p=profile(6000);assertTrue(p.achievements.first{it.id=="hundred_hours"}.unlocked)
  assertTrue("furniture-9" in p.owned.furnitureIds)
 }
 @Test fun lockedFurnitureCannotBeEquipped(){
  val p=profile();assertThrows(IllegalArgumentException::class.java){JourneyRules.apply(catalog,p,p.state.copy(furnitureSlots= listOf("furniture-9")+List(9){null}))}
  assertThrows(IllegalArgumentException::class.java){JourneyRules.apply(catalog,p,p.state.copy(frameId="frame-9"))}
  assertThrows(IllegalArgumentException::class.java){JourneyRules.apply(catalog,p,p.state.copy(titleId="title-9"))}
 }
 @Test fun repeatedEquipmentDoesNotIncreaseRevisionAndConflictsAreRejected(){
  val p=profile(6000);val first=JourneyRules.apply(catalog,p,p.state.copy(frameId="frame-9",titleId="title-9"))
  val updated=JourneyRules.profile(catalog,first,p.facts)
  assertEquals(1,first.revision);assertEquals(first,JourneyRules.apply(catalog,updated,first))
  assertThrows(IllegalArgumentException::class.java){JourneyRules.apply(catalog,updated,first.copy(revision=0))}
 }
 @Test fun duplicateFurnitureIsRejectedAndUnlockedRewardRemainsOwned(){
  val p=profile(6000)
  assertThrows(IllegalArgumentException::class.java){JourneyRules.apply(catalog,p,p.state.copy(furnitureSlots=listOf("furniture-9","furniture-9")+List(8){null}))}
  assertTrue("furniture-9" in JourneyRules.profile(catalog,p.state,mapOf("studyMinutes" to 0)).owned.furnitureIds)
 }
 @Test fun guestCheckinAndCompletionPopulateActualCalendarAndClearOnExit(){
  val guest=com.keling.app.network.GuestWorkspaces.create()
  try {
   assertEquals(0,guest.journeyProfile(catalog).facts["planetsCreated"])
   guest.checkin();guest.checkin()
   val task=guest.createTask(com.keling.app.network.WorkspaceTaskInput("一次真实任务")).task!!
   guest.complete(task.id,2);guest.complete(task.id,2)
   val month=java.time.YearMonth.now(java.time.ZoneId.of("Asia/Shanghai")).toString()
   val cal=guest.journeyCalendar(month)
   assertEquals(2,cal.totals.studyMinutes);assertEquals(1,cal.totals.checkinDays);assertEquals(1,cal.totals.completedTasks)
   val p=guest.journeyProfile(catalog);assertTrue("furniture-1" in p.owned.furnitureIds);assertFalse("furniture-9" in p.owned.furnitureIds)
  }finally{com.keling.app.network.GuestWorkspaces.close(guest.token)}
  assertThrows(com.keling.app.network.ApiException::class.java){guest.journeyCalendar("2026-11")}
 }
 @Test fun equipmentPatchKeepsLegacyAvatarAndExplicitlyClearsOptionalRewards(){
  val payload=journeyPatchPayload(JourneyState())
  assertFalse(payload.containsKey("avatarId"));assertEquals(kotlinx.serialization.json.JsonNull,payload["frameId"]);assertEquals(kotlinx.serialization.json.JsonNull,payload["titleId"])
  assertEquals(kotlinx.serialization.json.JsonPrimitive("avatar-3"),journeyPatchPayload(JourneyState(avatarId="avatar-3"),true)["avatarId"])
  val guest=com.keling.app.network.GuestWorkspaces.create()
  try{guest.avatar(4);guest.saveJourney(catalog,guest.journeyProfile(catalog).state);assertEquals("stellar:avatar-4",guest.profile.avatarUrl)
   guest.saveJourney(catalog,guest.journeyProfile(catalog).state.copy(avatarId="avatar-3"),true);assertEquals("journey:avatar-3",guest.profile.avatarUrl)
  }finally{com.keling.app.network.GuestWorkspaces.close(guest.token)}
 }
}
