export const avatarNames = ['星芽导师', '赤狐探索者', '星猫领航员', '月兔园丁', '星光伙伴', '音乐机器人', '薄荷宇航员', '珊瑚宇航员', '行星芽芽'];
export const subjectNames = ['数学', '物理', '化学', '生物', '计算机', '语言', '历史', '地理', '艺术'];
export const avatarIndex = (url?: string | null) => /^stellar:avatar-[0-8]$/.test(url || '') ? Number(url?.slice(-1)) : 0;
export function subjectIndex(name: string) {
  const groups = [/数学|高数|线性|微积分/, /物理|力学|电磁/, /化学/, /生物|生命/, /计算|程序|数据结构|算法|软件/, /语文|英语|语言|文学/, /历史/, /地理|地质/];
  const i = groups.findIndex(x => x.test(name)); return i < 0 ? 8 : i;
}
