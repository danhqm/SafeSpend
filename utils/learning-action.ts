import type { PracticeDraft, PracticeKind } from '../types/learning.ts';

export function validatePracticeDraft(kind:PracticeKind,draft:PracticeDraft,confirm=false):string|null {
  const fields=kind==='budget' ? ['budgetId'] : kind==='saving' ? ['targetAmount','contributionAmount','frequency','firstStep'] : ['priority','strategy','reason','hypothetical'];
  for(const [key,value] of Object.entries(draft)) {
    if(!fields.includes(key)) return 'This field does not belong to this exercise.';
    if(key==='hypothetical' ? typeof value!=='boolean' : typeof value!=='string' || value.length>500) return 'Keep each field under 500 characters.';
  }
  if(!confirm) return null;
  if(kind==='budget') return draft.budgetId ? null : 'Select a current-month budget first.';
  if(kind==='saving') {
    const amount=(value:unknown)=>typeof value==='string' && /^[0-9]+([.][0-9]{1,2})?$/.test(value) && Number(value)>0 && Number(value)<=999999999.99;
    if(!amount(draft.targetAmount) || !amount(draft.contributionAmount)) return 'Enter positive RM amounts with up to two decimal places.';
    if(!['weekly','monthly'].includes(draft.frequency||'') || !draft.firstStep?.trim()) return 'Choose a frequency and describe your first step.';
  } else if(!draft.priority?.trim() || !draft.reason?.trim() || !['highest_cost','smallest_balance','avoid_new_debt'].includes(draft.strategy||'') || typeof draft.hypothetical!=='boolean') return 'Choose a repayment priority, strategy and reason.';
  return null;
}
