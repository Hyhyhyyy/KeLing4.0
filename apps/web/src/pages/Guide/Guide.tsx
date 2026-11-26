import { Link } from 'react-router-dom';
import { ModuleTitle, SectionTitle, type TitleKind } from '../../components/ModuleTitle';
import { NavigationArrow } from '../../components/NavigationArrow';
import { appPath } from '../../services/appPath';
import { useAppStore } from '../../store/useAppStore';
import './Guide.css';

const modules: { id: string; title: string; kind: TitleKind; route: string; action: string; steps: string[]; result: string }[] = [
  {
    id: 'voyage', title: '远航 · 做一次练习', kind: 'voyage', route: '/voyage', action: '打开远航',
    steps: [
      '在「学习星球」选择课程。没有课程时，点「创建示例课程」。当前远航使用二叉树示例章节。',
      '选 10 分钟做路线修复，20 分钟教星芽，或 25 分钟综合试炼。有未结束的远征时，先点「继续」。',
      '阅读题目与来源，操作队列、栈或输入访问顺序；教星芽时写下自己的解释并自核，然后点「提交作答」。',
      '阅读反馈，填写「下一步」并保存。需要保留自己的解释时，勾选「保存到星芽自述档案」。',
    ],
    result: '作答留在本轮记录中；学习证据可回看来源与结果。使用提示后不计独立证据，自述不等于知识已验证。',
  },
  {
    id: 'courses', title: '星图 · 整理课程资料', kind: 'courses', route: '/greenhouse', action: '打开星图',
    steps: [
      '打开「星图」，创建或选择课程。在课程详情可添加知识节点、打开知识图谱或带着课程问 AI。',
      '点「进入二叉树示例章节」，找到「课程资料」，展开「导入资料」。填写标题，选择 TXT、Markdown、文字 PDF，或直接粘贴原文。',
      '点「上传到课灵并预览」，核对解析内容后点「保存资料」。文件上限 512 KiB，PDF 最多 50 页，原文最多 10 万字符。',
      '勾选已保存的资料，点「提取知识点」。核对名称、内容与来源，再点「确认加入」；随后可打开知识图谱查看。',
    ],
    result: '原文与知识点分别保存。导入其他课程资料不会自动生成对应的新练习章节。',
  },
  {
    id: 'assistant', title: '问星芽 · 带着资料提问', kind: 'ai', route: '/ai', action: '打开问星芽',
    steps: [
      '先按下方「连接 AI」设置模型。也可从课程的「AI 辅导」、已保存笔记的「问 AI」或任务的「问 AI」进入。',
      '核对将要附带的资料与问题，按需要刷新或移除资料；使用临时问答时也可编辑摘录，再点「发送」。',
      '阅读回答并核查来源；有用的内容点「保存笔记」或「加入笔记」，再到笔记页整理。',
      '要追问导入原文，在示例章节的「课程资料」中勾选资料，展开「资料 AI 问答」，先预览引用片段，同意发送后再提问。',
    ],
    result: 'AI 回答需要核查。临时问答的回答不会自动成为笔记，发送前请确认所选服务商与资料范围。',
  },
  {
    id: 'planning', title: '智能编排 · 把目标变成任务', kind: 'voyage', route: '/agent', action: '打开智能编排',
    steps: [
      '选择课程，填写学习目标、目标日期与每日时长。缺少知识点时，展开「添加课程与资料」补充内容。',
      '游客可在本页「配置模型」中设置 API Key 与聊天模型；账号模式需页面显示规划服务已配置。',
      '点「开始规划」，等待计划生成。核对任务内容、日期、时长与资料依据。',
      '满意后点「确认并加入任务」，再到「查看任务」开始执行。只有预览而未确认时，不会添加任务。',
    ],
    result: '服务未配置时，可手动创建任务；也可在远航展开「安排学习目标 · 规则排程」，计算预览后点「添加任务」。',
  },
  {
    id: 'schedule', title: '规则排程 · 安排学习时间', kind: 'tasks', route: '/voyage', action: '到远航安排时间',
    steps: [
      '在远航展开「安排学习目标 · 规则排程」，填写开始与截止日期、每日时长、可用时段和休息时间。',
      '游客先勾选同意向课灵排程服务发送时段与任务信息，再点「计算预览」。此步骤不需要 AI 模型。',
      '检查新增任务、已有任务与尚未安排的内容。排不下时，增加可用时间或延后截止；修改条件后重新预览。',
      '确认时间合适后点「添加任务」，再进入「任务与计时」执行。',
    ],
    result: '预览不会写入任务。规则排程需要连接课灵服务，时间按北京时间安排。',
  },
  {
    id: 'tasks', title: '任务 · 专注与完成', kind: 'tasks', route: '/tasks', action: '打开任务与计时',
    steps: [
      '从远航的「任务与计时」进入，或在首页点「全部任务」。可创建任务，也可查看已确认的学习计划。',
      '点任务上的「开始任务」播放形按钮，进入本机计时；完成时直接点「完成任务」勾选按钮，记录本次计时。',
      '只需离开计时或去问 AI 时点「停止」。停止不会完成任务，也不会保存本次计时。',
    ],
    result: '离开任务页会停止本机计时。未带本次计时直接完成任务时，按任务预计时长记录。',
  },
  {
    id: 'notes', title: '笔记 · 留下自己的理解', kind: 'notes', route: '/notes', action: '打开学习笔记',
    steps: [
      '首页点「资料与笔记」，再点「新笔记」，填写标题与正文后点「保存」。',
      '已有文件可用「导入 MD / TXT」，上限 200 KB；导入到编辑区后仍需点「保存」。',
      '修改已保存笔记后，先保存再点「问 AI」。临时草稿或保存失败时，可先点「导出草稿」保留 Markdown 文件。',
    ],
    result: '笔记列表可搜索标题和正文。游客笔记只留在本次试用中，重要内容请及时导出。',
  },
  {
    id: 'base', title: '基地 · 回看成长', kind: 'settings', route: '/base', action: '打开基地',
    steps: [
      '在「基地建设」查看当前结晶与装饰，选择可购买的项目点「购买并装备」。已有装饰可直接「装备」。',
      '在「星芽自述档案」回看教星芽时确认保存的解释，需要时修正或删除。',
      '点「学习证据」查看作答记录与来源，再决定下一次练习目标。',
    ],
    result: '基地展示学习中积累的记录与装饰；自己的解释仍可继续修正。',
  },
  {
    id: 'growth', title: '我的 · 记录与统计', kind: 'profile', route: '/me', action: '打开我的',
    steps: [
      '进入「我的」，可调整叙事浓度、减少动效，或记录线下学习的内容、时长与笔记。',
      '点「学习统计」查看已有任务与学习记录；点「学习证据」查看远征作答。',
      '点「个人资料」更换头像，或进入「历史荣誉」「模型与偏好」。',
    ],
    result: '线下学习按自述记录，统计与徽章应结合实际作答理解，不等同于考试成绩。',
  },
];

const questions = [
  { question: '没有课程，或没有学习记录？', answer: '先进入远航，点「创建示例课程」；也可到星图创建自己的课程。完成练习、保存笔记或添加任务后，对应列表才会出现内容。新账号没有游客的试用记录。' },
  { question: 'AI 无法发送，或一直没有回答？', answer: '检查服务商、密钥、模型 ID 和所属区域。需要资料时先完成预览；笔记有未保存修改时先保存。获取到模型目录不代表已获得模型调用权限，可用简短问题检查。停止等待后，已经发出的请求仍可能计费。' },
  { question: '智能编排提示服务未配置？', answer: '游客在本页展开「配置模型」；账号模式依赖平台规划服务，个人问答的 API Key 不会自动开启该服务。暂时可到任务页手动创建，或用远航中的规则排程。' },
  { question: '资料解析失败，或知识点不对？', answer: '确认文件未超过大小和页数限制，并能复制出文字；扫描图片 PDF 请先转成可选中文字的文档。编辑原文后重新预览，知识点候选需要自己核对，再确认加入图谱。' },
  { question: '出现离线、待同步或记录冲突？', answer: '打开「同步」，先导出重要草稿，联网后点「立即同步」。有冲突时进入对应作答核对最新记录；「停止重试」会保留草稿，不会撤销已提交的结果。游客请先导出，刷新会清空本次数据。' },
  { question: '网页与手机内容不同，怎么办？', answer: '先确认两端使用同一账号且网络正常，再检查是否保存成功、是否仍有待同步操作。游客空间和本机计时不会跨端延续；不要靠反复切换账号处理尚未保存的草稿。' },
  { question: 'Android 上的按钮在哪里？', answer: '底部有「远航、星图、基地、我的、资料、设置、总览」。远航 10 分钟的按钮叫「开始远征」，作答后点「提交答案」；任务点「开始专注」，结束后点「结束并确认时长」并保存。同步失败时点「重试同步」。本页其余步骤按网页按钮名称说明。' },
];

export default function Guide() {
  const token = useAppStore(state => state.token);
  const isGuest = useAppStore(state => state.isGuest);
  const hasWorkspace = Boolean(token) || isGuest;
  const entry = hasWorkspace ? '/workspace' : '/trial';
  const entryLabel = hasWorkspace ? '返回学习空间' : '开始游客试用';

  return <div className="guide-page">
    <a className="guide-skip" href="#guide-content">跳到使用指南</a>
    <header className="guide-nav">
      <Link to="/explore" aria-label="课灵介绍"><img src={appPath('/stellar/title_logo.webp')} alt="课灵 KeLing" width="146" height="64"/></Link>
      <nav aria-label="指南导航"><Link to="/explore">课灵首页</Link><Link className="guide-primary" to={entry}>{entryLabel}<NavigationArrow/></Link></nav>
    </header>
    <main id="guide-content" className="guide-content" tabIndex={-1}>
      <section className="guide-hero" aria-labelledby="guide-title">
        <div><span className="guide-kicker">星芽的学习手册</span><ModuleTitle kind="notes" id="guide-title">课灵使用指南</ModuleTitle>
          <p>先完成一次远航，再把课程资料、提问和计划连成自己的学习过程。</p>
          <div className="guide-actions"><a className="guide-primary" href="#guide-start">从这里开始<NavigationArrow direction="down"/></a><Link className="guide-secondary" to={entry}>{entryLabel}<NavigationArrow/></Link></div>
        </div>
        <img className="guide-scroll-art" src={appPath('/stellar/guide_scroll.webp')} width="1536" height="1024" alt="" aria-hidden="true"/>
      </section>

      <nav className="guide-index" aria-label="使用指南目录">
        {[['guide-start', '首次上手'], ['guide-modules', '功能地图'], ['guide-save', '保存与账号'], ['guide-ai', '连接 AI'], ['guide-questions', '常见问题']].map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>

      <section id="guide-start" className="guide-section" aria-labelledby="guide-start-title" tabIndex={-1}>
        <SectionTitle kind="voyage" id="guide-start-title">第一次，先走这三步</SectionTitle>
        <ol className="guide-first-steps">
          <li><span className="guide-step-number" aria-hidden="true">01</span><h3>进入学习空间</h3><p>点「游客试用」即可体验。已登录或正在试用时，点「返回学习空间」继续当前内容。</p><Link to={entry}>{entryLabel}<NavigationArrow/></Link></li>
          <li><span className="guide-step-number" aria-hidden="true">02</span><h3>选一颗学习星球</h3><p>点顶部「远航」，选择课程。没有课程时点「创建示例课程」，从二叉树练习开始。</p><Link to="/voyage">打开远航<NavigationArrow/></Link></li>
          <li><span className="guide-step-number" aria-hidden="true">03</span><h3>做题，再教星芽</h3><p>选 10 分钟开始路线修复；想讲清理解时选 20 分钟教星芽。提交后读反馈，并保存下一步。</p><a href="#guide-modules">查看操作步骤<NavigationArrow direction="down"/></a></li>
        </ol>
        <p className="guide-note">这些示例练习无需先配置 AI。游客数据会在刷新、关闭或退出后清空；重要笔记请先导出。</p>
      </section>

      <section id="guide-modules" className="guide-section" aria-labelledby="guide-modules-title" tabIndex={-1}>
        <SectionTitle kind="courses" id="guide-modules-title">每个模块怎么用</SectionTitle>
        <p className="guide-intro">展开需要的模块，按步骤操作。</p>
        <div className="guide-module-grid">{modules.map(module => <details className="guide-module" key={module.id} id={`guide-module-${module.id}`}>
          <summary><ModuleTitle kind={module.kind} as="h3">{module.title}</ModuleTitle></summary>
          <div className="guide-module-body"><ol>{module.steps.map(step => <li key={step}>{step}</li>)}</ol><p className="guide-result">{module.result}</p><Link to={module.route}>{module.action}<NavigationArrow/></Link></div>
        </details>)}</div>
      </section>

      <section id="guide-save" className="guide-section" aria-labelledby="guide-save-title" tabIndex={-1}>
        <SectionTitle kind="profile" id="guide-save-title">怎样留下学习成果</SectionTitle>
        <div className="guide-save-grid"><article><h3>游客 · 随时体验</h3><p>无需账号，课程、笔记、任务与练习保留在本次试用中。站内打开指南再返回，不会重开试用；刷新、关闭或退出会清空。</p><p>需要保留文字，先到笔记页「导出草稿」；作答草稿可在「同步」页导出。</p></article>
          <article><h3>账号 · 接着学习</h3><p>登录同一账号，可在网页和手机读取已保存的课程、任务与笔记。看到「已保存」或同步成功后，再换设备继续。</p><p>游客记录不会自动转入账号。未保存的编辑、本机计时和待同步草稿，请先处理。</p><Link to="/login">账号登录<NavigationArrow/></Link></article></div>
      </section>

      <section id="guide-ai" className="guide-section guide-ai" aria-labelledby="guide-ai-title" tabIndex={-1}>
        <ModuleTitle kind="ai" as="h2" id="guide-ai-title">连接自己的 AI</ModuleTitle>
        <ol className="guide-ai-steps"><li><strong>打开「问星芽」的「临时问答」。</strong>在同一面板选择服务商，粘贴 API Key；需要时填写服务地址与所属区域。</li>
          <li><strong>获取并选择聊天模型。</strong>点「获取模型」，再选模型；服务商未提供目录时，可填写已开通的模型 ID。</li>
          <li><strong>发一个简短问题。</strong>核对发送范围与可能产生的费用，点「发送」；真正收到回答后，再继续带资料提问。</li></ol>
        <p>账号的「学习会话」也可使用平台已配置的模型。自己的 API Key 只保存在当前内存，离开配置面板、刷新或退出后可能需要重新填写。回答需自行核查；想保留时请点「保存笔记」。</p>
        <div className="guide-actions"><Link className="guide-primary" to="/ai?mode=personal">打开临时问答<NavigationArrow/></Link><a href="#guide-module-planning">查看计划说明<NavigationArrow direction="up"/></a></div>
      </section>

      <section id="guide-questions" className="guide-section guide-faq" aria-labelledby="guide-questions-title" tabIndex={-1}>
        <SectionTitle kind="settings" id="guide-questions-title">卡住时，看这里</SectionTitle>
        {questions.map(item => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}
        <Link to="/voyage/sync">打开草稿与同步<NavigationArrow/></Link>
      </section>
      <section className="guide-ready"><ModuleTitle kind="home" as="h2">现在，开始自己的远航</ModuleTitle><Link className="guide-primary" to={entry}>{entryLabel}<NavigationArrow/></Link></section>
    </main>
    <footer className="guide-footer"><span>课灵 · 学习从一次理解开始</span><Link to="/explore">返回课灵首页<NavigationArrow direction="left"/></Link><a href="#guide-content">回到顶部<NavigationArrow direction="up"/></a></footer>
  </div>;
}
