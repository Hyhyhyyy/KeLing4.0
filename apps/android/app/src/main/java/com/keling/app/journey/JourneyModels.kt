package com.keling.app.journey

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

@Serializable data class JourneyItem(val id:String,val name:String,val index:Int,val achievementId:String?=null)
@Serializable data class JourneyAchievement(val id:String,val name:String,val description:String,val metric:String,val target:Int,val index:Int,val frameId:String,val titleId:String,val furnitureId:String,val progress:Int=0,val unlocked:Boolean=false)
@Serializable data class JourneyCatalog(val version:Int=1,val avatars:List<JourneyItem>,val frames:List<JourneyItem>,val titles:List<JourneyItem>,val furniture:List<JourneyItem>,val achievements:List<JourneyAchievement>,val slots:Int=10)
@Serializable data class JourneyState(val version:Int=1,val revision:Int=0,val avatarId:String="avatar-0",val frameId:String?=null,val titleId:String?=null,val furnitureSlots:List<String?> = List(10){null},val unlockedAchievementIds:List<String> = emptyList())
@Serializable data class JourneyOwned(val frameIds:List<String> = emptyList(),val titleIds:List<String> = emptyList(),val furnitureIds:List<String> = emptyList())
@Serializable data class JourneyProfile(val state:JourneyState,val facts:Map<String,Int>,val achievements:List<JourneyAchievement>,val owned:JourneyOwned)
@Serializable data class JourneyDay(val date:String,val checkedIn:Boolean=false,val studyMinutes:Int=0,val completedTasks:Int=0,val notesCreated:Int=0)
@Serializable data class JourneyTotals(val studyMinutes:Int=0,val completedTasks:Int=0,val checkinDays:Int=0,val notesCreated:Int=0)
@Serializable data class JourneyCalendar(val month:String,val timezone:String="Asia/Shanghai",val days:List<JourneyDay>,val totals:JourneyTotals)

object JourneyRules {
 fun profile(catalog:JourneyCatalog,state:JourneyState,facts:Map<String,Int>):JourneyProfile {
  val clean=facts.mapValues { it.value.coerceAtLeast(0) }
  val achievements=catalog.achievements.map { it.copy(progress=(clean[it.metric]?:0).coerceAtMost(it.target),unlocked=it.id in state.unlockedAchievementIds || (clean[it.metric]?:0)>=it.target) }
  val ids=achievements.filter{it.unlocked}.map{it.id}
  return JourneyProfile(state.copy(unlockedAchievementIds=ids),clean,achievements,JourneyOwned(catalog.frames.filter{it.achievementId in ids}.map{it.id},catalog.titles.filter{it.achievementId in ids}.map{it.id},catalog.furniture.filter{it.achievementId in ids}.map{it.id}))
 }
 fun apply(catalog:JourneyCatalog,p:JourneyProfile,next:JourneyState):JourneyState {
  require(next.revision==p.state.revision){"装扮已更新，请重新读取"}
  require(catalog.avatars.any{it.id==next.avatarId}){"请选择已有形象"}
  require(next.frameId==null || next.frameId in p.owned.frameIds){"完成成就后解锁头像框"}
  require(next.titleId==null || next.titleId in p.owned.titleIds){"完成成就后解锁称号"}
  val ids=next.furnitureSlots.filterNotNull()
  require(next.furnitureSlots.size==10 && ids.distinct().size==ids.size){"每件家具只能陈列一次"}
  require(ids.all{it in p.owned.furnitureIds}){"完成成就后解锁家具"}
  val candidate=next.copy(unlockedAchievementIds=p.state.unlockedAchievementIds)
  return candidate.copy(revision=if(candidate==p.state)p.state.revision else p.state.revision+1)
 }
}

internal fun journeyPatchPayload(next:JourneyState,avatarChanged:Boolean=false):JsonObject = buildJsonObject {
 put("expectedRevision",next.revision)
 if(avatarChanged)put("avatarId",next.avatarId)
 put("frameId",next.frameId?.let{JsonPrimitive(it)}?:JsonNull)
 put("titleId",next.titleId?.let{JsonPrimitive(it)}?:JsonNull)
 put("furnitureSlots",JsonArray(next.furnitureSlots.map{it?.let{JsonPrimitive(it)}?:JsonNull}))
}
