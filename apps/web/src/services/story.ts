export const STORY_SCENES = [
  {title:'欢迎登舰，探索者',text:'我是星芽。这里是课灵。每一门学科，都有一片值得探索的天地。那些暂时没弄懂的问题，就是我们接下来要去的地方。'},
  {title:'星图，等你添上下一笔',text:'远处，是数学的几何群山、英语的书页城堡、历史的文明遗迹……每一个问题，都会成为新的坐标。'},
  {title:'第一站，想去哪里',text:'写下你想学的学科，再告诉我你的起点和目标。新的知识星球上，学习区域逐一点亮，第一条航线等待启程。'},
  {title:'第一颗星球，由你选择',text:'让我们一起一步一步探索这个知识星球的每一方寸文明！'},
];
export function openStory(){window.dispatchEvent(new Event('keling-open-story'));}
