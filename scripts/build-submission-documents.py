"""Author two DOCX files by patching copies of the supplied template packages.

Private team metadata is read from a local JSON file, never embedded in this
public builder. Preserves all template parts except documented editable parts.
Run only after the documents skill authoring marker and template distillation.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from copy import deepcopy
import argparse, hashlib, html, json, re
from lxml import etree as E
import fitz

P=argparse.ArgumentParser();P.add_argument('--work',required=True);P.add_argument('--output',required=True);P.add_argument('--metadata',required=True)
A=P.parse_args();WORK=Path(A.work).resolve();OUT=Path(A.output).resolve();META=json.loads(Path(A.metadata).read_text(encoding='utf-8-sig'))
ROOT=Path(__file__).resolve().parents[1];DRAFT=ROOT/'.cache/submission-drafts';OUT.mkdir(parents=True,exist_ok=True)
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
W=NS['w']; R=NS['r']; PR='http://schemas.openxmlformats.org/package/2006/relationships'
def q(s):return '{'+W+'}'+s
def el(name,**attrs):return E.Element(q(name),{q(k):str(v) for k,v in attrs.items()})

FIG=WORK/'figures';FIG.mkdir(exist_ok=True)
FONT=Path('C:/Windows/Fonts/msyh.ttc')
class Diagram:
    def __init__(self,name,h=900):
        self.name=name;self.h=h;self.d=fitz.open();self.p=self.d.new_page(width=1300,height=h);self.p.insert_font(fontname='C',fontfile=str(FONT))
        self.svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="{h}"><rect width="1300" height="{h}" fill="white"/>']
    def txt(self,x,y,t,size=30):
        self.p.insert_text((x,y),t,fontname='C',fontsize=size,color=(.04,.1,.15))
        self.svg.append(f'<text x="{x}" y="{y}" font-size="{size}" font-family="Microsoft YaHei" fill="#10283b">{html.escape(t)}</text>')
    def box(self,x,y,w,h,lines,fill=(.93,.96,.95)):
        self.p.draw_rect(fitz.Rect(x,y,x+w,y+h),color=(.3,.45,.44),fill=fill,width=2)
        col='#'+''.join(f'{round(v*255):02x}' for v in fill)
        self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" stroke="#4c7370" fill="{col}" stroke-width="2"/>')
        for j,t in enumerate(lines):self.txt(x+18,y+43+j*42,t,29)
    def arrow(self,x,y,x2,y2,dash=False):
        self.p.draw_line((x,y),(x2,y2),color=(.2,.35,.4),width=2.5,dashes='[8 7] 0' if dash else None)
        self.svg.append(f'<path d="M{x},{y} L{x2},{y2}" stroke="#335966" stroke-width="2.5" '+('stroke-dasharray="8 7"' if dash else '')+'/>')
        if x==x2:
            d=10 if y2>y else -10;a,b=(x2-7,y2-d),(x2+7,y2-d)
        else:
            d=10 if x2>x else -10;a,b=(x2-d,y2-7),(x2-d,y2+7)
        for z in [a,b]:self.p.draw_line(z,(x2,y2),color=(.2,.35,.4),width=2.5)
        self.svg.append(f'<path d="M{a[0]},{a[1]} L{x2},{y2} L{b[0]},{b[1]}" fill="none" stroke="#335966" stroke-width="2.5"/>')
    def save(self):
        self.svg.append('</svg>');(FIG/(self.name+'.svg')).write_text('\n'.join(self.svg),encoding='utf8')
        self.p.get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False).save(str(FIG/(self.name+'.png')));self.d.close()
    def route(self,points,dash=False):
        for a,b in zip(points[:-2],points[1:-1]):
            self.p.draw_line(a,b,color=(.2,.35,.4),width=2.5,dashes='[8 7] 0' if dash else None)
            self.svg.append(f'<path d="M{a[0]},{a[1]} L{b[0]},{b[1]}" stroke="#335966" stroke-width="2.5" '+('stroke-dasharray="8 7"' if dash else '')+'/>')
        self.arrow(*points[-2],*points[-1],dash)

g=Diagram('feature-map',760)
g.box(400,10,500,85,['课灵学习工作区'])
for j,(head,lines) in enumerate([
 ('端侧交互',['Web 资料整理与过程回看','Android 触控与随身接续','远航  星图  基地  我的','游客内存  账号共享']),
 ('云侧业务与规则',['身份  资料版本  来源位置','任务  排程  学习过程','幂等回执  单设备写入','证据  自述  奖励流水']),
 ('智侧辅助',['明确选择的模型服务','先预览资料  再发送','解释建议  计划草案','引用与输出结构校验'])]):
 x=20+j*430;g.route([(650,95),(650,130),(x+200,130),(x+200,160)]);g.box(x,160,400,320,[head]+lines)
g.txt(35,555,'资料与作答 → 反馈与记录 → 用户确认 → 下一步学习',32)
g.txt(35,625,'模型不能直接写入任务、发放奖励或认定知识掌握',30)
g.txt(35,695,'游客使用相同界面与规则；退出后不恢复本次内存',29);g.save()

g=Diagram('architecture',1080)
for x,t in [(20,'端侧'),(450,'云侧  实际部署'),(880,'智侧  受控接入')]:g.txt(x,45,t,32)
g.box(20,80,380,140,['浏览器 Web / PWA','React + TypeScript'])
g.box(20,270,380,180,['Android 手机','Kotlin + Compose','非原生 HarmonyOS'])
g.box(20,660,380,180,['设备本地','账号草稿与待发操作','游客仅本次内存'])
g.box(450,80,380,140,['Vercel','静态资源与 Node API'])
g.box(450,300,380,180,['Express 业务服务','权限 版本 确认','资料 排程 远征 结算'])
g.box(450,580,380,180,['Neon PostgreSQL','Prisma 事务与唯一约束','账号数据与证据流水'])
g.box(20,875,380,105,['共享规则与18题','Kotlin 同样例镜像'])
g.box(880,300,400,180,['模型适配与校验','所选片段  引用  结构','不直接写业务数据库'])
g.box(880,80,400,140,['所选模型服务','本版无有效 Key 实测'])
g.box(880,580,400,180,['华为云 MaaS','AgentArts 可选适配','本次真实运行未验证'],(.97,.96,.92))
g.arrow(400,150,450,150);g.arrow(400,365,450,365);g.arrow(640,220,640,300);g.arrow(640,480,640,580)
g.arrow(830,390,880,390);g.arrow(1080,300,1080,220);g.arrow(1080,480,1080,580,True)
g.arrow(210,450,210,660)
g.arrow(400,920,425,920,True);g.arrow(425,920,425,465,True);g.arrow(425,465,450,465,True)
g.txt(20,1035,'实线为已实现接口；虚线为适配或规则依赖，均不代表真实模型或设备已验收',25);g.save()

lanes=['学习者','Web 客户端','云端规则','模型服务','Android 客户端']
flows=[('flow-materials','资料与计划',[(0,0,['选择课程与资料']),(1,0,['解析预览']),(2,0,['版本与片段校验']),(0,1,['确认保存与候选']),(2,1,['保存不可变版本']),(0,2,['填写时间条件']),(1,2,['排程差异预览']),(2,2,['避开课表与任务']),(0,3,['确认计划']),(2,3,['一次性写入任务'])]),
 ('flow-learning','作答与可选辅导',[(0,0,['操作或解释']),(1,0,['保存尝试与提示']),(2,0,['规则反馈']),(0,1,['阅读反馈','填写下一步']),(2,1,['过程与证据','唯一奖励结算']),(0,2,['可选 求助']),(1,2,['记提示 预览来源','明确发送']),(3,2,['可选 AI 建议']),(2,3,['重新核对来源']),(1,3,['带引用的建议']),(0,3,['决定是否修订'])]),
 ('flow-resume','跨端接续与回访',[(0,0,['网页暂停']),(1,0,['保留草稿']),(2,0,['保存当前状态']),(4,1,['读取同账号远征']),(0,1,['主动接管']),(2,1,['推进租约代次']),(1,2,['旧操作拒绝','保留冲突草稿']),(4,2,['继续作答并确认']),(2,2,['权威状态与回执']),(0,3,['回访或基地建设']),(2,3,['实践与严格证据','按审核状态区分'])])]
for name,title,events in flows:
 g=Diagram(name,1010)
 for j,l in enumerate(lanes):
  x=10+j*258;g.box(x,35,248,80,[l],(.9,.93,.94))
  g.p.draw_line((x+124,115),(x+124,900),color=(.75,.8,.8),width=1)
  g.svg.append(f'<path d="M{x+124},115 L{x+124},900" stroke="#c0cccc"/>')
 for lane,row,lines in events:g.box(16+lane*258,170+row*180,236,120,lines)
 edges={
  'flow-materials':[((0,0),(1,0)),((1,0),(2,0)),((2,0),(0,1)),((0,1),(2,1)),((2,1),(0,2)),((0,2),(1,2)),((1,2),(2,2)),((2,2),(0,3)),((0,3),(2,3))],
  'flow-learning':[((0,0),(1,0)),((1,0),(2,0)),((2,0),(0,1)),((0,1),(2,1)),((0,2),(1,2)),((1,2),(3,2)),((3,2),(2,3)),((2,3),(1,3)),((1,3),(0,3))],
  'flow-resume':[((0,0),(1,0)),((1,0),(2,0)),((2,0),(4,1)),((4,1),(0,1)),((0,1),(2,1)),((2,1),(2,2)),((2,2),(1,2)),((2,2),(4,2)),((4,2),(0,3)),((0,3),(2,3))]
 }[name]
 for a,b in edges:
  x1=134+a[0]*258;x2=134+b[0]*258;y1=230+a[1]*180;y2=230+b[1]*180
  occupied=any(row==a[1] and min(a[0],b[0])<lane<max(a[0],b[0]) for lane,row,_ in events)
  if a[1]==b[1] and not occupied:
   direction=1 if x2>x1 else -1;g.arrow(x1+118*direction,y1,x2-118*direction,y2)
  elif a[1]==b[1]:g.route([(x1,y1+60),(x1,y1+84),(x2,y2+84),(x2,y2+60)])
  else:g.route([(x1,y1+60),(x1,y1+90),(x2,y1+90),(x2,y2-60)])
 g.txt(20,950,title+'  自上而下阅读；同一行表示请求与响应阶段',27);g.save()

def text_of(p):return ''.join(p.xpath('.//w:t/text()',namespaces=NS))
evidence=[]
for kind,label in [('requirements','需求文档'),('technical','技术设计')]:
    ref=WORK/kind/'reference.docx';contract=WORK/kind/'artifact.md'
    assert contract.exists(),'Template contract missing'
    with ZipFile(ref) as z:parts={n:z.read(n) for n in z.namelist()}
    original=dict(parts);tree=E.fromstring(parts['word/document.xml']);body=tree.find('w:body',NS)
    paras=body.findall('w:p',NS);section=deepcopy(body.find('w:sectPr',NS))
    title_proto=paras[0];body_proto=next(p for p in paras if text_of(p).startswith('撰写指南'))
    h1_proto=next(p for p in paras if re.match(r'1[.． ]',text_of(p)))
    for child in list(body):body.remove(child)
    def para(text,role='body',keep=False):
        proto=title_proto if role=='title' else h1_proto if role=='h1' else body_proto
        p=E.Element(q('p'));pr=deepcopy(proto.find('w:pPr',NS))
        if pr is None:pr=el('pPr')
        for n in ['pBdr','numPr','ind','rPr']:
            for c in pr.findall('w:'+n,NS):pr.remove(c)
        style=pr.find('w:pStyle',NS)
        if style is not None:pr.remove(style)
        if role=='title':pr.insert(0,el('pStyle',val='9'))
        elif role in ['h1','h2']:pr.insert(0,el('pStyle',val='3' if role=='h1' else '4'))
        if role in ['title','h1','h2','caption'] or keep:pr.append(el('keepNext'))
        pr.append(el('widowControl'))
        if role=='h2':
            sp=pr.find('w:spacing',NS)
            if sp is not None:sp.set(q('before'),'180');sp.set(q('after'),'90')
        if role=='code':
            sp=pr.find('w:spacing',NS)
            if sp is None:sp=el('spacing');pr.append(sp)
            sp.set(q('before'),'0');sp.set(q('after'),'0');sp.set(q('line'),'240')
        if role in ['meta','caption']:
            jc=pr.find('w:jc',NS)
            if jc is None:pr.append(el('jc',val='center'))
            else:jc.set(q('val'),'center')
        p.append(pr);r=el('r');rp=el('rPr')
        rp.append(el('rFonts',ascii='Consolas' if role=='code' else 'Cambria',hAnsi='Consolas' if role=='code' else 'Cambria',eastAsia='宋体'))
        sz={'title':52,'h1':40,'h2':30,'code':21,'caption':22}.get(role,24)
        rp.append(el('sz',val=sz));rp.append(el('szCs',val=sz));rp.append(el('color',val='000000'))
        if role=='h2':rp.append(el('b'))
        r.append(rp);t=el('t');t.set('{http://www.w3.org/XML/1998/namespace}space','preserve');t.text=text;r.append(t);p.append(r);return p
    def add(t,role='body',keep=False):p=para(t,role,keep);body.append(p);return p
    def plain(t):return re.sub(r'`([^`]+)`|\*\*([^*]+)\*\*',lambda m:m.group(1) or m.group(2),t)
    def table(rows):
        tbl=el('tbl');pr=el('tblPr');pr.append(el('tblW',w=9360,type='dxa'));pr.append(el('tblLayout',type='fixed'))
        borders=el('tblBorders')
        for b in ['top','left','bottom','right','insideH','insideV']:borders.append(el(b,val='single',sz=4,color='000000'))
        pr.append(borders);mar=el('tblCellMar')
        for side in ['top','left','bottom','right']:mar.append(el(side,w=90,type='dxa'))
        pr.append(mar);tbl.append(pr);grid=el('tblGrid');count=len(rows[0])
        widths=([2800,2700,3860] if rows[0][0]=='数据对象' else [3500,2350,3510] if rows[0][0]=='接口' else [1500,2800,5060]) if count==3 else [9360//count]*count
        for width in widths:grid.append(el('gridCol',w=width))
        tbl.append(grid)
        for index,row in enumerate(rows):
            tr=el('tr');trp=el('trPr');trp.append(el('cantSplit'))
            if index==0:trp.append(el('tblHeader'))
            tr.append(trp)
            for col,(value,width) in enumerate(zip(row,widths)):
                tc=el('tc');tcp=el('tcPr');tcp.append(el('tcW',w=width,type='dxa'));tcp.append(el('vAlign',val='center'))
                if index==0:tcp.append(el('shd',val='clear',fill='E7E6E6'))
                tc.append(tcp);p=para(plain(value));sp=p.find('w:pPr/w:spacing',NS)
                if sp is not None:sp.set(q('after'),'40');sp.set(q('before'),'40')
                if index==0:p.find('w:r/w:rPr',NS).append(el('b'))
                if index>0 and col==0 and rows[0][0]=='接口':
                    rp=p.find('w:r/w:rPr',NS)
                    rp.find('w:sz',NS).set(q('val'),'21');rp.find('w:szCs',NS).set(q('val'),'21')
                    rp.find('w:rFonts',NS).set(q('ascii'),'Consolas');rp.find('w:rFonts',NS).set(q('hAnsi'),'Consolas')
                    method,path=value.split(' ',1);segments=path.split('/');parts_text=[method];line=''
                    for seg in segments:
                        if not seg:continue
                        token='/'+seg
                        if len(line)+len(token)>28:parts_text.append(line);line=token
                        else:line+=token
                    if line:parts_text.append(line)
                    run=p.find('w:r',NS)
                    for item in list(run):
                        if item.tag!=q('rPr'):run.remove(item)
                    for j,txt in enumerate(parts_text):
                        if j:run.append(el('br'))
                        node=el('t');node.text=txt;run.append(node)
                tc.append(p);tr.append(tc)
            tbl.append(tr)
        body.append(tbl);add('')
    image_index=0
    rels=E.fromstring(parts['word/_rels/document.xml.rels']);types=E.fromstring(parts['[Content_Types].xml'])
    if not any(x.get('Extension')=='png' for x in types):E.SubElement(types,'{http://schemas.openxmlformats.org/package/2006/content-types}Default',Extension='png',ContentType='image/png')
    def figure(name,caption):
        nonlocal_dummy=None
        global_image=str(len(rels)+100);rid='rIdSubmission'+global_image;path=FIG/(name+'.png')
        px=fitz.Pixmap(str(path));cx=5943600;cy=round(cx*px.height/px.width)
        E.SubElement(rels,'{'+PR+'}Relationship',Id=rid,Type=R+'/image',Target='media/submission-'+name+'.png')
        parts['word/media/submission-'+name+'.png']=path.read_bytes()
        p=para('','body',True);r=p.find('w:r',NS)
        for c in list(r):
            if c.tag!=q('rPr'):r.remove(c)
        xml=f'''<w:drawing xmlns:w="{W}" xmlns:r="{R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><wp:inline><wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="{global_image}" name="{name}" descr="{caption}"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="{name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>'''
        r.append(E.fromstring(xml));body.append(p);cap=add(caption,'caption');kn=cap.find('w:pPr/w:keepNext',NS)
        if kn is not None:cap.find('w:pPr',NS).remove(kn)
    add('课灵智学编排平台','title');add(label,'title')
    add('团队名称：'+META['team']);add('学校：'+META['school']);add('团队成员与专业：')
    for student in META['students']:add(student)
    add('指导老师：'+META['teacher']);add('文档版本 V2.0　产品版本 4.0.0-preview','meta');add('2026年10月30日','meta')
    lines=(DRAFT/(kind+'.md')).read_text(encoding='utf-8-sig').splitlines();i=0;in_code=False;inserted=set()
    while i<len(lines):
        t=lines[i].strip();i+=1
        if not t or t.startswith('# ') or re.match(r'^(产品版本|版本 |日期 )',t):continue
        if t.startswith('```'):in_code=not in_code;continue
        if in_code:add(lines[i-1],'code',i<len(lines) and not lines[i].strip().startswith('```'));continue
        if t.startswith('|'):
            rowlines=[t]
            while i<len(lines) and lines[i].strip().startswith('|'):rowlines.append(lines[i].strip());i+=1
            rows=[[x.strip() for x in l.strip('|').split('|')] for l in rowlines]
            rows=[r for r in rows if not all(re.fullmatch('[: -]+',x) for x in r)];table(rows);continue
        if t.startswith('## '):
            add(t[3:],'h1')
            if kind=='requirements' and t.startswith('## 3 '):figure('feature-map','图1 课灵端云智功能结构')
            continue
        if t.startswith('### '):
            add(t[4:],'h2')
            if kind=='requirements' and t.startswith('### 4.1 '):figure('flow-materials','图2a 资料确认与时间约束计划')
            if kind=='requirements' and t.startswith('### 4.2 '):figure('flow-resume','图2c 同账号跨端接续与回访')
            continue
        if kind=='technical' and t=='图1 课灵端云智架构':figure('architecture','图1 课灵端云智架构');continue
        add(plain(t))
        if kind=='requirements' and t.startswith('学生填写未来一周'):figure('flow-learning','图2b 操作反馈与可选模型辅导')
    body.append(section)
    styles=E.fromstring(parts['word/styles.xml'])
    for st in styles.findall('w:style',NS):
        if st.get(q('styleId')) in ['2','3','4','5','6','7','8','9']:
            rp=st.find('w:rPr',NS)
            if rp is None:rp=el('rPr');st.append(rp)
            co=rp.find('w:color',NS)
            if co is None:co=el('color');rp.append(co)
            co.attrib.clear();co.set(q('val'),'000000')
    for name,node in [('word/document.xml',tree),('word/styles.xml',styles),('word/_rels/document.xml.rels',rels),('[Content_Types].xml',types)]:parts[name]=E.tostring(node,encoding='UTF-8',xml_declaration=True,standalone=True)
    filename=('附件4 ' if kind=='requirements' else '附件5 ')+'课灵智学编排平台'+label+' V2.0.docx';target=OUT/filename
    with ZipFile(target,'w',ZIP_DEFLATED) as z:
        for name,data in parts.items():z.writestr(name,data)
    changed=[n for n in original if original[n]!=parts[n]];allowed=['word/document.xml','word/styles.xml','word/_rels/document.xml.rels','[Content_Types].xml']
    assert set(changed)<=set(allowed)
    assert E.tostring(section)==E.tostring(E.fromstring(parts['word/document.xml']).find('w:body/w:sectPr',NS))
    evidence.append({'kind':kind,'file':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'reference_sha256':hashlib.sha256(ref.read_bytes()).hexdigest(),'changed_template_parts':changed,'preserved_template_parts':len(original)-len(changed),'figures':len([n for n in parts if n.startswith('word/media/submission-')])})
(WORK/'authoring-evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(evidence,ensure_ascii=False))
