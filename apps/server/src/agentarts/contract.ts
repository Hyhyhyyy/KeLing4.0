import { z } from 'zod';

export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function today(): string { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }); }
export const requestSchema = z.object({
  courseId: z.string().min(1).max(100), goal: z.string().trim().min(2).max(1200),
  examDate: z.string().refine(validDate), dailyMinutes: z.number().int().min(10).max(480),
  mode: z.enum(['plan','review']).default('plan')
});
const planSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  tasks: z.array(z.object({
    title: z.string().trim().min(1).max(180), description: z.string().max(2000),
    date: z.string().refine(validDate), minutes: z.number().int().min(5).max(480),
    sourceIds: z.array(z.string().max(120)).min(1).max(12)
  })).min(1).max(100)
});
export type Plan = z.infer<typeof planSchema>;
export function validatePlan(value: unknown, limits: { startDate:string; examDate:string; dailyMinutes:number; sourceIds:string[] }): Plan {
  const result=planSchema.parse(value); const daily:Record<string,number>={};
  for(const task of result.tasks){
    if(task.date < limits.startDate || task.date > limits.examDate) throw new Error('计划日期超出学习区间');
    daily[task.date]=(daily[task.date]||0)+task.minutes;
    if(daily[task.date]>limits.dailyMinutes) throw new Error('计划超过每日可用时长');
    if(task.sourceIds.some(id=>!limits.sourceIds.includes(id))) throw new Error('引用了未检索到的资料');
  }
  return result;
}
