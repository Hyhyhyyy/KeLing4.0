/** Stable persisted indexes: changing the order would change existing courses. */
export const coursePlanets = [
  { name: '翡翠书环', description: '环绕书页的翡翠星环', file: 'planet_01.png' },
  { name: '珊瑚火山', description: '珊瑚色熔岩与火山脊', file: 'planet_02.png' },
  { name: '极光冰晶', description: '冰晶山脉与极光', file: 'planet_03.png' },
  { name: '琥珀沙丘', description: '琥珀沙海与起伏沙丘', file: 'planet_04.png' },
  { name: '云海雷霆', description: '翻涌云海中的闪电', file: 'planet_05.png' },
  { name: '深海潮汐', description: '深蓝海洋与潮汐涡流', file: 'planet_06.png' },
  { name: '苔原花园', description: '苔原绿洲与花园', file: 'planet_07.png' },
  { name: '紫晶洞窟', description: '紫晶簇生的地下洞窟', file: 'planet_08.png' },
  { name: '机械星核', description: '机械环带与发光星核', file: 'planet_09.png' },
  { name: '银月陨坑', description: '银色月壤与陨石坑', file: 'planet_10.png' },
] as const;

export function coursePlanetIndex(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < coursePlanets.length ? value : 0;
}
export function coursePlanet(value: unknown) { return coursePlanets[coursePlanetIndex(value)]; }
