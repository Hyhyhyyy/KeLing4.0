package com.keling.app.journey

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.keling.app.network.WorkspaceApi
import com.keling.app.ui.components.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.time.YearMonth
import java.time.LocalDate
import java.time.ZoneId

@Composable fun JourneyArt(atlas:String,index:Int,label:String?,modifier:Modifier=Modifier) = StellarSprite(atlas,index,label,modifier,columns=5,rows=2,cropTop=if(atlas=="journey_titles")0.1f else 0f,cropBottom=if(atlas=="journey_titles")0.9f else 1f)

@Composable fun JourneyScreen(token:String,initialTab:String,onNavigate:(String)->Unit) {
 val context=LocalContext.current
 val api=remember(token){JourneyApi(token,context.applicationContext)}
 val scope=rememberCoroutineScope()
 var catalog by remember(token){mutableStateOf<JourneyCatalog?>(null)}
 var profile by remember(token){mutableStateOf<JourneyProfile?>(null)}
 var avatarUrl by remember(token){mutableStateOf<String?>(null)}
 var busy by remember(token){mutableStateOf(false)}
 var error by remember(token){mutableStateOf<String?>(null)}
 var notice by remember(token){mutableStateOf<String?>(null)}
 var slot by remember{mutableIntStateOf(0)}
 var section by remember(initialTab){mutableStateOf(if(initialTab=="base")"家园" else if(initialTab=="achievements")"成就" else "形象")}
 fun refresh(){scope.launch{busy=true;error=null;try{catalog=api.catalog();profile=api.profile();avatarUrl=WorkspaceApi().profile(token).user.avatarUrl}catch(e:CancellationException){throw e}catch(e:Exception){error=e.message?:"读取失败，请重试"}finally{busy=false}}}
 fun save(next:JourneyState,avatarChanged:Boolean=false){if(busy)return;scope.launch{busy=true;error=null;notice=null;try{profile=api.save(next,avatarChanged);if(avatarChanged)avatarUrl="journey:${next.avatarId}";notice=if(token.startsWith("guest-memory:"))"已暂存" else "已保存"}catch(e:CancellationException){throw e}catch(e:Exception){error=e.message?:"保存失败，请重新读取"}finally{busy=false}}}
 LaunchedEffect(token){refresh()}
 StellarTheme { Surface(Modifier.fillMaxSize()) {
  LazyColumn(Modifier.fillMaxSize().padding(horizontal=16.dp),verticalArrangement=Arrangement.spacedBy(14.dp),contentPadding=PaddingValues(vertical=12.dp)) {
   item { Column { StellarHeading(if(initialTab=="base")"星图家园" else "我的远航",mascot=7);UsageGuideButton() } }
   item { Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){listOf("形象","家园","成就").forEach{label->FilterChip(section==label,{section=label},label={Text(label)})};TextButton(onClick=::refresh,enabled=!busy){Text("重读")}} }
   if(busy)item{LinearProgressIndicator(Modifier.fillMaxWidth())}
   error?.let{item{Text(it,color=MaterialTheme.colorScheme.error)}}
   notice?.let{item{Text(it,color=MaterialTheme.colorScheme.primary)}}
   if(profile!=null && catalog!=null) {
    val p=profile!!;val c=catalog!!;val s=p.state
    item { Card { Column(Modifier.fillMaxWidth().padding(16.dp),horizontalAlignment=Alignment.CenterHorizontally) {
     Box(Modifier.size(138.dp),contentAlignment=Alignment.Center){
      if(avatarUrl?.startsWith("stellar:avatar-")==true) StellarSprite("avatars",avatarUrl?.substringAfterLast('-')?.toIntOrNull()?:0,"当前形象",Modifier.size(96.dp))
      else JourneyArt("journey_avatars",c.avatars.firstOrNull{it.id==s.avatarId}?.index?:0,"当前形象",Modifier.size(100.dp))
      s.frameId?.let{id->c.frames.firstOrNull{it.id==id}?.let{JourneyArt("journey_frames",it.index,it.name,Modifier.fillMaxSize())}}
     }
     s.titleId?.let{id->c.titles.firstOrNull{it.id==id}?.let{item->Box(Modifier.width(238.dp).height(175.dp),contentAlignment=Alignment.Center){JourneyArt("journey_titles",item.index,null,Modifier.fillMaxSize());Text(item.name,color=Color(0xFFFFF2CF),fontSize=17.sp,modifier=Modifier.offset(y=22.dp))}}}
     Text("${p.achievements.count{it.unlocked}} / ${p.achievements.size} 航行成就",style=MaterialTheme.typography.bodySmall)
    } } }
    if(section=="形象") {
     item{StellarSectionTitle("选择探索者",motif=7)}
     item{LazyRow(horizontalArrangement=Arrangement.spacedBy(10.dp)){items(c.avatars,key={it.id}){item->Column(Modifier.width(106.dp).border(if(item.id==s.avatarId&&avatarUrl?.startsWith("stellar:")!=true)2.dp else 1.dp,MaterialTheme.colorScheme.outline,RoundedCornerShape(8.dp)).clickable(enabled=!busy){save(s.copy(avatarId=item.id),avatarChanged=true)}.padding(8.dp),horizontalAlignment=Alignment.CenterHorizontally){JourneyArt("journey_avatars",item.index,item.name,Modifier.size(82.dp));Text(item.name,fontSize=13.sp,textAlign=TextAlign.Center)}}}}
     item{RewardPicker("头像星环","journey_frames",c.frames,p.owned.frameIds,s.frameId,busy,c.achievements,{id->save(s.copy(frameId=id))})}
     item{RewardPicker("成就称号","journey_titles",c.titles,p.owned.titleIds,s.titleId,busy,c.achievements,{id->save(s.copy(titleId=id))})}
     item{OutlinedButton(onClick={onNavigate("account_profile")},modifier=Modifier.fillMaxWidth()){Text("账号资料")}}
    }
    if(section=="家园") {
     item{Text("选择位置，再布置家具",style=MaterialTheme.typography.bodyMedium)}
     item{Box(Modifier.fillMaxWidth().height(300.dp).background(Color(0xFF123249),RoundedCornerShape(12.dp))){
      StellarArt("expedition_base",null,Modifier.fillMaxSize(),ContentScale.Crop)
      Column(Modifier.fillMaxSize().padding(horizontal=10.dp,vertical=26.dp),verticalArrangement=Arrangement.SpaceEvenly){
       (0..1).forEach{row->Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(4.dp)){(0..4).forEach{col->val n=row*5+col;val furniture=c.furniture.firstOrNull{it.id==s.furnitureSlots.getOrNull(n)}
        Column(Modifier.weight(1f).height(105.dp).background(Color(0xCB15394A),RoundedCornerShape(6.dp)).border(if(slot==n)2.dp else 1.dp,if(slot==n)Color(0xFFF2C774) else Color(0xFF7EC8BA),RoundedCornerShape(6.dp)).clickable{slot=n}.padding(3.dp),horizontalAlignment=Alignment.CenterHorizontally){
         if(furniture!=null)JourneyArt("journey_furniture",furniture.index,furniture.name,Modifier.fillMaxWidth().weight(1f)) else Spacer(Modifier.weight(1f))
         Text("${n+1}",color=Color(0xFFFFF2CF),fontSize=12.sp)
        }
       }} }
      }
     }}
     item{Row(verticalAlignment=Alignment.CenterVertically){Text("${slot+1}号陈列位",Modifier.weight(1f));TextButton(onClick={save(s.copy(furnitureSlots=s.furnitureSlots.mapIndexed{i,id->if(i==slot)null else id}))},enabled=!busy&&s.furnitureSlots[slot]!=null){Text("收起家具")}}}
     c.furniture.chunked(2).forEach{row->item{Row(horizontalArrangement=Arrangement.spacedBy(10.dp)){row.forEach{item->val owned=item.id in p.owned.furnitureIds;val equipped=item.id in s.furnitureSlots
      Card(Modifier.weight(1f)){Column(Modifier.fillMaxWidth().padding(12.dp),horizontalAlignment=Alignment.CenterHorizontally){JourneyArt("journey_furniture",item.index,item.name,Modifier.size(104.dp));Text(item.name,style=MaterialTheme.typography.titleSmall,textAlign=TextAlign.Center);Text(c.achievements.first{it.id==item.achievementId}.description,fontSize=12.sp,textAlign=TextAlign.Center)
       Button(onClick={save(s.copy(furnitureSlots=s.furnitureSlots.mapIndexed{i,id->if(i==slot)item.id else if(id==item.id)null else id}))},enabled=owned&&!busy){Text(if(!owned)"待解锁" else if(equipped)"移动到此处" else "布置")}
      }}
     }}}}
    }
    if(section=="成就") {
     items(p.achievements,key={it.id}){a->Card{Row(Modifier.fillMaxWidth().padding(12.dp),verticalAlignment=Alignment.CenterVertically){JourneyArt("journey_furniture",a.index,null,Modifier.size(76.dp));Column(Modifier.weight(1f).padding(start=10.dp)){Text(a.name,style=MaterialTheme.typography.titleMedium);Text(a.description,fontSize=13.sp);LinearProgressIndicator(progress=a.progress.toFloat()/a.target,modifier=Modifier.fillMaxWidth().padding(vertical=6.dp));Text(if(a.unlocked)"已解锁 · 头像框 / 称号 / 家具" else "${a.progress} / ${a.target}",fontSize=12.sp)}}}}
    }
    item{JourneyDailyCard(token)}
    item{Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){OutlinedButton(onClick={onNavigate("tasks")},modifier=Modifier.weight(1f)){Text("轨道计时器")};OutlinedButton(onClick={onNavigate("report")},modifier=Modifier.weight(1f)){Text("学习轨迹")}}}
   }
  }
 } }
}

@Composable private fun RewardPicker(title:String,atlas:String,items:List<JourneyItem>,owned:List<String>,selected:String?,busy:Boolean,achievements:List<JourneyAchievement>,onSelect:(String?)->Unit){
 Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
  Row(verticalAlignment=Alignment.CenterVertically){StellarSectionTitle(title,modifier=Modifier.weight(1f),motif=7);TextButton(onClick={onSelect(null)},enabled=!busy&&selected!=null){Text("卸下")}}
  LazyRow(horizontalArrangement=Arrangement.spacedBy(10.dp)){items(items,key={it.id}){item->val ready=item.id in owned;Column(Modifier.width(if(atlas=="journey_titles")180.dp else 122.dp).border(if(selected==item.id)2.dp else 1.dp,MaterialTheme.colorScheme.outline,RoundedCornerShape(8.dp)).clickable(enabled=ready&&!busy){onSelect(item.id)}.padding(8.dp),horizontalAlignment=Alignment.CenterHorizontally){
   Box(Modifier.fillMaxWidth().height(if(atlas=="journey_titles")132.dp else 95.dp),contentAlignment=Alignment.Center){JourneyArt(atlas,item.index,null,Modifier.fillMaxSize());if(atlas=="journey_titles")Text(item.name,color=Color(0xFFFFF2CF),fontSize=13.sp,modifier=Modifier.offset(y=17.dp))}
   if(atlas!="journey_titles")Text(item.name,fontSize=14.sp)
   Text(if(ready)if(selected==item.id)"已佩戴" else "佩戴" else achievements.first{it.id==item.achievementId}.description,fontSize=11.sp,textAlign=TextAlign.Center)
  }}}
 }
}

@Composable fun JourneyDailyCard(token:String,refreshKey:Any?=null){
 val context=LocalContext.current;val api=remember(token){JourneyApi(token,context.applicationContext)};val scope=rememberCoroutineScope()
 var month by remember{mutableStateOf(YearMonth.now(ZoneId.of("Asia/Shanghai")))}
 var checkedToday by remember(token){mutableStateOf(false)}
 var calendar by remember(token){mutableStateOf<JourneyCalendar?>(null)};var error by remember{mutableStateOf<String?>(null)};var busy by remember{mutableStateOf(false)}
 suspend fun read(){try{calendar=api.calendar(month.toString());checkedToday=WorkspaceApi().checkinStatus(token).hasCheckedInToday;error=null}catch(e:CancellationException){throw e}catch(e:Exception){error="日历读取失败"}}
 LaunchedEffect(token,month,refreshKey){read()}
 Card{Column(Modifier.fillMaxWidth().padding(10.dp)){
  Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){
   Column(Modifier.width(102.dp),horizontalAlignment=Alignment.CenterHorizontally){
    StellarArt("mascot_mentor",null,Modifier.size(70.dp));Text("日常打卡",style=MaterialTheme.typography.titleSmall)
    Button(onClick={scope.launch{busy=true;try{WorkspaceApi().checkin(token);read()}catch(e:CancellationException){throw e}catch(e:Exception){error=e.message?:"打卡失败"}finally{busy=false}}},enabled=!busy&&calendar!=null&&!checkedToday,contentPadding=PaddingValues(8.dp)){Text(if(checkedToday)"今日已打卡" else "打卡",fontSize=13.sp,lineHeight=18.sp)}
    Text("${calendar?.totals?.studyMinutes?:0} 分钟",fontSize=12.sp,lineHeight=17.sp)
   }
   Column(Modifier.weight(1f)){
    Row(verticalAlignment=Alignment.CenterVertically){IconButton(onClick={month=month.minusMonths(1)},modifier=Modifier.size(32.dp)){StellarArrow(Modifier.size(28.dp),StellarArrowDirection.Left)};Text("${month.year}.${month.monthValue}",Modifier.weight(1f),textAlign=TextAlign.Center,fontSize=13.sp,lineHeight=18.sp);IconButton(onClick={month=month.plusMonths(1)},modifier=Modifier.size(32.dp)){StellarArrow(Modifier.size(28.dp))}}
    Row{listOf("一","二","三","四","五","六","日").forEach{Text(it,Modifier.weight(1f),textAlign=TextAlign.Center,fontSize=11.sp,lineHeight=15.sp)}}
    val start=month.atDay(1).dayOfWeek.value-1
    (0..5).forEach{row->Row{(0..6).forEach{col->val day=row*7+col-start+1;val record=calendar?.days?.firstOrNull{it.date==month.atDay(day.coerceIn(1,month.lengthOfMonth())).toString()};val visible=day in 1..month.lengthOfMonth()
      Box(Modifier.weight(1f).height(22.dp).padding(1.dp).background(if(visible&&record?.checkedIn==true)Color(0xFFD5EDE1) else Color.Transparent,RoundedCornerShape(4.dp)),contentAlignment=Alignment.Center){Text(if(visible)day.toString() else "",fontSize=11.sp,lineHeight=15.sp,color=if(visible&&(record?.studyMinutes?:0)>0)Color(0xFF9A5C1B) else MaterialTheme.colorScheme.onSurface)}
    }}}
    Text("打卡浅绿 · 学习暖金",fontSize=10.sp,lineHeight=14.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)
   }
  }
  Text("本月 ${calendar?.totals?.completedTasks?:0} 项完成 · ${calendar?.totals?.notesCreated?:0} 篇笔记",fontSize=12.sp,lineHeight=17.sp)
  error?.let{Text(it,color=MaterialTheme.colorScheme.error,fontSize=12.sp,lineHeight=17.sp)}
 }}
}
