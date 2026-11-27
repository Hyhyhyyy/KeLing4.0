export const JOURNEY_NOTE_TYPE = 'JOURNEY_PROFILE_INTERNAL';
export const JOURNEY_VERSION = 1;
export type JourneyMetric = 'planetsCreated' | 'tasksCompleted' | 'notesCreated' | 'knowledgeNodes' | 'studyMinutes' | 'checkinDays';
export type JourneyFacts = Record<JourneyMetric, number>;
export type JourneyItem = { id: string; name: string; index: number; achievementId: string | null };
export type JourneyAchievement = { id: string; name: string; description: string; metric: JourneyMetric; target: number; index: number; frameId: string; titleId: string; furnitureId: string };
export const JOURNEY_ACHIEVEMENTS: JourneyAchievement[] = [
  ['first_planet','启航探索者','创建第一颗知识星球','planetsCreated',1],
  ['first_task','行动新星','完成第一个学习任务','tasksCompleted',1],
  ['first_note','航行记录员','保存第一篇学习笔记','notesCreated',1],
  ['ten_nodes','星图绘制师','整理10个知识点','knowledgeNodes',10],
  ['first_hour','专注新秀','累计记录学习1小时','studyMinutes',60],
  ['three_checkins','归航伙伴','累计打卡3天','checkinDays',3],
  ['ten_tasks','航线领航员','累计完成10个学习任务','tasksCompleted',10],
  ['five_notes','知识收藏家','保存5篇学习笔记','notesCreated',5],
  ['ten_hours','星际研习者','累计记录学习10小时','studyMinutes',600],
  ['hundred_hours','百时远航家','累计记录6000分钟（100小时）','studyMinutes',6000],
].map((row,index)=>({id:row[0] as string,name:row[1] as string,description:row[2] as string,metric:row[3] as JourneyMetric,target:row[4] as number,index,frameId:`frame-${index}`,titleId:`title-${index}`,furnitureId:`furniture-${index}`}));
const items=(names:string[],prefix:string):JourneyItem[]=>names.map((name,index)=>({id:`${prefix}-${index}`,name,index,achievementId:JOURNEY_ACHIEVEMENTS[index].id}));
export const JOURNEY_AVATARS: JourneyItem[] = ['星芽领航员','赤狐探索者','星猫档案员','月兔观察员','星光伙伴','星海音乐家','薄荷宇航员','珊瑚宇航员','行星园丁','银河绘图师'].map((name,index)=>({id:`avatar-${index}`,name,index,achievementId:null}));
export const JOURNEY_FRAMES=items(['萌芽舷窗','羽翼罗盘','书卷羽笔','星座仪表','轨道时钟','三星枝叶','领航桂冠','晶体档案','月亮天文','百时远航'],'frame');
export const JOURNEY_TITLES=items(JOURNEY_ACHIEVEMENTS.map(a=>a.name),'title');
export const JOURNEY_FURNITURE=items(['萌芽台灯','领航座椅','书页书桌','星座全息台','沙漏计时器','发光盆栽','星图书柜','晶体档案柜','天文望远镜','星环天体仪'],'furniture');
export const JOURNEY_CATALOG={version:1,avatars:JOURNEY_AVATARS,frames:JOURNEY_FRAMES,titles:JOURNEY_TITLES,furniture:JOURNEY_FURNITURE,achievements:JOURNEY_ACHIEVEMENTS,slots:10,atlases:{avatars:'journey_avatars',frames:'journey_frames',titles:'journey_titles',furniture:'journey_furniture',columns:5,rows:2}};
export type JourneyState={version:1;revision:number;avatarId:string;frameId:string|null;titleId:string|null;furnitureSlots:(string|null)[];unlockedAchievementIds:string[]};
export type JourneyProgress=JourneyAchievement & {progress:number;unlocked:boolean};
export type JourneyProfile={state:JourneyState;facts:JourneyFacts;achievements:JourneyProgress[];owned:{frameIds:string[];titleIds:string[];furnitureIds:string[]}};
export type JourneyPatch={expectedRevision:number;avatarId?:string;frameId?:string|null;titleId?:string|null;furnitureSlots?:(string|null)[]};
export type JourneyDay={date:string;checkedIn:boolean;studyMinutes:number;completedTasks:number;notesCreated:number};
export type JourneyCalendar={month:string;timezone:'Asia/Shanghai';days:JourneyDay[];totals:{studyMinutes:number;completedTasks:number;checkinDays:number;notesCreated:number}};
export function emptyJourneyFacts():JourneyFacts{return {planetsCreated:0,tasksCompleted:0,notesCreated:0,knowledgeNodes:0,studyMinutes:0,checkinDays:0};}
export function emptyJourneyState():JourneyState{return {version:1,revision:0,avatarId:'avatar-0',frameId:null,titleId:null,furnitureSlots:Array(10).fill(null),unlockedAchievementIds:[]};}
export function journeyProfile(state:JourneyState,facts:JourneyFacts):JourneyProfile{
 const normalized={...facts};for(const key of Object.keys(normalized) as JourneyMetric[])normalized[key]=Number.isFinite(normalized[key])?Math.max(0,Math.floor(normalized[key])):0;
 const unlocked=new Set(state.unlockedAchievementIds);
 JOURNEY_ACHIEVEMENTS.forEach(a=>{if(normalized[a.metric]>=a.target)unlocked.add(a.id);});
 const next={...state,unlockedAchievementIds:JOURNEY_ACHIEVEMENTS.filter(a=>unlocked.has(a.id)).map(a=>a.id)};
 const owned=(list:JourneyItem[])=>list.filter(i=>i.achievementId&&unlocked.has(i.achievementId)).map(i=>i.id);
 return {state:next,facts:normalized,achievements:JOURNEY_ACHIEVEMENTS.map(a=>({...a,progress:Math.min(a.target,normalized[a.metric]),unlocked:unlocked.has(a.id)})),owned:{frameIds:owned(JOURNEY_FRAMES),titleIds:owned(JOURNEY_TITLES),furnitureIds:owned(JOURNEY_FURNITURE)}};
}
export class JourneyError extends Error {constructor(public code:string,message:string,public status=400){super(message);}}
export function applyJourneyPatch(profile:JourneyProfile,input:JourneyPatch):JourneyState{
 if(input.expectedRevision!==profile.state.revision)throw new JourneyError('REVISION_CONFLICT','装扮已在另一端更新，请重新读取',409);
 const next=JSON.parse(JSON.stringify(profile.state)) as JourneyState;
 if(input.avatarId!==undefined){if(!JOURNEY_AVATARS.some(a=>a.id===input.avatarId))throw new JourneyError('INVALID_AVATAR','请选择已有形象');next.avatarId=input.avatarId;}
 for(const key of ['frameId','titleId'] as const){const value=input[key];if(value===undefined)continue;const owned=key==='frameId'?profile.owned.frameIds:profile.owned.titleIds;if(value!==null&&!owned.includes(value))throw new JourneyError('LOCKED_REWARD','完成对应成就后解锁',403);next[key]=value;}
 if(input.furnitureSlots!==undefined){if(input.furnitureSlots.length!==10)throw new JourneyError('INVALID_SLOTS','家园有10个陈列位置');const ids=input.furnitureSlots.filter((x):x is string=>x!==null);if(new Set(ids).size!==ids.length)throw new JourneyError('DUPLICATE_FURNITURE','同一件家具只能陈列一次');if(ids.some(id=>!profile.owned.furnitureIds.includes(id)))throw new JourneyError('LOCKED_REWARD','完成对应成就后解锁家具',403);next.furnitureSlots=[...input.furnitureSlots];}
 if(JSON.stringify(next)!==JSON.stringify(profile.state))next.revision++;
 return next;
}
export function journeyDate(date:Date|string):string{return new Date(new Date(date).getTime()+8*3600000).toISOString().slice(0,10);}
