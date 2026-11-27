package com.keling.app.journey

import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.keling.app.ui.components.*
import kotlinx.coroutines.delay

private val prologue=listOf(
 "欢迎登舰，探索者" to "我是星芽。这里是课灵。每一门学科，都有一片值得探索的天地。那些暂时没弄懂的问题，就是我们接下来要去的地方。",
 "星图，等你添上下一笔" to "远处，是数学的几何群山、英语的书页城堡、历史的文明遗迹……每一个问题，都会成为新的坐标。",
 "第一站，想去哪里" to "写下你想学的学科，再告诉我你的起点和目标。新的知识星球上，学习区域逐一点亮，第一条航线等待启程。",
 "第一颗星球，由你选择" to "让我们一起一步一步探索这个知识星球的每一方寸文明！"
)
@Composable fun StoryDialog(onClose:()->Unit){
 val context=LocalContext.current
 val reduce=remember{Settings.Global.getFloat(context.contentResolver,Settings.Global.ANIMATOR_DURATION_SCALE,1f)==0f}
 var scene by remember{mutableIntStateOf(0)}
 val text=prologue[scene].second
 var count by remember(scene){mutableIntStateOf(if(reduce)text.length else 0)}
 var cursor by remember{mutableStateOf(true)}
 LaunchedEffect(scene,reduce){if(!reduce){while(count<text.length){delay(42);count++}}}
 LaunchedEffect(reduce){if(!reduce){while(true){delay(550);cursor=!cursor}}}
 Dialog(onDismissRequest=onClose,properties=DialogProperties(usePlatformDefaultWidth=false)){
  Surface(Modifier.fillMaxWidth(.94f).aspectRatio(1122f/1402f),color=Color(0xFF102D43),shape=androidx.compose.foundation.shape.RoundedCornerShape(18.dp)){
   Box{
    StellarArt("story_cockpit_mobile",null,Modifier.fillMaxSize(),ContentScale.FillBounds)
    Column(Modifier.fillMaxSize().padding(horizontal=28.dp,vertical=24.dp),horizontalAlignment=Alignment.CenterHorizontally){
     Text("序章 ${scene+1} / 4",color=Color(0xFF9CDACB),fontSize=14.sp)
     Text(prologue[scene].first,color=Color(0xFFFFF2D5),style=MaterialTheme.typography.headlineSmall,textAlign=TextAlign.Center,modifier=Modifier.padding(vertical=12.dp))
     Column(Modifier.weight(1f).verticalScroll(rememberScrollState())){
      Text(text.take(count)+if(cursor)"▏" else " ",color=Color(0xFFFFF2D5),fontSize=19.sp,lineHeight=31.sp)
     }
     Button(onClick={if(count<text.length)count=text.length else if(scene<3)scene++ else onClose()},colors=ButtonDefaults.buttonColors(containerColor=Color(0xFFF1CC7A),contentColor=Color(0xFF183B47)),modifier=Modifier.fillMaxWidth()){
      Text(if(count<text.length)"显示全文" else if(scene<3)"继续航行" else "选择第一颗星球");StellarArrow(Modifier.size(28.dp))
     }
     Row(verticalAlignment=Alignment.CenterVertically){TextButton(onClick=onClose){Text("跳过故事",color=Color(0xFFFFF2D5))};UsageGuideButton(dark=true)}
    }
   }
  }
 }
}
