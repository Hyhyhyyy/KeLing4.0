import type { PlanetQuestion } from '@keling/shared';
import type { PlanetResponse } from '../../services/planets';

export const questionLabels = {
  single_choice: '单选', multiple_choice: '多选', true_false: '判断',
  fill_blank: '填空', ordering: '排序', short_answer: '简答自核',
};

export function questionKind(question: PlanetQuestion) { return question.kind || 'single_choice'; }
export function questionResponse(question: PlanetQuestion, selected: number | null, selectedIndices: number[], text: string, orderedIndices: number[], selfReview = false): PlanetResponse | null {
  switch (questionKind(question)) {
    case 'multiple_choice': return selectedIndices.length ? { selectedIndices: [...selectedIndices].sort((a,b)=>a-b) } : null;
    case 'ordering': return orderedIndices.length === question.options.length && new Set(orderedIndices).size === question.options.length ? { orderedIndices: [...orderedIndices] } : null;
    case 'fill_blank': return text.trim() ? { text: text.trim() } : null;
    case 'short_answer': return text.trim() ? { text: text.trim(), ...(selfReview ? { selfReview: true } : {}) } : null;
    default: return selected === null ? null : { selectedIndex: selected };
  }
}

export function moveOrder(order: number[], at: number, direction: -1 | 1): number[] {
  const target=at+direction;
  if(at<0||at>=order.length||target<0||target>=order.length)return order;
  const result=[...order];[result[at],result[target]]=[result[target],result[at]];return result;
}

export function describeResponse(question: PlanetQuestion, response: PlanetResponse | null): string {
  if(!response)return '';
  if(response.text!==undefined)return response.text;
  if(response.orderedIndices)return response.orderedIndices.map((index,i)=>`${i+1}. ${question.options[index]}`).join('\n');
  if(response.selectedIndices)return response.selectedIndices.map(index=>question.options[index]).join('；');
  return response.selectedIndex===undefined?'':question.options[response.selectedIndex]||'';
}

export function sourceUrl(value: string): string | undefined {
  try { const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:undefined; } catch { return undefined; }
}
