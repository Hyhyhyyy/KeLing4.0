"""Build editable video design frames and a provenance-preserving historical shot pack.

This is graphic composition, never application screenshot capture. Run with the
bundled workspace Python. Every frame labels its evidence status explicitly.
"""
from pathlib import Path
import argparse, csv, hashlib, html, json, re, shutil
import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
P = argparse.ArgumentParser()
P.add_argument('--output', required=True)
OUT = Path(P.parse_args().output).resolve()
MEDIA = OUT / '03_演示视频设计'
for part in ['关键帧PNG', '可编辑SVG', '素材', '历史实拍_3.2.4', '新版补录']:
    (MEDIA / part).mkdir(parents=True, exist_ok=True)
BG, FG, MINT, GOLD, MUTED, PANEL = '#10283b', '#faf5df', '#8bd9bc', '#f0c46e', '#a6bcc4', '#1b3a4e'
FONT = Path('C:/Windows/Fonts/msyh.ttc')
font = fitz.Font(fontfile=str(FONT))
assets = {}
for name in ['expedition_voyage.png','expedition_starmap.png','expedition_base.png',
             'decoration_antenna.png','decoration_archive.png','decoration_observatory.png','planet_01.png']:
    with Image.open(ROOT / 'assets/stellar' / Path(name).with_suffix('.webp')) as artwork:
        artwork.save(MEDIA / '素材' / name, format='PNG')
    assets[name] = MEDIA / '素材' / name
shots=[]
for src in sorted((ROOT/'docs/screenshots/guest-entry-2026-10-30').glob('*.png')):
    dst=MEDIA/'历史实拍_3.2.4'/src.name
    shutil.copy2(src,dst)
    px=fitz.Pixmap(str(dst))
    shots.append({'file':f'历史实拍_3.2.4/{src.name}','source':str(src.relative_to(ROOT)).replace('\\','/'),
                  'version':'3.2.4-preview','status':'历史真实截图，不是4.0.0验收',
                  'width':px.width,'height':px.height,'sha256':hashlib.sha256(dst.read_bytes()).hexdigest()})

scenes = [
 {'id':'01','start':0,'end':12,'title':'把理解变成一次远航','kicker':'课灵智学编排平台','sub':'Web × Kotlin Android · 4.0.0-preview',
  'voice':'课灵把课程资料、AI 辅导和日常学习任务连在一起。我们希望学生不仅得到答案，也能看清自己的操作，解释错误，并决定下一步怎么学。','capture':'标题使用正式美术资源，不需要伪装成应用画面。','motion':'0—2秒淡入标题，背景星点低速移动；2—12秒静稳展示。'},
 {'id':'02','start':12,'end':30,'title':'学习的断点，往往在下一步','kicker':'真实问题','sub':'资料在哪里 · 为什么错了 · 接下来做什么',
  'voice':'学生常遇到三个断点：资料散落，问答缺少依据；练习结束，只看到对错；列出计划，却没有时间落实。课灵围绕这些具体问题组织功能，不以聊天次数代替学习进展。','capture':'概念图，非用户调研统计；不得添加未经采集的满意率。','motion':'三条问题依次出现，每条停留4秒；不用快速闪烁。'},
 {'id':'03','start':30,'end':48,'title':'先体验，再决定是否保存','kicker':'免登录进入','sub':'当前端完整功能入口 · 本次数据跨模块共用 · 清空时机按端区分',
  'voice':'游客可用全部功能，本次数据跨模块共用。网页刷新、关闭或退出后清空。移动端退出试用、界面重建或进程结束后清空；未销毁时，后台返回仍保留。长期保存和跨端接续需登录。','capture':'补录4.0.0游客进入及完整功能；Web刷新清空、Android退出试用或Activity重建后清空、后台未销毁返回保留。设计稿暂放3.2.4历史实拍。','motion':'真实点击一次游客入口，停顿2秒，再展示空间提示；不加虚构鼠标点击。'},
 {'id':'04','start':48,'end':70,'title':'四个入口，连接同一段学习','kicker':'产品导航','sub':'远航 / 星图 / 基地 / 我的',
  'voice':'远航负责开始与接续练习，星图管理课程资料和目标，基地呈现学习装饰，我的收拢证据、记录和偏好。原有课程、笔记、任务、报告和模型配置仍可访问，功能之间共享当前学习上下文。','capture':'补录四个入口的实际切换，保持同一课程；本帧是导航结构设计。','motion':'每次导航停留3秒；标题移动180毫秒后静止，不做全屏晃动。'},
 {'id':'05','start':70,'end':100,'title':'用操作解释二叉树','kicker':'远航首章','sub':'3 个目标 · 18 道原创变式 · 两种核心玩法',
  'voice':'本版以二叉树为首章，设置三个目标、十八道原创变式。路线修复让学生处理遍历、栈和队列；教星芽让学生解释概念。学生既可以点选操作，也可以使用传统输入控件。任意材料目前不会自动变成已审核关卡。','capture':'补录树操作、一次输入提交及教星芽解释。题目与结果必须来自实际运行。','motion':'镜头锁定操作区；点击后停留1秒；不在关键步骤做转场。'},
 {'id':'06','start':100,'end':124,'title':'看见偏差，再试一次','kicker':'反馈与学习证据','sub':'首次偏差 → 步骤回放 → 确认反馈 → 下一题',
  'voice':'提交后，确定性规则指出首次偏差，并允许回看步骤。请求提示会记录在证据中，不能再算作完全独立完成。确认反馈后才能继续；奖励按唯一凭据发放，重复提交不会重复获奖。','capture':'补录真实错答与回放、提示标记、确认反馈、奖励流水；禁止剪接成一遍全对。','motion':'给首次偏差文字至少4秒；回放逐步推进；结算镜头静止。'},
 {'id':'07','start':124,'end':148,'title':'让每次解释有可核对的来源','kicker':'资料与知识星图','sub':'文字 / Markdown / 文字 PDF · 版本与段落定位',
  'voice':'资料导入支持文字、Markdown 和带文字层的 PDF。系统保留版本、段落和页码，先预览提取内容，再由用户确认知识点候选。材料变化后，依赖旧版本的活动和回复会被拦截，避免把过期内容当作当前依据。','capture':'补录文本PDF解析预览、候选确认、材料版本变更提示。扫描件不要假装可OCR。','motion':'从材料列表切到引用定位；高亮是编辑叠层，需保留完整原始画面。'},
 {'id':'08','start':148,'end':174,'title':'AI 在明确授权后参与','kicker':'模型配置与来源预览','sub':'17 家预设入口 · 主动获取目录 · 先预览再发送',
  'voice':'用户在明显的 Key 模块选择厂商和地域，再主动获取可用模型目录。前缀识别只给出候选，不向多家厂商试探。发送前可以检查资料和学习反馈。当前没有有效 Key，真实模型调用未实测，本演示只展示配置与请求边界，不展示虚构回答。','capture':'补录空Key界面、厂商选择、来源预览与明确的未配置提示；不要录入或暴露真实Key。','motion':'慢速展开来源预览；真实AI未实测提示保持可见，不用生成动画模拟网络成功。'},
 {'id':'09','start':174,'end':196,'title':'计划要放得进真实的一天','kicker':'日程约束编排','sub':'课程 + 已有任务 + 休息 + 每日预算',
  'voice':'制定计划时，系统同时考虑课程、已有任务、休息、时间窗和考试期限。能够安排和暂时无法安排的内容会分别呈现。用户看清变化后再确认写入，相同确认不重复添加任务。','capture':'补录有冲突的排程预览、未分配项、确认写入及再次确认去重。','motion':'时间轴先展示占用，再出现建议；停留4秒让观众读清差异。'},
 {'id':'10','start':196,'end':216,'title':'电脑整理，手机接续','kicker':'双端协作','sub':'同账号共享已提交数据 · 单一写入设备 · 冲突保留草稿',
  'voice':'相同账号共享已提交数据。进行中的远航由一个设备写入，另一端需要主动接管；离线冲突保留草稿。协议与数据库已经验证，但真实双设备验收尚未完成，正式录制需要补齐这一段实际操作。','capture':'必须补录真实Web+Android同账号接管。现有390px截图只是手机尺寸网页，不能称Android实拍。','motion':'并列画面固定同一课程，先电脑暂停再手机主动接管；不交叉伪造同步。'},
 {'id':'11','start':216,'end':232,'title':'把进步放进自己的小基地','kicker':'像素视觉与反馈','sub':'独立场景与装饰 · 低动效偏好 · 证据和自述分开',
  'voice':'基地把学习反馈变成可选择的像素装饰。两端共享六十张视觉资源，并按屏幕适配。动画响应操作，也遵守低动效设置。线下自述与可验证的练习证据分开记录，不把装饰数量等同于掌握程度。','capture':'补录购买、装备与低动效切换；本帧是正式美术素材组合，不是运行截图。','motion':'装饰轻微入场250毫秒，随后静止；不连续弹跳或用奖励遮盖学习反馈。'},
 {'id':'12','start':232,'end':250,'title':'有依据地学习，有边界地使用 AI','kicker':'交付与后续验证','sub':'可运行预览 · 可复现代码 · 明确的验证边界',
  'voice':'课灵已完成网页、Kotlin 移动端和共享服务的本轮实现。华为云模型入口可选，但当前部署是 Vercel 和 Neon，尚非原生鸿蒙。真实模型、真机与学生效果验证仍需完成。源码和试用入口已提供，欢迎从一次真实学习开始。','capture':'结束页显示真实网址；根据最终发布证据填写版本。不得添加奖项、用户量或成绩提升声明。','motion':'3秒淡入，网址至少停留8秒，最后1秒淡出。'}
]

doc=fitz.open()
def rgb(v): return tuple(int(v[i:i+2],16)/255 for i in (1,3,5))
class Frame:
    def __init__(self,s):
        self.s=s;self.page=doc.new_page(width=1920,height=1080)
        self.page.insert_font(fontname='CN',fontfile=str(FONT))
        self.svg=['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1920" height="1080" viewBox="0 0 1920 1080">']
        self.rect(0,0,1920,1080,BG)
        for x,y in [(70,250),(1830,190),(1800,850),(1630,70),(80,870),(1230,980)]:self.rect(x,y,6,6,MINT)
        self.text(96,70,'KELING / PRODUCT FILM',24,MINT)
        self.text(1310,70,'分镜设计 · 非新版运行截图',23,MUTED)
        self.text(96,150,s['kicker'],27,GOLD)
        self.text(96,228,s['title'],58,FG)
        self.text(96,292,s['sub'],28,MUTED)
    def rect(self,x,y,w,h,fill,stroke=None):
        self.page.draw_rect(fitz.Rect(x,y,x+w,y+h),fill=rgb(fill),color=rgb(stroke) if stroke else None,width=2)
        self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="2"' if stroke else '')+'/>')
    def text(self,x,y,t,size=30,color=FG):
        assert font.text_length(t,fontsize=size) <= 1920-x-50,(self.s['id'],t)
        self.page.insert_text((x,y),t,fontname='CN',fontsize=size,color=rgb(color))
        self.svg.append(f'<text x="{x}" y="{y}" fill="{color}" font-family="Microsoft YaHei, sans-serif" font-size="{size}">{html.escape(t)}</text>')
    def wrap(self,x,y,t,width,size=28,color=MUTED,leading=1.7):
        line=''
        for c in t:
            if font.text_length(line+c,fontsize=size)>width:
                self.text(x,y,line,size,color);y+=size*leading;line=''
            line+=c
        if line:self.text(x,y,line,size,color)
        return y
    def image(self,p,x,y,w,h):
        self.page.insert_image(fitz.Rect(x,y,x+w,y+h),filename=str(p),keep_proportion=True)
        rel='../'+str(p.relative_to(MEDIA)).replace('\\','/')
        self.svg.append(f'<image x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid meet" xlink:href="{html.escape(rel,quote=True)}"/>')
    def line(self,x,y,x2,y2,color=MINT):
        self.page.draw_line((x,y),(x2,y2),color=rgb(color),width=3)
        self.svg.append(f'<path d="M{x},{y} L{x2},{y2}" stroke="{color}" stroke-width="3"/>')
    def finish(self):
        s=self.s
        self.rect(96,1010,1728,4,PANEL);self.rect(96,1010,1728*s['end']/250,4,MINT)
        self.text(96,1050,f"{s['id']} / 12  ·  {s['start']//60:02}:{s['start']%60:02}—{s['end']//60:02}:{s['end']%60:02}",22,MUTED)
        self.text(1360,1050,'启衡智算 · 2026.10.30',22,MUTED)
        self.svg.append('</svg>')
        (MEDIA/'可编辑SVG'/f"KF{s['id']}.svg").write_text('\n'.join(self.svg),encoding='utf8')
        self.page.get_pixmap(matrix=fitz.Matrix(1,1),alpha=False).save(str(MEDIA/'关键帧PNG'/f"KF{s['id']}.png"))

for s in scenes:
    f=Frame(s);i=int(s['id'])
    if i==1:
        f.image(assets['expedition_voyage.png'],780,330,1040,620)
        f.text(100,465,'从资料出发',48,MINT);f.text(100,550,'在操作中理解',48,FG);f.text(100,635,'把下一步落实',48,FG)
        f.text(100,790,'这是产品视频设计稿。',26,MUTED)
        f.text(100,834,'正式成片需补录本版真实操作。',26,MUTED)
    elif i==2:
        for j,(a,b) in enumerate([('01 资料断点','来源、版本、摘录应当能被核对'),('02 理解断点','需要看见过程中的首次偏差'),('03 行动断点','任务必须放得进真实时间表')]):
            x=96+j*584;f.rect(x,400,550,410,PANEL);f.text(x+34,490,a,36,MINT);f.wrap(x+34,590,b,465,32,FG)
        f.text(96,930,'设计出发点；尚无学生对照研究，不展示虚构统计。',27,MUTED)
    elif i in (3,10):
        if i==3:
            f.image(MEDIA/'历史实拍_3.2.4/full-workspace-desktop.png',96,345,1300,590)
            f.wrap(1450,425,'历史真实截图 3.2.4',340,32,GOLD)
            f.wrap(1450,560,'新版游客入口与清空行为需要重新补录。',340,30)
        else:
            f.image(MEDIA/'历史实拍_3.2.4/full-workspace-desktop.png',96,385,1120,480)
            f.image(MEDIA/'历史实拍_3.2.4/full-workspace-mobile.png',1280,345,460,565)
            f.text(96,950,'两张均为历史网页实拍 3.2.4；右侧不是 Android 真机。新版双端接管待补录。',26,GOLD)
    elif i==4:
        for j,(a,b,im) in enumerate([('远航','动手练习与反馈','expedition_voyage.png'),('星图','资料与目标','expedition_starmap.png'),('基地','装饰与成长记录','expedition_base.png')]):
            x=96+j*584;f.image(assets[im],x,365,550,370);f.text(x,800,a,43,MINT);f.text(x,855,b,29,FG)
        f.text(96,955,'我的：学习证据、自述、偏好与原有工具',30,MUTED)
    elif i==5:
        points=[(470,460,'8'),(280,620,'3'),(660,620,'10'),(170,790,'1'),(390,790,'6')]
        for a,b in [(0,1),(0,2),(1,3),(1,4)]:f.line(points[a][0],points[a][1],points[b][0],points[b][1])
        for x,y,t in points:f.rect(x-40,y-45,80,80,PANEL,MINT);f.text(x-13,y+8,t,38,FG)
        f.text(945,450,'概念示意，非题目运行截图',30,GOLD)
        for j,t in enumerate(['选择路线与目标','操作栈 队列 或解释概念','提交后定位具体偏差','确认反馈后继续']):f.text(945,555+j*95,t,35,FG)
    elif i==6:
        for j,(a,b) in enumerate([('尝试','保留真实操作'),('定位','指出首次偏差'),('回放','逐步理解原因'),('确认','再决定下一步')]):
            x=96+j*440;f.rect(x,440,400,270,PANEL);f.text(x+28,525,a,46,MINT);f.text(x+28,620,b,27,FG)
            if j<3:f.line(x+405,575,x+430,575)
        f.wrap(96,845,'录制重点：保留错答、提示与修正过程。不得用剪辑把得到提示的操作包装为独立完成。',1650,31)
    elif i==7:
        f.image(assets['expedition_starmap.png'],96,365,880,585)
        for j,(a,b) in enumerate([('材料版本','版本变化后需重新确认引用'),('引用定位','页码 段落 UTF-16 位置 摘要'),('确认候选','标题提取结果由用户确认')]):
            f.text(1050,440+j*180,a,40,MINT);f.text(1050,505+j*180,b,27,FG)
    elif i==8:
        f.text(96,430,'配置 → 预览 → 明确发送',48,MINT)
        f.wrap(96,540,'Key 检测只提供候选，不自动向多家模型商试探。模型目录来自所选服务，权限与额度仍由服务商决定。',810,34,FG)
        f.rect(1050,390,775,430,PANEL);f.text(1090,470,'真实 AI 未实测',48,GOLD)
        f.wrap(1090,565,'当前演示只展示配置、来源与错误提示。没有有效 Key，不提供伪造回答或网络成功画面。',680,33)
        f.text(96,945,'录制时隐藏凭据、邮箱、令牌和个人资料。',29,MUTED)
    elif i==9:
        f.text(96,440,'18:30',28,MUTED);f.text(1740,440,'21:00',28,MUTED)
        f.line(96,476,1824,476,MUTED)
        for x,w,lab,c in [(96,450,'课程与已有任务',MUTED),(570,330,'休息',GOLD),(924,900,'可安排的学习单元',MINT)]:
            f.rect(x,500,w,150,PANEL,c);f.wrap(x+22,565,lab,w-42,30,FG)
        f.text(96,760,'时间轴为设计示意。',32,GOLD)
        f.text(96,820,'正式镜头需替换为真实约束预览。',32,MUTED)
        f.rect(1280,720,544,180,PANEL,MUTED)
        f.text(1310,770,'未分配清单',32,FG)
        f.text(1310,820,'不占用时间轴',28,GOLD)
        f.text(1310,865,'保留原因，待调整后重排',26,MUTED)
        f.text(96,955,'预览差异 → 用户确认 → 原子写入 → 重复确认去重',34,FG)
    elif i==11:
        f.image(assets['expedition_base.png'],96,350,1110,570)
        for j,n in enumerate(['decoration_antenna.png','decoration_archive.png','decoration_observatory.png']):f.image(assets[n],1280,340+j*205,400,205)
        f.text(96,960,'正式美术素材组合；购置与装备效果需使用真实运行画面。',25,GOLD)
    else:
        f.text(96,445,'68',78,MINT);f.text(295,445,'后端测试',32,FG)
        f.text(710,445,'78',78,MINT);f.text(910,445,'Android JVM',30,FG)
        f.text(1320,445,'60',78,MINT);f.text(1510,445,'张 PNG 资源',30,FG)
        f.text(96,600,'keling-ict-preview.vercel.app/trial',43,FG)
        f.text(96,685,'github.com/Hyhyhyyy/KeLing4.0',39,FG)
        f.wrap(96,815,'边界：真实模型、真机和学生效果尚待验证；华为接口可选，当前不是原生 HarmonyOS 或华为云部署。',1680,29,GOLD)
    f.finish()
doc.save(str(MEDIA/'视频关键帧设计稿.pdf'),garbage=4,deflate=True)
doc.close()

def stamp(ms):
    sec, millis = divmod(ms, 1000)
    return f'{sec//3600:02}:{sec%3600//60:02}:{sec%60:02},{millis:03}'

def subtitle_lines(text):
    """Break at authored clause boundaries, never inside a word or before punctuation."""
    lines=[];current=''
    for clause in re.findall(r'[^，；。！？]+[，；。！？]?',text):
        assert font.text_length(clause,fontsize=1)<=26, ('字幕语义片段过长，请调整原句',clause)
        if current and font.text_length(current+clause,fontsize=1)>26:
            lines.append(current);current=''
        current+=clause
    if current:lines.append(current)
    assert ''.join(lines)==text, ('字幕不可丢字',text)
    assert all(not re.match(r'^[，；。！？]',line) for line in lines)
    return lines

subs=[];n=1
for s in scenes:
    cues=[]
    for sentence in re.findall(r'[^。！？]+[。！？]?',s['voice']):
        lines=subtitle_lines(sentence)
        cues.extend(lines[k:k+2] for k in range(0,len(lines),2))
    total=sum(len(''.join(lines)) for lines in cues);cursor=s['start']*1000;consumed=0
    for j,lines in enumerate(cues):
        consumed+=len(''.join(lines))
        end=s['end']*1000 if j==len(cues)-1 else s['start']*1000+round((s['end']-s['start'])*1000*consumed/total)
        assert end>cursor, ('字幕时长必须为正',s['id'],lines)
        subs.append(f'{n}\n{stamp(cursor)} --> {stamp(end)}\n'+ '\n'.join(lines)+'\n');n+=1;cursor=end
(MEDIA/'旁白字幕_4分10秒.srt').write_text('\n'.join(subs),encoding='utf8')
(MEDIA/'分镜数据.json').write_text(json.dumps(scenes,ensure_ascii=False,indent=2),encoding='utf8')
with (MEDIA/'逐镜头脚本.csv').open('w',encoding='utf-8-sig',newline='') as fp:
    w=csv.DictWriter(fp,fieldnames=list(scenes[0]));w.writeheader();w.writerows(scenes)
(MEDIA/'截图来源清单.json').write_text(json.dumps({'historical_actual_shots':shots,'current_version':'4.0.0-preview','current_actual_shots':[],
 'current_actual_gifs':[],'reason':'本轮Computer Use因无法可靠确定Windows浏览器URL而停止；未绕过限制。SVG/PNG/PDF是设计合成，不是运行截图。'},ensure_ascii=False,indent=2),encoding='utf8')
brief='''# 课灵产品视频制作说明

成片目标为 4 分 10 秒，满足用户所提供必读文档的 3—5 分钟范围。当前交付是可编辑视频设计、字幕和带版本来源的历史实拍包，不是已经录制完成的提交视频。

## 视觉和剪辑

1920 × 1080，16:9，30 fps；标题与必要控件距边缘至少96 px。主色深蓝 #10283B，薄荷绿 #8BD9BC，暖金 #F0C46E，正文米白 #FAF5DF。背景延续像素原画，文字采用清晰的微软雅黑，不用像素字体承载长段技术说明。正式标题、素材、旁白字幕分轨；保留无字幕母版和带字幕交付版。

默认硬切或 180—250 ms 淡化。局部放大最多1.2倍，不能裁掉版本、状态或来源。录屏中的连续操作保留真实先后关系；等待可压缩，但标记加速倍数，不把加载缩短剪成性能结论。真实 UI 中的输入、错误、修正不能由动效伪造。鼠标高亮及解释标注属于后期叠层，原始录屏另存。

声音建议真人中文旁白，平稳解释。先按脚本试读，再在每个场景内微调；SRT时码是剪辑起稿，需对实际旁白校时。可用自有或明确授权的低音量氛围音乐，旁白响度目标约 -16 LUFS，峰值不高于 -1 dBTP；没有已授权音乐时保持旁白，不下载未经授权的配乐。关键操作不依赖声音传达。

## 素材真实性

历史实拍目录保存 3.2.4 原始 PNG，未裁剪、重绘或修改，来源与SHA256见截图来源清单。390px画面是移动尺寸网页，不是Android真机。设计稿中的场景图是本版正式美术；框图和时间轴是说明图。所有关键帧均标注为设计，正式成片须用新版真实画面替换相应位置后再审片。

本轮 Computer Use 无法可靠确认 Windows 浏览器 URL，工具已停止；没有绕过此限制，故新版截图与真实操作动图尚未采集。不得把历史截图改版本号、用AI重绘UI、或把设计逐帧图输出为“真实操作GIF”。

## 新版采集规范

使用4.0.0-preview Web及同版APK，记录源码提交、APK SHA256、系统、浏览器/设备、窗口尺寸、缩放、账号/游客模式与采集时间。演示账号仅含自行构造的学习资料；真实Key、令牌、邮箱和个人资料不得出现在录制画面。

桌面视口建议1440×900或1920×1080，手机网页390×844；另验320px宽和200%字号。Android需真实设备或明确标注的模拟器，不把网页响应式截图当移动App。录屏保留30fps原始MP4，截图PNG无有损压缩。GIF仅用于8—15秒短操作说明，10—15fps，边长960px；正式视频使用原始录屏以保证清晰度。

补录逐镜头要求见逐镜头脚本CSV中的capture。必须覆盖：游客进入与清空、首章错答和提示、回放确认、材料版本失效、无Key边界、排程冲突与去重、双端主动接管、基地装备。真实AI尚无有效Key，只展示配置及未配置提示；不得用合成模型响应冒充真实回答。

## 工程文件

可编辑SVG保留文字与独立图像对象，旁边素材和历史实拍目录不可改相对位置。PNG是1920×1080设计预览，PDF是12页评审用分镜设计。分镜JSON和CSV可供剪映、Premiere或DaVinci重建时间线；SRT可直接导入后校时。它们不包含软件专用工程文件，也不包含最终音频或最终演示MP4。
'''
(MEDIA/'视频制作说明.md').write_text(brief,encoding='utf8')
(MEDIA/'新版补录/待补录说明.md').write_text('新版真实截图与动图尚未采集。按上级逐镜头脚本补录；此空目录不是已完成证明。\n',encoding='utf8')
print(json.dumps({'keyframes':12,'editable_svgs':12,'pdf_pages':12,'subtitle_cues':n-1,'historical_actual_pngs':len(shots),'current_actual_pngs':0,'duration_seconds':250,'output':str(MEDIA)},ensure_ascii=False))
